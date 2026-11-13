// Tipos del proceso diario de cobranza (descarga de pagos por aseguradora).

export type EstatusPoliza = "VIGENTE" | "CANCELADA";

// Situación de un recibo en la aseguradora (Afirme: EMI, PAG, CAN).
export type SituacionRecibo = "EMITIDO" | "PAGADO" | "CANCELADO";

export interface Recibo {
  idRecibo: string;
  folio: string;
  numeroEndoso: number;
  // REC = cargo, RD = devolución (importes negativos).
  tipoRecibo: string;
  situacion: SituacionRecibo;
  primaTotal: number;
  vigenciaInicio: string | null;
  vigenciaFin: string | null;
  fechaVencimiento: string | null;
}

// OK: se consultó; SIN_CONFIGURAR: faltan accesos o el conector aún no existe.
export type EstadoFuente = "OK" | "ERROR" | "SIN_CONFIGURAR";

export interface ResultadoFuente {
  aseguradora: string;
  estado: EstadoFuente;
  mensaje: string;
  polizasRevisadas: number;
  pagosNuevos: number;
  cancelaciones: number;
  // Pólizas que no se pudieron consultar (número y motivo).
  errores: { numeroPoliza: string; mensaje: string }[];
}

export function esDevolucion(r: Pick<Recibo, "tipoRecibo" | "primaTotal">): boolean {
  return r.tipoRecibo === "RD" || r.primaTotal < 0;
}
