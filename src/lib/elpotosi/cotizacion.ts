// Cotización real de El Potosí (Cotizador Dinámico). Flujo:
//   1. ObtenerCoberturasPaquete devuelve las coberturas del paquete con su
//      prima individual.
//   2. Si el broker cambió sumas o deducibles, ObtenerPrimaCobertura recalcula
//      la prima de esa cobertura (Cotizar no la recalcula por sí solo).
//   3. Cotizar suma las coberturas seleccionadas y devuelve totales, planes de
//      pago y el folio de cotización.

import type {
  Cobertura,
  CotizacionRequest,
  CotizacionResultado,
  FormaPago,
  Paquete,
} from "@/domain/types";
import { acotar, masCercano } from "@/lib/coberturas";
import { ElPotosiError, getElPotosiConfig, llamarElPotosi, urlCotizador } from "./client";
import { parsearClaveElPotosi, ubicacionPorCp, type ClaveElPotosi } from "./catalogos";

const PAQUETE: Record<Paquete, string> = { AMPLIA: "DAMP", LIMITADA: "DLIM", RC: "DBS" };

const FORMA_PAGO: Record<FormaPago, RegExp | undefined> = {
  CONTADO: /^CONTADO/i,
  SEMESTRAL: /^SEMESTRAL/i,
  TRIMESTRAL: /^TRIMESTRAL/i,
  MENSUAL: undefined,
};

const TIPO_USO = process.env.EL_POTOSI_TIPO_USO || "22";
const FORMA_ASEGURAMIENTO = "1"; // valor comercial
const TIPO_PERSONA = "F";
const TIPO_CARGA = "Z"; // no aplica

const COB_DM = "DAMA";
const COB_RT = "ROBT";
const COB_RC = "DBPE";
const COB_GM = "GTMO";

const HOMOLOGADA: Record<string, string> = {
  [COB_DM]: "Daños Materiales",
  [COB_RT]: "Robo Total",
  [COB_RC]: "Responsabilidad Civil",
  [COB_GM]: "Gastos Médicos Ocupantes",
  ASVJ: "Asistencia Vial y Legal",
  ASDL: "Defensa Jurídica",
};
const ORDEN = Object.values(HOMOLOGADA);

export interface CoberturaElPotosi {
  codRamo: string;
  codCobert: string;
  descCobert: string;
  suma_Asegurada: number;
  suma_Asegurada_Etiqueta?: string | null;
  prima: number;
  deducible: number;
  seleccionada: string;
  ocupantes: number;
  sumaAseguradaList?: { sA_Asegurada: number }[] | null;
  deducibleList?: number[] | null;
}

interface PlanPago {
  formapagoid: string;
  descripcion: string;
  importeTotal: number;
}

export interface RespuestaCotizar {
  primaNeta: number;
  descuento: number;
  subtotal: number;
  gastosEmision: number;
  iva: number;
  primaTotal: number;
  planes: PlanPago[];
  folioCotizacion: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function edad(fechaNacimiento: string): number {
  const nac = new Date(fechaNacimiento);
  const hoy = new Date();
  let e = hoy.getFullYear() - nac.getFullYear();
  if (
    hoy.getMonth() < nac.getMonth() ||
    (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())
  )
    e--;
  return e;
}

interface Contexto {
  clave: ClaveElPotosi;
  anio: number;
  cp: string;
  estado: string;
  municipio: string;
  edad: number;
  genero: string;
}

function parametrosVehiculo(c: Contexto) {
  const cfg = getElPotosiConfig();
  return {
    CodUsr: cfg.usuario,
    CodInter: cfg.intermediario,
    CodMarca: c.clave.marca,
    CodModelo: c.clave.modelo,
    CodVersion: c.clave.version,
    CodEstado: c.estado,
    CodMunicipio: c.municipio,
    TipoCarga: TIPO_CARGA,
    TipoPersona: TIPO_PERSONA,
    CP: c.cp,
    Genero: c.genero,
    FormaAseguramiento: FORMA_ASEGURAMIENTO,
  };
}

function coberturasPaquete(c: Contexto, paquete: string): Promise<CoberturaElPotosi[]> {
  return llamarElPotosi<CoberturaElPotosi[]>(
    urlCotizador("Cotizador/ObtenerCoberturasPaquete", {
      ...parametrosVehiculo(c),
      AnioVeh: c.anio,
      TipoUso: TIPO_USO,
      Edad: c.edad,
      Paquete: paquete,
    }),
  );
}

function primaCobertura(c: Contexto, cob: CoberturaElPotosi): Promise<number> {
  return llamarElPotosi<number>(
    urlCotizador("Cotizador/ObtenerPrimaCobertura", {
      ...parametrosVehiculo(c),
      CodRamo: cob.codRamo,
      CodCobert: cob.codCobert,
      Deducible: cob.deducible,
      Suma_Asegurada: cob.suma_Asegurada,
      Anio: c.anio,
      EdadConductor: c.edad,
      CodUso: TIPO_USO,
      Tonelaje: 0,
    }),
  );
}

// Aplica sumas y deducibles elegidos por el broker; devuelve las coberturas
// que cambiaron para recalcular su prima.
export function aplicarPersonalizadas(
  request: CotizacionRequest,
  coberturas: CoberturaElPotosi[],
  ajustes: string[],
): CoberturaElPotosi[] {
  const p = request.coberturasPersonalizadas;
  if (!p) return [];
  const cambiadas = new Set<CoberturaElPotosi>();
  const por = (cod: string) => coberturas.find((c) => c.codCobert === cod);

  const rc = por(COB_RC);
  if (rc && p.responsabilidadCivil !== undefined) {
    const opciones = (rc.sumaAseguradaList ?? []).map((o) => o.sA_Asegurada);
    const v = masCercano("responsabilidadCivil", p.responsabilidadCivil, opciones, ajustes);
    if (v !== rc.suma_Asegurada) {
      rc.suma_Asegurada = v;
      cambiadas.add(rc);
    }
  }
  const gm = por(COB_GM);
  if (gm && p.gastosMedicos !== undefined) {
    const opciones = (gm.sumaAseguradaList ?? []).map((o) => o.sA_Asegurada);
    const v = opciones.length
      ? masCercano("gastosMedicos", p.gastosMedicos, opciones, ajustes)
      : acotar("gastosMedicos", p.gastosMedicos, undefined, undefined, ajustes);
    if (v !== gm.suma_Asegurada) {
      gm.suma_Asegurada = v;
      cambiadas.add(gm);
    }
  }
  const deducible = (
    cob: CoberturaElPotosi | undefined,
    campo: "deducibleDanosMateriales" | "deducibleRoboTotal",
  ) => {
    const solicitado = p[campo];
    if (!cob || solicitado === undefined || !cob.deducibleList?.length) return;
    const v = masCercano(campo, solicitado, cob.deducibleList, ajustes);
    if (v !== cob.deducible) {
      cob.deducible = v;
      cambiadas.add(cob);
    }
  };
  deducible(por(COB_DM), "deducibleDanosMateriales");
  deducible(por(COB_RT), "deducibleRoboTotal");
  return Array.from(cambiadas);
}

async function cotizar(
  c: Contexto,
  paquete: string,
  coberturas: CoberturaElPotosi[],
  descuento: number,
): Promise<RespuestaCotizar> {
  const cfg = getElPotosiConfig();
  return llamarElPotosi<RespuestaCotizar>(`${cfg.urlCotizador}/Cotizador/cotizar`, {
    Addenda: "",
    parametrosGenerales: {
      ...parametrosVehiculo(c),
      TipoUso: TIPO_USO,
      AnioVeh: c.anio,
      EdadConductor: c.edad,
      PorDescuento: descuento,
      Paquete: paquete,
    },
    coberturas: coberturas.map((x) => ({
      codRamo: x.codRamo,
      codCobert: x.codCobert,
      descCobert: x.descCobert,
      suma_Asegurada: x.suma_Asegurada,
      prima: x.prima,
      deducible: x.deducible,
      seleccionada: x.seleccionada,
      ocupantes: x.ocupantes,
    })),
  });
}

function dinero(n: number): string {
  return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

export function coberturasHomologadas(coberturas: CoberturaElPotosi[]): Cobertura[] {
  const porNombre = new Map<string, CoberturaElPotosi>();
  for (const c of coberturas) {
    const nombre = HOMOLOGADA[c.codCobert];
    if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, c);
  }
  return ORDEN.map((nombre) => {
    const c = porNombre.get(nombre);
    if (!c) return { nombre, incluida: false, deducible: "N/A" };
    const conDeducible = c.codCobert === COB_DM || c.codCobert === COB_RT;
    return {
      nombre,
      incluida: true,
      sumaAsegurada: conDeducible
        ? c.suma_Asegurada_Etiqueta || "Valor comercial"
        : c.suma_Asegurada > 0
          ? dinero(c.suma_Asegurada)
          : "Amparada",
      deducible: conDeducible && c.deducible > 0 ? `${c.deducible}%` : "N/A",
    };
  });
}

const MAXIMO_DESCUENTO = /m[aá]ximo es (\d+(?:\.\d+)?)\s*%/i;

export async function cotizarElPotosiReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  descuento: number,
  claveElPotosi: string,
): Promise<CotizacionResultado> {
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };
  try {
    const clave = parsearClaveElPotosi(claveElPotosi);
    if (!clave) throw new ElPotosiError(`Clave El Potosí inválida: ${claveElPotosi}.`);
    const patronPago = FORMA_PAGO[request.formaPago];
    if (!patronPago)
      throw new ElPotosiError("El Potosí solo maneja pago de contado, semestral o trimestral.");

    const { estado, municipio } = await ubicacionPorCp(request.vehiculo.cp);
    const ctx: Contexto = {
      clave,
      anio: request.vehiculo.anio,
      cp: request.vehiculo.cp,
      estado,
      municipio,
      edad: edad(request.conductor.fechaNacimiento),
      genero: request.conductor.genero,
    };
    const paquete = `${PAQUETE[request.paquete]}-${getElPotosiConfig().usuario}`;
    const coberturas = (await coberturasPaquete(ctx, paquete)).filter(
      (c) => c.seleccionada === "S",
    );
    if (!coberturas.length)
      throw new ElPotosiError(`El Potosí no devolvió coberturas del paquete ${paquete}.`);

    const ajustes: string[] = [];
    for (const c of aplicarPersonalizadas(request, coberturas, ajustes)) {
      c.prima = await primaCobertura(ctx, c);
    }

    let aplicado = descuento;
    let r: RespuestaCotizar;
    try {
      r = await cotizar(ctx, paquete, coberturas, aplicado);
    } catch (err) {
      const max = err instanceof ElPotosiError ? MAXIMO_DESCUENTO.exec(err.message) : null;
      if (!max || descuento <= 0) throw err;
      aplicado = Number(max[1]);
      ajustes.push(`Descuento: El Potosí autoriza máximo ${aplicado}%.`);
      r = await cotizar(ctx, paquete, coberturas, aplicado);
    }

    const plan = r.planes.find((p) => patronPago.test(p.descripcion));
    if (!plan) throw new ElPotosiError("El Potosí no ofreció la forma de pago solicitada.");
    const descuentoMonto = round2(Math.abs(r.descuento));
    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setFullYear(fin.getFullYear() + 1);

    return {
      ...base,
      status: "success",
      prima: {
        primaNetaSinDescuento: round2(r.primaNeta),
        descuentoPorcentaje: aplicado,
        descuentoMonto,
        primaNeta: round2(r.primaNeta - descuentoMonto),
        derechos: round2(r.gastosEmision),
        recargoPagoFraccionado: round2(plan.importeTotal - r.primaTotal),
        iva: round2(r.iva),
        primaTotal: round2(plan.importeTotal),
      },
      coberturas: coberturasHomologadas(coberturas),
      vigencia: {
        inicio: inicio.toISOString().slice(0, 10),
        fin: fin.toISOString().slice(0, 10),
      },
      tiempoRespuestaMs: Date.now() - inicioTiempo,
      origen: "real",
      noCotizacion: String(r.folioCotizacion),
      referenciaEmision: plan.formapagoid,
      ajustes: ajustes.length ? ajustes : undefined,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error:
        err instanceof Error
          ? `No se pudo consultar a El Potosí: ${err.message}`
          : "No se pudo consultar a El Potosí.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }
}
