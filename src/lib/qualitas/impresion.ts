// WS de impresión de Quálitas (RecuperaImpresionM15): devuelve las ligas a los
// PDF de la póliza, el recibo y los textos/anexos.

import type { Ambiente } from "./config";
import { getQualitasConfig } from "./config";
import { escapeXml, extractTag, soapCall, unescapeXml } from "./soap";

const WS_IMPRESION_URL: Record<Ambiente, string> = {
  pruebas: "https://qa.qualitas.com.mx:8443/QBCImpresion/Service.asmx",
  produccion: "https://qbcenter.qualitas.com.mx/QBCImpresion/Service.asmx",
};

export interface LigasImpresion {
  poliza: string | null;
  recibo: string | null;
  textos: string | null;
}

export async function recuperarImpresion(
  numeroPoliza: string,
  ambiente: Ambiente,
): Promise<LigasImpresion> {
  const cfg = getQualitasConfig();
  const campo = (n: string, v: string | number) => `<${n}>${escapeXml(String(v))}</${n}>`;
  const body =
    '<RecuperaImpresionM15 xmlns="http://tempuri.org/">' +
    campo("nPoliza", numeroPoliza.replace(/\D/g, "").padStart(10, "0")) +
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
  const liga = (tag: string) => {
    const v = unescapeXml(extractTag(respuesta, tag) || "").trim();
    return /^https?:\/\//.test(v) ? v : null;
  };
  return { poliza: liga("URLPoliza"), recibo: liga("URLRecibo"), textos: liga("URLTextos") };
}
