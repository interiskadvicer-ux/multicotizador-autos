// Cliente del Web Service Preferente de GNP: cada operación recibe y devuelve
// XML por POST; los errores llegan como <ERROR><DESCRIPCION>.

import { escapeXml } from "@/lib/qualitas/soap";
import { bloques, valor } from "@/lib/gs/client";
import { credencialesConfiguradas, getGnpConfig, type GnpConfig } from "./config";

export { bloques, valor, escapeXml };

export class GnpError extends Error {}

export class GnpNoConfigurado extends Error {
  constructor() {
    super("Faltan las credenciales de GNP: GNP_WS_USER y GNP_WS_PASS.");
  }
}

export async function postGnp(
  ruta: string,
  xml: string,
  cfg: GnpConfig = getGnpConfig(),
  requiereCredenciales = true,
): Promise<string> {
  if (requiereCredenciales && !credencialesConfiguradas(cfg)) throw new GnpNoConfigurado();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: xml,
      signal: controller.signal,
      cache: "no-store",
    });
    const texto = await res.text();
    const error = bloques(texto, "ERROR")[0];
    if (error !== undefined) throw new GnpError(valor(error, "DESCRIPCION") || "GNP rechazó la solicitud.");
    if (!res.ok) throw new GnpError(`HTTP ${res.status}: respuesta inesperada de GNP.`);
    return texto;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GnpError("GNP no respondió dentro del tiempo límite.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
