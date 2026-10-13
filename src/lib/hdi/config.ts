// Configuración de la integración con HDI Seguros (WS público de Autos, WCF
// SOAP 1.2 con WS-Addressing y WS-Security UsernameToken).

export interface HdiConfig {
  url: string;
  usuario: string;
  password: string;
  // Oficina o agencia asignada por HDI.
  agencia: string;
  // Descuento comercial (%) autorizado por HDI para la clave de agente.
  descuentoDefault: number;
  // Tipo de ajuste del paquete que HDI interpreta como descuento.
  tipoAjusteDescuento: number;
  // Tipo de suma asegurada (valor comercial).
  tipoSumaAsegurada: number;
  timeoutMs: number;
}

export function getHdiConfig(): HdiConfig {
  return {
    url:
      process.env.HDI_WS_URL ||
      "https://enterpriseservices.implementation.hdi.com.mx/B2B/Partners/WCF/Autos/publicservicesautos.svc",
    usuario: process.env.HDI_WS_USER || "0954350001",
    password: process.env.HDI_WS_PASS || "",
    agencia: process.env.HDI_AGENCIA || "619",
    descuentoDefault: Number(process.env.HDI_DESCUENTO_DEFAULT) || 0,
    tipoAjusteDescuento: Number(process.env.HDI_TIPO_AJUSTE_DESCUENTO) || 4612,
    tipoSumaAsegurada: Number(process.env.HDI_TIPO_SUMA_ASEGURADA) || 4452,
    timeoutMs: Number(process.env.HDI_TIMEOUT_MS) || 30_000,
  };
}

export function credencialesConfiguradas(cfg: HdiConfig): boolean {
  return Boolean(cfg.usuario && cfg.password);
}

export function cotizacionRealHabilitada(): boolean {
  return process.env.HDI_COTIZACION_REAL !== "false";
}
