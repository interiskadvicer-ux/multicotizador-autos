import type { FormaPagoPoliza } from "@/domain/admin";
import type { Celda, DocumentoEstado, Renglon } from "@/lib/documento-estado";
import { extraerFechas, extraerMontos, normalizar } from "@/lib/conciliacion";

// Lectura de la carátula (PDF) de una póliza de cualquier ramo para
// prellenar el alta. Busca etiquetas comunes ("Póliza", "Contratante",
// "Prima neta", "Desde/Hasta", "Forma de pago"); lo que no encuentre queda
// vacío para captura manual.

export interface DatosCaratula {
  numeroPoliza?: string;
  ramo?: string;
  aseguradora?: string;
  asegurado?: string;
  primaNeta?: number;
  primaTotal?: number;
  vigenciaInicio?: string;
  vigenciaFin?: string;
  formaPago?: FormaPagoPoliza;
}

// [nombre, patrón sobre el texto compacto, sigla sobre el texto con espacios]
const ASEGURADORAS: [string, RegExp, RegExp?][] = [
  ["Quálitas", /QUALITAS/g],
  ["GNP", /GRUPONACIONALPROVINCIAL|GNPSEGUROS/g, /\bGNP\b/g],
  ["AXA", /AXASEGUROS/g, /\bAXA\b/g],
  ["HDI", /HDISEGUROS/g, /\bHDI\b/g],
  ["Zurich", /ZURICH/g],
  ["Banorte", /BANORTE/g],
  ["Chubb", /CHUBB/g],
  ["Mapfre", /MAPFRE/g],
  ["El Potosí", /ELPOTOSI|SEGUROSPOTOSI/g],
  ["Afirme", /AFIRME/g],
  ["General de Seguros", /GENERALDESEGUROS/g],
  ["Seguros Atlas", /SEGUROSATLAS/g],
  ["ANA Seguros", /ANASEGUROS|ANACOMPANIA/g],
  ["MetLife", /METLIFE/g],
  ["Allianz", /ALLIANZ/g],
  ["Sura", /SEGUROSSURA/g, /\bSURA\b/g],
  ["Inbursa", /INBURSA/g],
  ["BBVA Seguros", /BBVASEGUROS/g, /\bBBVA\b/g],
  ["Plan Seguro", /PLANSEGURO/g],
  ["Seguros Monterrey New York Life", /MONTERREYNEWYORKLIFE|SEGUROSMONTERREY/g],
  ["Primero Seguros", /PRIMEROSEGUROS/g],
];

const RAMOS: [RegExp, string][] = [
  [/GASTOSMEDICOS/g, "Gastos Médicos Mayores"],
  [/ACCIDENTESPERSONALES/g, "Accidentes Personales"],
  [/SEGURODEVIDA|VIDAINDIVIDUAL|VIDAGRUPO|SUMAASEGURADAPORFALLECIMIENTO/g, "Vida"],
  [/AUTOMOVIL|AUTOS|VEHICULO|NUMERODESERIE|PLACAS/g, "Autos"],
  [/DANOS|INCENDIO|HOGAR|EMPRESARIAL|RESPONSABILIDADCIVIL|EDIFICIO|CONTENIDOS/g, "Daños / Hogar"],
  [/TRANSPORTE|MERCANCIA/g, "Transporte"],
];

const MESES_LARGOS: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7,
  AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

function fechas(texto: string): string[] {
  const res = extraerFechas(texto);
  const plano = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  for (const m of Array.from(plano.matchAll(/\b(\d{1,2})\s+DE\s+([A-Z]+)\s+(?:DE|DEL)\s+(20\d{2})\b/g))) {
    const mes = MESES_LARGOS[m[2]];
    if (mes) res.push(`${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  return res;
}

const texto = (r: Renglon) => r.celdas.map((c) => c.texto).join("  ");

// Celdas que son otra etiqueta (formatos con varias columnas de datos).
const ES_ETIQUETA =
  /:$|^(n[úu]mero de p[óo]liza|p[óo]liza|asegurado|contratante|r\.?f\.?c\.?|domicilio|forma de pago|frecuencia de pago|periodicidad|(inicio|fin) de vigencia|vigencia( desde| hasta)?|desde|hasta|prima neta|prima total|importe total|total a pagar|derecho de p[óo]liza|iva|moneda|agente|clave)$/i;

// Valores a la derecha de la etiqueta (misma celda tras ":", celdas
// siguientes del renglón) y, si no hay, la celda debajo de ella.
function valoresTras(doc: DocumentoEstado, etiqueta: RegExp): string[] {
  const re = new RegExp(`(?:^|\\s)(?:${etiqueta.source})\\s*[:.]?\\s*(.*)$`, "i");
  const valores: string[] = [];
  doc.renglones.forEach((r, i) => {
    r.celdas.forEach((c, ci) => {
      const m = c.texto.match(re);
      if (!m) return;
      const resto = [m[1], ...r.celdas.slice(ci + 1, ci + 3).map((x) => x.texto)]
        .map((s) => s.trim())
        .filter((s) => s && !ES_ETIQUETA.test(s));
      valores.push(...resto);
      const abajo = celdaDebajo(doc, i, c);
      if (abajo && !ES_ETIQUETA.test(abajo.texto.trim())) valores.push(abajo.texto.trim());
    });
  });
  return valores;
}

function celdaDebajo(doc: DocumentoEstado, i: number, c: Celda): Celda | null {
  const sig = doc.renglones[i + 1];
  if (!sig || sig.pagina !== doc.renglones[i].pagina) return null;
  const centro = c.x + c.ancho / 2;
  const dist = (o: Celda) => Math.min(Math.abs(o.x - c.x), Math.abs(o.x + o.ancho / 2 - centro));
  const cercana = sig.celdas.reduce<Celda | null>((a, b) => (!a || dist(b) < dist(a) ? b : a), null);
  return cercana && dist(cercana) <= Math.max(25, c.ancho) ? cercana : null;
}

function numeroPoliza(doc: DocumentoEstado): string | undefined {
  const etiqueta = /(?:no\.?|n[úu]m(?:ero)?\.?)?\s*(?:de\s+)?p[óo]liza(?:\s*(?:no\.?|n[úu]m(?:ero)?\.?|#))?/;
  for (const v of valoresTras(doc, etiqueta)) {
    const token = v
      .split(/\s+/)
      .find((t) => /\d/.test(t) && /^[A-Z0-9][A-Z0-9\-/]{3,29}$/i.test(t) && !fechas(t).length);
    if (token) return token.replace(/[.,;:]+$/, "");
  }
  return undefined;
}

function asegurado(doc: DocumentoEstado): string | undefined {
  const etiqueta = /nombre\s+del\s+(?:asegurado|contratante)|contratante|asegurado\s+titular|asegurado|raz[óo]n\s+social/;
  for (const v of valoresTras(doc, etiqueta)) {
    const limpio = v.replace(/\b(R\.?F\.?C\.?|DOMICILIO|DIRECCI[ÓO]N|C\.?P\.?)\b.*$/i, "").trim();
    const letras = limpio.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").length;
    if (letras >= 5 && letras >= limpio.replace(/\s/g, "").length * 0.7 && !/^(y|o|del|de)\b/i.test(limpio)) {
      return limpio.slice(0, 120);
    }
  }
  return undefined;
}

function prima(doc: DocumentoEstado, etiqueta: RegExp): number | undefined {
  for (const v of valoresTras(doc, etiqueta)) {
    const m = extraerMontos(v);
    if (m.length) return m[0];
    const n = Number(v.replace(/[$,\s]|MXN|M\.N\./gi, ""));
    if (/\d/.test(v) && Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function vigencia(doc: DocumentoEstado): [string | undefined, string | undefined] {
  const desde = valoresTras(doc, /(?:vigencia\s+)?desde|inicio\s+de\s+vigencia|vigencia\s+inicial/).flatMap(fechas)[0];
  const hasta = valoresTras(doc, /hasta|fin\s+de\s+vigencia|vigencia\s+final|vencimiento/).flatMap(fechas)[0];
  if (desde && hasta && hasta > desde) return [desde, hasta];
  // Sin etiquetas: el par de fechas más cercano a un año de diferencia.
  const todas = Array.from(new Set(doc.renglones.flatMap((r) => fechas(texto(r))))).sort();
  let mejor: [string, string] | null = null;
  let error = Infinity;
  for (let i = 0; i < todas.length; i++) {
    for (let j = i + 1; j < todas.length; j++) {
      const dias = (Date.parse(todas[j]) - Date.parse(todas[i])) / 86_400_000;
      const e = Math.abs(dias - 365);
      if (dias >= 28 && e < error) {
        error = e;
        mejor = [todas[i], todas[j]];
      }
    }
  }
  return mejor ?? [desde, hasta];
}

function formaPago(doc: DocumentoEstado): FormaPagoPoliza | undefined {
  const valores = valoresTras(doc, /forma\s+de\s+pago|frecuencia\s+de\s+pago|periodicidad(?:\s+de\s+pago)?|conducto\s+de\s+pago/);
  for (const v of valores) {
    const n = normalizar(v);
    if (n.includes("MENSUAL")) return "MENSUAL";
    if (n.includes("TRIMESTRAL")) return "TRIMESTRAL";
    if (n.includes("SEMESTRAL")) return "SEMESTRAL";
    if (/ANUAL|CONTADO/.test(n)) return "ANUAL";
  }
  return undefined;
}

function cuenta(texto: string, re?: RegExp): number {
  return re ? (texto.match(re) ?? []).length : 0;
}

function aseguradora(plano: string, compacto: string): string | undefined {
  let mejor: [number, string] | null = null;
  for (const [nombre, completo, sigla] of ASEGURADORAS) {
    const n = cuenta(compacto, completo) * 2 + cuenta(plano, sigla);
    if (n > 0 && (!mejor || n > mejor[0])) mejor = [n, nombre];
  }
  return mejor?.[1];
}

function ramo(compacto: string): string | undefined {
  let mejor: [number, string] | null = null;
  for (const [re, nombre] of RAMOS) {
    const n = cuenta(compacto, re);
    if (n > 0 && (!mejor || n > mejor[0])) mejor = [n, nombre];
  }
  return mejor?.[1];
}

export function leerCaratula(doc: DocumentoEstado): DatosCaratula {
  // Con espacios entre palabras para que \b funcione en siglas (GNP, AXA).
  const plano = doc.renglones
    .map(texto)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "");
  const compacto = plano.replace(/ /g, "");
  const [vigenciaInicio, vigenciaFin] = vigencia(doc);
  const datos: DatosCaratula = {
    numeroPoliza: numeroPoliza(doc),
    aseguradora: aseguradora(plano, compacto),
    ramo: ramo(compacto),
    asegurado: asegurado(doc),
    primaNeta: prima(doc, /prima\s+neta/),
    primaTotal: prima(doc, /prima\s+total|importe\s+total|total\s+a\s+pagar|prima\s+anual\s+total/),
    vigenciaInicio,
    vigenciaFin,
    formaPago: formaPago(doc),
  };
  return Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined)) as DatosCaratula;
}
