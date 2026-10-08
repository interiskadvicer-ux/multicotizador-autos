// Cliente REST/JSON de las APIs de Seguros El Potosí (Cotizador Dinámico y
// Catálogos). La autenticación es el header `x-elpotosi` más la IP de origen.
// Su balanceador rechaza (403) algunos User-Agent genéricos, por lo que se
// envía uno propio explícito.

export interface ElPotosiConfig {
  urlCotizador: string;
  urlCatalogos: string;
  apiKey: string;
  usuario: string;
  intermediario: string;
  descuentoDefault: number;
  timeoutMs: number;
}

export function getElPotosiConfig(): ElPotosiConfig {
  return {
    urlCotizador:
      process.env.EL_POTOSI_COTIZADOR_URL ||
      "https://api.elpotosi.com.mx/Autos/CotizadorDinamico/qa",
    urlCatalogos:
      process.env.EL_POTOSI_CATALOGOS_URL ||
      "https://api.elpotosi.com.mx/Autos/Catalogos/beta4",
    apiKey: process.env.EL_POTOSI_API_KEY || "headerAPIsElPotosi",
    usuario: process.env.EL_POTOSI_USUARIO || "MC010000",
    intermediario: process.env.EL_POTOSI_INTERMEDIARIO || "010000",
    descuentoDefault: Number(process.env.EL_POTOSI_DESCUENTO_DEFAULT) || 0,
    timeoutMs: Number(process.env.EL_POTOSI_TIMEOUT_MS) || 30_000,
  };
}

export function cotizacionRealHabilitada(): boolean {
  return process.env.EL_POTOSI_COTIZACION_REAL !== "false";
}

export class ElPotosiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const USER_AGENT = "Mozilla/5.0 (compatible; InteriskadMulticotizador/1.0)";

// Mensajes de validación: [{ campo, errores: [...] }] o texto plano.
function mensajeError(texto: string): string {
  try {
    const json: unknown = JSON.parse(texto);
    if (Array.isArray(json)) {
      return json
        .flatMap((e: { errores?: string[] }) => e.errores ?? [])
        .join(" ");
    }
    if (json && typeof json === "object" && "message" in json)
      return String((json as { message: unknown }).message);
  } catch {
    // no es JSON
  }
  return texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

async function solicitar(url: string, body?: unknown): Promise<Response> {
  const cfg = getElPotosiConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/pdf, text/plain",
        "x-elpotosi": cfg.apiKey,
        "User-Agent": USER_AGENT,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const texto = await res.text();
      throw new ElPotosiError(
        mensajeError(texto) || `HTTP ${res.status}`,
        res.status,
      );
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError")
      throw new ElPotosiError("El Potosí no respondió a tiempo.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function llamarElPotosi<T>(
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await solicitar(url, body);
  return JSON.parse(await res.text()) as T;
}

export async function llamarElPotosiTexto(
  url: string,
  body?: unknown,
): Promise<string> {
  const res = await solicitar(url, body);
  return res.text();
}

export async function llamarElPotosiBinario(
  url: string,
): Promise<{ contentType: string; datos: Buffer }> {
  const res = await solicitar(url);
  return {
    contentType: res.headers.get("content-type") ?? "",
    datos: Buffer.from(await res.arrayBuffer()),
  };
}

export function urlCotizador(path: string, params: Record<string, string | number>): string {
  const q = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  return `${getElPotosiConfig().urlCotizador}/${path}?${q.toString()}`;
}
