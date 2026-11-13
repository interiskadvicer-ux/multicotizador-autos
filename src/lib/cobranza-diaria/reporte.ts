// Reporte diario de cobranza: pólizas pagadas, recibos pendientes y pólizas
// canceladas, más el resultado de la consulta a cada aseguradora.

import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { RECIBOS_POR_FORMA, type FormaPagoPoliza } from "@/domain/admin";
import type { ResultadoFuente } from "@/domain/cobranza";

// Recibos que inician en los próximos días también se listan como pendientes.
const DIAS_POR_VENCER = 15;

export function diasGracia(): number {
  const n = Number(process.env.COBRANZA_DIAS_GRACIA);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

export interface FilaPagada {
  numeroPoliza: string;
  aseguradora: string;
  asegurado: string;
  agente: string;
  recibo: string;
  fechaPago: string;
  monto: number;
  origen: string;
  nuevo: boolean;
}

export type EstadoPendiente = "POR_VENCER" | "EN_GRACIA" | "FUERA_DE_GRACIA";

export interface FilaPendiente {
  numeroPoliza: string;
  aseguradora: string;
  asegurado: string;
  agente: string;
  formaPago: string;
  recibo: string;
  inicioRecibo: string;
  fechaLimite: string;
  monto: number;
  diasAtraso: number;
  estado: EstadoPendiente;
}

export interface FilaCancelada {
  numeroPoliza: string;
  aseguradora: string;
  asegurado: string;
  agente: string;
  fechaCancelacion: string;
  primaTotal: number;
  pagado: number;
}

export interface ReporteCobranza {
  fechaCorte: string;
  hoy: string;
  pagadas: FilaPagada[];
  pendientes: FilaPendiente[];
  canceladas: FilaCancelada[];
  fuentes: ResultadoFuente[];
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Suma meses respetando fin de mes (31-ene + 1 mes = 28/29-feb).
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const total = m - 1 + meses;
  const anio = a + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);

function clasificar(inicio: string, limite: string, hoy: string): EstadoPendiente {
  if (limite < hoy) return "FUERA_DE_GRACIA";
  if (inicio <= hoy) return "EN_GRACIA";
  return "POR_VENCER";
}

const ORIGEN: Record<string, string> = {
  MANUAL: "Captura manual",
  ESTADO_CUENTA: "Estado de cuenta",
  WS_ASEGURADORA: "Aseguradora (automático)",
};

function pagadas(fechaCorte: string, ultimoPagoPrevio: number): FilaPagada[] {
  const rows = db
    .prepare(
      `SELECT p.numero_poliza, p.aseguradora, p.asegurado, COALESCE(u.nombre, '') AS agente,
              pp.recibo, pp.fecha_pago, pp.monto, pp.origen, pp.id > ? AS nuevo
       FROM policy_payments pp JOIN policies p ON p.id = pp.poliza_id
       LEFT JOIN users u ON u.id = p.agente_id
       WHERE pp.fecha_pago = ? OR pp.id > ?
       ORDER BY p.aseguradora, p.numero_poliza`,
    )
    .all(ultimoPagoPrevio, fechaCorte, ultimoPagoPrevio) as {
    numero_poliza: string; aseguradora: string; asegurado: string; agente: string;
    recibo: string | null; fecha_pago: string; monto: number; origen: string; nuevo: number;
  }[];
  return rows.map((r) => ({
    numeroPoliza: r.numero_poliza,
    aseguradora: r.aseguradora,
    asegurado: r.asegurado,
    agente: r.agente,
    recibo: r.recibo ?? "",
    fechaPago: r.fecha_pago,
    monto: r.monto,
    origen: ORIGEN[r.origen] ?? r.origen,
    nuevo: r.nuevo === 1,
  }));
}

interface PolizaVigente {
  id: number;
  numero_poliza: string;
  aseguradora: string;
  asegurado: string;
  agente: string;
  forma_pago: FormaPagoPoliza | null;
  prima_total: number;
  vigencia_inicio: string;
  pagado: number;
  recibos_aseguradora: number;
}

// Con recibos de la aseguradora (Afirme) se usan sus recibos emitidos; si
// no, se calculan los recibos esperados por forma de pago contra lo pagado.
function pendientes(hoy: string): FilaPendiente[] {
  const gracia = diasGracia();
  const horizonte = sumarDias(hoy, DIAS_POR_VENCER);
  const polizas = db
    .prepare(
      `SELECT p.id, p.numero_poliza, p.aseguradora, p.asegurado, COALESCE(u.nombre, '') AS agente,
              p.forma_pago, p.prima_total, p.vigencia_inicio,
              (SELECT COALESCE(SUM(monto), 0) FROM policy_payments WHERE poliza_id = p.id) AS pagado,
              (SELECT COUNT(*) FROM policy_receipts WHERE poliza_id = p.id) AS recibos_aseguradora
       FROM policies p LEFT JOIN users u ON u.id = p.agente_id
       WHERE p.estatus <> 'CANCELADA' AND p.vigencia_inicio <= ? AND p.vigencia_fin >= ?`,
    )
    .all(horizonte, hoy) as PolizaVigente[];

  const filas: FilaPendiente[] = [];
  const base = (p: PolizaVigente) => ({
    numeroPoliza: p.numero_poliza,
    aseguradora: p.aseguradora,
    asegurado: p.asegurado,
    agente: p.agente,
    formaPago: p.forma_pago ?? "ANUAL",
  });
  const agregar = (p: PolizaVigente, recibo: string, inicio: string, monto: number) => {
    const limite = sumarDias(inicio, gracia);
    filas.push({
      ...base(p),
      recibo,
      inicioRecibo: inicio,
      fechaLimite: limite,
      monto: Math.round(monto * 100) / 100,
      diasAtraso: Math.max(0, diasEntre(limite, hoy)),
      estado: clasificar(inicio, limite, hoy),
    });
  };

  const recibosEmitidos = db.prepare(
    `SELECT id_recibo, folio, prima_total, vigencia_inicio, fecha_vencimiento FROM policy_receipts
     WHERE poliza_id = ? AND situacion = 'EMITIDO' AND prima_total > 0 AND COALESCE(tipo_recibo, '') <> 'RD'`,
  );
  for (const p of polizas) {
    if (p.recibos_aseguradora > 0) {
      const emitidos = recibosEmitidos.all(p.id) as {
        id_recibo: string; folio: string | null; prima_total: number;
        vigencia_inicio: string | null; fecha_vencimiento: string | null;
      }[];
      for (const r of emitidos) {
        const inicio = r.vigencia_inicio ?? p.vigencia_inicio;
        if (inicio > horizonte) continue;
        agregar(p, r.folio || r.id_recibo, inicio, r.prima_total);
      }
      continue;
    }
    const n = RECIBOS_POR_FORMA[p.forma_pago ?? "ANUAL"] ?? 1;
    const montoRecibo = p.prima_total / n;
    if (montoRecibo <= 0) continue;
    // Tolerancia de un peso por redondeos de la aseguradora.
    const cubiertos = Math.floor((p.pagado + 1) / montoRecibo);
    for (let k = cubiertos; k < n; k++) {
      const inicio = sumarMeses(p.vigencia_inicio, (k * 12) / n);
      if (inicio > horizonte) break;
      agregar(p, `${k + 1} de ${n}`, inicio, montoRecibo);
    }
  }
  return filas.sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
}

function canceladas(): FilaCancelada[] {
  const rows = db
    .prepare(
      `SELECT p.numero_poliza, p.aseguradora, p.asegurado, COALESCE(u.nombre, '') AS agente,
              COALESCE(p.fecha_cancelacion, '') AS fecha_cancelacion, p.prima_total,
              (SELECT COALESCE(SUM(monto), 0) FROM policy_payments WHERE poliza_id = p.id) AS pagado
       FROM policies p LEFT JOIN users u ON u.id = p.agente_id
       WHERE p.estatus = 'CANCELADA' ORDER BY p.fecha_cancelacion DESC`,
    )
    .all() as {
    numero_poliza: string; aseguradora: string; asegurado: string; agente: string;
    fecha_cancelacion: string; prima_total: number; pagado: number;
  }[];
  return rows.map((r) => ({
    numeroPoliza: r.numero_poliza,
    aseguradora: r.aseguradora,
    asegurado: r.asegurado,
    agente: r.agente,
    fechaCancelacion: r.fecha_cancelacion,
    primaTotal: r.prima_total,
    pagado: r.pagado,
  }));
}

// Los pagos con id mayor a `ultimoPagoPrevio` los registró esta ejecución.
export function armarReporte(
  fechaCorte: string,
  ultimoPagoPrevio: number,
  fuentes: ResultadoFuente[],
): ReporteCobranza {
  const hoy = sumarDias(fechaCorte, 1);
  return {
    fechaCorte,
    hoy,
    pagadas: pagadas(fechaCorte, ultimoPagoPrevio),
    pendientes: pendientes(hoy),
    canceladas: canceladas(),
    fuentes,
  };
}

const ETIQUETA_PENDIENTE: Record<EstadoPendiente, string> = {
  POR_VENCER: "Por vencer",
  EN_GRACIA: "En periodo de gracia",
  FUERA_DE_GRACIA: "Fuera de gracia (riesgo de cancelación)",
};

const ETIQUETA_FUENTE: Record<string, string> = {
  OK: "Consultada",
  ERROR: "Error",
  SIN_CONFIGURAR: "Pendiente de configurar",
};

const MONEDA = '"$"#,##0.00';

function hoja(
  wb: ExcelJS.Workbook,
  nombre: string,
  columnas: { header: string; key: string; width: number; moneda?: boolean }[],
  filas: object[],
): void {
  const ws = wb.addWorksheet(nombre);
  ws.columns = columnas.map(({ header, key, width }) => ({ header, key, width }));
  for (const f of filas) ws.addRow(f);
  for (const c of columnas) if (c.moneda) ws.getColumn(c.key).numFmt = MONEDA;
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
}

export function resumenTexto(r: ReporteCobranza): string[] {
  const suma = (xs: { monto: number }[]) => xs.reduce((s, x) => s + x.monto, 0);
  const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const fuera = r.pendientes.filter((p) => p.estado === "FUERA_DE_GRACIA");
  return [
    `Pagos del ${r.fechaCorte} y nuevos detectados: ${r.pagadas.length} (${fmt(suma(r.pagadas))})`,
    `Recibos pendientes: ${r.pendientes.length} (${fmt(suma(r.pendientes))}), ${fuera.length} fuera del periodo de gracia`,
    `Pólizas canceladas: ${r.canceladas.length}`,
  ];
}

export async function excelReporte(r: ReporteCobranza): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Multicotizador Interiskad";

  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [
    { key: "a", width: 28 },
    { key: "b", width: 26 },
    { key: "c", width: 12 },
    { key: "d", width: 12 },
    { key: "e", width: 14 },
    { key: "f", width: 70 },
  ];
  resumen.addRow([`Reporte de cobranza — corte ${r.fechaCorte}`]).font = { bold: true, size: 14 };
  for (const linea of resumenTexto(r)) resumen.addRow([linea]);
  resumen.addRow([]);
  const enc = resumen.addRow(["Aseguradora", "Estado", "Pólizas", "Pagos nuevos", "Cancelaciones", "Detalle"]);
  enc.font = { bold: true };
  for (const f of r.fuentes) {
    resumen.addRow([
      f.aseguradora,
      ETIQUETA_FUENTE[f.estado] ?? f.estado,
      f.polizasRevisadas,
      f.pagosNuevos,
      f.cancelaciones,
      [f.mensaje, ...f.errores.map((e) => `${e.numeroPoliza}: ${e.mensaje}`)].join(" | "),
    ]);
  }

  hoja(
    wb,
    "Pagadas",
    [
      { header: "No. Póliza", key: "numeroPoliza", width: 18 },
      { header: "Aseguradora", key: "aseguradora", width: 16 },
      { header: "Asegurado", key: "asegurado", width: 30 },
      { header: "Agente", key: "agente", width: 22 },
      { header: "Recibo", key: "recibo", width: 14 },
      { header: "Fecha de pago", key: "fechaPago", width: 14 },
      { header: "Importe", key: "monto", width: 14, moneda: true },
      { header: "Origen", key: "origen", width: 24 },
      { header: "Nuevo hoy", key: "nuevo", width: 10 },
    ],
    r.pagadas.map((p) => ({ ...p, nuevo: p.nuevo ? "Sí" : "" })),
  );
  hoja(
    wb,
    "Pendientes",
    [
      { header: "No. Póliza", key: "numeroPoliza", width: 18 },
      { header: "Aseguradora", key: "aseguradora", width: 16 },
      { header: "Asegurado", key: "asegurado", width: 30 },
      { header: "Agente", key: "agente", width: 22 },
      { header: "Forma de pago", key: "formaPago", width: 13 },
      { header: "Recibo", key: "recibo", width: 12 },
      { header: "Inicio del recibo", key: "inicioRecibo", width: 15 },
      { header: "Fecha límite de pago", key: "fechaLimite", width: 18 },
      { header: "Importe", key: "monto", width: 14, moneda: true },
      { header: "Días de atraso", key: "diasAtraso", width: 13 },
      { header: "Estado", key: "estado", width: 34 },
    ],
    r.pendientes.map((p) => ({ ...p, estado: ETIQUETA_PENDIENTE[p.estado] })),
  );
  hoja(
    wb,
    "Canceladas",
    [
      { header: "No. Póliza", key: "numeroPoliza", width: 18 },
      { header: "Aseguradora", key: "aseguradora", width: 16 },
      { header: "Asegurado", key: "asegurado", width: 30 },
      { header: "Agente", key: "agente", width: 22 },
      { header: "Fecha de cancelación", key: "fechaCancelacion", width: 18 },
      { header: "Prima total", key: "primaTotal", width: 14, moneda: true },
      { header: "Pagado", key: "pagado", width: 14, moneda: true },
    ],
    r.canceladas,
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}
