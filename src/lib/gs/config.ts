// Configuración de General de Seguros (servicios SOAP gsautos-ws).

export interface GsConfig {
  baseUrl: string;
  usuario: string;
  password: string;
  descuentoDefault: number;
  timeoutMs: number;
}

export function getGsConfig(): GsConfig {
  return {
    baseUrl: (
      process.env.GS_BASE_URL || "https://serviciosgs.mx/gsautos-ws/soap"
    ).replace(/\/+$/, ""),
    usuario: process.env.GS_WS_USER || "",
    password: process.env.GS_WS_PASS || "",
    descuentoDefault: Number(process.env.GS_DESCUENTO_DEFAULT) || 20,
    timeoutMs: Number(process.env.GS_TIMEOUT_MS) || 30_000,
  };
}

export function credencialesConfiguradas(cfg: GsConfig): boolean {
  return Boolean(cfg.usuario && cfg.password);
}

export function cotizacionRealHabilitada(): boolean {
  return process.env.GS_COTIZACION_REAL !== "false";
}
