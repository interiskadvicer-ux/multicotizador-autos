// Cotización real de HDI (ObtenerPaquetes, tarifa tradicional).
// Flujo: se calcula el paquete con sus coberturas por defecto; si el broker
// pidió descuento o coberturas personalizadas se recalcula enviando el
// paquete en `paquetesConCambios` con el ajuste (descuento) y las sumas y
// deducibles elegidos. HDI devuelve la prima de lista y el descuento por
// separado en <Totales>.

import type {
  Cobertura,
  CoberturasPersonalizadas,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
  FormaPago,
  Paquete,
} from "@/domain/types";
import { acotar, masCercano } from "@/lib/coberturas";
import { unescapeXml } from "@/lib/qualitas/soap";
import { credencialesConfiguradas, getHdiConfig } from "./config";
import { HdiError, HdiNoConfigurado, bloques, llamarHdi, valor, xmlCampos } from "./client";
import { TIPO_VEHICULO_PICKUP, parsearClaveHdi, type ClaveHdi } from "./catalogos";

// Claves de paquete por tipo de vehículo (autos residentes / pick ups).
const PAQUETE_HDI: Record<"auto" | "pickup", Record<Paquete, number>> = {
  auto: { AMPLIA: 19, LIMITADA: 21, RC: 22 },
  pickup: { AMPLIA: 23, LIMITADA: 24, RC: 25 },
};

// Uso y servicio por tipo de vehículo: 4581 automóviles residentes / 4601
// particular; 4596 pick up familiar / 4584 pick up carga comercial.
const USO_SERVICIO: Record<"auto" | "pickup", { idUso: number; idServicio: number }> = {
  auto: { idUso: 4581, idServicio: 4601 },
  pickup: { idUso: 4596, idServicio: 4584 },
};
const ID_RIESGO_CARGA = 5425;
const TIPO_PERSONA = "00";

const COB_DANOS_MATERIALES = 233;
const COB_ROBO_TOTAL = 236;
const COB_RC = 253;
const COB_GASTOS_MEDICOS = 239;

const COBERTURA_HOMOLOGADA: Record<number, string> = {
  [COB_DANOS_MATERIALES]: "Daños Materiales",
  [COB_ROBO_TOTAL]: "Robo Total",
  [COB_RC]: "Responsabilidad Civil",
  [COB_GASTOS_MEDICOS]: "Gastos Médicos Ocupantes",
  249: "Asistencia Vial y Legal",
  242: "Defensa Jurídica",
};

const ORDEN_COBERTURAS = [
  "Daños Materiales",
  "Robo Total",
  "Responsabilidad Civil",
  "Gastos Médicos Ocupantes",
  "Asistencia Vial y Legal",
  "Defensa Jurídica",
];

const FORMA_PAGO_HDI: Record<FormaPago, RegExp> = {
  CONTADO: /CONTADO|ANUAL/i,
  MENSUAL: /MENSUAL/i,
  TRIMESTRAL: /TRIMESTRAL/i,
  SEMESTRAL: /SEMESTRAL/i,
};

const GRUPOS = [
  "CoberturasObligatorias",
  "CoberturasObligatoriasOpcionales",
  "CoberturasOpcionales",
] as const;
type Grupo = (typeof GRUPOS)[number];

export interface CoberturaHdi {
  regla: number;
  clave: number;
  descripcion: string;
  sumaAsegurada: number;
  deducible: number;
  proveedorAsistencia: number;
  calculada: boolean;
  opcionesSuma: number[];
  sumaMinima?: number;
  sumaMaxima?: number;
  opcionesDeducible: number[];
}

export interface TotalesHdi {
  primaNeta: number;
  descuento: number;
  financiamiento: number;
  derechoPoliza: number;
  iva: number;
  primaTotal: number;
}

export interface PaqueteHdi {
  clave: number;
  descripcion: string;
  coberturas: Record<Grupo, CoberturaHdi[]>;
  totales: TotalesHdi;
  porcentajeAjuste: number;
}

export interface SolicitudHdi {
  vehiculo: ClaveHdi;
  anio: number;
  cp: string;
  idFormaPago: number;
  clavePaquete: number;
  inicio: string;
  fin: string;
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function categoria(tipoVehiculo: number): "auto" | "pickup" {
  return tipoVehiculo === TIPO_VEHICULO_PICKUP ? "pickup" : "auto";
}

// Fragmento desde la primera apertura de <tag> hasta su último cierre
// (útil para listas anidadas con el mismo nombre, p. ej. Deducibles).
function region(xml: string, tag: string): string {
  const inicio = xml.search(new RegExp(`<(?:\\w+:)?${tag}[\\s>]`));
  const cierre = xml.lastIndexOf(`${tag}>`);
  return inicio < 0 || cierre < inicio ? "" : xml.slice(inicio, cierre);
}

function todos(xml: string, tag: string): number[] {
  return Array.from(
    xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`, "g")),
    (m) => num(unescapeXml(m[1]).trim()),
  );
}

function leerCobertura(c: string): CoberturaHdi {
  const min = valor(c, "SumaAseguradaMinima");
  const max = valor(c, "SumaAseguradaMaxima");
  return {
    regla: num(valor(c, "Regla")),
    clave: num(valor(c, "Clave")),
    descripcion: valor(c, "Descripcion"),
    sumaAsegurada: num(valor(c, "SumaAsegurada")),
    deducible: num(valor(c, "Deducible")),
    proveedorAsistencia: num(valor(c, "ProveedorAsistencia")),
    calculada: valor(c, "Calculada") === "true",
    opcionesSuma: todos(region(c, "InformacionSumasAseguradas"), "SumaAsegurada").filter(
      (n) => n > 0,
    ),
    sumaMinima: min ? num(min) : undefined,
    sumaMaxima: max ? num(max) : undefined,
    opcionesDeducible: todos(region(c, "Deducibles"), "Descripcion"),
  };
}

export function leerPaquetes(xml: string): PaqueteHdi[] {
  return bloques(xml, "PaquetesCoberturas").map((p) => {
    const coberturas = {} as Record<Grupo, CoberturaHdi[]>;
    for (const g of GRUPOS) {
      coberturas[g] = (bloques(p, g)[0] ?? "")
        ? bloques(bloques(p, g)[0], "Coberturas").map(leerCobertura)
        : [];
    }
    const t = bloques(p, "Totales")[0] ?? "";
    return {
      clave: num(valor(p, "Clave")),
      descripcion: valor(p, "Descripcion"),
      coberturas,
      totales: {
        primaNeta: num(valor(t, "PrimaNeta")),
        descuento: num(valor(t, "Descuento")),
        financiamiento: num(valor(t, "Financiamiento")),
        derechoPoliza: num(valor(t, "DerechoPoliza")),
        iva: num(valor(t, "IVA")),
        primaTotal: num(valor(t, "PrimaTotal")),
      },
      porcentajeAjuste: num(valor(bloques(p, "Ajuste")[0] ?? "", "PorcentajeAjuste")),
    };
  });
}

function xmlCobertura(c: CoberturaHdi): string {
  return `<pub:Coberturas>${xmlCampos([
    ["Regla", c.regla],
    ["Clave", c.clave],
    ["Descripcion", c.descripcion],
    ["SumaAsegurada", c.sumaAsegurada],
    ["Deducible", c.deducible],
    ["ProveedorAsistencia", c.proveedorAsistencia],
    ["PrimaNeta", 0],
    ["Calculada", c.calculada],
  ])}</pub:Coberturas>`;
}

function xmlGrupo(grupo: Grupo, lista: CoberturaHdi[]): string {
  return `<pub:${grupo}>${lista.map(xmlCobertura).join("")}</pub:${grupo}>`;
}

// Paquete a recalcular, con el orden de elementos del esquema de HDI.
export function xmlPaqueteConCambios(
  paquete: PaqueteHdi,
  s: SolicitudHdi,
  descuento: number,
  tipoAjuste: number,
): string {
  return (
    `<pub:PaquetesCoberturas><pub:Clave>${paquete.clave}</pub:Clave>` +
    xmlGrupo("CoberturasObligatorias", paquete.coberturas.CoberturasObligatorias) +
    `<pub:Vigencia>${xmlCampos([
      ["Inicial", s.inicio],
      ["Final", s.fin],
    ])}</pub:Vigencia>` +
    xmlGrupo(
      "CoberturasObligatoriasOpcionales",
      paquete.coberturas.CoberturasObligatoriasOpcionales,
    ) +
    xmlGrupo("CoberturasOpcionales", paquete.coberturas.CoberturasOpcionales) +
    `<pub:Ajuste>${xmlCampos([
      ["PorcentajeAjuste", descuento],
      ["TipoAjuste", tipoAjuste],
    ])}</pub:Ajuste></pub:PaquetesCoberturas>`
  );
}

// Cuerpo de ObtenerPaquetes. Sin `cambios` se calcula el paquete por
// defecto; con `cambios` se recalcula el paquete enviado.
export function xmlObtenerPaquetes(s: SolicitudHdi, cambios?: string): string {
  const cfg = getHdiConfig();
  const { idUso, idServicio } = USO_SERVICIO[categoria(s.vehiculo.tipoVehiculo)];
  const datosVehiculo =
    "<pub:datosVehiculo>" +
    xmlCampos([
      ["idVehiculo", s.vehiculo.idVehiculo],
      ["idMarca", 0],
      ["idModelo", s.anio],
      ["idTipo", 0],
      ["idVersion", 0],
      ["idTransmision", 0],
      ["idUso", idUso],
      ["tipoVehiculo", s.vehiculo.tipoVehiculo],
      ["numeroMotor", 0],
      ["placas", 0],
      ["color", 0],
      ["numeroSerie", ""],
      ["pasajeros", 0],
      ["idZonaCirculacion", 0],
      ["idTonelaje", 0],
      ["idServicio", idServicio],
      ["idRiesgoCarga", ID_RIESGO_CARGA],
    ]) +
    `<pub:DatosAdicionales>${xmlCampos([
      ["Renovaciones", 0],
      ["idRemolque", 0],
      ["CPCirculacion", s.cp],
    ])}</pub:DatosAdicionales>` +
    "<pub:DatosRiesgoCarga><pub:idRiesgoCarga/><pub:idDescripcionRiesgoCarga/></pub:DatosRiesgoCarga>" +
    "</pub:datosVehiculo>";
  const lista = cambios
    ? "<pub:listaPaquetesACalcular/>"
    : `<pub:listaPaquetesACalcular><pub:StringArray><arr:string>${s.clavePaquete}</arr:string></pub:StringArray></pub:listaPaquetesACalcular>`;
  return (
    "<pub:ObtenerPaquetesRequest>" +
    xmlCampos([
      ["IDTipoSumaAsegurada", cfg.tipoSumaAsegurada],
      ["SumaAsegurada", 0],
      ["TipoPersona", TIPO_PERSONA],
      ["ciudad", 0],
    ]) +
    datosVehiculo +
    xmlCampos([
      ["estado", 0],
      ["idFormaPago", s.idFormaPago],
    ]) +
    lista +
    xmlCampos([["obtenerTodosPaquetes", false]]) +
    (cambios
      ? `<pub:paquetesConCambios>${cambios}</pub:paquetesConCambios>`
      : "<pub:paquetesConCambios/>") +
    xmlCampos([["usuario", cfg.usuario]]) +
    "</pub:ObtenerPaquetesRequest>"
  );
}

let formasPago: Promise<Array<{ clave: number; descripcion: string }>> | undefined;

async function idFormaPago(forma: FormaPago): Promise<number> {
  formasPago ??= llamarHdi("ObtenerFormasPago", "").then((xml) =>
    bloques(xml, "FormaPago").map((f) => ({
      clave: num(valor(f, "Clave")),
      descripcion: valor(f, "Descripcion"),
    })),
  );
  formasPago.catch(() => (formasPago = undefined));
  const encontrada = (await formasPago).find((f) => FORMA_PAGO_HDI[forma].test(f.descripcion));
  if (!encontrada) throw new HdiError(`HDI no tiene la forma de pago ${forma}.`);
  return encontrada.clave;
}

async function obtenerPaquete(s: SolicitudHdi, cambios?: string): Promise<PaqueteHdi> {
  const xml = await llamarHdi("ObtenerPaquetes", xmlObtenerPaquetes(s, cambios));
  const paquete = leerPaquetes(xml).find((p) => p.clave === s.clavePaquete);
  if (!paquete) throw new HdiError(`HDI no devolvió el paquete ${s.clavePaquete}.`);
  return paquete;
}

// Aplica sumas aseguradas y deducibles elegidos por el broker con los valores
// que HDI admite para cada cobertura. Devuelve si hubo cambios.
export function aplicarPersonalizadas(
  cob: CoberturasPersonalizadas,
  paquete: PaqueteHdi,
  ajustes: string[],
): boolean {
  const porClave = new Map(
    GRUPOS.flatMap((g) => paquete.coberturas[g]).map((c) => [c.clave, c]),
  );
  let cambio = false;

  const suma = (clave: number, campo: "responsabilidadCivil" | "gastosMedicos") => {
    const c = porClave.get(clave);
    const solicitado = cob[campo];
    if (!c || !c.calculada || solicitado === undefined) return;
    const v = c.opcionesSuma.length
      ? masCercano(campo, solicitado, c.opcionesSuma, ajustes)
      : acotar(campo, solicitado, c.sumaMinima, c.sumaMaxima, ajustes);
    if (v !== c.sumaAsegurada) {
      c.sumaAsegurada = v;
      cambio = true;
    }
  };
  const deducible = (
    clave: number,
    campo: "deducibleDanosMateriales" | "deducibleRoboTotal",
  ) => {
    const c = porClave.get(clave);
    const solicitado = cob[campo];
    if (!c || !c.calculada || solicitado === undefined || !c.opcionesDeducible.length) return;
    const v = masCercano(campo, solicitado, c.opcionesDeducible, ajustes);
    if (v !== c.deducible) {
      c.deducible = v;
      cambio = true;
    }
  };

  suma(COB_RC, "responsabilidadCivil");
  suma(COB_GASTOS_MEDICOS, "gastosMedicos");
  deducible(COB_DANOS_MATERIALES, "deducibleDanosMateriales");
  deducible(COB_ROBO_TOTAL, "deducibleRoboTotal");
  return cambio;
}

function formatearSuma(clave: number, monto: number): string {
  if (clave === COB_DANOS_MATERIALES || clave === COB_ROBO_TOTAL) return "Valor comercial";
  if (monto <= 1) return "Amparada";
  return `$${monto.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

export function coberturasHomologadas(paquete: PaqueteHdi): Cobertura[] {
  const porNombre = new Map<string, CoberturaHdi>();
  for (const c of GRUPOS.flatMap((g) => paquete.coberturas[g])) {
    const nombre = COBERTURA_HOMOLOGADA[c.clave];
    if (nombre && c.calculada && !porNombre.has(nombre)) porNombre.set(nombre, c);
  }
  return ORDEN_COBERTURAS.map((nombre) => {
    const c = porNombre.get(nombre);
    if (!c) return { nombre, incluida: false, deducible: "N/A" };
    const conDeducible = c.clave === COB_DANOS_MATERIALES || c.clave === COB_ROBO_TOTAL;
    return {
      nombre,
      incluida: true,
      sumaAsegurada: formatearSuma(c.clave, c.sumaAsegurada),
      deducible: conDeducible && c.deducible > 0 ? `${c.deducible}%` : "N/A",
    };
  });
}

// HDI reporta el descuento como monto negativo en <Totales><Descuento>.
export function desglose(t: TotalesHdi, descuentoPorcentaje: number): DesglosePrima {
  const descuentoMonto = round2(Math.abs(t.descuento));
  const primaNetaSinDescuento = round2(t.primaNeta);
  return {
    primaNetaSinDescuento,
    descuentoPorcentaje,
    descuentoMonto,
    primaNeta: round2(primaNetaSinDescuento - descuentoMonto),
    derechos: round2(t.derechoPoliza),
    recargoPagoFraccionado: round2(t.financiamiento),
    iva: round2(t.iva),
    primaTotal: round2(t.primaTotal),
  };
}

export async function cotizarHdiReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  descuento: number,
  claveHdi: string,
): Promise<CotizacionResultado> {
  const cfg = getHdiConfig();
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };
  if (!credencialesConfiguradas(cfg)) {
    return { ...base, status: "error", error: new HdiNoConfigurado().message };
  }

  try {
    const vehiculo = parsearClaveHdi(claveHdi);
    if (!vehiculo) throw new HdiError(`Clave HDI inválida: ${claveHdi}.`);
    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setFullYear(fin.getFullYear() + 1);

    const solicitud: SolicitudHdi = {
      vehiculo,
      anio: request.vehiculo.anio,
      cp: request.vehiculo.cp,
      idFormaPago: await idFormaPago(request.formaPago),
      clavePaquete: PAQUETE_HDI[categoria(vehiculo.tipoVehiculo)][request.paquete],
      inicio: fecha(inicio),
      fin: fecha(fin),
    };

    let paquete = await obtenerPaquete(solicitud);
    const ajustes: string[] = [];
    const personalizado = request.coberturasPersonalizadas
      ? aplicarPersonalizadas(request.coberturasPersonalizadas, paquete, ajustes)
      : false;
    if (descuento > 0 || personalizado) {
      paquete = await obtenerPaquete(
        solicitud,
        xmlPaqueteConCambios(paquete, solicitud, descuento, cfg.tipoAjusteDescuento),
      );
    }
    if (!paquete.totales.primaTotal) {
      throw new HdiError("HDI no devolvió una prima válida para el paquete.");
    }

    return {
      ...base,
      status: "success",
      prima: desglose(paquete.totales, paquete.porcentajeAjuste || descuento),
      coberturas: coberturasHomologadas(paquete),
      vigencia: { inicio: solicitud.inicio, fin: solicitud.fin },
      tiempoRespuestaMs: Date.now() - inicioTiempo,
      origen: "real",
      ajustes: ajustes.length ? ajustes : undefined,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error:
        err instanceof Error
          ? `No se pudo consultar a HDI: ${err.message}`
          : "No se pudo consultar a HDI.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }
}
