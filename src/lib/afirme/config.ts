// Configuración de la integración con Afirme Seguros (plataforma Midas Autos).
// El acceso es un token REST (login.action) que después viaja en cada
// operación SOAP del servicio CotizacionAutoIndividualService.

export interface AfirmeConfig {
  baseUrl: string;
  usuario: string;
  password: string;
  // Negocio, producto y tipo de póliza asignados al agente por Afirme.
  idNegocio: string;
  idProducto: string;
  idTipoPoliza: string;
  // Líneas de negocio donde se busca el vehículo (automóviles, pick ups…).
  lineasNegocio: string[];
  // Tope de descuento comercial (%) que Afirme permite al agente.
  descuentoDefault: number;
  timeoutMs: number;
}

export function getAfirmeConfig(): AfirmeConfig {
  const lineas = (process.env.AFIRME_LINEAS_NEGOCIO || "31532,31533")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    baseUrl: (
      process.env.AFIRME_BASE_URL || "https://midas2.afirmeseguros.com"
    ).replace(/\/+$/, ""),
    usuario: process.env.AFIRME_WS_USER || "",
    password: process.env.AFIRME_WS_PASS || "",
    idNegocio: process.env.AFIRME_NEGOCIO || "4781",
    idProducto: process.env.AFIRME_PRODUCTO || "5432",
    idTipoPoliza: process.env.AFIRME_TIPO_POLIZA || "5556",
    lineasNegocio: lineas,
    descuentoDefault: Number(process.env.AFIRME_DESCUENTO_DEFAULT) || 25,
    timeoutMs: Number(process.env.AFIRME_TIMEOUT_MS) || 30_000,
  };
}

export function credencialesConfiguradas(cfg: AfirmeConfig): boolean {
  return Boolean(cfg.usuario && cfg.password);
}

export function cotizacionRealHabilitada(): boolean {
  return process.env.AFIRME_COTIZACION_REAL !== "false";
}
