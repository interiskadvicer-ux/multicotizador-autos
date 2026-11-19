// Recibos de una póliza Afirme ya emitida (solo lectura) con
// getRecibosPolizaActual, que se consulta inciso por inciso.

import type { Recibo, SituacionRecibo } from "@/domain/cobranza";
import { AfirmeError, llamarAfirme } from "./client";

interface ReciboAfirmeRaw {
  id?: { idRecibo?: number | string };
  numeroFolio?: number | string;
  noEndoso?: number;
  fechaInicioVigencia?: string;
  fechaFinVigencia?: string;
  cveTipoRecibo?: string;
  sitRecibo?: string;
  impPrimaTotal?: number;
  fechaVencimientoRecibo?: string;
}

// Afirme no expone la lista de incisos: se recorren en orden hasta encontrar
// varios seguidos sin recibos.
const INCISOS_VACIOS_PARA_DETENER = 3;
const MAX_INCISOS = 300;

const MESES: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
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
  if (m && MESES[m[1]]) return `${m[3]}-${MESES[m[1]]}-${m[2].padStart(2, "0")}`;
  return null;
}

// Formato de póliza Afirme: oficina-número-renovación, p. ej. 3401-117764-00.
export function numeroPolizaAfirmeValido(numero: string): boolean {
  return /^\d{4}-\d{5,8}-\d{2}$/.test(numero.trim());
}

function mapRecibo(raw: ReciboAfirmeRaw): Recibo | null {
  const idRecibo = raw.id?.idRecibo;
  const situacion = raw.sitRecibo ? SITUACION[raw.sitRecibo] : undefined;
  if (idRecibo === undefined || !situacion) return null;
  return {
    idRecibo: String(idRecibo),
    folio: raw.numeroFolio !== undefined ? String(raw.numeroFolio) : "",
    numeroEndoso: raw.noEndoso ?? 0,
    tipoRecibo: raw.cveTipoRecibo ?? "",
    situacion,
    primaTotal: raw.impPrimaTotal ?? 0,
    vigenciaInicio: fechaAfirme(raw.fechaInicioVigencia),
    vigenciaFin: fechaAfirme(raw.fechaFinVigencia),
    fechaVencimiento: fechaAfirme(raw.fechaVencimientoRecibo),
  };
}

async function recibosInciso(numeroPoliza: string, inciso: number): Promise<Recibo[]> {
  const res = await llamarAfirme<ReciboAfirmeRaw[] | ReciboAfirmeRaw>("getRecibosPolizaActual", {
    json: JSON.stringify({ numeroPoliza, idInciso: String(inciso) }),
  });
  return (Array.isArray(res) ? res : [res])
    .map(mapRecibo)
    .filter((r): r is Recibo => r !== null);
}

// Recibos de todos los incisos sin duplicar: en flotillas un mismo recibo
// cubre varios incisos.
export async function recibosPolizaAfirme(numero: string): Promise<Recibo[]> {
  const numeroPoliza = numero.trim();
  if (!numeroPolizaAfirmeValido(numeroPoliza)) {
    throw new AfirmeError("El número de póliza Afirme debe tener el formato 3401-117764-00.");
  }
  const porId = new Map<string, Recibo>();
  let vacios = 0;
  let fallidos = 0;
  for (let inciso = 1; inciso <= MAX_INCISOS; inciso++) {
    let recibos: Recibo[];
    try {
      recibos = await recibosInciso(numeroPoliza, inciso);
    } catch (err) {
      if (inciso === 1) throw err;
      fallidos++;
      recibos = [];
    }
    if (recibos.length === 0) {
      if (inciso === 1) throw new AfirmeError("Afirme no devolvió recibos para esta póliza.");
      if (++vacios >= INCISOS_VACIOS_PARA_DETENER) break;
      continue;
    }
    vacios = 0;
    for (const r of recibos) if (!porId.has(r.idRecibo)) porId.set(r.idRecibo, r);
  }
  // Con incisos sin respuesta no se puede afirmar que toda la póliza está cancelada.
  const cargos = Array.from(porId.values()).filter((r) => r.tipoRecibo !== "RD" && r.primaTotal >= 0);
  if (fallidos && cargos.length && cargos.every((r) => r.situacion === "CANCELADO")) {
    throw new AfirmeError("Consulta incompleta: algunos incisos no respondieron.");
  }
  return Array.from(porId.values()).sort(
    (a, b) =>
      a.numeroEndoso - b.numeroEndoso ||
      (a.fechaVencimiento ?? "").localeCompare(b.fechaVencimiento ?? ""),
  );
}
