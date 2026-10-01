// Consulta de pólizas y recibos ya emitidos en Afirme (solo lectura):
// buscarPoliza (datos generales) y getRecibosPolizaActual (recibos por inciso).

import {
  numeroPolizaAfirmeValido,
  type EstatusPago,
  type Recibo,
  type SituacionRecibo,
} from "@/domain/admin";
import { AfirmeError, llamarAfirme } from "./client";

interface PolizaAfirmeRaw {
  numeroPoliza?: string;
  nombreAsegurado?: string;
  fechaInicioVigencia?: string;
  fechaFinVigencia?: string;
  descEstatusPoliza?: string;
  numeroIncisos?: number;
  tipoPoliza?: string;
  modelo?: string;
  numeroSerie?: string;
  descMarcaVehiculo?: string;
  tipoVehiculo?: string;
}

interface ReciboAfirmeRaw {
  id?: { idRecibo?: number | string };
  numeroFolio?: number | string;
  noEndoso?: number;
  fechaInicioVigencia?: string;
  fechaFinVigencia?: string;
  cveTipoRecibo?: string;
  sitRecibo?: string;
  impPrimaNeta?: number;
  impRecargoFin?: number;
  impGastoExp?: number;
  montoIVA?: number;
  impPrimaTotal?: number;
  fechaVencimientoRecibo?: string;
}

export interface DatosPolizaAfirme {
  numeroPoliza: string;
  asegurado: string | null;
  vigenciaInicio: string | null;
  vigenciaFin: string | null;
  vehiculo: string | null;
  numeroSerie: string | null;
  tipoPoliza: string | null;
  estatusPoliza: string | null;
}

export interface ConsultaPolizaAfirme {
  poliza: DatosPolizaAfirme;
  recibos: Recibo[];
  estatusPago: EstatusPago | null;
  // Prima de la emisión original (recibos de cargo del endoso 0).
  primaNeta: number | null;
  primaTotal: number | null;
}

// Afirme no expone la lista de incisos: se recorren en orden hasta encontrar
// varios seguidos sin recibos.
const INCISOS_VACIOS_PARA_DETENER = 3;
const MAX_INCISOS = 300;

const MESES: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

const SITUACION: Record<string, SituacionRecibo> = {
  EMI: "EMITIDO",
  PAG: "PAGADO",
  CAN: "CANCELADO",
};

// Acepta "2026-08-04T00:00:00" y "Aug 4, 2026 12:00:00 AM".
export function fechaAfirme(valor: string | undefined): string | null {
  if (!valor) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  if (iso) return iso[1];
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(valor);
  if (m && MESES[m[1]])
    return `${m[3]}-${MESES[m[1]]}-${m[2].padStart(2, "0")}`;
  return null;
}

function texto(valor: string | undefined): string | null {
  const t = valor?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

function vehiculoDe(raw: PolizaAfirmeRaw): string | null {
  // tipoVehiculo viene como "109449 - NISSAN MARCH SENSE TM".
  const desc = texto(raw.tipoVehiculo?.replace(/^\d+\s*-\s*/, ""));
  const base = desc ?? texto(raw.descMarcaVehiculo);
  if (!base) return null;
  return raw.modelo ? `${base} ${raw.modelo}` : base;
}

async function buscarPoliza(numeroPoliza: string): Promise<DatosPolizaAfirme> {
  const raw = await llamarAfirme<PolizaAfirmeRaw>("buscarPoliza", {
    json: JSON.stringify({ numeroPoliza, numeroInciso: 1 }),
  });
  return {
    numeroPoliza,
    asegurado: texto(raw.nombreAsegurado),
    vigenciaInicio: fechaAfirme(raw.fechaInicioVigencia),
    vigenciaFin: fechaAfirme(raw.fechaFinVigencia),
    vehiculo: vehiculoDe(raw),
    numeroSerie: texto(raw.numeroSerie),
    tipoPoliza: texto(raw.tipoPoliza),
    estatusPoliza: texto(raw.descEstatusPoliza),
  };
}

async function recibosInciso(
  numeroPoliza: string,
  inciso: number,
): Promise<ReciboAfirmeRaw[]> {
  const res = await llamarAfirme<ReciboAfirmeRaw[] | ReciboAfirmeRaw>(
    "getRecibosPolizaActual",
    { json: JSON.stringify({ numeroPoliza, idInciso: String(inciso) }) },
  );
  return Array.isArray(res) ? res : [res];
}

function mapRecibo(raw: ReciboAfirmeRaw, inciso: number): Recibo | null {
  const idRecibo = raw.id?.idRecibo;
  const situacion = raw.sitRecibo ? SITUACION[raw.sitRecibo] : undefined;
  if (idRecibo === undefined || !situacion) return null;
  return {
    idRecibo: String(idRecibo),
    folio: raw.numeroFolio !== undefined ? String(raw.numeroFolio) : "",
    numeroEndoso: raw.noEndoso ?? 0,
    tipoRecibo: raw.cveTipoRecibo ?? "",
    situacion,
    incisos: String(inciso),
    primaNeta: raw.impPrimaNeta ?? 0,
    recargo: raw.impRecargoFin ?? 0,
    derechos: raw.impGastoExp ?? 0,
    iva: raw.montoIVA ?? 0,
    primaTotal: raw.impPrimaTotal ?? 0,
    vigenciaInicio: fechaAfirme(raw.fechaInicioVigencia),
    vigenciaFin: fechaAfirme(raw.fechaFinVigencia),
    fechaVencimiento: fechaAfirme(raw.fechaVencimientoRecibo),
  };
}

// Recibos de todos los incisos, sin duplicar: en flotillas un mismo recibo
// cubre varios incisos.
async function recibosPoliza(numeroPoliza: string): Promise<Recibo[]> {
  const porId = new Map<string, Recibo>();
  let vacios = 0;
  for (let inciso = 1; inciso <= MAX_INCISOS; inciso++) {
    let lista: ReciboAfirmeRaw[];
    try {
      lista = await recibosInciso(numeroPoliza, inciso);
    } catch (err) {
      if (inciso === 1) throw err;
      lista = [];
    }
    const recibos = lista
      .map((r) => mapRecibo(r, inciso))
      .filter((r): r is Recibo => r !== null);
    if (recibos.length === 0) {
      if (inciso === 1) {
        throw new AfirmeError("Afirme no devolvió recibos para esta póliza.");
      }
      if (++vacios >= INCISOS_VACIOS_PARA_DETENER) break;
      continue;
    }
    vacios = 0;
    for (const r of recibos) {
      const previo = porId.get(r.idRecibo);
      if (previo) previo.incisos = `${previo.incisos},${inciso}`;
      else porId.set(r.idRecibo, r);
    }
  }
  return Array.from(porId.values()).sort(
    (a, b) =>
      a.numeroEndoso - b.numeroEndoso ||
      (a.fechaVencimiento ?? "").localeCompare(b.fechaVencimiento ?? ""),
  );
}

export function esDevolucion(r: Recibo): boolean {
  return r.tipoRecibo === "RD" || r.primaTotal < 0;
}

// Estatus de cobranza a partir de los recibos de cargo (las devoluciones no
// cuentan): pendiente si alguno sigue emitido sin pagar, cancelada si todos
// están cancelados, pagada si todos los vigentes están pagados.
export function estatusPagoDeRecibos(recibos: Recibo[]): EstatusPago | null {
  const cargos = recibos.filter((r) => !esDevolucion(r));
  if (cargos.length === 0) return null;
  if (cargos.every((r) => r.situacion === "CANCELADO")) return "CANCELADA";
  if (cargos.some((r) => r.situacion === "EMITIDO")) return "PENDIENTE";
  return "PAGADA";
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function consultarPolizaAfirme(
  numero: string,
): Promise<ConsultaPolizaAfirme> {
  const numeroPoliza = numero.trim();
  if (!numeroPolizaAfirmeValido(numeroPoliza)) {
    throw new AfirmeError(
      "El número de póliza Afirme debe tener el formato 3401-117764-00.",
    );
  }
  const [poliza, recibos] = await Promise.all([
    buscarPoliza(numeroPoliza),
    recibosPoliza(numeroPoliza),
  ]);

  const emision = recibos.filter(
    (r) => r.numeroEndoso === 0 && !esDevolucion(r),
  );
  const primaNeta = emision.length
    ? redondear(emision.reduce((s, r) => s + r.primaNeta, 0))
    : null;
  const primaTotal = emision.length
    ? redondear(emision.reduce((s, r) => s + r.primaTotal, 0))
    : null;

  // En flotillas buscarPoliza no devuelve datos; la vigencia se toma del
  // recibo de emisión.
  if (!poliza.vigenciaInicio && emision[0]) {
    poliza.vigenciaInicio = emision[0].vigenciaInicio;
    poliza.vigenciaFin =
      emision[emision.length - 1].vigenciaFin ?? poliza.vigenciaFin;
  }

  return {
    poliza,
    recibos,
    estatusPago: estatusPagoDeRecibos(recibos),
    primaNeta,
    primaTotal,
  };
}
