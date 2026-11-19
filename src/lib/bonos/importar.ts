import ExcelJS from "exceljs";
import { mesDeTexto, normalizarNombre, numero } from "./normalizar";
import type { AgenteCatalogo, FilaImportada } from "./repositorio";

function valor(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object") {
    if ("result" in v) return valor((v as ExcelJS.CellFormulaValue).result ?? null);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    if (v instanceof Date) return v;
    if ("error" in v) return null;
  }
  return v;
}

function filasDe(ws: ExcelJS.Worksheet): unknown[][] {
  const res: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as ExcelJS.CellValue[];
    res.push(vals.slice(1).map(valor));
  });
  return res;
}

function indiceEncabezado(fila: unknown[], patron: RegExp): number {
  return fila.findIndex((c) => patron.test(normalizarNombre(c)));
}

export interface ResultadoLectura {
  tipo: "REPORTE" | "LIBRO";
  // Reporte original de El Potosí: un solo mes.
  filas?: FilaImportada[];
  // Libro de cierre (BASE 1 + CATAOGOS): todos los meses que contenga.
  meses?: { anio: number; mes: number; filas: FilaImportada[] }[];
  catalogo?: AgenteCatalogo[];
}

export async function leerLibro(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

export function leerProduccion(wb: ExcelJS.Workbook): ResultadoLectura {
  const base = wb.worksheets.find((w) => normalizarNombre(w.name) === "BASE 1");
  if (base) return leerLibroCierre(wb, base);
  for (const ws of wb.worksheets) {
    const filas = filasDe(ws);
    const h = filas.findIndex((f) => indiceEncabezado(f, /^AGENTE$/) >= 0 && indiceEncabezado(f, /^PRIMA COBRADA$/) >= 0);
    if (h < 0) continue;
    const enc = filas[h];
    const col = {
      agente: indiceEncabezado(enc, /^AGENTE$/),
      grupo: indiceEncabezado(enc, /^GRUPO$/),
      subgrupo: indiceEncabezado(enc, /^SUBGRUPO$/),
      emitida: indiceEncabezado(enc, /^PRIMA EMITIDA$/),
      cobrada: indiceEncabezado(enc, /^PRIMA COBRADA$/),
      comision: indiceEncabezado(enc, /^COMISI[OÓ]N$/),
    };
    const res: FilaImportada[] = [];
    for (const f of filas.slice(h + 1)) {
      const texto = String(f[col.agente] ?? "").trim();
      const m = texto.match(/^([A-Za-z0-9]+)\s*-\s*(.+)$/);
      if (!m || /^0+$/.test(m[1]) || /TODOS LOS INTERMEDIARIOS/i.test(texto)) continue;
      const subgrupo = String(f[col.subgrupo] ?? "").trim();
      if (!subgrupo) continue;
      res.push({
        clave: m[1],
        agente: m[2],
        grupo: String(f[col.grupo] ?? ""),
        subgrupo,
        primaEmitida: numero(f[col.emitida]),
        primaCobrada: numero(f[col.cobrada]),
        comision: col.comision >= 0 ? numero(f[col.comision]) : 0,
      });
    }
    if (res.length === 0) throw new Error("El reporte no tiene renglones de agentes.");
    return { tipo: "REPORTE", filas: res };
  }
  throw new Error("No reconozco el archivo: debe ser el reporte de El Potosí (columnas Agente, Subgrupo, Prima cobrada) o tu libro de cierre con la hoja BASE 1.");
}

function leerLibroCierre(wb: ExcelJS.Workbook, base: ExcelJS.Worksheet): ResultadoLectura {
  const filas = filasDe(base);
  const enc = filas[0];
  const col = {
    clave: indiceEncabezado(enc, /^CLAVE$/),
    agente: indiceEncabezado(enc, /^AGENTE$/),
    grupo: indiceEncabezado(enc, /^GRUPO/),
    subgrupo: indiceEncabezado(enc, /^SUBGRUPO$/),
    emitida: indiceEncabezado(enc, /^PRIMA EMITIDA$/),
    cobrada: indiceEncabezado(enc, /^PRIMA COBRADA$/),
    comision: indiceEncabezado(enc, /^COMISION$/),
    anio: indiceEncabezado(enc, /^AÑO$/),
    mes: indiceEncabezado(enc, /^MES$/),
  };
  if (Object.values(col).some((c) => c < 0)) throw new Error("La hoja BASE 1 no tiene las columnas esperadas.");
  const porMes = new Map<string, { anio: number; mes: number; filas: FilaImportada[] }>();
  for (const f of filas.slice(1)) {
    const anio = Math.trunc(numero(f[col.anio]));
    const mes = mesDeTexto(f[col.mes]);
    const subgrupo = String(f[col.subgrupo] ?? "").trim();
    if (anio < 2000 || mes < 1 || !subgrupo) continue;
    const k = `${anio}-${mes}`;
    if (!porMes.has(k)) porMes.set(k, { anio, mes, filas: [] });
    porMes.get(k)!.filas.push({
      clave: String(f[col.clave] ?? ""),
      agente: String(f[col.agente] ?? ""),
      grupo: String(f[col.grupo] ?? ""),
      subgrupo,
      primaEmitida: numero(f[col.emitida]),
      primaCobrada: numero(f[col.cobrada]),
      comision: numero(f[col.comision]),
    });
  }
  const meses = Array.from(porMes.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes);
  return { tipo: "LIBRO", meses, catalogo: leerCatalogo(wb) };
}

// Hoja CATAOGOS: tabla "NO. | AGENTES | SUB | %".
function leerCatalogo(wb: ExcelJS.Workbook): AgenteCatalogo[] {
  const ws = wb.worksheets.find((w) => normalizarNombre(w.name).startsWith("CAT"));
  if (!ws) return [];
  const filas = filasDe(ws);
  const h = filas.findIndex((f) => normalizarNombre(f[0]) === "NO." && normalizarNombre(f[1]) === "AGENTES");
  if (h < 0) return [];
  const res: AgenteCatalogo[] = [];
  for (const f of filas.slice(h + 1)) {
    const nombre = normalizarNombre(f[1]);
    const porcentaje = numero(f[3]);
    if (!nombre || !normalizarNombre(f[2])) continue;
    res.push({ clave: String(f[0] ?? ""), nombre, subpromo: normalizarNombre(f[2]), porcentaje });
  }
  return res;
}

export function leerCorreos(wb: ExcelJS.Workbook): { clave: string; nombre: string; email: string }[] {
  for (const ws of wb.worksheets) {
    const filas = filasDe(ws);
    const h = filas.findIndex((f) => indiceEncabezado(f, /CORREO|E-?MAIL/) >= 0);
    if (h < 0) continue;
    const enc = filas[h];
    const cCorreo = indiceEncabezado(enc, /CORREO|E-?MAIL/);
    const cNombre = indiceEncabezado(enc, /AGENTE|NOMBRE/);
    const cClave = indiceEncabezado(enc, /CLAVE/);
    return filas.slice(h + 1).map((f) => ({
      clave: cClave >= 0 ? String(f[cClave] ?? "") : "",
      nombre: cNombre >= 0 ? String(f[cNombre] ?? "") : "",
      email: String(f[cCorreo] ?? "").trim(),
    })).filter((f) => f.email);
  }
  throw new Error("No encontré una columna de CORREO o EMAIL.");
}
