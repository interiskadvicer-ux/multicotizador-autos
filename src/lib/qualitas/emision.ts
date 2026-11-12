// Emisión real de Quálitas (WS obtenerNuevaEmision, TipoMovimiento=3).
// Quálitas pide emitir sólo en su ambiente de pruebas mientras el negocio no
// esté liberado; por eso el ambiente de emisión es independiente del de
// cotización y por omisión es "pruebas".

import type { CotizacionGuardada, Contratante } from "@/lib/cotizaciones";
import { WS_EMISION_URL, getQualitasConfig, type Ambiente } from "./config";
import {
  PAQUETE_A_QUALITAS,
  USOS_VEHICULO,
  digitoVerificador,
  xmlCoberturasNegocio,
} from "./cotizacion";
import { escapeXml, extractAttr, extractTag, soapCall, unescapeXml } from "./soap";
import { interpretarError } from "./errores";
import { polizaParaImpresion } from "./impresion";
import { estadoDesdeCP } from "./estados";

const SOAP_ACTION = "http://qualitas.com.mx/obtenerNuevaEmision";
const NS = "http://qualitas.com.mx/";

const FORMA_PAGO_QUALITAS: Record<string, string> = {
  CONTADO: "C",
  SEMESTRAL: "S",
  TRIMESTRAL: "T",
  MENSUAL: "M",
};

export function ambienteEmision(): Ambiente {
  return process.env.QUALITAS_EMISION_AMBIENTE === "produccion" ? "produccion" : "pruebas";
}

export interface ReciboQualitas {
  noRecibo: string;
  fechaInicio: string;
  fechaTermino: string;
  primaTotal: number;
}

export interface ResultadoEmisionQualitas {
  ok: boolean;
  error?: string;
  numeroPoliza?: string;
  primaNeta?: number;
  primaTotal?: number;
  recibos?: ReciboQualitas[];
  ambiente: Ambiente;
}

// Datos que Quálitas exige para emitir (art. 492 y domicilio legal SEPOMEX).
export function faltantesEmisionQualitas(cot: CotizacionGuardada): string[] {
  const c = cot.contratante;
  const v = cot.detalleVehiculo;
  const faltan: string[] = [];
  const req = (ok: unknown, campo: string) => !ok && faltan.push(campo);
  req(cot.request?.vehiculo?.claveAmis, "clave AMIS de Quálitas");
  req(c, "contratante");
  if (!c) return faltan;
  if (c.tipoPersona === "FISICA") {
    req(c.nombres, "nombre(s)");
    req(c.apellidoPaterno, "apellido paterno");
    req(/^\d{4}-\d{2}-\d{2}$/.test(c.fechaNacimiento ?? ""), "fecha de nacimiento");
    req(c.ocupacion, "ocupación");
    req(c.tipoIdentificacion, "tipo de identificación");
    req(c.numeroIdentificacion, "número de identificación");
    req(c.entidadNacimiento, "entidad de nacimiento");
    req(c.pep, "persona políticamente expuesta");
    if (c.pep === "S") req(c.pepNombre, "nombre del funcionario");
  } else {
    req(c.nombre, "razón social");
  }
  req(c.rfc, "RFC");
  req(c.giro, "giro o actividad");
  req(c.calle, "calle");
  req(c.numExterior, "número exterior");
  req(c.codigoMunicipio && c.codigoColonia, "colonia del catálogo SEPOMEX");
  req(c.telefono || c.celular, "teléfono o celular");
  req(v?.serie, "número de serie");
  req(v?.motor, "número de motor");
  req(v?.placas, "placas");
  return faltan;
}

function fechaDMA(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function consideracionesAsegurado(c: Contratante): string {
  const reglas: [number, string | undefined][] = [
    [1, c.numExterior],
    [2, c.numInterior],
    [3, "MEXICO"],
    [4, c.tipoPersona === "FISICA" ? c.nombres : c.nombre],
    [5, c.tipoPersona === "FISICA" ? c.apellidoPaterno : undefined],
    [6, c.tipoPersona === "FISICA" ? c.apellidoMaterno : undefined],
    [7, c.codigoMunicipio],
    [8, c.codigoColonia],
    [19, c.tipoPersona === "FISICA" ? "1" : "2"],
    [21, c.nacionalidad || "1"],
    [24, c.giro],
    [26, c.email],
    [28, c.rfc],
    [70, c.telefono],
    [86, c.celular],
  ];
  if (c.tipoPersona === "FISICA") {
    reglas.push(
      [20, c.fechaNacimiento ? fechaDMA(c.fechaNacimiento) : undefined],
      [22, "001"],
      [23, c.ocupacion],
      [27, c.curp],
      [56, c.genero],
      [57, c.pep || "N"],
      [58, c.pep === "S" ? c.pepNombre : undefined],
      [88, c.pep === "S" ? c.pepParentesco : undefined],
      [62, c.tipoIdentificacion],
      [63, c.numeroIdentificacion],
      [78, c.entidadNacimiento],
    );
  }
  return reglas
    .filter(([, valor]) => valor && String(valor).trim())
    .map(
      ([regla, valor]) =>
        '<ConsideracionesAdicionalesDA NoConsideracion="40">' +
        `<TipoRegla>${regla}</TipoRegla><ValorRegla>${escapeXml(String(valor).trim())}</ValorRegla>` +
        "</ConsideracionesAdicionalesDA>",
    )
    .join("");
}

export function construirXmlEmision(
  cot: CotizacionGuardada,
  fechaInicio: string,
  uso: string,
  ambiente: Ambiente,
): string {
  const cfg = getQualitasConfig();
  const c = cot.contratante!;
  const v = cot.detalleVehiculo!;
  const request = { ...cot.request, paquete: cot.seleccion?.paquete ?? cot.request.paquete };
  const claveAmis = request.vehiculo.claveAmis!.trim();
  const fin = new Date(`${fechaInicio}T12:00:00Z`);
  fin.setUTCFullYear(fin.getUTCFullYear() + 1);
  const nombre =
    c.tipoPersona === "FISICA"
      ? [c.apellidoPaterno, c.apellidoMaterno, c.nombres].filter(Boolean).join(" ")
      : c.nombre;
  const descuento = cot.request.descuentos?.qualitas ?? cfg.descuentoDefault;
  const hoy = new Date().toISOString().slice(0, 10);
  // Quálitas arma el domicilio con la calle y los números de las reglas 1 y 2.
  const calle = c.calle.trim();
  const numExt = (c.numExterior ?? "").trim();
  const calleTraeNumero = !!numExt && calle.toUpperCase().endsWith(` ${numExt.toUpperCase()}`);
  const direccion = calleTraeNumero ? calle.slice(0, -numExt.length).trim() : calle;

  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<Movimientos><Movimiento TipoMovimiento="3" NoPoliza="" NoCotizacion="" ' +
    `NoEndoso="" TipoEndoso="" NoOTra="" NoNegocio="${escapeXml(cfg.negocio)}">` +
    '<DatosAsegurado NoAsegurado="">' +
    `<Nombre>${escapeXml(nombre)}</Nombre>` +
    `<Direccion>${escapeXml(direccion)}</Direccion>` +
    `<Colonia>${escapeXml(c.colonia)}</Colonia>` +
    `<Poblacion>${escapeXml(c.municipio)}</Poblacion>` +
    `<Estado>${estadoDesdeCP(c.cp) ?? ""}</Estado>` +
    `<CodigoPostal>${escapeXml(c.cp)}</CodigoPostal>` +
    "<NoEmpleado/><Agrupador/>" +
    consideracionesAsegurado(c) +
    "</DatosAsegurado>" +
    '<DatosVehiculo NoInciso="1">' +
    `<ClaveAmis>${escapeXml(claveAmis)}</ClaveAmis>` +
    `<Modelo>${request.vehiculo.anio}</Modelo>` +
    "<DescripcionVehiculo/>" +
    `<Uso>${uso}</Uso><Servicio>01</Servicio>` +
    `<Paquete>${PAQUETE_A_QUALITAS[request.paquete]}</Paquete>` +
    `<Motor>${escapeXml(v.motor.trim().toUpperCase())}</Motor>` +
    `<Serie>${escapeXml(v.serie.trim().toUpperCase())}</Serie>` +
    xmlCoberturasNegocio(request) +
    '<ConsideracionesAdicionalesDV NoConsideracion="39">' +
    "<TipoRegla>0</TipoRegla><ValorRegla>N|S</ValorRegla></ConsideracionesAdicionalesDV>" +
    '<ConsideracionesAdicionalesDV NoConsideracion="58">' +
    `<TipoRegla>0</TipoRegla><ValorRegla>${escapeXml(v.placas.trim().toUpperCase())}</ValorRegla>` +
    "</ConsideracionesAdicionalesDV>" +
    "</DatosVehiculo>" +
    "<DatosGenerales>" +
    `<FechaEmision>${hoy}</FechaEmision>` +
    `<FechaInicio>${fechaInicio}</FechaInicio>` +
    `<FechaTermino>${fin.toISOString().slice(0, 10)}</FechaTermino>` +
    "<Moneda>0</Moneda>" +
    `<Agente>${escapeXml(cfg.agente)}</Agente>` +
    `<FormaPago>${FORMA_PAGO_QUALITAS[cot.request.formaPago] ?? "C"}</FormaPago>` +
    "<TarifaValores>LINEA</TarifaValores><TarifaCuotas>LINEA</TarifaCuotas>" +
    "<TarifaDerechos>LINEA</TarifaDerechos><Plazo/><Agencia/><Contrato/>" +
    `<PorcentajeDescuento>${descuento}</PorcentajeDescuento>` +
    '<ConsideracionesAdicionalesDG NoConsideracion="1">' +
    `<TipoRegla>0</TipoRegla><ValorRegla>${digitoVerificador(claveAmis)}</ValorRegla>` +
    "</ConsideracionesAdicionalesDG>" +
    '<ConsideracionesAdicionalesDG NoConsideracion="4">' +
    `<TipoRegla>0</TipoRegla><ValorRegla>${ambiente === "pruebas" ? "1" : "0"}</ValorRegla>` +
    "</ConsideracionesAdicionalesDG>" +
    '<ConsideracionesAdicionalesDG NoConsideracion="5">' +
    "<TipoRegla>0</TipoRegla><ValorRegla>14</ValorRegla></ConsideracionesAdicionalesDG>" +
    "</DatosGenerales>" +
    "<Primas><PrimaNeta/><Derecho/><Recargo/><Impuesto/><PrimaTotal/><Comision/></Primas>" +
    "<CodigoError/></Movimiento></Movimientos>"
  );
}

function parseRecibos(movimiento: string): ReciboQualitas[] {
  const out: ReciboQualitas[] = [];
  const re = /<Recibos NoRecibo="([^"]*)"[^>]*>([\s\S]*?)<\/Recibos>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(movimiento)) !== null) {
    out.push({
      noRecibo: m[1],
      fechaInicio: (extractTag(m[2], "FechaInicio") || "").trim(),
      fechaTermino: (extractTag(m[2], "FechaTermino") || "").trim(),
      primaTotal: Number(extractTag(m[2], "PrimaTotal") || 0),
    });
  }
  return out;
}

export async function emitirQualitas(
  cot: CotizacionGuardada,
  fechaInicio: string,
): Promise<ResultadoEmisionQualitas> {
  const cfg = getQualitasConfig();
  const ambiente = ambienteEmision();
  const faltan = faltantesEmisionQualitas(cot);
  if (faltan.length) {
    return { ok: false, ambiente, error: `Faltan datos para emitir en Quálitas: ${faltan.join(", ")}.` };
  }
  let movimiento = "";
  for (const uso of USOS_VEHICULO) {
    const xml = construirXmlEmision(cot, fechaInicio, uso, ambiente);
    let respuesta: string;
    try {
      respuesta = await soapCall({
        url: process.env.QUALITAS_WS_EMISION_URL || WS_EMISION_URL[ambiente],
        soapAction: SOAP_ACTION,
        body: `<obtenerNuevaEmision xmlns="${NS}"><xmlEmision>${escapeXml(xml)}</xmlEmision></obtenerNuevaEmision>`,
        timeoutMs: Math.max(cfg.timeoutMs, 60_000),
      });
    } catch (err) {
      return {
        ok: false,
        ambiente,
        error: `No se pudo emitir en Quálitas: ${err instanceof Error ? err.message : "error de conexión"}`,
      };
    }
    const inner = extractTag(respuesta, "obtenerNuevaEmisionResult");
    if (!inner) return { ok: false, ambiente, error: "Respuesta inesperada del web service de Quálitas." };
    movimiento = unescapeXml(inner);
    if (!/^0*288\b/.test((extractTag(movimiento, "CodigoError") || "").trim())) break;
  }
  const error = interpretarError(extractTag(movimiento, "CodigoError"));
  const noPoliza = (extractAttr(movimiento, "NoPoliza") || "").trim();
  const numeroPoliza = noPoliza ? polizaParaImpresion(noPoliza) : "";
  if (error || !numeroPoliza) {
    return { ok: false, ambiente, error: error ?? "Quálitas no regresó número de póliza." };
  }
  const primas = movimiento.match(/<Primas>[\s\S]*?<\/Primas>/)?.[0] ?? "";
  return {
    ok: true,
    ambiente,
    numeroPoliza,
    primaNeta: Number(extractTag(primas, "PrimaNeta") || 0),
    primaTotal: Number(extractTag(primas, "PrimaTotal") || 0),
    recibos: parseRecibos(movimiento),
  };
}
