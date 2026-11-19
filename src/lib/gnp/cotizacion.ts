// Cotización real de GNP (Web Service Preferente, /cotizador/cotizar). Una
// llamada cotiza todos los paquetes del negocio para el vehículo; las
// columnas del comparativo comparten esa respuesta.

import type { Cobertura, CotizacionRequest, CotizacionResultado, DesglosePrima, FormaPago, Paquete } from "@/domain/types";
import { parsearClaveGnp, type TipoVehiculoGnp } from "./catalogos";
import { GnpError, GnpNoConfigurado, bloques, escapeXml, postGnp, valor } from "./client";
import { credencialesConfiguradas, getGnpConfig } from "./config";

// Claves de paquete del kit de conexión (persona física, residentes).
const PAQUETES_GNP: Record<TipoVehiculoGnp, Record<Paquete, string>> = {
  AUT: { AMPLIA_PLUS: "PRS0010536", AMPLIA: "PRS0009355", LIMITADA: "PRS0009356", RC: "PRP0000289" },
  CA1: { AMPLIA_PLUS: "PRS0010543", AMPLIA: "PRS0009357", LIMITADA: "PRS0009358", RC: "PRP0000308" },
};
const NOMBRE_PAQUETE: Record<Paquete, string> = {
  AMPLIA_PLUS: "Premium",
  AMPLIA: "Amplia",
  LIMITADA: "Limitada",
  RC: "Responsabilidad Civil",
};
// Claves de cobertura del kit ("COBERTURAS JUEGA Y COMPARA"); las opciones del
// comparativo están dentro de los valores que GNP admite.
function coberturasXml(request: CotizacionRequest, paquete: Paquete): string {
  const c = request.coberturasPersonalizadas;
  if (!c) return "<COBERTURAS/>";
  const conDanos = paquete === "AMPLIA" || paquete === "AMPLIA_PLUS";
  const lista: Array<[string, number | undefined, number | undefined]> = [
    // GNP exige que protección legal y extensión de RC igualen la RC.
    ["0000001273", c.responsabilidadCivil, undefined],
    ["0000001285", c.responsabilidadCivil, undefined],
    ["0000000904", c.responsabilidadCivil, undefined],
    ["0000000906", c.gastosMedicos, undefined],
    ...(conDanos
      ? ([
          ["0000001289", undefined, c.deducibleDanosMateriales],
          ["0000001288", undefined, c.deducibleDanosMateriales],
        ] as Array<[string, undefined, number | undefined]>)
      : []),
    ...(paquete !== "RC" ? ([["0000000916", undefined, c.deducibleRoboTotal]] as Array<[string, undefined, number | undefined]>) : []),
  ];
  const items = lista
    .filter(([, suma, ded]) => suma !== undefined || ded !== undefined)
    .map(
      ([cve, suma, ded]) =>
        `<COBERTURA><CVE_COBERTURA>${cve}</CVE_COBERTURA>` +
        (suma !== undefined ? `<SUMA_ASEGURADA>${suma}</SUMA_ASEGURADA>` : "") +
        (ded !== undefined ? `<DEDUCIBLE>${ded}</DEDUCIBLE>` : "") +
        `</COBERTURA>`,
    )
    .join("");
  return items ? `<COBERTURAS>${items}</COBERTURAS>` : "<COBERTURAS/>";
}

// Comisión que GNP pide informar: 10 en autos, 8 en pick ups. El descuento se
// da cediendo parte de esa comisión (PORCENTAJE_CESION_COMISION, en % de la
// comisión), así que el máximo es la comisión completa.
const COMISION: Record<TipoVehiculoGnp, number> = { AUT: 10, CA1: 8 };

export function cesionPara(tipo: TipoVehiculoGnp, descuento: number): { cesion: number; aplicado: number } {
  const comision = COMISION[tipo];
  const aplicado = Math.min(Math.max(descuento, 0), comision);
  return { cesion: round2((aplicado / comision) * 100), aplicado };
}

const PERIODICIDAD: Record<FormaPago, string> = { CONTADO: "A", SEMESTRAL: "S", TRIMESTRAL: "T", MENSUAL: "M" };

interface PaqueteGnp {
  clave: string;
  coberturas: Cobertura[];
  conceptos: Array<{ nombre: string; monto: number }>;
  parcialidades: Array<{ num: number; monto: number }>;
}

interface CotizacionGnp {
  numero: string;
  paquetes: PaqueteGnp[];
}

const fecha = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const num = (t: string) => Number(t.replace(/[^0-9.-]/g, "")) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

function edad(fechaNacimiento: string): number {
  const n = new Date(fechaNacimiento);
  if (Number.isNaN(n.getTime())) return 35;
  return Math.floor((Date.now() - n.getTime()) / (365.25 * 24 * 3600 * 1000));
}

const elemento = (nombre: string, v: string | number) =>
  `<ELEMENTO><NOMBRE>${nombre}</NOMBRE><CLAVE>${v}</CLAVE><VALOR>${v}</VALOR></ELEMENTO>`;

function solicitudXml(
  request: CotizacionRequest,
  clave: NonNullable<ReturnType<typeof parsearClaveGnp>>,
  descuento: number,
): string {
  const cfg = getGnpConfig();
  const inicio = new Date();
  const fin = new Date(inicio);
  fin.setFullYear(fin.getFullYear() + 1);
  const cp = escapeXml(request.vehiculo.cp);
  const c = request.conductor;
  const paquetes = (Object.keys(PAQUETES_GNP[clave.tipo]) as Paquete[])
    .map(
      (p) =>
        `<PAQUETE><CVE_PAQUETE>${PAQUETES_GNP[clave.tipo][p]}</CVE_PAQUETE><DESC_PAQUETE>${NOMBRE_PAQUETE[p]}</DESC_PAQUETE>${coberturasXml(request, p)}</PAQUETE>`,
    )
    .join("");
  return (
    `<COTIZACION><SOLICITUD><USUARIO>${escapeXml(cfg.usuario)}</USUARIO><PASSWORD>${escapeXml(cfg.password)}</PASSWORD>` +
    `<ID_UNIDAD_OPERABLE>${cfg.unidadOperable}</ID_UNIDAD_OPERABLE>` +
    `<FCH_INICIO_VIGENCIA>${fecha(inicio)}</FCH_INICIO_VIGENCIA><FCH_FIN_VIGENCIA>${fecha(fin)}</FCH_FIN_VIGENCIA>` +
    `<VIA_PAGO>IN</VIA_PAGO><PERIODICIDAD>${PERIODICIDAD[request.formaPago]}</PERIODICIDAD>` +
    `<ELEMENTOS>${elemento("INTERMEDIARIO", cfg.intermediario)}${elemento("PORCENTAJE_COMISION", COMISION[clave.tipo])}` +
    `${elemento("PORCENTAJE_CESION_COMISION", cesionPara(clave.tipo, descuento).cesion)}</ELEMENTOS>` +
    `</SOLICITUD><VEHICULO><SUB_RAMO>01</SUB_RAMO><TIPO_VEHICULO>${clave.tipo}</TIPO_VEHICULO>` +
    `<MODELO>${request.vehiculo.anio}</MODELO><ARMADORA>${escapeXml(clave.armadora)}</ARMADORA>` +
    `<CARROCERIA>${escapeXml(clave.carroceria)}</CARROCERIA><VERSION>${escapeXml(clave.version)}</VERSION>` +
    `<USO>01</USO><FORMA_INDEMNIZACION>01</FORMA_INDEMNIZACION><VALOR_FACTURA></VALOR_FACTURA></VEHICULO>` +
    `<CONTRATANTE><TIPO_PERSONA>F</TIPO_PERSONA><CODIGO_POSTAL>${cp}</CODIGO_POSTAL></CONTRATANTE>` +
    `<CONDUCTOR><FCH_NACIMIENTO>${c.fechaNacimiento.replace(/-/g, "")}</FCH_NACIMIENTO>` +
    `<SEXO>${c.genero === "F" ? "F" : "M"}</SEXO><EDAD>${edad(c.fechaNacimiento)}</EDAD>` +
    `<CODIGO_POSTAL>${cp}</CODIGO_POSTAL></CONDUCTOR><PAQUETES>${paquetes}</PAQUETES></COTIZACION>`
  );
}

function parsear(xml: string): CotizacionGnp {
  return {
    numero: valor(xml, "NUM_COTIZACION") || valor(xml, "NUM_CONTIZACION"),
    paquetes: bloques(xml, "PAQUETE").map((p) => ({
      clave: valor(p, "CVE_PAQUETE"),
      coberturas: homologar(bloques(p, "COBERTURA")),
      conceptos: bloques(p, "CONCEPTO_ECONOMICO").map((c) => ({ nombre: valor(c, "NOMBRE"), monto: num(valor(c, "MONTO")) })),
      parcialidades: bloques(p, "RESULTADO_MONTO_PARCIALIDAD").map((r) => ({
        num: num(valor(r, "NUM_PARCIALIDADES")),
        monto: num(valor(r, "MTO_PARCIALIDAD") || valor(r, "MTO_PARCIALIDADES")),
      })),
    })),
  };
}

const COBERTURA_HOMOLOGADA: Array<[RegExp, string]> = [
  [/DA[ÑN]OS MATERIALES P[EÉ]RDIDA PARCIAL/i, "Daños Materiales"],
  [/ROBO TOTAL/i, "Robo Total"],
  [/RESPONSABILIDAD CIVIL (POR )?DA[ÑN]OS A TERCEROS/i, "Responsabilidad Civil"],
  [/GASTOS M[EÉ]DICOS/i, "Gastos Médicos Ocupantes"],
  [/PROTECCI[OÓ]N LEGAL/i, "Defensa Jurídica"],
];

function texto(t: string): string | undefined {
  const v = t.replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").trim();
  return v && !/^no aplica$/i.test(v) ? v.replace(/^VALOR COMERCIAL$/i, "Valor comercial").replace(/^AMPARADA$/i, "Amparada") : undefined;
}

function homologar(lista: string[]): Cobertura[] {
  const principales = new Map<string, Cobertura>();
  const otras: Cobertura[] = [];
  for (const c of lista) {
    const nombre = valor(c, "NOMBRE").replace(/\s+/g, " ").trim();
    const cob = { nombre, incluida: true, sumaAsegurada: texto(valor(c, "SUMA_ASEGURADA")), deducible: texto(valor(c, "DEDUCIBLE")) };
    const hom = COBERTURA_HOMOLOGADA.find(([re]) => re.test(nombre));
    if (hom && !principales.has(hom[1])) principales.set(hom[1], { ...cob, nombre: hom[1] });
    else if (nombre) otras.push({ ...cob, nombre: nombre.charAt(0) + nombre.slice(1).toLowerCase() });
  }
  return [...COBERTURA_HOMOLOGADA.map(([, n]) => principales.get(n)).filter((c): c is Cobertura => !!c), ...otras];
}

const compartidas = new Map<string, { expira: number; valor: Promise<CotizacionGnp> }>();

function cotizacionCompartida(request: CotizacionRequest, claveGnp: string, descuento: number): Promise<CotizacionGnp> {
  const ahora = Date.now();
  compartidas.forEach((v, k) => v.expira <= ahora && compartidas.delete(k));
  const llave = JSON.stringify([claveGnp, request.vehiculo, request.conductor, request.formaPago, request.coberturasPersonalizadas, descuento]);
  const hit = compartidas.get(llave);
  if (hit) return hit.valor;
  const clave = parsearClaveGnp(claveGnp);
  if (!clave) return Promise.reject(new GnpError(`Clave GNP no válida: ${claveGnp}.`));
  const promesa = postGnp("/cotizador/cotizar", solicitudXml(request, clave, descuento)).then(parsear);
  compartidas.set(llave, { expira: ahora + 60_000, valor: promesa });
  promesa.catch(() => compartidas.delete(llave));
  return promesa;
}

function concepto(p: PaqueteGnp, re: RegExp): number {
  return p.conceptos.find((c) => re.test(c.nombre))?.monto ?? 0;
}

export async function cotizarGnpReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  claveGnp: string,
  descuento = 0,
): Promise<CotizacionResultado> {
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };
  if (!credencialesConfiguradas(getGnpConfig())) {
    return { ...base, status: "error", error: new GnpNoConfigurado().message };
  }
  if (request.vehiculo.uso !== "PARTICULAR") {
    return { ...base, status: "error", error: "GNP solo tiene autorizado el uso particular." };
  }
  try {
    const clave = parsearClaveGnp(claveGnp);
    if (!clave) throw new GnpError(`Clave GNP no válida: ${claveGnp}.`);
    const { aplicado } = cesionPara(clave.tipo, descuento);
    const [cotizacion, lista] = await Promise.all([
      cotizacionCompartida(request, claveGnp, aplicado),
      aplicado > 0 ? cotizacionCompartida(request, claveGnp, 0) : undefined,
    ]);
    const buscada = PAQUETES_GNP[clave.tipo][request.paquete];
    const paquete = cotizacion.paquetes.find((p) => p.clave === buscada);
    const paqueteLista = lista?.paquetes.find((p) => p.clave === buscada) ?? paquete;
    if (!paquete) return { ...base, status: "error", noOfrecido: true, error: "GNP no devolvió este paquete." };
    const primaTotal = concepto(paquete, /^TOTAL_PAGAR$/);
    if (!(primaTotal > 0)) throw new GnpError("GNP no devolvió la prima total.");
    // La cesión de comisión llega como PRIMA_CEDIDA (negativa) aparte de la
    // prima neta; el IVA y el total ya la descuentan.
    const primaNeta = concepto(paquete, /^PRIMA_NETA$/) + concepto(paquete, /^PRIMA_CEDIDA$/);
    const primaLista = paqueteLista ? concepto(paqueteLista, /^PRIMA_NETA$/) : primaNeta;
    const prima: DesglosePrima = {
      primaNetaSinDescuento: round2(primaLista),
      descuentoPorcentaje: aplicado,
      descuentoMonto: round2(primaLista - primaNeta),
      primaNeta: round2(primaNeta),
      derechos: round2(concepto(paquete, /^DERECHOS_POLIZA$/)),
      recargoPagoFraccionado: round2(concepto(paquete, /^RECARGO_FRACCIONAMIENTO$/)),
      iva: round2(concepto(paquete, /^IVA$/)),
      primaTotal: round2(primaTotal),
    };
    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setFullYear(fin.getFullYear() + 1);
    return {
      ...base,
      status: "success",
      prima,
      coberturas: paquete.coberturas,
      vigencia: { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) },
      tiempoRespuestaMs: Date.now() - inicioTiempo,
      origen: "real",
      noCotizacion: cotizacion.numero || undefined,
      ajustes:
        descuento > aplicado
          ? [`Descuento: GNP solo permite ceder la comisión de ${COMISION[clave.tipo]}%; se aplicó ${aplicado}%.`]
          : undefined,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error: err instanceof Error ? `No se pudo consultar a GNP: ${err.message}` : "No se pudo consultar a GNP.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }
}
