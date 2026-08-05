// Cliente del web service de tarifas de Quálitas (WSTarifas / QBCenter).
// Sirve para obtener el catálogo de vehículos y su ClaveAmis (CAMIS) a partir
// de marca / tipo / versión / modelo. Requiere un usuario de QBCenter que
// entrega Quálitas (config: QUALITAS_QBC_USUARIO).

import { getQualitasConfig } from "./config";
import { escapeXml, extractTag, soapCall } from "./soap";

const NS = "http://tempuri.org/WSQBC/QBCDE";

export interface VehiculoQualitas {
  claveAmis: string; // CAMIS
  marca: string;
  tipo: string; // línea / submarca
  version: string;
  modelo: string; // año
  categoria: string;
  transmision: string;
  ocupantes: string;
  valorAlta: number; // nV1
  valorBaja: number; // nV2
  marcaLarga: string;
  nvaAmis: string;
}

export class QBCenterNoConfigurado extends Error {
  constructor() {
    super(
      "El catálogo de vehículos de Quálitas (WSTarifas) requiere un usuario de " +
        "QBCenter. Configura QUALITAS_QBC_USUARIO para habilitarlo.",
    );
    this.name = "QBCenterNoConfigurado";
  }
}

function parseElementos(xml: string): VehiculoQualitas[] {
  const out: VehiculoQualitas[] = [];
  const re = /<Elemento>([\s\S]*?)<\/Elemento>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const g = (t: string) => (extractTag(b, t) || "").trim();
    out.push({
      claveAmis: g("CAMIS"),
      marca: g("cMarca"),
      tipo: g("cTipo"),
      version: g("cVersion"),
      modelo: g("cModelo"),
      categoria: g("cCategoria"),
      transmision: g("cTransmision"),
      ocupantes: g("cOcupantes"),
      valorAlta: Number(g("nV1") || 0),
      valorBaja: Number(g("nV2") || 0),
      marcaLarga: g("cMarcaLarga"),
      nvaAmis: g("cNvaAMIS"),
    });
  }
  return out;
}

export interface BusquedaVehiculo {
  marca?: string;
  tipo?: string;
  version?: string;
  modelo?: string; // año
  camis?: string;
  categoria?: string;
  nvaAmis?: string;
}

// Consulta el catálogo de vehículos de Quálitas. Lanza QBCenterNoConfigurado
// si no hay usuario de QBCenter configurado.
export async function buscarVehiculos(
  filtros: BusquedaVehiculo,
): Promise<VehiculoQualitas[]> {
  const cfg = getQualitasConfig();
  if (!cfg.qbcUsuario) throw new QBCenterNoConfigurado();

  const body =
    `<listaTarifas xmlns="${NS}">` +
    `<cUsuario>${escapeXml(cfg.qbcUsuario)}</cUsuario>` +
    `<cTarifa>${escapeXml(cfg.qbcTarifa)}</cTarifa>` +
    `<cMarca>${escapeXml(filtros.marca || "")}</cMarca>` +
    `<cTipo>${escapeXml(filtros.tipo || "")}</cTipo>` +
    `<cVersion>${escapeXml(filtros.version || "")}</cVersion>` +
    `<cModelo>${escapeXml(filtros.modelo || "")}</cModelo>` +
    `<cCAMIS>${escapeXml(filtros.camis || "")}</cCAMIS>` +
    `<cCategoria>${escapeXml(filtros.categoria || "")}</cCategoria>` +
    `<cNvaAMIS>${escapeXml(filtros.nvaAmis || "")}</cNvaAMIS>` +
    "</listaTarifas>";

  const respuesta = await soapCall({
    url: cfg.wsTarifasUrl,
    soapAction: `${NS}/listaTarifas`,
    body,
    timeoutMs: cfg.timeoutMs,
  });

  const result = extractTag(respuesta, "listaTarifasResult") ?? respuesta;
  return parseElementos(result);
}

// Lista las marcas disponibles para la tarifa configurada.
export async function listarMarcas(): Promise<string[]> {
  const cfg = getQualitasConfig();
  if (!cfg.qbcUsuario) throw new QBCenterNoConfigurado();

  const body =
    `<listaMarcas xmlns="${NS}">` +
    `<cUsuario>${escapeXml(cfg.qbcUsuario)}</cUsuario>` +
    `<cTarifa>${escapeXml(cfg.qbcTarifa)}</cTarifa>` +
    "</listaMarcas>";

  const respuesta = await soapCall({
    url: cfg.wsTarifasUrl,
    soapAction: `${NS}/listaMarcas`,
    body,
    timeoutMs: cfg.timeoutMs,
  });

  const result = extractTag(respuesta, "listaMarcasResult") ?? respuesta;
  const marcas: string[] = [];
  const re = /<(?:cMarca|Marca|string)>([\s\S]*?)<\/(?:cMarca|Marca|string)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(result)) !== null) {
    const v = m[1].trim();
    if (v && !marcas.includes(v)) marcas.push(v);
  }
  return marcas;
}
