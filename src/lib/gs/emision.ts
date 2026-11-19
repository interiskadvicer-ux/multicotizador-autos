// Emisión de General de Seguros (CotizacionEmisionWS.emitirCotizacion): se
// cotiza con las mismas condiciones, se emite el paquete y forma de pago
// elegidos y se descargan los documentos (carátula, recibos) de las ligas que
// devuelve el servicio.

import type { CotizacionRequest } from "@/domain/types";
import type { CotizacionGuardada } from "@/lib/cotizaciones";
import { escapeXml } from "@/lib/qualitas/soap";
import { GsError, bloques, llamarGs, valor, xmlCampos } from "./client";
import { FORMA_PAGO_GS, PAQUETE_GS, generarCotizacion } from "./cotizacion";
import { type AmbienteGs, ambienteEmisionGs, getGsConfig, getGsConfigEmision } from "./config";

export interface ClienteGs {
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  rfc: string;
  curp?: string;
  sexo: "M" | "F";
  // Catálogos de CatalogosWS: estados civiles, títulos (ocupación) y giros.
  estadoCivil: number;
  ocupacion: number;
  giro: number;
  fechaNacimiento: string;
  calle: string;
  numeroExterior: string;
  cp: string;
  // idcolonia de CatalogosWS.wsListarColonias.
  colonia: string;
  telefono: string;
  email: string;
}

export interface EmisionGs {
  cliente: ClienteGs;
  unidad: { numeroSerie: string; numeroMotor?: string; placas?: string };
  inicioVigencia?: string;
}

export interface DocumentoGs {
  nombre: string;
  liga: string;
  pdf?: Buffer;
}

export interface PolizaGs {
  ambiente: AmbienteGs;
  poliza: string;
  sucursal: string;
  ramo: string;
  idCotizacion: string;
  paquete: string;
  primaTotal: number;
  documentos: DocumentoGs[];
}

const NS_CLIENTE = "KB_ObtenerClientes";

function xmlCliente(c: ClienteGs): string {
  const campos: Array<[string, string | number]> = [
    ["cve_cli", 0],
    ["suc_emi", 0],
    ["fis_mor", 1],
    ["nom_cli", c.nombre.toUpperCase()],
    ["ape_pat", c.apellidoPaterno.toUpperCase()],
    ["ape_mat", (c.apellidoMaterno ?? "").toUpperCase()],
    ["raz_soc", ""],
    ["ane_cli", ""],
    ["rfc_cli", c.rfc.toUpperCase()],
    ["cve_ele", ""],
    ["curpcli", (c.curp ?? "").toUpperCase()],
    ["sexocli", c.sexo === "F" ? 2 : 1],
    ["edo_civ", c.estadoCivil],
    ["cal_cli", c.calle.toUpperCase()],
    ["num_cli", c.numeroExterior],
    ["cod_pos", Number(c.cp)],
    ["colonia", c.colonia],
    ["municip", 0],
    ["poblaci", ""],
    ["cve_est", 0],
    ["fec_nac", c.fechaNacimiento],
    ["nac_ext", 1],
    ["ocu_pro", c.ocupacion],
    ["act_gir", c.giro],
    ["telefo1", c.telefono],
    ["telefo2", ""],
    ["telefo3", ""],
    ["cor_ele", c.email],
    ["pag_web", ""],
    ["can_con", 1],
    ["fue_ing", "SUELDO"],
    ["adm_con", ""],
    ["car_pub", "N"],
    ["nom_car", ""],
    ["per_car", ""],
    ["apo_cli", ""],
    ["apo_cli_pat", ""],
    ["apo_cli_mat", ""],
    ["dom_ori", ""],
    ["num_pas", ""],
    ["descuento", 0],
  ];
  return (
    "<cliente>" +
    campos
      .map(
        ([k, v]) =>
          `<${k} xmlns="${NS_CLIENTE}">${escapeXml(String(v))}</${k}>`,
      )
      .join("") +
    "</cliente>"
  );
}

function validar(e: EmisionGs): void {
  const c = e.cliente;
  if (!/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{0,3}$/i.test(c.rfc.trim()))
    throw new GsError("RFC inválido.");
  if (!/^\d{5}$/.test(c.cp)) throw new GsError("Código postal inválido.");
  if (!c.colonia) throw new GsError("Falta la colonia del cliente.");
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(e.unidad.numeroSerie.trim()))
    throw new GsError("El número de serie debe tener 17 caracteres.");
}

// Solo se descargan los PDF con liga absoluta; "Pago en Linea" es una página
// y las condiciones generales vienen como nombre de archivo.
async function descargar(liga: string): Promise<Buffer | undefined> {
  if (!/^https:\/\//i.test(liga)) return undefined;
  try {
    const res = await fetch(liga, {
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return undefined;
    const pdf = Buffer.from(await res.arrayBuffer());
    return pdf.subarray(0, 4).toString() === "%PDF" ? pdf : undefined;
  } catch {
    return undefined;
  }
}

export async function emitirGs(
  request: CotizacionRequest,
  claveGs: string,
  descuento: number,
  e: EmisionGs,
): Promise<PolizaGs> {
  validar(e);
  const cfg = getGsConfigEmision();
  const cotizacion = await generarCotizacion(request, claveGs, descuento, cfg);
  const paquete = cotizacion.paquetes.find((p) =>
    PAQUETE_GS[request.paquete].test(p.nombre),
  );
  const forma = paquete?.formas.find((f) =>
    FORMA_PAGO_GS[request.formaPago].test(f.nombre),
  );
  if (!paquete || !forma?.id) {
    throw new GsError(
      `General de Seguros no ofrece el paquete ${request.paquete} con esa forma de pago.`,
    );
  }

  const xml = await llamarGs(
    "cotizacionEmisionWS",
    "cotizacionEmision",
    "emitirCotizacion",
    [],
    xmlCliente(e.cliente) +
      "<datosIncisoEmision>" +
      xmlCampos([
        ["numeroMotor", e.unidad.numeroMotor || ""],
        ["numeroPlacas", e.unidad.placas || ""],
        ["numeroSerie", e.unidad.numeroSerie.trim().toUpperCase()],
      ]) +
      "</datosIncisoEmision>" +
      xmlCampos([
        ["idAgenteCompartido", 0],
        ["idCliente", 0],
        ["idCotizacion", cotizacion.idCotizacion],
        ["idFormaPago", forma.id],
        ["idPaquete", paquete.id],
        ...(e.inicioVigencia
          ? ([["inicioVigencia", `${e.inicioVigencia}T00:00:00`]] as Array<[string, string]>)
          : []),
      ]),
    cfg,
  );

  // <poliza> anida otro <poliza> con el consecutivo.
  const numero = xml.match(/<poliza>(\d+)<\/poliza>/)?.[1] ?? "";
  if (!numero || numero === "0") {
    throw new GsError(
      valor(xml, "mensaje") || "General de Seguros no devolvió la póliza.",
    );
  }
  const documentos = await Promise.all(
    bloques(xml, "SDTDocumentos.SDTDocumentosItem").map(async (d) => {
      const liga = valor(d, "liga");
      return { nombre: valor(d, "nombre"), liga, pdf: await descargar(liga) };
    }),
  );
  return {
    ambiente: ambienteEmisionGs(),
    poliza: numero,
    sucursal: valor(xml, "sucursal"),
    ramo: valor(xml, "ramo"),
    idCotizacion: cotizacion.idCotizacion,
    paquete: paquete.nombre,
    primaTotal: Math.round(forma.primaTotal * 100) / 100,
    documentos,
  };
}

// Datos que General de Seguros exige para emitir; los catálogos (estado civil,
// ocupación, giro y colonia) son los de su CatalogosWS.
export function faltantesEmisionGs(cot: CotizacionGuardada): string[] {
  const c = cot.contratante;
  const v = cot.detalleVehiculo;
  const faltan: string[] = [];
  const req = (ok: unknown, campo: string) => !ok && faltan.push(campo);
  req(cot.request?.vehiculo?.claveGs, "clave del vehículo de General de Seguros");
  req(c, "contratante");
  if (!c) return faltan;
  if (c.tipoPersona !== "FISICA") faltan.push("persona física (la emisión de persona moral no está habilitada)");
  req(c.nombres, "nombre(s)");
  req(c.apellidoPaterno, "apellido paterno");
  req(/^\d{4}-\d{2}-\d{2}$/.test(c.fechaNacimiento ?? ""), "fecha de nacimiento");
  req(c.genero, "género");
  req(c.gsEstadoCivil, "estado civil");
  req(c.gsOcupacion, "ocupación");
  req(c.gsGiro, "giro o actividad");
  req(c.rfc, "RFC");
  req(c.calle, "calle");
  req(c.numExterior, "número exterior");
  req(c.gsColonia, "colonia del catálogo de General de Seguros");
  req(c.telefono || c.celular, "teléfono o celular");
  req(c.email, "correo");
  req(v?.serie, "número de serie");
  return faltan;
}

function clienteDesdeCotizacion(cot: CotizacionGuardada): ClienteGs {
  const c = cot.contratante!;
  const calle = c.calle.trim();
  const numExt = (c.numExterior ?? "").trim();
  const calleTraeNumero = !!numExt && calle.toUpperCase().endsWith(` ${numExt.toUpperCase()}`);
  return {
    nombre: c.nombres!.trim(),
    apellidoPaterno: c.apellidoPaterno!.trim(),
    apellidoMaterno: c.apellidoMaterno?.trim(),
    rfc: c.rfc.trim(),
    curp: c.curp?.trim(),
    sexo: c.genero === "M" ? "F" : "M",
    estadoCivil: Number(c.gsEstadoCivil),
    ocupacion: Number(c.gsOcupacion),
    giro: Number(c.gsGiro),
    fechaNacimiento: c.fechaNacimiento!,
    calle: calleTraeNumero ? calle.slice(0, -numExt.length).trim() : calle,
    numeroExterior: numExt,
    cp: c.cp,
    colonia: c.gsColonia!,
    telefono: (c.telefono || c.celular || "").replace(/\D/g, ""),
    email: c.email.trim(),
  };
}

export async function emitirCotizacionGs(
  cot: CotizacionGuardada,
  inicioVigencia: string,
): Promise<PolizaGs> {
  const faltan = faltantesEmisionGs(cot);
  if (faltan.length) {
    throw new GsError(`Faltan datos para emitir en General de Seguros: ${faltan.join(", ")}.`);
  }
  const v = cot.detalleVehiculo!;
  const request = { ...cot.request, paquete: cot.seleccion?.paquete ?? cot.request.paquete };
  const descuento = cot.request.descuentos?.generalseguros ?? getGsConfig().descuentoDefault;
  return emitirGs(request, cot.request.vehiculo.claveGs!.trim(), descuento, {
    cliente: clienteDesdeCotizacion(cot),
    unidad: { numeroSerie: v.serie, numeroMotor: v.motor, placas: v.placas },
    inicioVigencia,
  });
}
