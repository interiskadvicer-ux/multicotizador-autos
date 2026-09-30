// Cotización real de Zurich (Web Service V2 de Autos).
// Flujo: detalle de la clave Zurich (tipo de vehículo) → solicitud de
// cotización (devuelve folio y los paquetes con sus coberturas) →
// recotización del paquete elegido con el descuento y las coberturas
// personalizadas del broker.

import type {
  Cobertura,
  CoberturasPersonalizadas,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
  FormaPago,
  Paquete,
} from "@/domain/types";
import { masCercano } from "@/lib/coberturas";
import { credencialesConfiguradas, getZurichConfig } from "./config";
import {
  ZurichError,
  ZurichNoConfigurado,
  bloques,
  llamarZurich,
  valor,
  xmlCampos,
} from "./client";
import { detalleVehiculo } from "./catalogos";

const SOLICITUD = "autos/solCotV2/publicService";
const RECOTIZACION = "autos/reCotV2/publicService";
const CATALOGOS = "autos/consultaCatalogosAutos/publicService";
const CODIGOS_POSTALES = "catalogos/obtenerCatEstMunAsentCp/publicService";

const FORMA_PAGO_ZURICH: Record<FormaPago, string> = {
  CONTADO: "C",
  MENSUAL: "M",
  TRIMESTRAL: "T",
  SEMESTRAL: "S",
};

// Zurich nombra sus paquetes "055 Amplia Plus", "056 Limitada", "057 RC Autos".
const PAQUETE_ZURICH: Record<Paquete, RegExp> = {
  AMPLIA: /AMPLIA/i,
  LIMITADA: /LIMITADA/i,
  RC: /\bRC\b|RESPONSABILIDAD CIVIL/i,
};

const TIPO_VALOR_COMERCIAL = 7;
const TIPO_USO: Record<CotizacionRequest["vehiculo"]["uso"], number> = {
  PARTICULAR: 1,
  COMERCIAL: 2,
};
// Carga "A - Mercancía con reducido grado de peligrosidad" (no peligrosa),
// aplicable a camiones ligeros.
const CARGA_NO_PELIGROSA = 1;
const TIPO_VEHICULO_CAMION = "2";

const COB_DANOS_MATERIALES = "341";
const COB_ROBO_TOTAL = "331";
const COB_RC = "312";
const COB_GASTOS_MEDICOS = "352";

const COBERTURA_HOMOLOGADA: Record<string, string> = {
  [COB_DANOS_MATERIALES]: "Daños Materiales",
  [COB_ROBO_TOTAL]: "Robo Total",
  [COB_RC]: "Responsabilidad Civil",
  [COB_GASTOS_MEDICOS]: "Gastos Médicos Ocupantes",
  "681": "Asistencia Vial y Legal",
  "326": "Defensa Jurídica",
};

const ORDEN_COBERTURAS = [
  "Daños Materiales",
  "Robo Total",
  "Responsabilidad Civil",
  "Gastos Médicos Ocupantes",
  "Asistencia Vial y Legal",
  "Defensa Jurídica",
];

// Pasos con los que se reduce el descuento cuando Zurich lo rechaza por
// exceder el autorizado para el número de relación.
const PASO_DESCUENTO = 5;
const MAX_REINTENTOS_DESCUENTO = 6;

interface CoberturaZurich {
  id: string;
  monto: number;
  deducible: number;
  seleccion: string;
  modificaMonto: boolean;
  modificaDeducible: boolean;
}

interface FormaPagoZurich {
  primaNeta: number;
  derechos: number;
  recargos: number;
  iva: number;
  primaTotal: number;
}

interface PaqueteZurich {
  id: string;
  descripcion: string;
  coberturas: CoberturaZurich[];
  formas: Record<string, FormaPagoZurich>;
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function edad(fechaNacimiento: string): number {
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return 35;
  const diff = Date.now() - nacimiento.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function leerCoberturas(xml: string): CoberturaZurich[] {
  return bloques(xml, "COBERTURA")
    .map((c) => ({
      id: valor(c, "id_cobertura"),
      monto: num(valor(c, "monto_asegurado")),
      deducible: num(valor(c, "porcentaje_deducible")),
      seleccion: valor(c, "id_seleccion") || "0",
      modificaMonto: valor(c, "id_modifMonto") === "1",
      modificaDeducible: valor(c, "id_modifDeducible") === "1",
    }))
    .filter((c) => c.id && c.id !== "0");
}

function leerFormas(xml: string): Record<string, FormaPagoZurich> {
  const formas: Record<string, FormaPagoZurich> = {};
  for (const f of bloques(xml, "FORMA_PAGO")) {
    const id = valor(f, "id_forma_pago");
    if (!id) continue;
    formas[id] = {
      primaNeta: num(valor(f, "prima_neta")),
      derechos: num(valor(f, "derechos")),
      recargos: num(valor(f, "recargos")),
      iva: num(valor(f, "iva")),
      primaTotal: num(valor(f, "prima_total")),
    };
  }
  return formas;
}

async function solicitarCotizacion(
  request: CotizacionRequest,
  claveZurich: string,
  tipoVehiculo: string,
  inicio: Date,
  fin: Date,
): Promise<{ folio: string; paquetes: PaqueteZurich[] }> {
  const cfg = getZurichConfig();
  const campos = xmlCampos([
    ["num_req", 8],
    ["usuario", cfg.usuario],
    ["idOficina", cfg.oficina],
    ["programaComercial", cfg.numRelacion],
    ["tipoVehiculo", tipoVehiculo],
    ["cve_zurich", claveZurich],
    ["modelo", request.vehiculo.anio],
    ["id_estado", 0],
    ["id_ciudad", 0],
    ["id_tipoValor", TIPO_VALOR_COMERCIAL],
    ["id_tipoUso", TIPO_USO[request.vehiculo.uso]],
    ["cve_agente", cfg.agente],
    ["tipo_producto", 0],
    ["tipo_carga", tipoVehiculo === TIPO_VEHICULO_CAMION ? CARGA_NO_PELIGROSA : 0],
    ["tipo_persona", "F"],
    ["edad", edad(request.conductor.fechaNacimiento)],
    ["genero", request.conductor.genero === "F" ? "M" : "H"],
    ["estadoCivil", 7],
    ["ocupacion", 1],
    ["giro", 1],
    ["nacionalidad", 0],
    ["id_moneda", 0],
    ["fecha_inicio", yyyymmdd(inicio)],
    ["fecha_fin", yyyymmdd(fin)],
    ["monto_asegurado", 0],
    ["codigoPostal", request.vehiculo.cp],
    ["situacionVehiculo", ""],
    ["mesesVigencia", 12],
    ["tipoMovimiento", 1],
    ["polizaAnterior", 0],
  ]);
  const xml = await llamarZurich(SOLICITUD, "SOLICITUD_COT_AUTOS_REQ", campos);
  const folio = valor(xml, "folio_cotizacion");
  if (!folio || folio === "0") {
    throw new ZurichError(valor(xml, "mensaje") || "Zurich no devolvió folio de cotización.");
  }
  const paquetes = bloques(xml, "PAQUETE").map((p) => ({
    id: valor(p, "id_paquete"),
    descripcion: valor(p, "descripcion_paquete"),
    coberturas: leerCoberturas(p),
    formas: leerFormas(p),
  }));
  return { folio, paquetes };
}

async function recotizar(
  folio: string,
  idPaquete: string,
  descuento: number,
  coberturas: CoberturaZurich[],
): Promise<{ coberturas: CoberturaZurich[]; formas: Record<string, FormaPagoZurich> }> {
  const lista = coberturas
    .map(
      (c) =>
        `<web:COBERTURA>${xmlCampos([
          ["id_cobertura", c.id],
          ["monto_asegurado", c.monto],
          ["porcentaje_deducible", c.deducible],
          ["id_seleccion", c.seleccion],
        ])}</web:COBERTURA>`,
    )
    .join("");
  const xml = await llamarZurich(
    RECOTIZACION,
    "RECOTIZACION_AUTOS_REQ",
    xmlCampos([
      ["num_resquest", 6],
      ["folio_cotizacion", folio],
      ["porcentaje_descuento", descuento],
      ["porcentaje_recargo", 0],
      ["prima_objetivo", 0],
      ["id_paquete", idPaquete],
    ]) + lista,
  );
  return { coberturas: leerCoberturas(xml), formas: leerFormas(xml) };
}

async function recotizarConDescuento(
  folio: string,
  idPaquete: string,
  descuento: number,
  coberturas: CoberturaZurich[],
  ajustes: string[],
): Promise<{
  descuento: number;
  respuesta: Awaited<ReturnType<typeof recotizar>>;
}> {
  let intento = descuento;
  for (let i = 0; ; i++) {
    try {
      const respuesta = await recotizar(folio, idPaquete, intento, coberturas);
      if (intento !== descuento) {
        ajustes.push(
          `Descuento: Zurich no autorizó ${descuento}%, se aplicó ${intento}%.`,
        );
      }
      return { descuento: intento, respuesta };
    } catch (err) {
      const excede =
        err instanceof ZurichError && /DESCUENTO MAYOR AL AUTORIZADO/i.test(err.message);
      if (!excede || intento <= 0 || i >= MAX_REINTENTOS_DESCUENTO) throw err;
      intento = Math.max(0, intento - PASO_DESCUENTO);
    }
  }
}

async function estadoPorCp(cp: string): Promise<string> {
  const xml = await llamarZurich(
    CODIGOS_POSTALES,
    "CatAsentamientosPorCpReq",
    xmlCampos([
      ["id_proceso", "04"],
      ["codigo_postal", cp],
      ["numero_relacion", 0],
      ["usuario", ""],
      ["clave_agente", 0],
      ["clave_ramo", 0],
    ]),
    "bandera",
    "mensajeError",
  );
  return valor(xml, "clave_estado");
}

async function sumasPermitidas(
  idPaquete: string,
  idCobertura: string,
  tipoVehiculo: string,
): Promise<number[]> {
  const xml = await llamarZurich(
    CATALOGOS,
    "CatSumasAseguradasReq",
    xmlCampos([
      ["numRequest", 18],
      ["catalogo", "SUMAS"],
      ["idPaquete", idPaquete],
      ["idCobertura", idCobertura],
      ["tipoVehiculo", tipoVehiculo],
    ]),
  );
  return bloques(xml, "sumaAsegurada").map(num).filter((n) => n > 0);
}

async function deduciblesPermitidos(
  idPaquete: string,
  idCobertura: string,
  tipoVehiculo: string,
  estado: string,
): Promise<number[]> {
  const xml = await llamarZurich(
    CATALOGOS,
    "CatPorcentajesDedReq",
    xmlCampos([
      ["numRequest", 19],
      ["catalogo", "PORDE"],
      ["tipoVehiculo", tipoVehiculo],
      ["estado", estado],
      ["idPaquete", idPaquete],
      ["idCobertura", idCobertura],
    ]),
  );
  return bloques(xml, "porcentajeDed").map(num).filter((n) => n > 0);
}

// Aplica las sumas aseguradas y deducibles elegidos por el broker usando los
// valores que Zurich admite para el paquete. Devuelve si hubo cambios.
async function aplicarPersonalizadas(
  cob: CoberturasPersonalizadas,
  paquete: PaqueteZurich,
  tipoVehiculo: string,
  cp: string,
  ajustes: string[],
): Promise<boolean> {
  const porId = new Map(paquete.coberturas.map((c) => [c.id, c]));
  let estado: Promise<string> | undefined;
  const tareas: Array<Promise<boolean>> = [];

  const suma = (id: string, clave: "responsabilidadCivil" | "gastosMedicos") => {
    const c = porId.get(id);
    const solicitado = cob[clave];
    if (!c || solicitado === undefined || !c.modificaMonto) return;
    tareas.push(
      sumasPermitidas(paquete.id, id, tipoVehiculo).then((opciones) => {
        const v = masCercano(clave, solicitado, opciones, ajustes);
        if (v === c.monto) return false;
        c.monto = v;
        return true;
      }),
    );
  };
  const deducible = (
    id: string,
    clave: "deducibleDanosMateriales" | "deducibleRoboTotal",
  ) => {
    const c = porId.get(id);
    const solicitado = cob[clave];
    if (!c || solicitado === undefined || !c.modificaDeducible) return;
    estado ??= estadoPorCp(cp);
    tareas.push(
      estado
        .then((e) => deduciblesPermitidos(paquete.id, id, tipoVehiculo, e))
        .then((opciones) => {
          const v = masCercano(clave, solicitado, opciones, ajustes);
          if (v === c.deducible) return false;
          c.deducible = v;
          return true;
        }),
    );
  };

  suma(COB_RC, "responsabilidadCivil");
  suma(COB_GASTOS_MEDICOS, "gastosMedicos");
  deducible(COB_DANOS_MATERIALES, "deducibleDanosMateriales");
  deducible(COB_ROBO_TOTAL, "deducibleRoboTotal");
  return (await Promise.all(tareas)).some(Boolean);
}

function formatearSuma(id: string, monto: number): string {
  if (monto <= 1) return "Amparada";
  const pesos = `$${monto.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
  return id === COB_DANOS_MATERIALES || id === COB_ROBO_TOTAL
    ? `Valor comercial (${pesos})`
    : pesos;
}

function coberturas(lista: CoberturaZurich[]): Cobertura[] {
  const porNombre = new Map<string, CoberturaZurich>();
  for (const c of lista) {
    const nombre = COBERTURA_HOMOLOGADA[c.id];
    if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, c);
  }
  return ORDEN_COBERTURAS.map((nombre) => {
    const c = porNombre.get(nombre);
    if (!c) return { nombre, incluida: false, deducible: "N/A" };
    return {
      nombre,
      incluida: true,
      sumaAsegurada: formatearSuma(c.id, c.monto),
      deducible: c.deducible > 0 ? `${c.deducible}%` : "N/A",
    };
  });
}

export async function cotizarZurichReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  descuento: number,
  claveZurich: string,
): Promise<CotizacionResultado> {
  const cfg = getZurichConfig();
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };
  if (!credencialesConfiguradas(cfg)) {
    return { ...base, status: "error", error: new ZurichNoConfigurado().message };
  }

  try {
    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setFullYear(fin.getFullYear() + 1);

    const vehiculo = await detalleVehiculo(claveZurich);
    const { folio, paquetes } = await solicitarCotizacion(
      request,
      claveZurich,
      vehiculo.tipoVehiculo,
      inicio,
      fin,
    );
    const paquete = paquetes.find((p) =>
      PAQUETE_ZURICH[request.paquete].test(p.descripcion),
    );
    if (!paquete) {
      throw new ZurichError(`Zurich no ofrece el paquete ${request.paquete} para este vehículo.`);
    }

    const ajustes: string[] = [];
    const personalizado = request.coberturasPersonalizadas
      ? await aplicarPersonalizadas(
          request.coberturasPersonalizadas,
          paquete,
          vehiculo.tipoVehiculo,
          request.vehiculo.cp,
          ajustes,
        )
      : false;

    // La prima de lista (0 %) se obtiene de la solicitud; si el broker cambió
    // coberturas se recotiza a 0 % para que el desglose refleje esa lista.
    const lista = personalizado
      ? await recotizar(folio, paquete.id, 0, paquete.coberturas)
      : { coberturas: paquete.coberturas, formas: paquete.formas };
    const final =
      descuento > 0
        ? await recotizarConDescuento(folio, paquete.id, descuento, paquete.coberturas, ajustes)
        : { descuento: 0, respuesta: lista };

    const idForma = FORMA_PAGO_ZURICH[request.formaPago];
    const forma = final.respuesta.formas[idForma];
    const formaLista = lista.formas[idForma];
    if (!forma || !forma.primaTotal) {
      throw new ZurichError("Zurich no devolvió una prima válida para la forma de pago.");
    }
    const primaNeta = round2(forma.primaNeta);
    const primaNetaSinDescuento = round2(formaLista?.primaNeta || primaNeta);

    const prima: DesglosePrima = {
      primaNetaSinDescuento,
      descuentoPorcentaje: final.descuento,
      descuentoMonto: round2(primaNetaSinDescuento - primaNeta),
      primaNeta,
      derechos: round2(forma.derechos),
      recargoPagoFraccionado: round2(forma.recargos),
      iva: round2(forma.iva),
      primaTotal: round2(forma.primaTotal),
    };

    return {
      ...base,
      status: "success",
      prima,
      coberturas: coberturas(final.respuesta.coberturas),
      vigencia: {
        inicio: inicio.toISOString().slice(0, 10),
        fin: fin.toISOString().slice(0, 10),
      },
      tiempoRespuestaMs: Date.now() - inicioTiempo,
      origen: "real",
      noCotizacion: folio,
      ajustes: ajustes.length ? ajustes : undefined,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error:
        err instanceof Error
          ? `No se pudo consultar a Zurich: ${err.message}`
          : "No se pudo consultar a Zurich.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }
}
