import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import { formatMXN } from "./format";

const PAQUETE_LABEL: Record<CotizacionRequest["paquete"], string> = {
  AMPLIA: "Cobertura Amplia",
  LIMITADA: "Cobertura Limitada",
  RC: "Responsabilidad Civil (Básica)",
};

const FORMA_PAGO_LABEL: Record<CotizacionRequest["formaPago"], string> = {
  CONTADO: "Contado (anual)",
  MENSUAL: "Mensual",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
};

// Genera y descarga un PDF con la comparativa de cotizaciones para presentar
// al cliente. Se ejecuta 100% en el navegador.
export function generarPdfCotizacion(
  request: CotizacionRequest,
  resultados: CotizacionResultado[],
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const fecha = new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Encabezado.
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("Cotización de Seguro de Auto", margin, 18);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Fecha de emisión: ${fecha}`, margin, 25);

  // Datos del cliente y vehículo.
  const { vehiculo: v, conductor: c } = request;
  const contacto = [c.email, c.telefono].filter(Boolean).join(" · ");
  const clienteLineas = [
    `Cliente: ${c.nombre || "—"}`,
    contacto ? `Contacto: ${contacto}` : null,
    `Vehículo: ${v.marca} ${v.modelo} ${v.anio}${
      v.version ? ` ${v.version}` : ""
    }`,
    `Uso: ${v.uso === "COMERCIAL" ? "Comercial" : "Particular"}  ·  C.P.: ${
      v.cp || "—"
    }`,
    `Paquete: ${PAQUETE_LABEL[request.paquete]}  ·  Forma de pago: ${
      FORMA_PAGO_LABEL[request.formaPago]
    }`,
  ].filter(Boolean) as string[];

  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  let y = 33;
  for (const linea of clienteLineas) {
    doc.text(linea, margin, y);
    y += 5;
  }

  const exitosas = resultados.filter((r) => r.status === "success" && r.prima);
  const mejorPrima = exitosas
    .map((r) => r.prima!.primaTotal)
    .sort((a, b) => a - b)[0];

  // Tabla comparativa de precios (sin información interna de descuentos).
  const filas = exitosas.map((r) => {
    const p = r.prima!;
    const esMejor = p.primaTotal === mejorPrima;
    return [
      `${r.aseguradora}${esMejor ? "  ★" : ""}`,
      formatMXN(p.primaNeta),
      formatMXN(p.recargoPagoFraccionado),
      formatMXN(p.derechos),
      formatMXN(p.iva),
      formatMXN(p.primaTotal),
    ];
  });

  autoTable(doc, {
    startY: y + 3,
    head: [
      [
        "Aseguradora",
        "Prima neta",
        "Recargo pago fracc.",
        "Derechos",
        "IVA",
        "Prima total",
      ],
    ],
    body: filas,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, textColor: [51, 65, 85] },
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold" },
      5: { fontStyle: "bold", textColor: [15, 23, 42] },
    },
    didParseCell: (data) => {
      // Resalta la fila de la mejor prima.
      const raw = data.row.raw;
      if (
        data.section === "body" &&
        Array.isArray(raw) &&
        typeof raw[0] === "string" &&
        raw[0].includes("★")
      ) {
        data.cell.styles.fillColor = [220, 252, 231];
      }
    },
  });

  // Detalle de coberturas del paquete seleccionado, comparado por aseguradora.
  const tablaPreciosY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y + 40;

  if (exitosas.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Coberturas incluidas — ${PAQUETE_LABEL[request.paquete]}`,
      margin,
      tablaPreciosY + 10,
    );

    const coberturasBase = exitosas[0].coberturas;
    const covFilas = coberturasBase.map((base) => {
      const celdas = exitosas.map((r) => {
        const cob = r.coberturas.find((x) => x.nombre === base.nombre);
        if (!cob || !cob.incluida) return "No incluida";
        const ded =
          cob.deducible && cob.deducible !== "N/A"
            ? ` (Ded. ${cob.deducible})`
            : "";
        return `${cob.sumaAsegurada ?? "Incluida"}${ded}`;
      });
      return [base.nombre, ...celdas];
    });

    autoTable(doc, {
      startY: tablaPreciosY + 13,
      head: [["Cobertura", ...exitosas.map((r) => r.aseguradora)]],
      body: covFilas,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.8, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 7 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index > 0) {
          const txt = Array.isArray(data.cell.text)
            ? data.cell.text.join(" ")
            : String(data.cell.text);
          if (txt.includes("No incluida")) {
            data.cell.styles.textColor = [148, 163, 184];
          }
        }
      },
    });
  }

  // Nota al pie.
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? tablaPreciosY + 40;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const nota =
    "★ Mejor precio. Primas en pesos mexicanos (MXN), vigencia 1 año. Coberturas y sumas aseguradas de carácter informativo, sujetas a las condiciones generales de cada aseguradora y a su validación y aceptación.";
  const notaLineas = doc.splitTextToSize(nota, pageWidth - margin * 2);
  doc.text(notaLineas, margin, finalY + 8);

  const nombreArchivo = `cotizacion-${(c.nombre || "cliente")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}.pdf`;
  doc.save(nombreArchivo);
}
