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

function solicitudXml(request: CotizacionRequest, clave: NonNullable<ReturnType<typeof parsearClaveGnp>>): string {
  const cfg = getGnpConfig();
  const inicio = new Date();
  const fin = new Date(inicio);
  fin.setFullYear(fin.getFullYear() + 1);
  const cp = escapeXml(request.vehiculo.cp);
  const c = request.conductor;
  const paquetes = (Object.keys(PAQUETES_GNP[clave.tipo]) as Paquete[])
    .map(
      (p) =>
        `<PAQUETE><CVE_PAQUETE>${PAQUETES_GNP[clave.tipo][p]}</CVE_PAQUETE><DESC_PAQUETE>${NOMBRE_PAQUETE[p]}</DESC_PAQUETE><COBERTURAS/></PAQUETE>`,
    )
    .join("");
  return (
    `<COTIZACION><SOLICITUD><USUARIO>${escapeXml(cfg.usuario)}</USUARIO><PASSWORD>${escapeXml(cfg.password)}</PASSWORD>` +
    `<ID_UNIDAD_OPERABLE>${cfg.unidadOperable}</ID_UNIDAD_OPERABLE>` +
    `<FCH_INICIO_VIGENCIA>${fecha(inicio)}</FCH_INICIO_VIGENCIA><FCH_FIN_VIGENCIA>${fecha(fin)}</FCH_FIN_VIGENCIA>` +
    `<VIA_PAGO>IN</VIA_PAGO><PERIODICIDAD>${PERIODICIDAD[request.formaPago]}</PERIODICIDAD>` +
    `<ELEMENTOS><ELEMENTO><NOMBRE>INTERMEDIARIO</NOMBRE><CLAVE>${cfg.intermediario}</CLAVE><VALOR>${cfg.intermediario}</VALOR></ELEMENTO></ELEMENTOS>` +
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
      coberturas: bloques(p, "COBERTURA").map((c) => {
        const suma = valor(c, "SUMA_ASEGURADA");
        const ded = valor(c, "DEDUCIBLE");
        return {
          nombre: valor(c, "NOMBRE"),
          incluida: true,
          sumaAsegurada: suma && num(suma) > 0 ? `$${num(suma).toLocaleString("es-MX")}` : "Amparada",
          deducible: ded && num(ded) > 0 ? `${num(ded)}%` : undefined,
        };
      }),
      conceptos: bloques(p, "CONCEPTO_ECONOMICO").map((c) => ({ nombre: valor(c, "NOMBRE"), monto: num(valor(c, "MONTO")) })),
      parcialidades: bloques(p, "RESULTADO_MONTO_PARCIALIDAD").map((r) => ({
        num: num(valor(r, "NUM_PARCIALIDADES")),
        monto: num(valor(r, "MTO_PARCIALIDAD") || valor(r, "MTO_PARCIALIDADES")),
      })),
    })),
  };
}

const compartidas = new Map<string, { expira: number; valor: Promise<CotizacionGnp> }>();

function cotizacionCompartida(request: CotizacionRequest, claveGnp: string): Promise<CotizacionGnp> {
  const ahora = Date.now();
  compartidas.forEach((v, k) => v.expira <= ahora && compartidas.delete(k));
  const llave = JSON.stringify([claveGnp, request.vehiculo, request.conductor, request.formaPago]);
  const hit = compartidas.get(llave);
  if (hit) return hit.valor;
  const clave = parsearClaveGnp(claveGnp);
  if (!clave) return Promise.reject(new GnpError(`Clave GNP no válida: ${claveGnp}.`));
  const promesa = postGnp("/cotizador/cotizar", solicitudXml(request, clave)).then(parsear);
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
    const cotizacion = await cotizacionCompartida(request, claveGnp);
    const buscada = clave && PAQUETES_GNP[clave.tipo][request.paquete];
    const paquete = cotizacion.paquetes.find((p) => p.clave === buscada);
    if (!paquete) return { ...base, status: "error", noOfrecido: true, error: "GNP no devolvió este paquete." };
    const primaTotal = concepto(paquete, /PRIMA.?TOTAL|^TOTAL/i);
    if (!(primaTotal > 0)) throw new GnpError("GNP no devolvió la prima total.");
    const primaNeta = concepto(paquete, /PRIMA.?NETA/i);
    const prima: DesglosePrima = {
      primaNetaSinDescuento: round2(primaNeta),
      descuentoPorcentaje: 0,
      descuentoMonto: 0,
      primaNeta: round2(primaNeta),
      derechos: round2(concepto(paquete, /DERECHO/i)),
      recargoPagoFraccionado: round2(concepto(paquete, /RECARGO/i)),
      iva: round2(concepto(paquete, /IVA/i)),
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
