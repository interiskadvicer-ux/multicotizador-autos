// Opciones del cotizador de Gastos Médicos Mayores Individual de AURA.
// Sin tarifas: se puede importar desde el navegador.

export const SUMAS_ASEGURADAS = [
  500000, 1000000, 2000000, 5000000, 7000000, 10000000, 20000000, 30000000,
  40000000, 50000000,
] as const;
export const DEDUCIBLES = [15000, 22000, 35000, 50000, 75000, 100000, 150000, 200000] as const;
export const COASEGUROS = [0.1, 0.15, 0.2, 0.25] as const;
export const TOPES_COASEGURO = [30000, 50000, 75000, 100000] as const;
export const NIVELES_HOSPITALARIOS = ["1 - AMPLIO", "2 - ESTÁNDAR", "3 - ESENCIAL"] as const;
export const TABULADORES = [
  "THQ BASE",
  "THQ + 10%",
  "THQ + 25%",
  "THQ + 50%",
  "THQ + 75%",
  "THQ + 100%",
] as const;
export const ESTADOS = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Coahuila",
  "Colima", "Chiapas", "Chihuahua", "CDMX y Z.M.", "Durango", "Guanajuato", "Guerrero",
  "Hidalgo", "Jalisco", "Estado de México", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán",
  "Zacatecas",
] as const;
export const FORMAS_PAGO = ["ANUAL", "SEMESTRAL", "TRIMESTRAL", "MENSUAL"] as const;
export const EDAD_MAXIMA = 75;
export const MAX_ASEGURADOS = 13;

export const EMERGENCIA_EXTRANJERO = { sumaAsegurada: 1500000, deducible: 1500 };
export const BENEFICIO_MATERNIDAD = 32000;

export type FormaPagoGmm = (typeof FORMAS_PAGO)[number];

export const PARENTESCOS = ["Titular", "Cónyuge", "Hijo(a)", "Otro"] as const;

export interface AseguradoGmm {
  nombre: string;
  parentesco: string;
  sexo: "F" | "M";
  edad: number;
}

export interface SolicitudGmm {
  sumaAsegurada: number;
  deducible: number;
  coaseguro: number;
  topeCoaseguro: number;
  nivelHospitalario: string;
  estado: string;
  tabulador: string;
  formaPago: FormaPagoGmm;
  emergenciaExtranjero: boolean;
  asegurados: AseguradoGmm[];
}

export interface ResultadoGmm {
  asegurados: (AseguradoGmm & { prima: number })[];
  primaNeta: number;
  derechoPoliza: number;
  recargoFraccionado: number;
  subtotal: number;
  iva: number;
  primaTotal: number;
  primerPago: number;
  pagoSubsecuente: number;
  numeroPagos: number;
  beneficioMaternidad: boolean;
}

// Maternidad: aplica si hay alguna asegurada de 15 a 50 años.
export function aplicaMaternidad(asegurados: AseguradoGmm[]): boolean {
  return asegurados.some((a) => a.sexo === "F" && a.edad > 14 && a.edad <= 50);
}
