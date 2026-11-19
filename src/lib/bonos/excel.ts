import ExcelJS from "exceljs";
import type { ResultadoAgente, ResultadoPromotor } from "./calculo";
import type { ReporteBono } from "./repositorio";

const MONEDA = '"$"#,##0.00';

function encabezado(ws: ExcelJS.Worksheet, fila: number): void {
  const r = ws.getRow(fila);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0369A1" } };
  r.alignment = { vertical: "middle", wrapText: true };
}

async function buffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const data = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  return ab;
}

export async function excelAgentes(titulo: string, filas: ResultadoAgente[], reportes: ReporteBono[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Agentes");
  ws.addRow([`CIFRAS ${titulo.toUpperCase()}`]).font = { bold: true, size: 13 };
  ws.addRow([
    "AGENTE", "PRIMA COMPUTABLE COBRADA DAÑOS AUTOS", "% AGENTE", "REPARTO", "BONO AGENTE", "IVA",
    "RET ISR", "RET IVA", "TOTAL FACTURA", "TOTAL REPORTE", "ESTADO", "UUID", "FECHA PAGO",
  ]);
  encabezado(ws, 2);
  const porAgente = new Map(reportes.map((r) => [r.agenteId, r]));
  for (const f of filas) {
    const rep = porAgente.get(f.agenteId);
    const reparto = [
      ...f.recibe.map((x) => `+${(x.porcentaje * 100).toFixed(2)}% de ${x.nombre}`),
      ...f.cede.map((x) => `-${(x.porcentaje * 100).toFixed(2)}% a ${x.nombre}`),
    ].join("; ");
    ws.addRow([f.nombre, f.base, f.porcentaje, reparto, f.bono, f.iva, f.retIsr, f.retIva, f.total,
      rep?.total ?? "", rep?.estado ?? "", rep?.facturaUuid ?? "", rep?.fechaPago ?? ""]);
  }
  const n = ws.rowCount;
  const suma = (c: string) => (n >= 3 ? { formula: `SUM(${c}3:${c}${n})` } : 0);
  const tot = ws.addRow(["TOTAL", suma("B"), "", "", suma("E"), suma("F"), suma("G"), suma("H"), suma("I"), suma("J")]);
  tot.font = { bold: true };
  for (const c of [2, 5, 6, 7, 8, 9, 10]) ws.getColumn(c).numFmt = MONEDA;
  ws.getColumn(3).numFmt = "0.00%";
  ws.columns.forEach((c, i) => (c.width = [38, 18, 9, 34, 14, 12, 12, 12, 14, 14, 12, 38, 12][i]));
  return buffer(wb);
}

export async function excelPromotor(
  titulo: string,
  nombre: string,
  r: ResultadoPromotor,
  reporte?: ReporteBono,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Promotor");
  ws.addRow([`${nombre} – ${titulo.toUpperCase()}`]).font = { bold: true, size: 13 };
  ws.addRow([
    "AGENTE", "PRIMA COMPUTABLE COBRADA DAÑOS AUTOS", "BONO DAÑOS AUTOS 100%", "% AGENTE", "BONO AGENTE", "DIFERENCIA",
    "PRIMA COMPUTABLE COBRADA VGPO / ACCDS", "BONO VGPO/ACCDS", "PRIMA COMPUTABLE COBRADA TRANSPORTE", "BONO TRANSPORTE",
    "TOTAL BONO SIN AGENTE",
  ]);
  encabezado(ws, 2);
  for (const f of r.filas) {
    ws.addRow([f.nombre, f.primaAutosDanos, f.bonoAutosDanos, f.porcentajeAgente, f.bonoAgente, f.diferencia,
      f.primaVida, f.bonoVida, f.primaTransporte, f.bonoTransporte, f.totalSinAgente]);
  }
  const t = r.totales;
  ws.addRow(["TOTAL", t.primaAutosDanos, t.bonoAutosDanos, "", t.bonoAgente, t.diferencia, t.primaVida, t.bonoVida,
    t.primaTransporte, t.bonoTransporte, t.totalSinAgente]).font = { bold: true };
  ws.addRow([]);
  const resumen: [string, number][] = [
    ["Ponderado", r.ponderado], ["Subtotal × ponderado", r.subtotal], ["Factor", r.factor], ["Bono", r.bono],
    ["IVA", r.iva], ["Retención ISR", r.retIsr], ["Retención IVA", r.retIva], ["Total a facturar", r.total],
  ];
  if (reporte && Math.abs(reporte.total - r.total) > 0.005) resumen.push([`Total del reporte (${reporte.estado})`, reporte.total]);
  for (const [k, v] of resumen) {
    const row = ws.addRow(["", "", "", "", "", "", "", "", "", k, v]);
    row.getCell(10).font = { bold: true };
    if (k !== "Ponderado" && k !== "Factor") row.getCell(11).numFmt = MONEDA;
  }
  for (const c of [2, 3, 5, 6, 7, 8, 9, 10]) ws.getColumn(c).numFmt = MONEDA;
  ws.getColumn(11).numFmt = MONEDA;
  ws.getColumn(4).numFmt = "0.00%";
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 38 : 16));
  return buffer(wb);
}
