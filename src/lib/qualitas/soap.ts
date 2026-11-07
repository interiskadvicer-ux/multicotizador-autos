// Utilidades mínimas para consumir los web services SOAP de Quálitas.
// No usamos una librería SOAP completa: los servicios son sencillos
// (un método por WS que recibe/devuelve strings), así que armamos el sobre
// a mano para mantener el bundle ligero y el control total del XML.

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Devuelve el contenido del primer elemento <tag>…</tag> (sin namespaces).
export function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1] : null;
}

// Devuelve el valor de un atributo del primer elemento que lo tenga.
export function extractAttr(xml: string, attr: string): string | null {
  const m = xml.match(new RegExp(`${attr}="([^"]*)"`));
  return m ? m[1] : null;
}

export interface SoapCallOptions {
  url: string;
  soapAction: string;
  body: string; // contenido del <soap:Body>
  timeoutMs: number;
}

// Ejecuta una llamada SOAP 1.1 y devuelve el cuerpo de la respuesta como texto.
export async function soapCall(opts: SoapCallOptions): Promise<string> {
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body>${opts.body}</soap:Body>` +
    "</soap:Envelope>";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${opts.soapAction}"`,
      },
      body: envelope,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} del web service de Quálitas.`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}
