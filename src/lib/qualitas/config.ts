// Configuración de la integración con los web services de Quálitas.
// Los valores se leen de variables de entorno para no exponer llaves en el
// repositorio. Los valores por defecto corresponden al negocio del broker
// (según la matriz de negocio entregada por Quálitas).

export type Ambiente = "pruebas" | "produccion";

// Endpoints del web service de cotización/emisión (obtenerNuevaEmision).
const WS_EMISION_URL: Record<Ambiente, string> = {
  pruebas: "https://qa.qualitas.com.mx:8443/WsEmision/WsEmision.asmx",
  produccion: "http://sio.qualitas.com.mx/WsEmision/WsEmision.asmx",
};

export interface QualitasConfig {
  ambiente: Ambiente;
  // URL del WS de cotización/emisión.
  wsEmisionUrl: string;
  // URL del WS de tarifas (catálogo de vehículos / ClaveAmis).
  wsTarifasUrl: string;
  // Clave del negocio ligada a descuentos y políticas de suscripción.
  negocio: string;
  // Clave del agente al que se acreditan comisiones.
  agente: string;
  // Descuento comercial por defecto (%) autorizado para el negocio.
  descuentoDefault: number;
  // Usuario de QBCenter para consumir el WS de tarifas (lo entrega Quálitas).
  qbcUsuario: string;
  // Tarifa a consultar en el WS de tarifas (catálogo de vehículos).
  qbcTarifa: string;
  // Timeout de red para las llamadas SOAP (ms).
  timeoutMs: number;
}

function ambienteFromEnv(): Ambiente {
  return process.env.QUALITAS_AMBIENTE === "produccion"
    ? "produccion"
    : "pruebas";
}

export function getQualitasConfig(): QualitasConfig {
  const ambiente = ambienteFromEnv();
  return {
    ambiente,
    wsEmisionUrl: process.env.QUALITAS_WS_URL || WS_EMISION_URL[ambiente],
    wsTarifasUrl:
      process.env.QUALITAS_WS_TARIFAS_URL ||
      "http://qbcenter.qualitas.com.mx/wsTarifa/wsTarifa.asmx",
    negocio: process.env.QUALITAS_NEGOCIO || "08849",
    agente: process.env.QUALITAS_AGENTE || "0080245",
    descuentoDefault: Number(process.env.QUALITAS_DESCUENTO_DEFAULT) || 45,
    qbcUsuario: process.env.QUALITAS_QBC_USUARIO || "",
    qbcTarifa: process.env.QUALITAS_QBC_TARIFA || "LINEA",
    timeoutMs: Number(process.env.QUALITAS_TIMEOUT_MS) || 20_000,
  };
}

// La cotización real está habilitada salvo que se desactive explícitamente.
// El adaptador cae al cálculo simulado cuando no hay datos suficientes
// (ClaveAmis / estado) o cuando esta bandera está en "false".
export function cotizacionRealHabilitada(): boolean {
  return process.env.QUALITAS_COTIZACION_REAL !== "false";
}
