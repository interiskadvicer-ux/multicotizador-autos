// Cliente SOAP de los web services de Zurich. Las credenciales viajan en el
// header WS-Security (UsernameToken) y cada operación responde con `status`
// ("0" = correcto) y `mensaje`.

import { escapeXml, unescapeXml } from "@/lib/qualitas/soap";
import {
  credencialesConfiguradas,
  getZurichConfig,
  type ZurichConfig,
} from "./config";

const NS = "http://webservices.zurich.com/";
const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";

export class ZurichError extends Error {}

export class ZurichNoConfigurado extends Error {
  constructor() {
    super(
      "Faltan las credenciales de Zurich. Configura ZURICH_WS_USER y ZURICH_WS_PASS.",
    );
  }
}

// Campos simples de una operación, en el orden que exige el esquema.
export type Campos = Array<[string, string | number]>;

export function xmlCampos(campos: Campos): string {
  return campos
    .map(([k, v]) => `<web:${k}>${escapeXml(String(v))}</web:${k}>`)
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

async function post(cfg: ZurichConfig, path: string, body: string): Promise<string> {
  const envelope =
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    `xmlns:web="${NS}"><soapenv:Header>` +
    `<wsse:Security xmlns:wsse="${WSSE_NS}"><UsernameToken xmlns="${WSSE_NS}">` +
    `<Username>${escapeXml(cfg.usuario)}</Username>` +
    `<Password>${escapeXml(cfg.password)}</Password>` +
    "</UsernameToken></wsse:Security></soapenv:Header>" +
    `<soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
      body: envelope,
      signal: controller.signal,
      cache: "no-store",
    });
    const xml = await res.text();
    const fault = valor(xml, "faultstring");
    if (fault) throw new ZurichError(fault);
    if (!res.ok) throw new ZurichError(`HTTP ${res.status}: respuesta inesperada de Zurich.`);
    return xml;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ZurichError("Zurich no respondió dentro del tiempo límite.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Ejecuta la operación `operacion` del servicio `path` y devuelve el XML de
// la respuesta. Lanza ZurichError si el status de negocio no es "0".
export async function llamarZurich(
  path: string,
  operacion: string,
  contenido: string,
  campoStatus = "status",
  campoMensaje = "mensaje",
): Promise<string> {
  const cfg = getZurichConfig();
  if (!credencialesConfiguradas(cfg)) throw new ZurichNoConfigurado();
  const xml = await post(cfg, path, `<web:${operacion}>${contenido}</web:${operacion}>`);
  const status = valor(xml, campoStatus);
  if (status !== "" && status !== "0") {
    throw new ZurichError(valor(xml, campoMensaje) || `Zurich respondió status ${status}.`);
  }
  return xml;
}
