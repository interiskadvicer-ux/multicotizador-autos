// Dominio del multicotizador de autos.
// Estos tipos son la interfaz común que todas las aseguradoras deben respetar.

export type Uso = "PARTICULAR" | "COMERCIAL";

// Riesgo de la carga que transporta un vehículo de uso comercial.
export type TipoCarga = "VACIO" | "A" | "B";

export type Genero = "M" | "F";

// Paquetes estándar del mercado mexicano de autos. AMPLIA_PLUS es el paquete
// más alto de cada aseguradora (p. ej. Integral Plus de Banorte); solo lo
// cotizan las aseguradoras que lo declaran en `InsurerAdapter.paquetes`.
export type PaqueteEstandar = "AMPLIA" | "LIMITADA" | "RC";
export type Paquete = PaqueteEstandar | "AMPLIA_PLUS";

export const PAQUETES_ESTANDAR: readonly Paquete[] = ["AMPLIA", "LIMITADA", "RC"];

// Para integraciones que solo manejan los paquetes estándar.
export function paqueteEstandar(p: Paquete): PaqueteEstandar {
  if (p === "AMPLIA_PLUS") {
    throw new Error("La aseguradora no ofrece un paquete superior a Amplia.");
  }
  return p;
}

export type FormaPago = "CONTADO" | "MENSUAL" | "TRIMESTRAL" | "SEMESTRAL";

export interface Vehiculo {
  marca: string;
  modelo: string; // submarca / línea
  anio: number;
  version: string;
  uso: Uso;
  tipoCarga?: TipoCarga; // solo uso comercial; por defecto viaja vacío
  valorFactura?: number; // valor comercial estimado en MXN
  cp: string; // código postal de circulación
  // Clave del vehículo en el catálogo de Quálitas (ClaveAmis). Requerida para
  // la cotización real de Quálitas; opcional para el resto (simuladas).
  claveAmis?: string;
  // Clave del vehículo en el catálogo de Banorte. Requerida para la cotización
  // real de Banorte.
  claveBanorte?: string;
  // idEstilo del vehículo en el catálogo de Afirme (Midas Autos). Requerido
  // para la cotización real de Afirme.
  claveAfirme?: string;
  // Clave del vehículo en el catálogo de Zurich (p. ej. 098C6954). Requerida
  // para la cotización real de Zurich.
  claveZurich?: string;
  // Clave del vehículo en el catálogo de HDI
  // (`tipoVehiculo|idMarca|idTipo|idVersion|idTransmision`).
  claveHdi?: string;
  // Clave del vehículo en el catálogo de El Potosí (`tipo-marca-modelo-version`,
  // p. ej. AUT-120-001-07). Requerida para la cotización real de El Potosí.
  claveElPotosi?: string;
  // Clave del vehículo en el catálogo de General de Seguros (claveGs, p. ej.
  // 10598). Requerida para la cotización real de General de Seguros.
  claveGs?: string;
}

export interface Conductor {
  nombre: string;
  fechaNacimiento: string; // ISO yyyy-mm-dd
  genero: Genero;
  cp: string;
  email?: string;
  telefono?: string;
}

// Coberturas que el broker puede ajustar desde el comparativo. Todas son
// opcionales: si se omiten, cada aseguradora usa el valor por defecto de su
// plan. Las sumas aseguradas van en MXN y los deducibles en porcentaje.
export interface CoberturasPersonalizadas {
  responsabilidadCivil?: number;
  gastosMedicos?: number;
  deducibleDanosMateriales?: number;
  deducibleRoboTotal?: number;
}

export const OPCIONES_RC = [3_000_000, 4_000_000, 5_000_000] as const;
export const OPCIONES_GM = [100_000, 150_000, 200_000, 300_000, 500_000] as const;
export const OPCIONES_DEDUCIBLE_DM = [3, 5, 10] as const;
export const OPCIONES_DEDUCIBLE_RT = [5, 10, 20] as const;

export interface CotizacionRequest {
  vehiculo: Vehiculo;
  conductor: Conductor;
  // Paquete principal (compatibilidad). Si se envía `paquetes`, se cotizan
  // todos los indicados y este campo solo se usa como valor por defecto.
  paquete: Paquete;
  paquetes?: Paquete[];
  // Limita la cotización a estas aseguradoras (p. ej. para recotizar una
  // sola fila con otro descuento). Si se omite, se consultan todas.
  aseguradoras?: string[];
  formaPago: FormaPago;
  // Descuento (%) a aplicar por aseguradora: { [aseguradoraId]: porcentaje }.
  // Cada aseguradora ofrece un descuento comercial distinto; el broker puede
  // ajustarlo por cotización. Si no se envía, se usa el descuento por defecto
  // de cada aseguradora.
  descuentos?: Record<string, number>;
  // Sumas aseguradas y deducibles elegidos por el broker. Cada aseguradora
  // aplica el valor más cercano que admita y lo reporta en `ajustes`.
  coberturasPersonalizadas?: CoberturasPersonalizadas;
  // Coberturas opcionales contratadas en la Amplia, por aseguradora:
  // { [aseguradoraId]: [clave de la cobertura en esa aseguradora] }.
  coberturasAdicionales?: Record<string, string[]>;
}

// Cobertura opcional que la aseguradora ofrece para el paquete (devuelta por
// su web service) y que el broker puede contratar.
export interface CoberturaOpcional {
  id: string;
  nombre: string;
  contratada: boolean;
}

export interface Cobertura {
  nombre: string;
  incluida: boolean;
  sumaAsegurada?: string; // texto libre: "Valor comercial", "$3,000,000", "AMPARADA"
  deducible?: string; // texto libre: "5%", "10%", "N/A"
}

export interface DesglosePrima {
  // Prima neta antes de aplicar el descuento comercial de la aseguradora.
  primaNetaSinDescuento: number;
  // Descuento comercial aplicado.
  descuentoPorcentaje: number;
  descuentoMonto: number;
  // Prima neta final (ya con el descuento aplicado).
  primaNeta: number;
  derechos: number;
  recargoPagoFraccionado: number;
  iva: number;
  primaTotal: number;
}

export interface CotizacionResultado {
  aseguradoraId: string;
  aseguradora: string;
  status: "success" | "error";
  paquete: Paquete;
  moneda: "MXN";
  prima?: DesglosePrima;
  coberturas: Cobertura[];
  vigencia?: {
    inicio: string;
    fin: string;
  };
  // Milisegundos que tardó el web service en responder (útil para monitoreo).
  tiempoRespuestaMs?: number;
  error?: string;
  // La aseguradora no maneja este paquete (se muestra "No disponible").
  noOfrecido?: boolean;
  // Indica si la prima proviene de un web service real o de un cálculo
  // simulado. Permite señalar en la UI qué cotizaciones son reales.
  origen?: "real" | "simulado";
  // Número de cotización devuelto por la aseguradora (cuando aplica).
  noCotizacion?: string;
  // Dato adicional que la aseguradora pide para emitir esta cotización
  // (p. ej. el id del plan de pago de El Potosí).
  referenciaEmision?: string;
  // Avisos cuando la aseguradora no admite exactamente una cobertura
  // solicitada y aplicó el valor más cercano (p. ej. "RC mínima $4,000,000").
  ajustes?: string[];
  // Coberturas opcionales disponibles para este paquete (solo Amplia).
  opcionales?: CoberturaOpcional[];
}

export interface Aseguradora {
  id: string;
  nombre: string;
}
