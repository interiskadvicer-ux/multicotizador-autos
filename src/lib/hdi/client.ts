// Cliente SOAP 1.2 del WS público de Autos de HDI. Cada operación se
// identifica con el header WS-Addressing <Action> y las credenciales viajan en
// WS-Security UsernameToken. Los errores de negocio llegan en <errores>.

import { randomUUID } from "crypto";
import { escapeXml, unescapeXml } from "@/lib/qualitas/soap";
import { bloques, valor } from "@/lib/zurich/client";
import { credencialesConfiguradas, getHdiConfig, type HdiConfig } from "./config";

export { bloques, valor };

const SOAP_NS = "http://www.w3.org/2003/05/soap-envelope";
const WSA_NS = "http://www.w3.org/2005/08/addressing";
const WSSE_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WSU_NS =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
export const PUB_NS = "http://hdi.com.mx/services/public";
const ARR_NS = "http://schemas.microsoft.com/2003/10/Serialization/Arrays";

export class HdiError extends Error {}

export class HdiNoConfigurado extends Error {
  constructor() {
    super("Falta la contraseña del WS de HDI. Configura HDI_WS_USER y HDI_WS_PASS.");
  }
}

// Campos simples de una operación, en el orden que exige el esquema.
export type Campos = Array<[string, string | number | boolean]>;

export function xmlCampos(campos: Campos): string {
  return campos
    .map(([k, v]) => `<pub:${k}>${escapeXml(String(v))}</pub:${k}>`)
    .join("");
}

export function envelopeHdi(cfg: HdiConfig, accion: string, body: string): string {
  return (
    `<s:Envelope xmlns:s="${SOAP_NS}" xmlns:a="${WSA_NS}" xmlns:u="${WSU_NS}" ` +
    `xmlns:pub="${PUB_NS}" xmlns:arr="${ARR_NS}"><s:Header>` +
    `<a:Action s:mustUnderstand="0">${escapeXml(accion)}</a:Action>` +
    `<a:MessageID>urn:uuid:${randomUUID()}</a:MessageID>` +
    `<o:Security s:mustUnderstand="1" xmlns:o="${WSSE_NS}">` +
    `<o:UsernameToken u:Id="uuid-${randomUUID()}-1">` +
    `<o:Username>${escapeXml(cfg.usuario)}</o:Username>` +
    `<o:Password>${escapeXml(cfg.password)}</o:Password>` +
    "</o:UsernameToken></o:Security></s:Header>" +
    `<s:Body>${body}</s:Body></s:Envelope>`
  );
}

// Descripciones de los mensajes dentro de <errores> (vacío si no hay).
export function erroresNegocio(xml: string): string[] {
  return bloques(xml, "errores")
    .flatMap((e) => bloques(e, "descripcion"))
    .map((d) => unescapeXml(d).trim())
    .filter(Boolean);
}

async function post(cfg: HdiConfig, accion: string, body: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": `application/soap+xml; charset=utf-8; action="${accion}"`,
      },
      body: envelopeHdi(cfg, accion, body),
      signal: controller.signal,
      cache: "no-store",
    });
    const xml = await res.text();
    const [fault] = bloques(xml, "Fault");
    if (fault !== undefined) {
      throw new HdiError(valor(fault, "Text") || "HDI respondió con un SOAP Fault.");
    }
    if (!res.ok) throw new HdiError(`HTTP ${res.status}: respuesta inesperada de HDI.`);
    return xml;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HdiError("HDI no respondió dentro del tiempo límite.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Ejecuta la operación `accion` con el contenido `body` y devuelve el XML de
// la respuesta. Lanza HdiError si HDI reporta errores de negocio.
export async function llamarHdi(accion: string, body: string): Promise<string> {
  const cfg = getHdiConfig();
  if (!credencialesConfiguradas(cfg)) throw new HdiNoConfigurado();
  const xml = await post(cfg, accion, body);
  const errores = erroresNegocio(xml);
  if (errores.length) throw new HdiError(errores.join(" "));
  return xml;
}
