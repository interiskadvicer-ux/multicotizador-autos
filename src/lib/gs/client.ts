// Cliente SOAP de General de Seguros. `obtenerToken` entrega un token de
// sesión (~1 hora, se renueva con cada uso) que viaja en el cuerpo de cada
// operación; las respuestas traen `exito` y `mensaje`.

import { escapeXml, unescapeXml } from "@/lib/qualitas/soap";
import { credencialesConfiguradas, getGsConfig, type GsConfig } from "./config";

const NS_BASE = "http://com.gs.gsautos.ws.";
const TOKEN_TTL_MS = 45 * 60 * 1000;

export class GsError extends Error {}

export class GsNoConfigurado extends Error {
  constructor() {
    super("Faltan las credenciales de General de Seguros. Configura GS_WS_USER y GS_WS_PASS.");
  }
}

export type Campos = Array<[string, string | number | boolean]>;

export function xmlCampos(campos: Campos): string {
  return campos
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join("");
}

// Contenido de todos los elementos <tag> (con o sin prefijo de namespace).
export function bloques(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`,
    "g",
  );
  return Array.from(xml.matchAll(re), (m) => m[1]);
}

// Texto del primer elemento <tag>, sin espacios ni entidades XML.
export function valor(xml: string, tag: string): string {
  const [primero] = bloques(xml, tag);
  return primero === undefined ? "" : unescapeXml(primero).trim();
}

async function post(
  cfg: GsConfig,
  servicio: string,
  modulo: string,
  operacion: string,
  contenido: string,
): Promise<string> {
  const envelope =
    '<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Body>' +
    `<${operacion} xmlns="${NS_BASE}${modulo}"><arg0 xmlns="">${contenido}</arg0>` +
    `</${operacion}></Body></Envelope>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/${servicio}`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
      body: envelope,
      signal: controller.signal,
      cache: "no-store",
    });
    const xml = await res.text();
    const fault = valor(xml, "faultstring");
    if (fault) throw new GsError(fault);
    if (!res.ok) throw new GsError(`HTTP ${res.status}: respuesta inesperada de General de Seguros.`);
    return xml;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GsError("General de Seguros no respondió dentro del tiempo límite.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function verificarExito(xml: string): string {
  if (valor(xml, "exito") !== "true") {
    throw new GsError(valor(xml, "mensaje") || "General de Seguros rechazó la solicitud.");
  }
  return xml;
}

let tokenCache: { token: string; expira: number } | undefined;

async function obtenerToken(cfg: GsConfig): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now()) return tokenCache.token;
  const xml = verificarExito(
    await post(
      cfg,
      "autenticacionWS",
      "autenticacion",
      "obtenerToken",
      xmlCampos([
        ["usuario", cfg.usuario],
        ["password", cfg.password],
      ]),
    ),
  );
  const token = valor(xml, "token");
  if (!token) throw new GsError("General de Seguros no devolvió token de sesión.");
  tokenCache = { token, expira: Date.now() + TOKEN_TTL_MS };
  return token;
}

// Ejecuta `operacion` con un token de sesión vigente (antepuesto a los
// campos) y devuelve el XML. Lanza GsError si `exito` no es true.
export async function llamarGs(
  servicio: string,
  modulo: string,
  operacion: string,
  campos: Campos,
  extra = "",
): Promise<string> {
  const cfg = getGsConfig();
  if (!credencialesConfiguradas(cfg)) throw new GsNoConfigurado();
  const token = await obtenerToken(cfg);
  const xml = await post(
    cfg,
    servicio,
    modulo,
    operacion,
    xmlCampos([["token", token], ...campos]) + extra,
  );
  if (valor(xml, "exito") !== "true" && /token|sesi[oó]n/i.test(valor(xml, "mensaje"))) {
    tokenCache = undefined;
  }
  return verificarExito(xml);
}
