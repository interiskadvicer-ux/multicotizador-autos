// Configuración de General de Seguros (servicios SOAP gsautos-ws).

export interface GsConfig {
  baseUrl: string;
  usuario: string;
  password: string;
  idNegocio: string;
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
    idNegocio: process.env.GS_ID_NEGOCIO || "",
    descuentoDefault: Number(process.env.GS_DESCUENTO_DEFAULT) || 35,
    timeoutMs: Number(process.env.GS_TIMEOUT_MS) || 60_000,
  };
}

export function credencialesConfiguradas(cfg: GsConfig): boolean {
  return Boolean(cfg.usuario && cfg.password);
}

export function cotizacionRealHabilitada(): boolean {
  return process.env.GS_COTIZACION_REAL !== "false";
}

export type AmbienteGs = "pruebas" | "produccion";

// La emisión crea pólizas reales en producción; por omisión va al ambiente de
// pruebas (serviciosgs.mx) con sus propias credenciales, aunque la cotización
// use producción.
export function ambienteEmisionGs(): AmbienteGs {
  return process.env.GS_EMISION_AMBIENTE === "produccion" ? "produccion" : "pruebas";
}

export function getGsConfigEmision(): GsConfig {
  const base = getGsConfig();
  const cfg: GsConfig =
    ambienteEmisionGs() === "produccion"
      ? base
      : {
          ...base,
          baseUrl: (
            process.env.GS_PRUEBAS_BASE_URL || "https://serviciosgs.mx/gsautos-ws/soap"
          ).replace(/\/+$/, ""),
          usuario: process.env.GS_PRUEBAS_WS_USER || "",
          password: process.env.GS_PRUEBAS_WS_PASS || "",
          idNegocio: process.env.GS_PRUEBAS_ID_NEGOCIO || "",
        };
  // emitirCotizacion tarda de 75 a 155 s.
  return { ...cfg, timeoutMs: Math.max(cfg.timeoutMs, 240_000) };
}
