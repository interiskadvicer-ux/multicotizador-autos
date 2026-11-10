// WS de impresión de Quálitas (RecuperaImpresionM15): devuelve las ligas a los
// PDF de la póliza, el recibo y los textos/anexos.

import type { Ambiente } from "./config";
import { getQualitasConfig } from "./config";
import { escapeXml, extractTag, soapCall, unescapeXml } from "./soap";

const WS_IMPRESION_URL: Record<Ambiente, string> = {
  pruebas: "https://qa.qualitas.com.mx:8443/QBCImpresion/Service.asmx",
  produccion: "https://qbcenter.qualitas.com.mx/QBCImpresion/Service.asmx",
};

export interface DocumentoImpresion {
  etiqueta: string;
  url: string;
}

export interface LigasImpresion {
  poliza: string | null;
  recibo: string | null;
  textos: string | null;
  documentos: DocumentoImpresion[];
  mensaje: string | null;
}

// Quálitas regresa las ligas separadas por "|"; la letra inicial del archivo indica el documento.
const DOCUMENTOS: Record<string, string> = {
  p: "Póliza",
  r: "Recibo",
  a: "Acuse de entrega",
  c: "Certificado",
  b: "Carta de bienvenida",
};

// La emisión regresa ramo (2) + póliza (10) + endoso (6); la impresión pide solo la póliza.
export function polizaParaImpresion(numeroPoliza: string): string {
  const digitos = numeroPoliza.replace(/\D/g, "");
  return digitos.length === 18 ? digitos.slice(2, 12) : digitos.padStart(10, "0");
}

export async function recuperarImpresion(
  numeroPoliza: string,
  ambiente: Ambiente,
): Promise<LigasImpresion> {
  const cfg = getQualitasConfig();
  const campo = (n: string, v: string | number) => `<${n}>${escapeXml(String(v))}</${n}>`;
  const body =
    '<RecuperaImpresionM15 xmlns="http://tempuri.org/">' +
    campo("nPoliza", polizaParaImpresion(numeroPoliza)) +
    "<URLPoliza/><URLRecibo/><URLTextos/>" +
    campo("Inciso", 1) +
    campo("ImpPol", 0) +
    campo("ImpRec", 0) +
    campo("ImpAnexo", 0) +
    campo("Ramo", "04") +
    campo("formaPol", "polizaf1_logoQ_pdf") +
    campo("formaRec", "recibo_logoQ_pdf") +
    campo("formaAnexo", "polizaf2_logoQ_pdf") +
    campo("Endoso", "000000") +
    campo("NoNegocio", cfg.negocio) +
    campo("Agente", cfg.agente) +
    "<Usuario/><Password/>" +
    "</RecuperaImpresionM15>";
  const respuesta = await soapCall({
    url: process.env.QUALITAS_WS_IMPRESION_URL || WS_IMPRESION_URL[ambiente],
    soapAction: "http://tempuri.org/RecuperaImpresionM15",
    body,
    timeoutMs: Math.max(cfg.timeoutMs, 60_000),
  });
  const resultado = unescapeXml(extractTag(respuesta, "RecuperaImpresionM15Result") || "").trim();
  const urls = [
    ...resultado.split("|"),
    ...["URLPoliza", "URLRecibo", "URLTextos"].map((t) => unescapeXml(extractTag(respuesta, t) || "")),
  ]
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u));
  const documentos: DocumentoImpresion[] = [];
  for (const url of Array.from(new Set(urls))) {
    const letra = url.split("/").pop()?.charAt(0).toLowerCase() ?? "";
    documentos.push({ etiqueta: DOCUMENTOS[letra] ?? "Documento", url });
  }
  const buscar = (etiqueta: string) => documentos.find((d) => d.etiqueta === etiqueta)?.url ?? null;
  return {
    poliza: buscar("Póliza"),
    recibo: buscar("Recibo"),
    textos: buscar("Acuse de entrega"),
    documentos,
    mensaje: documentos.length ? null : resultado || "Quálitas no regresó ligas de impresión.",
  };
}
