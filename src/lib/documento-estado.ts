import ExcelJS from "exceljs";

// Un renglón del estado de cuenta con sus celdas y su posición. En PDF `x`,
// `ancho` y `y` son coordenadas de la página; en CSV/Excel `x` es el índice
// de columna.
export interface Celda {
  texto: string;
  x: number;
  ancho: number;
}

export interface Renglon {
  pagina: number;
  y: number;
  celdas: Celda[];
}

export type TipoEstadoCuenta = "pdf" | "csv" | "xlsx";

export interface DocumentoEstado {
  tipo: TipoEstadoCuenta;
  renglones: Renglon[];
}

export function tipoDeArchivo(nombre: string, datos: Buffer): TipoEstadoCuenta | null {
  const ext = nombre.toLowerCase().split(".").pop();
  if (datos.subarray(0, 4).toString() === "%PDF") return "pdf";
  if (ext === "xlsx" && datos.subarray(0, 2).toString() === "PK") return "xlsx";
  if (ext === "csv" && !datos.subarray(0, 4096).includes(0)) return "csv";
  return null;
}

export async function leerDocumento(tipo: TipoEstadoCuenta, datos: Buffer): Promise<DocumentoEstado> {
  const renglones =
    tipo === "pdf" ? await renglonesPdf(datos) : tipo === "xlsx" ? await renglonesXlsx(datos) : renglonesCsv(datos);
  return { tipo, renglones };
}

interface ItemTexto {
  str: string;
  transform: number[];
  width: number;
}

// Agrupa el texto del PDF por coordenada Y para reconstruir renglones.
async function renglonesPdf(datos: Buffer): Promise<Renglon[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(datos),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const renglones: Renglon[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      const porY = new Map<number, Celda[]>();
      for (const item of contenido.items as ItemTexto[]) {
        const texto = item.str?.trim();
        if (!texto) continue;
        const y = Math.round(item.transform[5] / 2) * 2;
        const fila = porY.get(y) ?? [];
        fila.push({ texto, x: item.transform[4], ancho: item.width ?? 0 });
        porY.set(y, fila);
      }
      Array.from(porY.entries())
        .sort((a, b) => b[0] - a[0])
        .forEach(([y, celdas]) => renglones.push({ pagina: n, y, celdas: celdas.sort((a, b) => a.x - b.x) }));
      pagina.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return renglones;
}

function aRenglon(valores: string[], i: number): Renglon {
  return {
    pagina: 1,
    y: -i,
    celdas: valores
      .map((texto, x) => ({ texto: texto.trim(), x, ancho: 1 }))
      .filter((c) => c.texto),
  };
}

function renglonesCsv(datos: Buffer): Renglon[] {
  const texto = datos.toString("utf8").replace(/^\uFEFF/, "");
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || fila.length) filas.push([...fila, campo]);
  return filas.map(aRenglon).filter((r) => r.celdas.length);
}

async function renglonesXlsx(datos: Buffer): Promise<Renglon[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(datos as unknown as ArrayBuffer);
  const renglones: Renglon[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      const valores: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        valores[col - 1] = typeof v === "number" ? v.toFixed(2) : cell.text ?? "";
      });
      renglones.push(aRenglon(valores, renglones.length));
    });
  });
  return renglones.filter((r) => r.celdas.length);
}
