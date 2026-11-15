import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMXN } from "./format";
import { cargarLogo, LOGO_PROPORCION } from "./pdf";
import {
  BENEFICIO_MATERNIDAD,
  EMERGENCIA_EXTRANJERO,
  type ResultadoGmm,
  type SolicitudGmm,
} from "./gmm/opciones";

type DocConTabla = jsPDF & { lastAutoTable?: { finalY: number } };

const pct = (n: number) => `${Math.round(n * 100)}%`;

// PDF para el cliente con la cotización de GMM Individual AURA. Se genera en el navegador.
export async function generarPdfGmm(
  solicitud: SolicitudGmm,
  resultado: ResultadoGmm,
  agente: string,
): Promise<void> {
  const logo = await cargarLogo();
  const doc = new jsPDF({ unit: "mm", format: "letter" }) as DocConTabla;
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 14;
  const fecha = new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (logo) {
    const w = 40;
    doc.addImage(logo, "JPEG", ancho - margen - w, 8, w, w * LOGO_PROPORCION);
  }
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text("Cotización de Gastos Médicos Mayores Individual", margen, 18);
  doc.setFontSize(11);
  doc.text("Plenit · AURA", margen, 25);
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Fecha: ${fecha}`, margen, 31);
  doc.text(`Elaborado por: ${agente}`, margen, 36);

  const estilos = {
    styles: {
      fontSize: 8.5,
      cellPadding: 2,
      textColor: [15, 23, 42] as [number, number, number],
      lineColor: [71, 85, 105] as [number, number, number],
      lineWidth: 0.2,
    },
    headStyles: { fillColor: [23, 37, 84] as [number, number, number], textColor: 255 },
    margin: { left: margen, right: margen },
  };

  const coberturas: string[][] = [
    ["Suma asegurada", formatMXN(solicitud.sumaAsegurada)],
    ["Deducible", formatMXN(solicitud.deducible)],
    ["Coaseguro", pct(solicitud.coaseguro)],
    ["Tope de coaseguro", formatMXN(solicitud.topeCoaseguro)],
    ["Nivel hospitalario", solicitud.nivelHospitalario],
    ["Tabulador de honorarios", solicitud.tabulador],
    ["Estado", solicitud.estado],
    ["Forma de pago", solicitud.formaPago],
    ["Servicios de asistencia", "Incluida"],
    [
      "Emergencia en el extranjero",
      solicitud.emergenciaExtranjero
        ? `SA ${formatMXN(EMERGENCIA_EXTRANJERO.sumaAsegurada)} · Deducible ${formatMXN(EMERGENCIA_EXTRANJERO.deducible)}`
        : "No incluida",
    ],
  ];
  if (resultado.beneficioMaternidad)
    coberturas.push(["Beneficio de maternidad", formatMXN(BENEFICIO_MATERNIDAD)]);

  autoTable(doc, {
    ...estilos,
    startY: 44,
    head: [["Cobertura básica", ""]],
    body: coberturas,
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
  });

  autoTable(doc, {
    ...estilos,
    startY: (doc.lastAutoTable?.finalY ?? 100) + 6,
    head: [["Asegurado", "Parentesco", "Sexo", "Edad", "Prima neta anual"]],
    body: resultado.asegurados.map((a) => [
      a.nombre || "—",
      a.parentesco,
      a.sexo === "F" ? "Femenino" : "Masculino",
      String(a.edad),
      formatMXN(a.prima),
    ]),
    columnStyles: { 4: { halign: "right" } },
  });

  const totales: string[][] = [
    ["Prima neta anual", formatMXN(resultado.primaNeta)],
    ["Derecho de póliza", formatMXN(resultado.derechoPoliza)],
    ["Recargo por pago fraccionado", formatMXN(resultado.recargoFraccionado)],
    ["Subtotal", formatMXN(resultado.subtotal)],
    ["IVA", formatMXN(resultado.iva)],
    ["Prima total", formatMXN(resultado.primaTotal)],
  ];
  if (resultado.numeroPagos > 1) {
    totales.push(["Primer pago", formatMXN(resultado.primerPago)]);
    totales.push([
      `Pagos subsecuentes (${resultado.numeroPagos - 1})`,
      formatMXN(resultado.pagoSubsecuente),
    ]);
  }
  autoTable(doc, {
    ...estilos,
    startY: (doc.lastAutoTable?.finalY ?? 150) + 6,
    head: [["Prima", ""]],
    body: totales,
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 }, 1: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.raw === totales[5]) {
        data.cell.styles.fillColor = [134, 239, 172];
        data.cell.styles.textColor = [5, 46, 22];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    "La presente cotización tiene una vigencia de 30 días naturales a partir de la fecha de elaboración.",
    margen,
    (doc.lastAutoTable?.finalY ?? 230) + 8,
  );
  doc.save(`cotizacion-gmm-plenit-aura-${new Date().toISOString().slice(0, 10)}.pdf`);
}
