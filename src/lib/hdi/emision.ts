// Emisión de HDI con pago en línea opcional:
//   ObtenerPaquetes (coberturas declaradas) → GuardarCotizacion →
//   EmiteCotizacionGuardada (con InformacionPago cuando se cobra con tarjeta:
//   HDI cobra y emite en el mismo paso) → ObtenerPolizaYReciboPDF.
// Los datos de la tarjeta solo viajan a HDI: no se guardan ni se registran.

import type { CotizacionRequest } from "@/domain/types";
import { unescapeXml } from "@/lib/qualitas/soap";
import { getHdiConfig } from "./config";
import { HdiError, bloques, llamarHdi, valor, xmlCampos } from "./client";
import {
  prepararCotizacionHdi,
  xmlPaqueteConCambios,
  xmlVehiculoHdi,
  type PaqueteHdi,
} from "./cotizacion";

const PAIS_MEXICO = "00007";
const NACIONALIDAD_MEXICANA = "002";
const PERSONA_FISICA = "00";
const REMOLQUE_EMISION = 4603;
const COB_DANOS_MATERIALES = 233;
const COB_ROBO_TOTAL = 236;

// Conductos de cobro de HDI (ObtenerConducto) y su tipo de tarjeta.
export const CONDUCTO_HDI = {
  SIN_PAGO: { conducto: 1, tipoTarjeta: undefined },
  CREDITO: { conducto: 4, tipoTarjeta: 4 },
  DEBITO: { conducto: 28, tipoTarjeta: 3 },
} as const;
export type MedioPagoHdi = keyof typeof CONDUCTO_HDI;

export interface OpcionHdi {
  clave: string;
  descripcion: string;
}

export interface UbicacionHdi {
  idEstado: string;
  estado: string;
  idCiudad: string;
  ciudad: string;
  colonias: string[];
}

export interface CatalogosEmisionHdi {
  ocupaciones: OpcionHdi[];
  estadosCiviles: OpcionHdi[];
  regimenesFiscales: OpcionHdi[];
  bancos: OpcionHdi[];
}

export interface TarjetaHdi {
  idBanco: string;
  numero: string;
  titular: string;
  vencimiento: string; // mm/aa
  cvv: string;
}

export interface EmisionHdi {
  contratante: {
    nombre: string;
    segundoNombre?: string;
    apellidoPaterno: string;
    apellidoMaterno?: string;
    rfc: string;
    fechaNacimiento: string; // aaaa-mm-dd
    sexo: "M" | "F";
    estadoCivil: string;
    ocupacion: string;
    email: string;
    telefono: string;
    calle: string;
    numeroExterior: string;
    numeroInterior?: string;
    cp: string;
    colonia: string;
  };
  fiscal: { regimenFiscal: string; idCif?: string };
  unidad: { numeroSerie: string; numeroMotor?: string; placas?: string };
  medioPago: MedioPagoHdi;
  tarjeta?: TarjetaHdi;
}

export interface PagoHdi {
  resultado: string;
  folio: string;
  importe: string;
  recibo: string;
  tarjeta: string;
}

export interface PolizaHdi {
  cotizacion: string;
  poliza: string;
  primaTotal: number;
  pago?: PagoHdi;
  pdfBase64?: string;
  avisoPdf?: string;
}

// Pares Clave/Descripcion de un catálogo (el nombre del elemento que los
// agrupa varía entre operaciones).
function opciones(xml: string): OpcionHdi[] {
  return Array.from(
    xml.matchAll(
      /<(?:\w+:)?Clave>([^<]*)<\/(?:\w+:)?Clave>\s*<(?:\w+:)?Descripcion>([^<]*)</g,
    ),
    (m) => ({ clave: unescapeXml(m[1]).trim(), descripcion: unescapeXml(m[2]).trim() }),
  );
}

let catalogos: Promise<CatalogosEmisionHdi> | undefined;

export function catalogosEmisionHdi(): Promise<CatalogosEmisionHdi> {
  catalogos ??= Promise.all([
    llamarHdi("ObtenerOcupaciones", "<pub:getoccupations/>"),
    llamarHdi("ObtenerEstadoCivil", ""),
    llamarHdi(
      "ObtenerRegimenFiscal",
      `<pub:RegimenFiscalRequest><pub:idTipoPersona>${PERSONA_FISICA}</pub:idTipoPersona></pub:RegimenFiscalRequest>`,
    ),
    llamarHdi("ObtenerBancos", ""),
  ]).then(([oc, ec, rf, bc]) => ({
    ocupaciones: opciones(oc),
    estadosCiviles: opciones(ec),
    regimenesFiscales: opciones(rf),
    bancos: opciones(bc).filter((b) => b.clave !== "0"),
  }));
  catalogos.catch(() => (catalogos = undefined));
  return catalogos;
}

export async function ubicacionHdi(cp: string): Promise<UbicacionHdi> {
  const xml = await llamarHdi(
    "ObtenerInfoUbicacion",
    xmlCampos([["CodigoPostal", cp]]),
  );
  const lista = bloques(xml, "InfoUbicaciones");
  if (!lista.length)
    throw new HdiError(`HDI no tiene registrado el código postal ${cp}.`);
  return {
    idEstado: valor(lista[0], "IdEstado"),
    estado: valor(lista[0], "Estado"),
    idCiudad: valor(lista[0], "IdCiudad"),
    ciudad: valor(lista[0], "Ciudad"),
    colonias: Array.from(new Set(lista.map((u) => valor(u, "Colonia")))),
  };
}

// Nunca dejar números de tarjeta en mensajes de error.
function sinTarjeta(texto: string): string {
  return texto.replace(/\d{12,19}/g, "****");
}

function deducible(p: PaqueteHdi, clave: number): number {
  return (
    [
      ...p.coberturas.CoberturasObligatorias,
      ...p.coberturas.CoberturasObligatoriasOpcionales,
      ...p.coberturas.CoberturasOpcionales,
    ].find((c) => c.clave === clave)?.deducible ?? 0
  );
}

function validar(e: EmisionHdi): void {
  const c = e.contratante;
  if (!/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{0,3}$/.test(c.rfc))
    throw new HdiError("RFC de persona física inválido.");
  if (!/^\d{5}$/.test(c.cp)) throw new HdiError("Código postal inválido.");
  if (!/^[A-Z0-9]{17}$/.test(e.unidad.numeroSerie))
    throw new HdiError("El número de serie debe tener 17 caracteres.");
  if (e.medioPago !== "SIN_PAGO") {
    const t = e.tarjeta;
    if (!t || !/^\d{15,16}$/.test(t.numero))
      throw new HdiError("Número de tarjeta inválido.");
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(t.vencimiento))
      throw new HdiError("Vencimiento de la tarjeta inválido (mm/aa).");
    if (!/^\d{3,4}$/.test(t.cvv)) throw new HdiError("CVV inválido.");
    if (!t.idBanco) throw new HdiError("Selecciona el banco de la tarjeta.");
    if (!t.titular.trim()) throw new HdiError("Indica el titular de la tarjeta.");
  }
}

function xmlCliente(e: EmisionHdi, u: UbicacionHdi): string {
  const c = e.contratante;
  const direccion = xmlCampos([
    ["calle", c.calle],
    ["ciudad", u.idCiudad],
    ["codigoPostal", c.cp],
    ["colonia", c.colonia],
    ["correoElectronico", c.email],
    ["estado", u.idEstado],
    ["nacionalidad", NACIONALIDAD_MEXICANA],
    ["pais", PAIS_MEXICO],
    ["telefonoCasa", c.telefono],
    ["telefonoNegocio", c.telefono],
    ["telefonoOficina", c.telefono],
    ["numeroExterior", c.numeroExterior],
    ["numeroInterior", c.numeroInterior ?? ""],
  ]);
  return (
    "<pub:Cliente>" +
    xmlCampos([
      ["actividadPolitica", false],
      ["apellidoMaterno", c.apellidoMaterno ?? ""],
      ["apellidoPaterno", c.apellidoPaterno],
      ["curp", ""],
      ["entidadGubernamental", 0],
      ["estadoCivil", c.estadoCivil],
      ["fechaNacimiento", `${c.fechaNacimiento}T00:00:00`],
      ["giroActividad", 0],
      ["ocupacion", c.ocupacion],
      ["primerNombre", c.nombre],
      ["rfc", c.rfc],
      ["segundoNombre", c.segundoNombre ?? ""],
      ["sexo", c.sexo === "F" ? 2 : 1],
    ]) +
    `<pub:Direccion>${direccion}</pub:Direccion>` +
    "<pub:FolioMercantil/>" +
    xmlCampos([["idTipoPersona", PERSONA_FISICA]]) +
    "<pub:NombreCompletoDelApoderado/></pub:Cliente>"
  );
}

function xmlDatosFiscales(e: EmisionHdi, u: UbicacionHdi): string {
  const c = e.contratante;
  const nombre = [c.apellidoPaterno, c.apellidoMaterno, c.nombre, c.segundoNombre]
    .filter(Boolean)
    .join(" ");
  return (
    "<pub:datosFiscales>" +
    xmlCampos([
      ["rfc", c.rfc],
      ["nombre", nombre],
      ["idRegimenFiscal", e.fiscal.regimenFiscal],
      ["idRegimenSocietario", ""],
      ["idCIF", e.fiscal.idCif ?? ""],
      ["CPFiscal", c.cp],
    ]) +
    `<pub:direccionFiscal>${xmlCampos([
      ["calle", c.calle],
      ["numeroExterior", c.numeroExterior],
      ["numeroInterior", c.numeroInterior ?? ""],
      ["colonia", c.colonia],
      ["ciudad", u.idCiudad],
      ["estado", u.idEstado],
    ])}</pub:direccionFiscal></pub:datosFiscales>`
  );
}

function xmlPago(e: EmisionHdi): string {
  const medio = CONDUCTO_HDI[e.medioPago];
  const conducto = xmlCampos([["idConductoCobro", medio.conducto]]);
  if (!e.tarjeta || medio.tipoTarjeta === undefined) return conducto;
  const t = e.tarjeta;
  return (
    conducto +
    `<pub:InformacionPago>${xmlCampos([
      ["idBanco", t.idBanco],
      ["idTipoTarjeta", medio.tipoTarjeta],
      ["numCuentaHabiente", t.numero],
      ["nombreTitularTarjeta", t.titular],
      ["numVencimientoTarjeta", t.vencimiento],
      ["numCodigoSeguridad", t.cvv],
      ["activarEmitirDespuesDePagar", true],
    ])}</pub:InformacionPago>`
  );
}

function leerPago(xml: string): PagoHdi | undefined {
  const r = bloques(xml, "RespuestaPagoBanco")[0];
  if (!r) return undefined;
  return {
    resultado: valor(r, "Resultado").replace(/<[^>]*>/g, "").trim(),
    folio: valor(r, "FolioTransaccion"),
    importe: valor(r, "Importe"),
    recibo: valor(r, "NoRecibo"),
    tarjeta: `${valor(r, "TipoTarjeta")} ${valor(r, "NumeroTarjeta")}`.trim(),
  };
}

export async function emitirHdi(
  request: CotizacionRequest,
  descuento: number,
  claveHdi: string,
  e: EmisionHdi,
): Promise<PolizaHdi> {
  validar(e);
  const cfg = getHdiConfig();
  const agencia = cfg.agencia.padStart(5, "0");
  try {
    const { solicitud, paquete } = await prepararCotizacionHdi(
      request,
      descuento,
      claveHdi,
    );
    const ajuste = paquete.porcentajeAjuste || descuento;
    const paqueteXml = xmlPaqueteConCambios(
      paquete,
      solicitud,
      ajuste,
      cfg.tipoAjusteDescuento,
    )
      .replace("<pub:PaquetesCoberturas>", "<pub:PaqueteCoberturas>")
      .replace("</pub:PaquetesCoberturas>", "</pub:PaqueteCoberturas>")
      .replace(
        `<pub:Clave>${paquete.clave}</pub:Clave>`,
        `<pub:Clave>${paquete.clave}</pub:Clave>${xmlCampos([["Descripcion", paquete.descripcion]])}`,
      );

    const guardado = await llamarHdi(
      "GuardarCotizacion",
      "<pub:GuardarCotizacionRequest><pub:datosCotizacion>" +
        paqueteXml +
        `<pub:CaracteristicasVehiculo>${xmlVehiculoHdi(solicitud)}</pub:CaracteristicasVehiculo>` +
        xmlCampos([
          ["fechaInicioVigencia", solicitud.inicio],
          ["idFormaPago", solicitud.idFormaPago],
          ["IDTipoSumaAsegurada", cfg.tipoSumaAsegurada],
          ["SumaAsegurada", 0],
          ["porcentajeIva", 0],
        ]) +
        "</pub:datosCotizacion>" +
        xmlCampos([["usuario", cfg.usuario]]) +
        "</pub:GuardarCotizacionRequest>",
    );
    const cotizacion = valor(guardado, "idCotizacion");
    if (!cotizacion) throw new HdiError("HDI no devolvió el número de cotización.");

    const ubicacion = await ubicacionHdi(e.contratante.cp);
    const emitida = await llamarHdi(
      "EmiteCotizacionGuardada",
      "<pub:EmiteCotGuardadaRequest>" +
        xmlCampos([
          ["IdAgencia", agencia],
          ["IdCotizacion", cotizacion],
          ["IdUsuario", cfg.usuario],
        ]) +
        "<pub:listaDatosCotizacion><pub:ListaDatosCotizacion>" +
        `<pub:CaracteristicasVehiculo>${xmlVehiculoHdi(solicitud, {
          ...e.unidad,
          idRemolque: REMOLQUE_EMISION,
        })}</pub:CaracteristicasVehiculo>` +
        xmlCliente(e, ubicacion) +
        xmlDatosFiscales(e, ubicacion) +
        xmlCampos([
          ["fechaInicioVigencia", solicitud.inicio],
          ["idFormaPago", solicitud.idFormaPago],
        ]) +
        xmlPago(e) +
        xmlCampos([
          ["idEstado", 0],
          ["idCiudad", 0],
        ]) +
        "<pub:PaqueteEmitir>" +
        xmlCampos([["IdPaquete", paquete.clave]]) +
        `<pub:ListaCondiciones><pub:ListaCondicionesTarificar>${xmlCampos([
          ["DeducibleDM", deducible(paquete, COB_DANOS_MATERIALES)],
          ["DeducibleRT", deducible(paquete, COB_ROBO_TOTAL)],
        ])}</pub:ListaCondicionesTarificar></pub:ListaCondiciones>` +
        `<pub:ListaConfiguraciones><pub:ListaConfiguracionesPaquete>${xmlCampos([
          ["UsuarioCotiza", cfg.usuario],
          ["InicioVigencia", solicitud.inicio],
          ["FinVigencia", solicitud.fin],
          ["EsCotizacionDiasPorMes", false],
          ["Descuento", ajuste],
        ])}</pub:ListaConfiguracionesPaquete></pub:ListaConfiguraciones>` +
        "</pub:PaqueteEmitir>" +
        xmlCampos([
          ["IDTipoSumaAsegurada", cfg.tipoSumaAsegurada],
          ["SumaAsegurada", 0],
        ]) +
        "</pub:ListaDatosCotizacion></pub:listaDatosCotizacion>" +
        "</pub:EmiteCotGuardadaRequest>",
    );
    const errorPago = bloques(emitida, "ErrorPagoEnLinea")[0];
    if (errorPago && valor(errorPago, "descripcion"))
      throw new HdiError(`Pago rechazado: ${valor(errorPago, "descripcion")}`);
    const poliza = valor(emitida, "idPoliza");
    if (!poliza) throw new HdiError("HDI no devolvió el número de póliza.");
    const totales = bloques(emitida, "totales")[0] ?? "";

    const resultado: PolizaHdi = {
      cotizacion,
      poliza: `${cfg.agencia}-${Number(poliza)}`,
      primaTotal: Number(valor(totales, "PrimaTotal")) || paquete.totales.primaTotal,
      pago: leerPago(emitida),
    };
    try {
      const pdf = await llamarHdi(
        "ObtenerPolizaYReciboPDF",
        "<pub:PolizaAImprimir>" +
          xmlCampos([
            ["Agencia", agencia],
            ["Cotizacion", cotizacion],
            ["NumeroDocumento", 0],
            ["NumeroPoliza", poliza],
            ["usuario", cfg.usuario],
          ]) +
          "</pub:PolizaAImprimir>",
      );
      resultado.pdfBase64 = valor(pdf, "ByteArray") || undefined;
    } catch (err) {
      resultado.avisoPdf = `La póliza se emitió, pero HDI no entregó el PDF: ${err instanceof Error ? err.message : ""}`;
    }
    return resultado;
  } catch (err) {
    throw new HdiError(sinTarjeta(err instanceof Error ? err.message : String(err)));
  }
}
