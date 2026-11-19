import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMXN } from "./format";
import { cargarLogo, LOGO_PROPORCION } from "./pdf";
import type { CampoGmm, ResultadoBanorte } from "./gmm/banorte/productos";

type DocConTabla = jsPDF & { lastAutoTable?: { finalY: number } };

function mostrar(v: string | number | undefined, formato?: CampoGmm["formato"]): string {
  if (v === undefined) return "";
  if (typeof v !== "number") return v;
  if (formato === "dinero") return formatMXN(v);
  if (formato === "porcentaje") return `${Math.round(v * 100)}%`;
  return String(v);
}

// PDF para el cliente con la cotización de GMM Individual Banorte. Se genera en el navegador.
export async function generarPdfGmmBanorte(
  campos: CampoGmm[],
  valores: Record<string, string | number>,
  resultado: ResultadoBanorte,
  agente: string,
): Promise<void> {
  const logo = await cargarLogo();
  const doc = new jsPDF({ unit: "mm", format: "letter" }) as DocConTabla;
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 14;
  const fecha = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });

  if (logo) {
    const w = 40;
    doc.addImage(logo, "JPEG", ancho - margen - w, 8, w, w * LOGO_PROPORCION);
  }
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text("Cotización de Gastos Médicos Mayores Individual", margen, 18);
  doc.setFontSize(11);
  doc.text(resultado.nombre, margen, 25);
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

  autoTable(doc, {
    ...estilos,
    startY: 44,
    head: [["Coberturas", ""]],
    body: campos.map((c) => [c.etiqueta, mostrar(valores[c.clave], c.formato)]),
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 } },
  });

  autoTable(doc, {
    ...estilos,
    startY: (doc.lastAutoTable?.finalY ?? 100) + 6,
    head: [["Asegurado", "Parentesco", "Sexo", "Edad"]],
    body: resultado.asegurados.map((a) => [
      a.nombre || "—",
      a.parentesco,
      a.sexo === "F" ? "Femenino" : "Masculino",
      String(a.edad),
    ]),
  });

  autoTable(doc, {
    ...estilos,
    startY: (doc.lastAutoTable?.finalY ?? 150) + 6,
    head: [["Forma de pago", "Primer recibo", "Recibos subsecuentes", "Prima total anual"]],
    body: resultado.pagos.map((p) => [
      p.forma,
      formatMXN(p.primerRecibo),
      p.subsecuentes ? formatMXN(p.subsecuentes) : "—",
      formatMXN(p.total),
    ]),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
  });

  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    "Primas con IVA incluido. La presente cotización tiene una vigencia de 30 días naturales a partir de la fecha de elaboración.",
    margen,
    (doc.lastAutoTable?.finalY ?? 230) + 8,
  );
  doc.save(`cotizacion-gmm-banorte-${new Date().toISOString().slice(0, 10)}.pdf`);
}
