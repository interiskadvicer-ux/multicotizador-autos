// Comparativo de GMM: homologa una captura común a las opciones de cada
// producto (el valor permitido más cercano) y arma la solicitud de cada uno.
// Sin tarifas: se usa desde el navegador.
import { formatMXN } from "../format";
import type { CampoGmm, ProductoBanorte, ResultadoBanorte } from "./banorte/productos";
import {
  COASEGUROS,
  DEDUCIBLES,
  ESTADOS,
  NIVELES_HOSPITALARIOS,
  SUMAS_ASEGURADAS,
  TABULADORES,
  TOPES_COASEGURO,
  type AseguradoGmm,
  type FormaPagoGmm,
  type ResultadoGmm,
  type SolicitudGmm,
} from "./opciones";

export type ProductoGmm = "AURA" | ProductoBanorte;

export const PRODUCTOS_GMM: { clave: ProductoGmm; nombre: string }[] = [
  { clave: "AURA", nombre: "Plenit AURA" },
  { clave: "ESENCIAL", nombre: "Banorte Esencial" },
  { clave: "TOTAL", nombre: "Banorte Total" },
  { clave: "TRANSFORMA", nombre: "Banorte Plan Transforma" },
];

export interface BaseComparativo {
  sa: number;
  ded: number;
  coa: number;
  estado: string;
}

export const BASE_SUMAS = [
  500000, 1000000, 2000000, 3000000, 5000000, 7000000, 10000000, 20000000, 30000000,
  40000000, 50000000, 100000000,
];
export const BASE_DEDUCIBLES = [
  15000, 18000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 75000, 100000, 150000, 200000,
];
export const BASE_COASEGUROS = [0.1, 0.15, 0.2, 0.25];
export const BASE_ESTADOS = ESTADOS;

// Campos de AURA con el mismo formato que los de Banorte.
export const CAMPOS_AURA: CampoGmm[] = [
  { clave: "sa", etiqueta: "Suma asegurada", formato: "dinero", opciones: [...SUMAS_ASEGURADAS], valor: 50000000 },
  { clave: "ded", etiqueta: "Deducible", formato: "dinero", opciones: [...DEDUCIBLES], valor: 50000 },
  { clave: "coa", etiqueta: "Coaseguro", formato: "porcentaje", opciones: [...COASEGUROS], valor: 0.1 },
  { clave: "tope", etiqueta: "Tope de coaseguro", formato: "dinero", opciones: [...TOPES_COASEGURO], valor: 30000 },
  { clave: "nivel", etiqueta: "Nivel hospitalario", opciones: [...NIVELES_HOSPITALARIOS], valor: "1 - AMPLIO" },
  { clave: "estado", etiqueta: "Estado", opciones: [...ESTADOS], valor: "CDMX y Z.M." },
  { clave: "thq", etiqueta: "Tabulador de honorarios", opciones: [...TABULADORES], valor: "THQ BASE" },
  { clave: "emergencia", etiqueta: "Emergencia en el extranjero", opciones: ["SI", "NO"], valor: "NO" },
];

const normal = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

const ALIAS_ESTADO: Record<string, string> = { "CDMX Y Z.M.": "CIUDAD DE MEXICO" };

function porcentaje(o: string | number): number {
  if (typeof o === "number") return o;
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(o);
  return m ? Number(m[1]) / 100 : NaN;
}

function cercano(opciones: (string | number)[], valor: number, aNumero = (o: string | number) => Number(o)) {
  let mejor: string | number | undefined;
  let dif = Infinity;
  for (const o of opciones) {
    const n = aNumero(o);
    if (!Number.isFinite(n)) continue;
    if (Math.abs(n - valor) < dif) {
      dif = Math.abs(n - valor);
      mejor = o;
    }
  }
  return mejor;
}

function estadoEn(opciones: (string | number)[], estado: string) {
  const n = ALIAS_ESTADO[normal(estado)] ?? normal(estado);
  return (
    opciones.find((o) => normal(String(o)) === n) ??
    opciones.find((o) => normal(String(o)) === `${n} NORTE`)
  );
}

// Valores de un producto para la captura común. Lo que no se homologa queda
// como viene en su Excel; las coberturas opcionales van sin contratar.
export function homologar(
  campos: CampoGmm[],
  base: BaseComparativo,
  numAsegurados: number,
): Record<string, string | number> {
  const v: Record<string, string | number> = {};
  for (const c of campos) {
    let elegido: string | number | undefined;
    if (c.clave === "sa") elegido = cercano(c.opciones, base.sa);
    else if (c.clave === "ded") elegido = cercano(c.opciones, base.ded);
    else if (c.clave === "coa") elegido = cercano(c.opciones, base.coa, porcentaje);
    else if (c.clave === "estado") elegido = estadoEn(c.opciones, base.estado);
    else if (c.clave === "tipo") elegido = c.opciones.find((o) => normal(String(o)) === "NUEVA");
    else if (c.clave === "cotizacion")
      elegido = c.opciones.find((o) => o === (numAsegurados > 1 ? "FAMILIAR" : "INDIVIDUAL"));
    else if (c.clave === "elimDed") elegido = c.opciones.find((o) => o === "NO");
    v[c.clave] = elegido ?? c.valor;
  }
  return v;
}

export function solicitudAura(
  v: Record<string, string | number>,
  formaPago: FormaPagoGmm,
  asegurados: AseguradoGmm[],
): SolicitudGmm {
  return {
    sumaAsegurada: Number(v.sa),
    deducible: Number(v.ded),
    coaseguro: Number(v.coa),
    topeCoaseguro: Number(v.tope),
    nivelHospitalario: String(v.nivel),
    estado: String(v.estado),
    tabulador: String(v.thq),
    formaPago,
    emergenciaExtranjero: v.emergencia === "SI",
    asegurados,
  };
}

export interface PrimaComparativo {
  primaTotal: number;
  primerRecibo: number;
  subsecuentes: number;
}

export function primaAura(r: ResultadoGmm): PrimaComparativo {
  return { primaTotal: r.primaTotal, primerRecibo: r.primerPago, subsecuentes: r.pagoSubsecuente };
}

export function primaBanorte(r: ResultadoBanorte, formaPago: FormaPagoGmm): PrimaComparativo {
  const p = r.pagos.find((x) => normal(x.forma) === formaPago);
  // El Excel deja el recibo en 0 cuando no alcanza el recibo mínimo de Banorte.
  if (!p || !(p.total > 0)) throw new Error(`Banorte no permite pago ${formaPago.toLowerCase()} para esta prima. Elige otra forma de pago.`);
  return { primaTotal: p.total, primerRecibo: p.primerRecibo, subsecuentes: p.subsecuentes };
}

export function mostrarValor(o: string | number | undefined, formato?: CampoGmm["formato"]): string {
  if (o === undefined || o === "") return "—";
  if (typeof o !== "number") return o.trim();
  if (formato === "dinero") return formatMXN(o);
  if (formato === "porcentaje") return `${Math.round(o * 100)}%`;
  return String(o);
}

// Renglones de coberturas del comparativo, en el orden en que se muestran.
export const RENGLONES: { clave: string; etiqueta: string }[] = [
  { clave: "sa", etiqueta: "Suma asegurada" },
  { clave: "ded", etiqueta: "Deducible" },
  { clave: "coa", etiqueta: "Coaseguro" },
  { clave: "tope", etiqueta: "Tope de coaseguro" },
  { clave: "nivel", etiqueta: "Nivel hospitalario" },
  { clave: "estado", etiqueta: "Estado" },
];
