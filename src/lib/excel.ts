import ExcelJS from "exceljs";
import type { PolizaConEstado } from "@/lib/polizas";
import type { RegistroActividad } from "@/domain/admin";

const ETIQUETA_ESTADO: Record<string, string> = {
  VIGENTE: "Vigente",
  PROXIMA: "Próxima (≤60 días)",
  POR_VENCER: "Por vencer (≤30 días)",
  VENCIDA: "Vencida",
};

async function bufferDeWorkbook(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const data = await wb.xlsx.writeBuffer();
  const view = new Uint8Array(data as ArrayBuffer);
  const ab = new ArrayBuffer(view.byteLength);
  new Uint8Array(ab).set(view);
  return ab;
}

function estilizarEncabezado(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0369A1" },
  };
  header.alignment = { vertical: "middle" };
}

export async function excelPolizas(
  polizas: PolizaConEstado[],
  titulo = "Pólizas",
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Multicotizador Interiskad";
  const ws = wb.addWorksheet(titulo);
  ws.columns = [
    { header: "No. Póliza", key: "numeroPoliza", width: 18 },
    { header: "Ramo", key: "ramo", width: 20 },
    { header: "Aseguradora", key: "aseguradora", width: 18 },
    { header: "Asegurado", key: "asegurado", width: 28 },
    { header: "Prima neta", key: "primaNeta", width: 14 },
    { header: "Prima total", key: "primaTotal", width: 14 },
    { header: "Vigencia inicio", key: "vigenciaInicio", width: 15 },
    { header: "Vigencia fin", key: "vigenciaFin", width: 15 },
    { header: "Días p/vencer", key: "diasParaVencer", width: 13 },
    { header: "Estado", key: "estado", width: 22 },
    { header: "Notas", key: "notas", width: 30 },
  ];

  for (const p of polizas) {
    ws.addRow({
      numeroPoliza: p.numeroPoliza,
      ramo: p.ramo,
      aseguradora: p.aseguradora,
      asegurado: p.asegurado,
      primaNeta: p.primaNeta,
      primaTotal: p.primaTotal,
      vigenciaInicio: p.vigenciaInicio,
      vigenciaFin: p.vigenciaFin,
      diasParaVencer: p.diasParaVencer,
      estado: ETIQUETA_ESTADO[p.estado] ?? p.estado,
      notas: p.notas ?? "",
    });
  }

  ws.getColumn("primaNeta").numFmt = '"$"#,##0.00';
  ws.getColumn("primaTotal").numFmt = '"$"#,##0.00';
  estilizarEncabezado(ws);
  ws.autoFilter = { from: "A1", to: "K1" };

  return bufferDeWorkbook(wb);
}

export async function excelActividad(
  registros: RegistroActividad[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Multicotizador Interiskad";
  const ws = wb.addWorksheet("Actividad");
  ws.columns = [
    { header: "Fecha", key: "createdAt", width: 22 },
    { header: "Usuario", key: "usuarioEmail", width: 30 },
    { header: "Acción", key: "accion", width: 20 },
    { header: "Detalle", key: "detalle", width: 50 },
  ];

  for (const r of registros) {
    ws.addRow({
      createdAt: r.createdAt,
      usuarioEmail: r.usuarioEmail,
      accion: r.accion,
      detalle: r.detalle,
    });
  }

  estilizarEncabezado(ws);
  ws.autoFilter = { from: "A1", to: "D1" };

  return bufferDeWorkbook(wb);
}

export function nombreArchivo(base: string): string {
  const fecha = new Date().toISOString().slice(0, 10);
  return `${base}-${fecha}.xlsx`;
}
