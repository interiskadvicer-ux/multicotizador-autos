export interface DatosCfdi {
  uuid: string | null;
  total: number | null;
  rfcEmisor: string | null;
  rfcReceptor: string | null;
}

function atributo(xml: string, etiqueta: RegExp, nombre: string): string | null {
  const nodo = xml.match(etiqueta)?.[0];
  if (!nodo) return null;
  const m = nodo.match(new RegExp(`\\b${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]).trim() : null;
}

// Lectura básica del CFDI 3.3/4.0: no valida sello ni estatus ante el SAT.
export function leerCfdi(xml: string): DatosCfdi | null {
  const inicio = xml.replace(/^\uFEFF/, "").replace(/^\s*<\?xml[^>]*\?>/, "").replace(/^(\s*<!--[\s\S]*?-->)*\s*/, "");
  if (!inicio.startsWith("<cfdi:Comprobante")) return null;
  const total = atributo(xml, /<cfdi:Comprobante\b[^>]*>/, "Total");
  return {
    uuid: atributo(xml, /<tfd:TimbreFiscalDigital\b[^>]*>/, "UUID")?.toUpperCase() ?? null,
    total: total !== null && Number.isFinite(Number(total)) ? Number(total) : null,
    rfcEmisor: atributo(xml, /<cfdi:Emisor\b[^>]*>/, "Rfc")?.toUpperCase() ?? null,
    rfcReceptor: atributo(xml, /<cfdi:Receptor\b[^>]*>/, "Rfc")?.toUpperCase() ?? null,
  };
}
