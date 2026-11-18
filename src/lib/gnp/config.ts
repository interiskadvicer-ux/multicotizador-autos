// Configuración del Web Service Preferente de GNP (REST con XML).

export interface GnpConfig {
  baseUrl: string;
  usuario: string;
  password: string;
  unidadOperable: string;
  intermediario: string;
  timeoutMs: number;
}

export function getGnpConfig(): GnpConfig {
  return {
    baseUrl: (process.env.GNP_BASE_URL || "https://api.service.gnp.com.mx/autos/wsp").replace(/\/+$/, ""),
    usuario: process.env.GNP_WS_USER || "",
    // Es la contraseña del Portal de Intermediarios de GNP.
    password: process.env.GNP_WS_PASS || "",
    unidadOperable: process.env.GNP_UNIDAD_OPERABLE || "NOP0000016",
    intermediario: process.env.GNP_INTERMEDIARIO || "0022033001",
    timeoutMs: Number(process.env.GNP_TIMEOUT_MS) || 60_000,
  };
}

export function credencialesConfiguradas(cfg: GnpConfig): boolean {
  return Boolean(cfg.usuario && cfg.password);
}

export function cotizacionRealHabilitada(): boolean {
  return process.env.GNP_COTIZACION_REAL !== "false";
}
