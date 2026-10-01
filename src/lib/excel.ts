import ExcelJS from "exceljs";
import type { PolizaConEstado } from "@/lib/polizas";
import type {
  EstatusPago,
  OrigenPago,
  RegistroActividad,
  ReciboGuardado,
} from "@/domain/admin";

const ETIQUETA_ESTADO: Record<string, string> = {
  VIGENTE: "Vigente",
  PROXIMA: "Próxima (≤60 días)",
  POR_VENCER: "Por vencer (≤30 días)",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
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

const ETIQUETA_PAGO: Record<EstatusPago, string> = {
  PAGADA: "Pagada",
  PENDIENTE: "Pendiente",
  CANCELADA: "Cancelada",
};

const ETIQUETA_ORIGEN: Record<OrigenPago, string> = {
  AFIRME: "Real Afirme",
  MANUAL: "Captura manual",
};

function situacionRecibo(r: ReciboGuardado, hoy: string): string {
  if (r.situacion === "PAGADO") return "Pagado";
  if (r.situacion === "CANCELADO") return "Cancelado";
  return r.fechaVencimiento && r.fechaVencimiento < hoy
    ? "Pendiente (vencido)"
    : "Pendiente";
}

// Reporte de cobranza: hoja de pólizas con su estatus de pago y hoja con el
// detalle de recibos consultados a la aseguradora.
export async function excelPagos(
  polizas: PolizaConEstado[],
  recibos: ReciboGuardado[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Multicotizador Interiskad";
  const hoy = new Date().toISOString().slice(0, 10);

  const wsP = wb.addWorksheet("Pólizas");
  wsP.columns = [
    { header: "No. Póliza", key: "numeroPoliza", width: 18 },
    { header: "Aseguradora", key: "aseguradora", width: 16 },
    { header: "Asegurado", key: "asegurado", width: 30 },
    { header: "Vehículo", key: "vehiculo", width: 30 },
    { header: "Prima total", key: "primaTotal", width: 14 },
    { header: "Vigencia inicio", key: "vigenciaInicio", width: 15 },
    { header: "Vigencia fin", key: "vigenciaFin", width: 15 },
    { header: "Estatus póliza (aseguradora)", key: "estatusAseguradora", width: 22 },
    { header: "Estatus de pago", key: "estatusPago", width: 16 },
    { header: "Origen del dato", key: "origenPago", width: 16 },
    { header: "Consultado el", key: "pagoActualizadoAt", width: 20 },
  ];
  for (const p of polizas) {
    wsP.addRow({
      numeroPoliza: p.numeroPoliza,
      aseguradora: p.aseguradora,
      asegurado: p.asegurado,
      vehiculo: p.vehiculo ?? "",
      primaTotal: p.primaTotal,
      vigenciaInicio: p.vigenciaInicio,
      vigenciaFin: p.vigenciaFin,
      estatusAseguradora: p.estatusAseguradora ?? "",
      estatusPago: p.estatusPago ? ETIQUETA_PAGO[p.estatusPago] : "Sin dato",
      origenPago: p.origenPago ? ETIQUETA_ORIGEN[p.origenPago] : "",
      pagoActualizadoAt: p.pagoActualizadoAt ?? "",
    });
  }
  wsP.getColumn("primaTotal").numFmt = '"$"#,##0.00';
  estilizarEncabezado(wsP);
  wsP.autoFilter = { from: "A1", to: "K1" };

  const porId = new Map(polizas.map((p) => [p.id, p]));
  const wsR = wb.addWorksheet("Recibos");
  wsR.columns = [
    { header: "No. Póliza", key: "numeroPoliza", width: 18 },
    { header: "Asegurado", key: "asegurado", width: 30 },
    { header: "Recibo", key: "idRecibo", width: 12 },
    { header: "Folio", key: "folio", width: 12 },
    { header: "Endoso", key: "numeroEndoso", width: 8 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Incisos", key: "incisos", width: 12 },
    { header: "Situación", key: "situacion", width: 20 },
    { header: "Vence", key: "fechaVencimiento", width: 12 },
    { header: "Prima neta", key: "primaNeta", width: 14 },
    { header: "Recargo", key: "recargo", width: 12 },
    { header: "Derechos", key: "derechos", width: 12 },
    { header: "IVA", key: "iva", width: 12 },
    { header: "Prima total", key: "primaTotal", width: 14 },
    { header: "Origen", key: "origen", width: 14 },
    { header: "Consultado el", key: "consultadoAt", width: 20 },
    { header: "Consultado por", key: "consultadoPor", width: 26 },
  ];
  for (const r of recibos) {
    const p = porId.get(r.policyId);
    if (!p) continue;
    wsR.addRow({
      numeroPoliza: p.numeroPoliza,
      asegurado: p.asegurado,
      idRecibo: r.idRecibo,
      folio: r.folio,
      numeroEndoso: r.numeroEndoso,
      tipo: r.tipoRecibo === "RD" || r.primaTotal < 0 ? "Devolución" : "Cargo",
      incisos: r.incisos,
      situacion: situacionRecibo(r, hoy),
      fechaVencimiento: r.fechaVencimiento ?? "",
      primaNeta: r.primaNeta,
      recargo: r.recargo,
      derechos: r.derechos,
      iva: r.iva,
      primaTotal: r.primaTotal,
      origen: ETIQUETA_ORIGEN[r.origen],
      consultadoAt: r.consultadoAt,
      consultadoPor: r.consultadoPor,
    });
  }
  for (const k of ["primaNeta", "recargo", "derechos", "iva", "primaTotal"]) {
    wsR.getColumn(k).numFmt = '"$"#,##0.00';
  }
  estilizarEncabezado(wsR);
  wsR.autoFilter = { from: "A1", to: "Q1" };

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
