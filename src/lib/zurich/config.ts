// Configuración de la integración con Zurich (Web Service V2 de Autos, SOAP
// con WS-Security UsernameToken).

export interface ZurichConfig {
  baseUrl: string;
  usuario: string;
  password: string;
  agente: string;
  oficina: string;
  // Número de relación (programa comercial) asignado por Zurich.
  numRelacion: string;
  // Descuento comercial (%) autorizado para el número de relación.
  descuentoDefault: number;
  timeoutMs: number;
}

export function getZurichConfig(): ZurichConfig {
  return {
    baseUrl: (
      process.env.ZURICH_BASE_URL || "https://uat.ezurich.com.mx/ZurichWS"
    ).replace(/\/+$/, ""),
    usuario: process.env.ZURICH_WS_USER || "",
    password: process.env.ZURICH_WS_PASS || "",
    agente: process.env.ZURICH_AGENTE || "11288",
    oficina: process.env.ZURICH_OFICINA || "11",
    numRelacion: process.env.ZURICH_NUM_RELACION || "8701022",
    descuentoDefault: Number(process.env.ZURICH_DESCUENTO_DEFAULT) || 35,
    timeoutMs: Number(process.env.ZURICH_TIMEOUT_MS) || 30_000,
  };
}

export function credencialesConfiguradas(cfg: ZurichConfig): boolean {
  return Boolean(cfg.usuario && cfg.password);
}

export function cotizacionRealHabilitada(): boolean {
  return process.env.ZURICH_COTIZACION_REAL !== "false";
}
