// Cotización real de General de Seguros (CotizacionEmisionWS.generarCotizacion).
// Una sola llamada devuelve todos los paquetes con sus coberturas y formas de
// pago; se cotiza con y sin descuento para mostrar la prima de lista.

import type {
  Cobertura,
  CoberturasPersonalizadas,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
  FormaPago,
  Paquete,
} from "@/domain/types";
import { ETIQUETA_COBERTURA } from "@/lib/coberturas";
import { credencialesConfiguradas, getGsConfig } from "./config";
import { GsError, GsNoConfigurado, bloques, llamarGs, valor, xmlCampos } from "./client";

const SERVICIO = "cotizacionEmisionWS";
const MODULO = "cotizacionEmision";

const PAQUETE_GS: Record<Paquete, RegExp> = {
  AMPLIA: /AMPLIA/i,
  LIMITADA: /LIMITADA/i,
  RC: /\bRC\b|RESPONSABILIDAD CIVIL|B[AÁ]SIC/i,
};

const FORMA_PAGO_GS: Record<FormaPago, RegExp> = {
  CONTADO: /ANUAL|CONTADO/i,
  SEMESTRAL: /SEMESTRAL/i,
  TRIMESTRAL: /TRIMESTRAL/i,
  MENSUAL: /MENSUAL/i,
};

const TIPO_SERVICIO: Record<CotizacionRequest["vehiculo"]["uso"], string> = {
  PARTICULAR: "PARTICULAR",
  COMERCIAL: "COMERCIAL",
};

const COBERTURA_HOMOLOGADA: Array<[RegExp, string]> = [
  [/DA[ÑN]OS MATERIALES/i, "Daños Materiales"],
  [/ROBO TOTAL/i, "Robo Total"],
  [/RESPONSABILIDAD CIVIL/i, "Responsabilidad Civil"],
  [/GASTOS M[EÉ]DICOS/i, "Gastos Médicos Ocupantes"],
  [/ASISTENCIA VIAL/i, "Asistencia Vial y Legal"],
  [/JUR[IÍ]DICA|LEGAL/i, "Defensa Jurídica"],
];

const ORDEN_COBERTURAS = COBERTURA_HOMOLOGADA.map(([, nombre]) => nombre);

const PASO_DESCUENTO = 5;
const MAX_REINTENTOS_DESCUENTO = 8;

interface CoberturaGs {
  descripcion: string;
  monto: string;
  deducible: string;
  orden: number;
}

interface FormaPagoGs {
  nombre: string;
  primaNeta: number;
  derechos: number;
  recargo: number;
  iva: number;
  primaTotal: number;
}

interface PaqueteGs {
  id: string;
  nombre: string;
  coberturas: CoberturaGs[];
  formas: FormaPagoGs[];
}

interface CotizacionGs {
  idCotizacion: string;
  paquetes: PaqueteGs[];
}

function num(v: string): number {
  const n = Number(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function edad(fechaNacimiento: string): number {
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return 35;
  const diff = Date.now() - nacimiento.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function configuracionPaquete(cob: CoberturasPersonalizadas | undefined): string {
  if (!cob) return "";
  const campos = xmlCampos(
    (
      [
        ["deducible_danos_materiales", cob.deducibleDanosMateriales],
        ["deducible_robo_total", cob.deducibleRoboTotal],
        ["sa_rc", cob.responsabilidadCivil],
        ["sa_gastos_medicos", cob.gastosMedicos],
      ] as const
    ).flatMap(([k, v]) => (v === undefined ? [] : [[k, v] as [string, number]])),
  );
  return campos ? `<configuracionPaqueteInciso>${campos}</configuracionPaqueteInciso>` : "";
}

function leerPaquetes(xml: string): PaqueteGs[] {
  return bloques(xml, "paquetes").map((p) => ({
    id: valor(p, "id"),
    nombre: valor(p, "nombre"),
    coberturas: bloques(p, "coberturas").map((c) => ({
      descripcion: valor(c, "descripcion"),
      monto: valor(c, "monto"),
      deducible: valor(c, "deducible"),
      orden: num(valor(c, "orden")),
    })),
    formas: bloques(p, "formasPagoDTO").map((f) => ({
      nombre: valor(f, "nombre"),
      primaNeta: num(valor(f, "primaNeta")),
      derechos: num(valor(f, "derechos")),
      recargo: num(valor(f, "recargo")),
      iva: num(valor(f, "iva")),
      primaTotal: num(valor(f, "primaTotal")),
    })),
  }));
}

async function generarCotizacion(
  request: CotizacionRequest,
  claveGs: string,
  descuento: number,
): Promise<CotizacionGs> {
  const { vehiculo, conductor } = request;
  const inciso =
    "<inciso>" +
    xmlCampos([
      ["claveGs", claveGs],
      ["conductorMenor30", edad(conductor.fechaNacimiento) < 30],
      ["descripcionVehiculo", `${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.version}`.trim()],
      ["modelo", vehiculo.anio],
    ]) +
    configuracionPaquete(request.coberturasPersonalizadas) +
    xmlCampos([
      ["tipoServicio", TIPO_SERVICIO[vehiculo.uso]],
      ["tipoValor", "VALOR_COMERCIAL"],
      ["tipoVehiculo", "AUTO_PICKUP"],
    ]) +
    "</inciso>";
  const xml = await llamarGs(
    SERVICIO,
    MODULO,
    "generarCotizacion",
    [
      ["configuracionProducto", "RESIDENTE_INDIVIDUAL"],
      ["cp", Number(vehiculo.cp)],
      ["descuento", descuento],
      ["vigencia", "ANUAL"],
    ],
    inciso,
  );
  const idCotizacion = valor(xml, "idCotizacion");
  if (!idCotizacion || idCotizacion === "0") {
    throw new GsError(valor(xml, "mensaje") || "General de Seguros no devolvió cotización.");
  }
  return { idCotizacion, paquetes: leerPaquetes(xml) };
}

// Cotiza con el descuento solicitado; si General de Seguros lo rechaza por
// exceder el autorizado, lo reduce hasta encontrar uno aceptado.
async function cotizarConDescuento(
  request: CotizacionRequest,
  claveGs: string,
  descuento: number,
  ajustes: string[],
): Promise<{ descuento: number; cotizacion: CotizacionGs }> {
  let intento = descuento;
  for (let i = 0; ; i++) {
    try {
      const cotizacion = await generarCotizacion(request, claveGs, intento);
      if (intento !== descuento) {
        ajustes.push(
          `Descuento: General de Seguros no autorizó ${descuento}%, se aplicó ${intento}%.`,
        );
      }
      return { descuento: intento, cotizacion };
    } catch (err) {
      const excede = err instanceof GsError && /descuento/i.test(err.message);
      if (!excede || intento <= 0 || i >= MAX_REINTENTOS_DESCUENTO) throw err;
      intento = Math.max(0, intento - PASO_DESCUENTO);
    }
  }
}

function porcentaje(texto: string): string | undefined {
  const m = texto.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? `${m[1]}%` : undefined;
}

function sumaAsegurada(c: CoberturaGs, nombre: string): string {
  if (nombre === "Daños Materiales" || nombre === "Robo Total") return "Valor comercial";
  if (/AMPARAD/i.test(c.monto) || !num(c.monto)) return "Amparada";
  return `$${num(c.monto).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function coberturas(lista: CoberturaGs[]): Cobertura[] {
  const porNombre = new Map<string, CoberturaGs>();
  for (const c of [...lista].sort((a, b) => a.orden - b.orden)) {
    const hom = COBERTURA_HOMOLOGADA.find(([re]) => re.test(c.descripcion));
    if (hom && !porNombre.has(hom[1])) porNombre.set(hom[1], c);
  }
  return ORDEN_COBERTURAS.map((nombre) => {
    const c = porNombre.get(nombre);
    if (!c) return { nombre, incluida: false, deducible: "N/A" };
    return {
      nombre,
      incluida: true,
      sumaAsegurada: sumaAsegurada(c, nombre),
      deducible: porcentaje(c.deducible) ?? porcentaje(c.monto) ?? "N/A",
    };
  });
}

// Compara lo que devolvió General de Seguros con lo que pidió el broker y
// avisa cuando la aseguradora aplicó un valor distinto.
function ajustesCoberturas(
  cob: CoberturasPersonalizadas | undefined,
  resultado: Cobertura[],
  ajustes: string[],
): void {
  if (!cob) return;
  const por = new Map(resultado.map((c) => [c.nombre, c]));
  const revisar = (
    clave: keyof CoberturasPersonalizadas,
    nombre: string,
    campo: "sumaAsegurada" | "deducible",
  ) => {
    const solicitado = cob[clave];
    const c = por.get(nombre);
    if (solicitado === undefined || !c?.incluida) return;
    const aplicado = c[campo] ?? "";
    const n = num(aplicado);
    if (n && n !== solicitado) {
      ajustes.push(`${ETIQUETA_COBERTURA[clave]}: General de Seguros aplicó ${aplicado}.`);
    }
  };
  revisar("responsabilidadCivil", "Responsabilidad Civil", "sumaAsegurada");
  revisar("gastosMedicos", "Gastos Médicos Ocupantes", "sumaAsegurada");
  revisar("deducibleDanosMateriales", "Daños Materiales", "deducible");
  revisar("deducibleRoboTotal", "Robo Total", "deducible");
}

export async function cotizarGsReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  descuento: number,
  claveGs: string,
): Promise<CotizacionResultado> {
  const cfg = getGsConfig();
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };
  if (!credencialesConfiguradas(cfg)) {
    return { ...base, status: "error", error: new GsNoConfigurado().message };
  }

  try {
    const ajustes: string[] = [];
    const [lista, final] = await Promise.all([
      generarCotizacion(request, claveGs, 0),
      descuento > 0
        ? cotizarConDescuento(request, claveGs, descuento, ajustes)
        : Promise.resolve(undefined),
    ]);
    const conDescuento = final ?? { descuento: 0, cotizacion: lista };

    const elegir = (c: CotizacionGs) =>
      c.paquetes.find((p) => PAQUETE_GS[request.paquete].test(p.nombre));
    const paquete = elegir(conDescuento.cotizacion);
    const paqueteLista = elegir(lista);
    if (!paquete) {
      throw new GsError(
        `General de Seguros no ofrece el paquete ${request.paquete} para este vehículo.`,
      );
    }
    const forma = paquete.formas.find((f) => FORMA_PAGO_GS[request.formaPago].test(f.nombre));
    const formaLista = paqueteLista?.formas.find((f) =>
      FORMA_PAGO_GS[request.formaPago].test(f.nombre),
    );
    if (!forma || !forma.primaTotal) {
      throw new GsError("General de Seguros no devolvió una prima válida para la forma de pago.");
    }

    const primaNeta = round2(forma.primaNeta);
    const primaNetaSinDescuento = round2(formaLista?.primaNeta || primaNeta);
    const prima: DesglosePrima = {
      primaNetaSinDescuento,
      descuentoPorcentaje: conDescuento.descuento,
      descuentoMonto: round2(primaNetaSinDescuento - primaNeta),
      primaNeta,
      derechos: round2(forma.derechos),
      recargoPagoFraccionado: round2(forma.recargo),
      iva: round2(forma.iva),
      primaTotal: round2(forma.primaTotal),
    };

    const inicio = new Date();
    const fin = new Date(inicio);
    fin.setFullYear(fin.getFullYear() + 1);
    const cobs = coberturas(paquete.coberturas);
    ajustesCoberturas(request.coberturasPersonalizadas, cobs, ajustes);

    return {
      ...base,
      status: "success",
      prima,
      coberturas: cobs,
      vigencia: {
        inicio: inicio.toISOString().slice(0, 10),
        fin: fin.toISOString().slice(0, 10),
      },
      tiempoRespuestaMs: Date.now() - inicioTiempo,
      origen: "real",
      noCotizacion: conDescuento.cotizacion.idCotizacion,
      ajustes: ajustes.length ? ajustes : undefined,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error:
        err instanceof Error
          ? `No se pudo consultar a General de Seguros: ${err.message}`
          : "No se pudo consultar a General de Seguros.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }
}
