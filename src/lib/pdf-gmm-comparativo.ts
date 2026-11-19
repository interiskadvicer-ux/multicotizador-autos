import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatMXN } from "./format";
import { cargarLogo, LOGO_PROPORCION } from "./pdf";
import type { PrimaComparativo } from "./gmm/comparativo";
import type { AseguradoGmm, FormaPagoGmm } from "./gmm/opciones";

type DocConTabla = jsPDF & { lastAutoTable?: { finalY: number } };

export interface ComparativoPdf {
  agente: string;
  formaPago: FormaPagoGmm;
  asegurados: AseguradoGmm[];
  renglones: string[];
  // Ya ordenadas de menor a mayor prima.
  columnas: { nombre: string; prima: PrimaComparativo; valores: string[] }[];
}

// PDF para el cliente con el comparativo de GMM. Se genera en el navegador.
export async function generarPdfGmmComparativo(c: ComparativoPdf): Promise<void> {
  const logo = await cargarLogo();
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: c.columnas.length > 3 ? "landscape" : "portrait" }) as DocConTabla;
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 14;
  const fecha = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });

  if (logo) {
    const w = 40;
    doc.addImage(logo, "JPEG", ancho - margen - w, 8, w, w * LOGO_PROPORCION);
  }
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text("Comparativo de Gastos Médicos Mayores Individual", margen, 18);
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Fecha: ${fecha}`, margen, 26);
  doc.text(`Elaborado por: ${c.agente}`, margen, 31);
  doc.text(`Forma de pago: ${c.formaPago.toLowerCase()}`, margen, 36);

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
    head: [["Asegurado", "Parentesco", "Sexo", "Edad"]],
    body: c.asegurados.map((a) => [
      a.nombre || "—",
      a.parentesco,
      a.sexo === "F" ? "Femenino" : "Masculino",
      String(a.edad),
    ]),
  });

  const fraccionado = c.formaPago !== "ANUAL";
  const primas = [
    ["Prima total anual", ...c.columnas.map((x) => formatMXN(x.prima.primaTotal))],
    ...(fraccionado
      ? [
          ["Primer recibo", ...c.columnas.map((x) => formatMXN(x.prima.primerRecibo))],
          ["Recibos subsecuentes", ...c.columnas.map((x) => formatMXN(x.prima.subsecuentes))],
        ]
      : []),
  ];
  autoTable(doc, {
    ...estilos,
    startY: (doc.lastAutoTable?.finalY ?? 80) + 6,
    head: [["", ...c.columnas.map((x) => x.nombre)]],
    body: [...primas, ...c.renglones.map((r, i) => [r, ...c.columnas.map((x) => x.valores[i])])],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "center";
      if (d.section !== "body") return;
      if (d.column.index > 0) d.cell.styles.halign = "center";
      if (d.row.index < primas.length) {
        d.cell.styles.fillColor = [203, 213, 225];
        d.cell.styles.fontStyle = "bold";
        if (d.row.index === 0 && d.column.index === 1) d.cell.styles.textColor = [21, 101, 52];
      }
    },
  });

  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    "Primas con IVA incluido. La presente cotización tiene una vigencia de 30 días naturales a partir de la fecha de elaboración.",
    margen,
    (doc.lastAutoTable?.finalY ?? 230) + 8,
  );
  doc.save(`comparativo-gmm-${new Date().toISOString().slice(0, 10)}.pdf`);
}
