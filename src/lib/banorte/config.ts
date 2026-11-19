// Configuración de la integración con los servicios REST de Seguros Banorte
// (Autos Individual). Las credenciales se leen de variables de entorno para no
// exponerlas en el repositorio.

export type Ambiente = "preproduccion" | "produccion";

const BASE_URL: Record<Ambiente, string> = {
  preproduccion: "https://api-pre.segurosbanorte.com/cotizadores/api/v1",
  produccion: "https://api.segurosbanorte.com/cotizadores/api/v1",
};

export interface BanorteConfig {
  ambiente: Ambiente;
  baseUrl: string;
  // Credenciales Basic del servicio (usuario de Weblogic).
  usuarioServicio: string;
  passwordServicio: string;
  // Usuario de Espacio que viaja en el header `usuario`.
  usuarioEspacio: string;
  // Oficina asociada al usuario de Espacio (header `numOficina`).
  numOficina: string;
  // Ramo solicitado (header `nombreRamo`). Sin este header todos los
  // servicios responden "No existe configuración para la oficina".
  nombreRamo: string;
  // Producto y categoría de Autos Individual, tal como los devuelve el
  // catálogo de productos.
  nombreProducto: string;
  nombreCategoria: string;
  // Clave del intermediario al que se acredita la cotización.
  claveIntermediario: string;
  // Tope de descuento discrecional (%) autorizado para el negocio.
  descuentoDefault: number;
  timeoutMs: number;
}

function ambienteFromEnv(): Ambiente {
  return process.env.BANORTE_AMBIENTE === "produccion"
    ? "produccion"
    : "preproduccion";
}

export function getBanorteConfig(): BanorteConfig {
  const ambiente = ambienteFromEnv();
  return {
    ambiente,
    baseUrl: process.env.BANORTE_BASE_URL || BASE_URL[ambiente],
    usuarioServicio: process.env.BANORTE_WS_USER || "",
    passwordServicio: process.env.BANORTE_WS_PASS || "",
    usuarioEspacio: process.env.BANORTE_USUARIO_ESPACIO || "",
    numOficina: process.env.BANORTE_NUM_OFICINA || "",
    nombreRamo: process.env.BANORTE_RAMO || "Autos",
    nombreProducto:
      process.env.BANORTE_PRODUCTO || "SEGURO DE AUTOMÓVILES RESIDENTES",
    nombreCategoria: process.env.BANORTE_CATEGORIA || "AUTOS RESIDENTES",
    claveIntermediario: process.env.BANORTE_INTERMEDIARIO || "",
    descuentoDefault: Number(process.env.BANORTE_DESCUENTO_DEFAULT) || 30,
    timeoutMs: Number(process.env.BANORTE_TIMEOUT_MS) || 30_000,
  };
}

// Indica si hay credenciales suficientes para llamar al servicio real.
export function credencialesConfiguradas(cfg: BanorteConfig): boolean {
  return Boolean(
    cfg.usuarioServicio &&
      cfg.passwordServicio &&
      cfg.usuarioEspacio &&
      cfg.numOficina &&
      cfg.claveIntermediario,
  );
}

// La cotización real está habilitada salvo que se desactive explícitamente.
export function cotizacionRealHabilitada(): boolean {
  return process.env.BANORTE_COTIZACION_REAL !== "false";
}
