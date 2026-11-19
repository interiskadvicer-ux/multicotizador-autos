export const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const NOMBRES_BIMESTRE = ["1er", "2do", "3er", "4to", "5to", "6to"];

export function normalizarClave(v: unknown): string {
  const s = String(v ?? "").replace(/\u00a0/g, " ").trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(s)) return "";
  return s.replace(/^0+(?=.)/, "");
}

export function normalizarNombre(v: unknown): string {
  return String(v ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function mesDeTexto(v: unknown): number {
  if (typeof v === "number" && v >= 1 && v <= 12) return v;
  const s = normalizarNombre(v).slice(0, 3);
  return MESES.indexOf(s) + 1;
}

export function bimestreDeMes(mes: number): number {
  return Math.ceil(mes / 2);
}

export function mesesDeBimestre(bimestre: number): [number, number] {
  return [bimestre * 2 - 1, bimestre * 2];
}

export function etiquetaBimestre(anio: number, bimestre: number): string {
  const [a, b] = mesesDeBimestre(bimestre);
  return `${NOMBRES_BIMESTRE[bimestre - 1]} bimestre ${anio} (${NOMBRES_MES[a - 1]}–${NOMBRES_MES[b - 1]})`;
}

export function etiquetaMes(anio: number, mes: number): string {
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}
