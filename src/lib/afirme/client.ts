// Cliente de los web services de Afirme Seguros (Midas Autos).
// Autenticación: GET rest/auth/login.action devuelve un token de sesión que se
// envía como último parámetro de cada operación SOAP. Toda operación responde
// un <return> con JSON (o con un texto "MIDxxxx – mensaje" cuando falla).

import { escapeXml, extractTag, unescapeXml } from "@/lib/qualitas/soap";
import {
  credencialesConfiguradas,
  getAfirmeConfig,
  type AfirmeConfig,
} from "./config";

const SOAP_NS = "http://segurosafirme.com.mx/cotizacion/cotizacionautoindividual";
const SOAP_PATH = "/MidasWeb/CotizacionAutoIndividualService";
const LOGIN_PATH = "/MidasWeb/rest/auth/login.action";

// Error de negocio devuelto por Afirme (mensaje "MIDxxxx – …").
export class AfirmeError extends Error {}

export class AfirmeNoConfigurado extends Error {
  constructor() {
    super(
      "Faltan las credenciales de Afirme. Configura AFIRME_WS_USER y AFIRME_WS_PASS.",
    );
  }
}

interface LoginResponse {
  data?: { token?: string };
  message?: string;
}

let tokenCache: { token: string; expira: number } | null = null;
const TOKEN_TTL_MS = 20 * 60 * 1000;

async function fetchConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AfirmeError("Afirme no respondió dentro del tiempo límite.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function login(cfg: AfirmeConfig): Promise<string> {
  const params = new URLSearchParams({
    usuario: cfg.usuario,
    password: cfg.password,
  });
  const res = await fetchConTimeout(
    `${cfg.baseUrl}${LOGIN_PATH}?${params.toString()}`,
    { method: "GET", headers: { Accept: "application/json" } },
    cfg.timeoutMs,
  );
  if (!res.ok) {
    throw new AfirmeError(`HTTP ${res.status} al autenticarse con Afirme.`);
  }
  const data = (await res.json()) as LoginResponse;
  const token = data.data?.token;
  if (!token) {
    throw new AfirmeError(
      data.message || "Afirme no devolvió token de autenticación.",
    );
  }
  tokenCache = { token, expira: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function obtenerToken(cfg: AfirmeConfig, forzar = false): Promise<string> {
  if (!forzar && tokenCache && tokenCache.expira > Date.now()) {
    return tokenCache.token;
  }
  return login(cfg);
}

function esTokenInvalido(mensaje: string): boolean {
  return /token/i.test(mensaje) && /inactivo|inv[aá]lido|expir/i.test(mensaje);
}

async function soapRaw(
  cfg: AfirmeConfig,
  operacion: string,
  params: Record<string, string | number>,
  token: string,
): Promise<string> {
  const cuerpo = Object.entries(params)
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
    .join("");
  const envelope =
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    `xmlns:cot="${SOAP_NS}"><soapenv:Header/><soapenv:Body>` +
    `<cot:${operacion}>${cuerpo}<token>${escapeXml(token)}</token></cot:${operacion}>` +
    "</soapenv:Body></soapenv:Envelope>";

  const res = await fetchConTimeout(
    `${cfg.baseUrl}${SOAP_PATH}`,
    {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: '""' },
      body: envelope,
    },
    cfg.timeoutMs,
  );
  const xml = await res.text();
  const retorno = extractTag(xml, "return");
  if (retorno === null) {
    const fault = extractTag(xml, "faultstring");
    throw new AfirmeError(
      fault
        ? unescapeXml(fault)
        : `HTTP ${res.status}: respuesta inesperada de Afirme.`,
    );
  }
  return unescapeXml(retorno).trim();
}

// Ejecuta una operación SOAP y devuelve el JSON del <return> ya parseado.
// Reintenta una vez con token nuevo cuando Afirme reporta token inactivo.
export async function llamarAfirme<T>(
  operacion: string,
  params: Record<string, string | number>,
): Promise<T> {
  const cfg = getAfirmeConfig();
  if (!credencialesConfiguradas(cfg)) throw new AfirmeNoConfigurado();

  let texto = await soapRaw(cfg, operacion, params, await obtenerToken(cfg));
  if (esTokenInvalido(texto)) {
    texto = await soapRaw(cfg, operacion, params, await obtenerToken(cfg, true));
  }

  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new AfirmeError(texto.replace(/\s+/g, " ").trim());
  }
}
