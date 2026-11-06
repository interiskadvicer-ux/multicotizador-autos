import type { Celda, DocumentoEstado, Renglon } from "@/lib/documento-estado";

// Conciliación de estados de cuenta de aseguradoras contra las pólizas
// registradas: busca cada número de póliza y toma los importes de su renglón
// o, en reportes donde cada póliza es una columna (p. ej. Quálitas), de su
// columna.

export interface PolizaConciliable {
  id: number;
  numeroPoliza: string;
  asegurado: string;
  aseguradora: string;
  primaNeta: number;
  primaTotal: number;
  pagado: number;
}

export interface Coincidencia {
  polizaId: number;
  numeroPoliza: string;
  asegurado: string;
  aseguradora: string;
  primaTotal: number;
  pagado: number;
  saldo: number;
  linea: string;
  montosLinea: number[];
  montoSugerido: number;
  // Algún importe del documento coincide con la prima o el saldo.
  importeCoincide: boolean;
  fechaDocumento: string | null;
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const sinCeros = (s: string) => s.replace(/^0+/, "");

export function extraerMontos(texto: string): number[] {
  const re = /-?\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|-?\$?\s?\d+\.\d{2}\b/g;
  return (texto.match(re) ?? [])
    .map((m) => Number(m.replace(/[$,\s]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

const MESES: Record<string, number> = {
  ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, AUG: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12,
};

const aIso = (a: number, m: number, d: number) =>
  m < 1 || m > 12 || d < 1 || d > 31
    ? null
    : `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Fechas reconocibles (2026-10-01, 01/10/2026, 03/Oct/2026, 23 - 09 - 2026).
export function extraerFechas(texto: string): string[] {
  const fechas: (string | null)[] = [];
  for (const x of Array.from(texto.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g))) {
    fechas.push(aIso(Number(x[1]), Number(x[2]), Number(x[3])));
  }
  const re = /\b(\d{1,2})\s?[/-]\s?([A-Za-z]{3}|\d{1,2})\s?[/-]\s?(20\d{2})\b/g;
  for (const x of Array.from(texto.matchAll(re))) {
    const m = /^\d+$/.test(x[2]) ? Number(x[2]) : MESES[x[2].toUpperCase()] ?? 0;
    fechas.push(aIso(Number(x[3]), m, Number(x[1])));
  }
  return fechas.filter((f): f is string => !!f);
}

// La fecha de pago es la más reciente que no sea futura (descarta, p. ej.,
// el fin de vigencia).
function fechaDePago(fechas: string[]): string | null {
  const hoy = new Date().toLocaleDateString("en-CA");
  const pasadas = fechas.filter((f) => f <= hoy).sort();
  return pasadas.at(-1) ?? null;
}

// Índices de las celdas donde aparece el número (puede venir partido en
// varios tokens o con ceros a la izquierda). -1 si no aparece.
function buscarEnRenglon(r: Renglon, objetivo: string): [number, number] | null {
  const tokens = r.celdas.flatMap((c, ci) =>
    c.texto.split(/\s+/).map((t) => ({ t: normalizar(t), ci })).filter((x) => x.t),
  );
  for (let i = 0; i < tokens.length; i++) {
    let acumulado = "";
    for (let j = i; j < Math.min(tokens.length, i + 4); j++) {
      acumulado += tokens[j].t;
      if (acumulado === objetivo || sinCeros(acumulado) === sinCeros(objetivo)) {
        return [tokens[i].ci, tokens[j].ci];
      }
      if (acumulado.length >= objetivo.length) break;
    }
  }
  return null;
}

const textoRenglon = (r: Renglon) => r.celdas.map((c) => c.texto).join("  ");

// Celdas de la misma columna: en cada renglón de la página, la celda más
// cercana al número de póliza por su centro o por su borde izquierdo (si
// queda a menos de su ancho).
function columna(doc: DocumentoEstado, r: Renglon, desde: number, hasta: number): string[] {
  const x0 = r.celdas[desde].x;
  const x1 = r.celdas[hasta].x + r.celdas[hasta].ancho;
  const centro = (x0 + x1) / 2;
  const maximo = Math.max(8, x1 - x0);
  const textos: string[] = [];
  for (const o of doc.renglones) {
    if (o.pagina !== r.pagina || o === r || o.celdas.length === 0) continue;
    const dist = (c: Celda) => Math.min(Math.abs(c.x + c.ancho / 2 - centro), Math.abs(c.x - x0));
    const cercana = o.celdas.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    if (dist(cercana) <= maximo) textos.push(cercana.texto);
  }
  return textos;
}

// En CSV/Excel, la columna cuyo encabezado dice "Fecha de pago".
function columnaFechaPago(doc: DocumentoEstado): number | null {
  for (const r of doc.renglones.slice(0, 10)) {
    const c = r.celdas.find((x) => /FECHA(DE)?PAGO/.test(normalizar(x.texto)));
    if (c) return c.x;
  }
  return null;
}

const cerca = (a: number, b: number) => b > 0 && Math.abs(a - b) <= Math.max(1, b * 0.02);

export function conciliar(doc: DocumentoEstado, polizas: PolizaConciliable[]): Coincidencia[] {
  const resultado: Coincidencia[] = [];
  const colFecha = doc.tipo === "pdf" ? null : columnaFechaPago(doc);
  for (const p of polizas) {
    const objetivo = normalizar(p.numeroPoliza);
    if (objetivo.length < 4) continue;
    let renglon: Renglon | null = null;
    let rango: [number, number] | null = null;
    for (const r of doc.renglones) {
      rango = buscarEnRenglon(r, objetivo);
      if (rango) {
        renglon = r;
        break;
      }
    }
    if (!renglon || !rango) continue;

    const linea = textoRenglon(renglon);
    let montos = extraerMontos(linea);
    const celdaFecha = colFecha == null ? undefined : renglon.celdas.find((c) => c.x === colFecha);
    let fechas = extraerFechas(celdaFecha?.texto ?? linea);
    let detalle = linea;
    if (montos.length === 0 && doc.tipo === "pdf") {
      const col = columna(doc, renglon, rango[0], rango[1]);
      montos = col.flatMap(extraerMontos);
      if (fechas.length === 0) fechas = col.flatMap(extraerFechas);
      detalle = `${linea.slice(0, 80)} … ${montos.slice(0, 6).join(" · ")}`;
    }

    const saldo = Math.max(0, Math.round((p.primaTotal - p.pagado) * 100) / 100);
    const referencia = saldo > 0 ? saldo : p.primaTotal;
    const importeCoincide = montos.some(
      (m) => cerca(m, saldo) || cerca(m, p.primaTotal) || cerca(m, p.primaNeta),
    );
    const montoSugerido =
      importeCoincide || montos.length === 0
        ? referencia
        : montos.reduce((a, b) => (Math.abs(b - referencia) < Math.abs(a - referencia) ? b : a));

    resultado.push({
      polizaId: p.id,
      numeroPoliza: p.numeroPoliza,
      asegurado: p.asegurado,
      aseguradora: p.aseguradora,
      primaTotal: p.primaTotal,
      pagado: p.pagado,
      saldo,
      linea: detalle.slice(0, 240),
      montosLinea: montos.slice(0, 12),
      montoSugerido,
      importeCoincide,
      fechaDocumento: fechaDePago(fechas),
    });
  }
  return resultado;
}

// "Quálitas" ~ "QUALITAS COMPAÑIA DE SEGUROS": compara sin acentos y por
// inclusión para tolerar nombres capturados a mano.
export function mismaAseguradora(a: string, b: string): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return true;
  return x.includes(y) || y.includes(x);
}
