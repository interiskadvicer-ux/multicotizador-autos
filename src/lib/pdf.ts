import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  CotizacionRequest,
  CotizacionResultado,
  Paquete,
} from "@/domain/types";
import { formatMXN } from "./format";

const PAQUETE_LABEL: Record<Paquete, string> = {
  AMPLIA_PLUS: "Cobertura Amplia Plus",
  AMPLIA: "Cobertura Amplia",
  LIMITADA: "Cobertura Limitada",
  RC: "Responsabilidad Civil (Básica)",
};

const ORDEN_PAQUETES: Paquete[] = ["AMPLIA_PLUS", "AMPLIA", "LIMITADA", "RC"];

const FORMA_PAGO_LABEL: Record<CotizacionRequest["formaPago"], string> = {
  CONTADO: "Contado (anual)",
  MENSUAL: "Mensual",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
};

type DocConTabla = jsPDF & { lastAutoTable?: { finalY: number } };

const LOGO_URL = "/logo-interisk.jpg";
const LOGO_PROPORCION = 515 / 800;

async function cargarLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Genera y descarga un PDF con la comparativa de cotizaciones para presentar
// al cliente: una tabla de prima total por aseguradora y paquete, y las
// coberturas de cada paquete. No incluye información interna (descuentos).
// Se ejecuta 100% en el navegador.
export async function generarPdfCotizacion(
  request: CotizacionRequest,
  resultados: CotizacionResultado[],
  soloPaquetes?: readonly Paquete[],
): Promise<void> {
  const logo = await cargarLogo();
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  }) as DocConTabla;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const fecha = new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Encabezado.
  if (logo) {
    const ancho = 42;
    doc.addImage(logo, "JPEG", pageWidth - margin - ancho, 6, ancho, ancho * LOGO_PROPORCION);
  }
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
    `Uso: ${v.uso === "COMERCIAL" ? "Comercial" : "Particular"}${
      v.uso === "COMERCIAL" && v.tipoCarga && v.tipoCarga !== "VACIO"
        ? ` (carga tipo ${v.tipoCarga})`
        : ""
    }  ·  C.P.: ${
      v.cp || "—"
    }  ·  Forma de pago: ${FORMA_PAGO_LABEL[request.formaPago]}`,
  ].filter(Boolean) as string[];

  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  let y = 33;
  for (const linea of clienteLineas) {
    doc.text(linea, margin, y);
    y += 5;
  }

  const exitosas = resultados.filter(
    (r) =>
      r.status === "success" &&
      r.prima &&
      (!soloPaquetes || soloPaquetes.includes(r.paquete)),
  );
  const paquetes = ORDEN_PAQUETES.filter((p) =>
    exitosas.some((r) => r.paquete === p),
  );
  const aseguradoras = Array.from(
    new Map(exitosas.map((r) => [r.aseguradoraId, r.aseguradora])).entries(),
  ).sort(([ida], [idb]) => {
    // Orden por la Amplia (casi todas la tienen); si no, por el primer paquete.
    const orden = paquetes.includes("AMPLIA") ? "AMPLIA" : paquetes[0];
    const pa =
      exitosas.find((r) => r.aseguradoraId === ida && r.paquete === orden)
        ?.prima?.primaTotal ?? Infinity;
    const pb =
      exitosas.find((r) => r.aseguradoraId === idb && r.paquete === orden)
        ?.prima?.primaTotal ?? Infinity;
    return pa - pb;
  });

  const buscar = (id: string, p: Paquete) =>
    exitosas.find((r) => r.aseguradoraId === id && r.paquete === p);

  const mejorPorPaquete = new Map<Paquete, number>();
  for (const p of paquetes) {
    const primas = exitosas
      .filter((r) => r.paquete === p)
      .map((r) => r.prima!.primaTotal);
    mejorPorPaquete.set(p, Math.min(...primas));
  }

  // Detalle de coberturas por paquete, comparado por aseguradora.
  for (const p of paquetes) {
    // De la prima más baja (izquierda) a la más alta (derecha).
    const delPaquete = aseguradoras
      .map(([id, nombre]) => ({ nombre, r: buscar(id, p) }))
      .filter((x): x is { nombre: string; r: CotizacionResultado } =>
        Boolean(x.r),
      )
      .sort((a, b) => a.r.prima!.primaTotal - b.r.prima!.primaTotal);
    if (delPaquete.length === 0) continue;

    let startY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 14 : y + 6;
    if (startY > pageHeight - 50) {
      doc.addPage();
      startY = 18;
    }

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Coberturas incluidas — ${PAQUETE_LABEL[p]}`, margin, startY);

    const nombres: string[] = [];
    for (const { r } of delPaquete) {
      for (const cob of r.coberturas) {
        if (!nombres.includes(cob.nombre)) nombres.push(cob.nombre);
      }
    }
    const covFilas = nombres.map((nombre) => [
      nombre,
      ...delPaquete.map(({ r }) => {
        const cob = r.coberturas.find((x) => x.nombre === nombre);
        if (!cob || !cob.incluida) return "No incluida";
        const ded =
          cob.deducible && cob.deducible !== "N/A"
            ? ` (Ded. ${cob.deducible})`
            : "";
        return `${cob.sumaAsegurada ?? "Incluida"}${ded}`;
      }),
    ]);

    autoTable(doc, {
      startY: startY + 3,
      head: [
        ["Cobertura", ...delPaquete.map((x) => x.nombre)],
        ["Prima total", ...delPaquete.map(({ r }) => formatMXN(r.prima!.primaTotal))],
      ],
      body: covFilas,
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.8, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 7 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 } },
      didParseCell: (data) => {
        if (data.section === "head" && data.row.index === 1) {
          const r = delPaquete[data.column.index - 1]?.r;
          const esMejor = r?.prima?.primaTotal === mejorPorPaquete.get(p);
          data.cell.styles.fillColor = esMejor ? [220, 252, 231] : [240, 253, 250];
          data.cell.styles.textColor = esMejor ? [6, 95, 70] : [15, 23, 42];
          data.cell.styles.fontSize = 9;
          return;
        }
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
  let finalY = (doc.lastAutoTable?.finalY ?? y + 40) + 8;
  if (finalY > pageHeight - 20) {
    doc.addPage();
    finalY = 18;
  }
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const nota =
    "En verde: mejor precio de cada paquete. Prima total anual en pesos mexicanos (MXN), IVA incluido, vigencia 1 año. " +
    "Coberturas y sumas aseguradas de carácter informativo, sujetas a las condiciones generales de cada aseguradora y a su validación y aceptación.";
  const notaLineas = doc.splitTextToSize(nota, pageWidth - margin * 2);
  doc.text(notaLineas, margin, finalY);

  const nombreArchivo = `cotizacion-${(c.nombre || "cliente")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}.pdf`;
  doc.save(nombreArchivo);
}
