// HDI: portal de agentes SmartOffice. Lista las pólizas del agente y sus
// recibos (pagados con fecha de pago y pendientes). Da de alta en Pólizas
// las que todavía no estaban capturadas.

import { db } from "@/lib/db";
import { mismaAseguradora } from "@/lib/conciliacion";
import { RECIBOS_POR_FORMA, type FormaPagoPoliza } from "@/domain/admin";
import type { Recibo, ResultadoFuente } from "@/domain/cobranza";
import {
  ESTATUS_RECIBO_HDI,
  PortalHdi,
  portalHdiConfigurado,
  type PolizaPortalHdi,
  type ReciboPortalHdi,
} from "@/lib/hdi/portal";
import { aplicarRecibos } from "./afirme";
import { sumarDias, sumarMeses } from "./reporte";

const ASEGURADORA = "HDI";
// El portal filtra los recibos por fecha de emisión de la póliza.
const DIAS_EMISION_ATRAS = 450;
const DIAS_EMISION_ADELANTE = 60;

const dia = (iso: string) => iso.slice(0, 10);
const sinCeros = (n: string) => String(Number(n));

// "0000000193" + certificado 1 → "193-1", como lo muestra el portal.
export function numeroHdi(numPoliza: string, certificado: number): string {
  return `${sinCeros(numPoliza)}-${certificado}`;
}

// Acepta "193-1", "193", "0000000193" o "00619-0000000193-1".
function coincideNumero(capturado: string, numPoliza: string, certificado: number): boolean {
  const grupos = capturado.match(/\d+/g) ?? [];
  const poliza = sinCeros(numPoliza);
  const i = grupos.findIndex((g) => sinCeros(g) === poliza && g.length >= poliza.length);
  if (i < 0) return false;
  const siguiente = grupos[i + 1];
  return siguiente === undefined || Number(siguiente) === certificado;
}

function formaPago(desc: string): FormaPagoPoliza {
  const d = desc.toUpperCase();
  if (d.includes("MENSUAL")) return "MENSUAL";
  if (d.includes("TRIMESTRAL")) return "TRIMESTRAL";
  if (d.includes("SEMESTRAL")) return "SEMESTRAL";
  // Anual y meses sin intereses: un solo recibo.
  return "ANUAL";
}

interface PolizaLocal {
  id: number;
  numero_poliza: string;
  aseguradora: string;
  estatus: string;
}

function polizasLocales(): PolizaLocal[] {
  return (
    db.prepare("SELECT id, numero_poliza, aseguradora, estatus FROM policies ORDER BY id").all() as PolizaLocal[]
  ).filter((p) => p.aseguradora.trim() && mismaAseguradora(p.aseguradora, ASEGURADORA));
}

function darDeAlta(p: PolizaPortalHdi): number {
  const info = db
    .prepare(
      `INSERT INTO policies
        (numero_poliza, ramo, aseguradora, asegurado, prima_neta, prima_total,
         vigencia_inicio, vigencia_fin, notas, forma_pago)
       VALUES (?, 'Autos', ?, ?, 0, ?, ?, ?, ?, ?)`,
    )
    .run(
      numeroHdi(p.numPoliza, p.numCertificado),
      ASEGURADORA,
      p.nombreCliente.replace(/\s+/g, " ").trim(),
      p.montoPrimaTotal,
      dia(p.fechaInicioVigencia),
      dia(p.fechaFinVigencia),
      `Alta automática desde el portal HDI (${p.descFormaPago}). La prima neta no viene en el portal.`,
      formaPago(p.descFormaPago),
    );
  return Number(info.lastInsertRowid);
}

// Los recibos de cargo se numeran en orden; el periodo de cada uno se
// calcula desde el inicio de vigencia según la forma de pago.
export function recibosDePoliza(p: PolizaPortalHdi, recibos: ReciboPortalHdi[]): Recibo[] {
  const n = RECIBOS_POR_FORMA[formaPago(p.descFormaPago)];
  const inicio = dia(p.fechaInicioVigencia);
  let k = 0;
  return [...recibos]
    .sort((a, b) => a.NodeRecibo.localeCompare(b.NodeRecibo, "en", { numeric: true }))
    .map((r) => {
      const devolucion = r.Total < 0;
      const periodo = devolucion ? null : sumarMeses(inicio, (k++ * 12) / n);
      const pagado = r.Tab_Status_Rbo === ESTATUS_RECIBO_HDI.PAGADO;
      return {
        idRecibo: r.NodeRecibo,
        folio: r.NodeRecibo,
        numeroEndoso: r.Documento,
        tipoRecibo: devolucion ? "RD" : "REC",
        situacion: pagado ? "PAGADO" : "EMITIDO",
        primaTotal: r.Total,
        vigenciaInicio: periodo,
        vigenciaFin: periodo ? sumarMeses(periodo, 12 / n) : null,
        fechaVencimiento: null,
        fechaPago: pagado && r.Status_Fecha ? dia(r.Status_Fecha) : null,
      };
    });
}

export async function sincronizarHdi(fechaCorte: string): Promise<ResultadoFuente> {
  const resultado: ResultadoFuente = {
    aseguradora: ASEGURADORA,
    estado: "OK",
    mensaje: "",
    polizasRevisadas: 0,
    pagosNuevos: 0,
    cancelaciones: 0,
    errores: [],
  };
  if (!portalHdiConfigurado()) {
    return { ...resultado, estado: "SIN_CONFIGURAR", mensaje: "Faltan el usuario y la contraseña del portal HDI." };
  }
  const portal = await PortalHdi.entrar();
  const polizas = await portal.polizas();
  const recibos = await portal.recibosPorEmision(
    sumarDias(fechaCorte, -DIAS_EMISION_ATRAS),
    sumarDias(fechaCorte, DIAS_EMISION_ADELANTE),
  );
  const locales = polizasLocales();
  let altas = 0;

  for (const p of polizas) {
    resultado.polizasRevisadas++;
    const numero = numeroHdi(p.numPoliza, p.numCertificado);
    try {
      let local = locales.find((l) => coincideNumero(l.numero_poliza, p.numPoliza, p.numCertificado));
      if (!local) {
        local = { id: darDeAlta(p), numero_poliza: numero, aseguradora: ASEGURADORA, estatus: "VIGENTE" };
        locales.push(local);
        altas++;
      }
      const propios = recibos.filter(
        (r) => sinCeros(r.IdPoliza) === sinCeros(p.numPoliza) && r.Certificado === p.numCertificado,
      );
      const cambio = aplicarRecibos(local.id, recibosDePoliza(p, propios), fechaCorte, ASEGURADORA);
      resultado.pagosNuevos += cambio.pagosNuevos;
      if (p.descEstatusDocumento.toUpperCase().startsWith("CANCEL") && local.estatus !== "CANCELADA") {
        db.prepare(
          `UPDATE policies SET estatus = 'CANCELADA', fecha_cancelacion = ?, updated_at = datetime('now')
           WHERE id = ? AND estatus <> 'CANCELADA'`,
        ).run(fechaCorte, local.id);
        local.estatus = "CANCELADA";
        resultado.cancelaciones++;
      }
    } catch (err) {
      resultado.errores.push({ numeroPoliza: numero, mensaje: err instanceof Error ? err.message : String(err) });
    }
  }
  resultado.mensaje = `${resultado.polizasRevisadas} pólizas en el portal (${altas} dadas de alta), ${resultado.pagosNuevos} pagos nuevos, ${resultado.cancelaciones} cancelaciones, ${resultado.errores.length} con error.`;
  return resultado;
}
