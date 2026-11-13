// Cliente de cotización real de Quálitas (WS obtenerNuevaEmision).
// Arma el XML <Movimientos> (TipoMovimiento=2 = cotización), lo envía al web
// service y mapea la respuesta al modelo del multicotizador.

import { paqueteEstandar, type PaqueteEstandar } from "@/domain/types";
import type {
  Cobertura,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
} from "@/domain/types";
import { getQualitasConfig } from "./config";
import { escapeXml, extractAttr, extractTag, soapCall, unescapeXml } from "./soap";
import { interpretarError } from "./errores";
import { estadoDesdeCP } from "./estados";

const SOAP_ACTION = "http://qualitas.com.mx/obtenerNuevaEmision";
const NS = "http://qualitas.com.mx/";

export const USOS_VEHICULO = ["01", "05"] as const;

// Paquete del multicotizador -> código de paquete Quálitas (Anexo 5).
export const PAQUETE_A_QUALITAS: Record<PaqueteEstandar, string> = {
  AMPLIA: "01",
  LIMITADA: "03",
  RC: "04",
};

// Cobertura Quálitas (Anexo 4) -> nombre mostrado en el multicotizador.
// Se alinean con los nombres del generador de coberturas para que la tabla
// comparativa del PDF quede homologada entre aseguradoras.
const COBERTURA_QUALITAS: Record<string, string> = {
  "1": "Daños Materiales",
  "3": "Robo Total",
  "4": "Responsabilidad Civil",
  "5": "Gastos Médicos Ocupantes",
  "7": "Defensa Jurídica",
  "14": "Asistencia Vial y Legal",
};

// Orden y conjunto de coberturas que se muestran (homologado con el mock).
const COBERTURAS_ESTANDAR: Array<{ no: string; nombre: string }> = [
  { no: "1", nombre: "Daños Materiales" },
  { no: "3", nombre: "Robo Total" },
  { no: "4", nombre: "Responsabilidad Civil" },
  { no: "5", nombre: "Gastos Médicos Ocupantes" },
  { no: "14", nombre: "Asistencia Vial y Legal" },
  { no: "7", nombre: "Defensa Jurídica" },
];

// Dígito verificador módulo 10 de la ClaveAmis (Consideración 01).
export function digitoVerificador(claveAmis: string): number {
  const s = claveAmis.replace(/\D/g, "").padStart(5, "0");
  let impares = 0;
  let pares = 0;
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    if (i % 2 === 0) impares += d;
    else pares += d;
  }
  const total = impares * 3 + pares;
  return (10 - (total % 10)) % 10;
}

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatSuma(suma: number, tipoSuma: string): string {
  if (!suma || suma <= 0) return "AMPARADA";
  const monto = suma.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
  if (tipoSuma === "1") return `${monto} (valor factura)`;
  if (tipoSuma === "2") return `${monto} (valor comercial)`;
  return monto;
}

function formatDeducible(deducible: string): string {
  const n = Number((deducible || "").replace(/\D/g, ""));
  return n > 0 ? `${n}%` : "N/A";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface CoberturaResp {
  no: string;
  suma: number;
  tipoSuma: string;
  deducible: string;
  prima: number;
}

function parseCoberturas(vehiculoXml: string): Map<string, CoberturaResp> {
  const out = new Map<string, CoberturaResp>();
  const re = /<Coberturas NoCobertura="(\d+)">([\s\S]*?)<\/Coberturas>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(vehiculoXml)) !== null) {
    const no = m[1];
    const body = m[2];
    out.set(no, {
      no,
      suma: Number(extractTag(body, "SumaAsegurada") || 0),
      tipoSuma: (extractTag(body, "TipoSuma") || "").trim(),
      deducible: (extractTag(body, "Deducible") || "").trim(),
      prima: Number(extractTag(body, "Prima") || 0),
    });
  }
  return out;
}

// Construye la lista de coberturas homologada para mostrar/PDF.
function construirCoberturasDesdeRespuesta(
  coberturas: Map<string, CoberturaResp>,
): Cobertura[] {
  return COBERTURAS_ESTANDAR.map(({ no, nombre }) => {
    const c = coberturas.get(no);
    if (!c) {
      return { nombre, incluida: false, deducible: "N/A" };
    }
    return {
      nombre: COBERTURA_QUALITAS[no] ?? nombre,
      incluida: true,
      sumaAsegurada: formatSuma(c.suma, no === "1" || no === "3" ? c.tipoSuma : ""),
      deducible: formatDeducible(c.deducible),
    };
  });
}

// Coberturas del negocio 08849: cada paquete se envía con sus coberturas y
// deducibles explícitos (por defecto DM 5%, RT 10% y RC sin deducible). Las
// coberturas personalizadas sólo sustituyen deducibles y sumas de DM, RT, RC
// y GM.
const COBERTURAS_POR_PAQUETE: Record<PaqueteEstandar, string[]> = {
  AMPLIA: ["1", "3", "4", "5", "6", "7", "11", "14", "22", "47"],
  LIMITADA: ["3", "4", "5", "6", "7", "11", "14", "22", "47"],
  RC: ["4", "5", "6", "7", "11", "14", "22", "47"],
};

export function xmlCoberturasNegocio(request: CotizacionRequest): string {
  const cob = request.coberturasPersonalizadas ?? {};
  const valores: Record<string, [number, string, number]> = {
    "1": [0, "0", cob.deducibleDanosMateriales ?? 5],
    "3": [0, "0", cob.deducibleRoboTotal ?? 10],
    "4": [cob.responsabilidadCivil ?? 3_000_000, "0", 0],
    "5": [cob.gastosMedicos ?? 200_000, "0", 0],
    "6": [100_000, "0", 0],
    "47": [1_000_000, "14", 0],
  };
  return COBERTURAS_POR_PAQUETE[paqueteEstandar(request.paquete)]
    .map((no) => {
      const [suma, tipoSuma, deducible] = valores[no] ?? [0, "0", 0];
      return (
        `<Coberturas NoCobertura="${no}"><SumaAsegurada>${suma}</SumaAsegurada>` +
        `<TipoSuma>${tipoSuma}</TipoSuma><Deducible>${deducible}</Deducible><Prima>0</Prima></Coberturas>`
      );
    })
    .join("");
}

function construirXmlCotizacion(
  request: CotizacionRequest,
  descuento: number,
  claveAmis: string,
  estadoId: number,
  inicio: Date,
  fin: Date,
  uso: string,
): string {
  const cfg = getQualitasConfig();
  const dv = digitoVerificador(claveAmis);
  const ambienteRegla = cfg.ambiente === "pruebas" ? "1" : "0";
  const cp = (request.vehiculo.cp || "").replace(/\D/g, "");
  const modelo = request.vehiculo.anio;
  const paquete = PAQUETE_A_QUALITAS[paqueteEstandar(request.paquete)];

  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<Movimientos><Movimiento TipoMovimiento="2" NoPoliza="" NoCotizacion="" ' +
    'NoEndoso="" TipoEndoso="" NoOTra="" ' +
    `NoNegocio="${escapeXml(cfg.negocio)}">` +
    '<DatosAsegurado NoAsegurado="">' +
    "<Nombre/><Direccion/><Colonia/><Poblacion/>" +
    `<Estado>${estadoId}</Estado>` +
    `<CodigoPostal>${escapeXml(cp)}</CodigoPostal>` +
    "<NoEmpleado/><Agrupador/></DatosAsegurado>" +
    '<DatosVehiculo NoInciso="1">' +
    `<ClaveAmis>${escapeXml(claveAmis)}</ClaveAmis>` +
    `<Modelo>${modelo}</Modelo>` +
    "<DescripcionVehiculo/>" +
    `<Uso>${uso}</Uso><Servicio>01</Servicio>` +
    `<Paquete>${paquete}</Paquete>` +
    "<Motor/><Serie/>" +
    xmlCoberturasNegocio(request) +
    '<ConsideracionesAdicionalesDV NoConsideracion="39">' +
    "<TipoRegla>0</TipoRegla><ValorRegla>N|S</ValorRegla>" +
    "</ConsideracionesAdicionalesDV>" +
    "</DatosVehiculo>" +
    "<DatosGenerales>" +
    `<FechaEmision>${fechaISO(inicio)}</FechaEmision>` +
    `<FechaInicio>${fechaISO(inicio)}</FechaInicio>` +
    `<FechaTermino>${fechaISO(fin)}</FechaTermino>` +
    "<Moneda>0</Moneda>" +
    `<Agente>${escapeXml(cfg.agente)}</Agente>` +
    "<FormaPago>C</FormaPago>" +
    "<TarifaValores>LINEA</TarifaValores>" +
    "<TarifaCuotas>LINEA</TarifaCuotas>" +
    "<TarifaDerechos>LINEA</TarifaDerechos>" +
    "<Plazo/><Agencia/><Contrato/>" +
    `<PorcentajeDescuento>${descuento}</PorcentajeDescuento>` +
    '<ConsideracionesAdicionalesDG NoConsideracion="1">' +
    `<TipoRegla>0</TipoRegla><ValorRegla>${dv}</ValorRegla>` +
    "</ConsideracionesAdicionalesDG>" +
    '<ConsideracionesAdicionalesDG NoConsideracion="4">' +
    `<TipoRegla>0</TipoRegla><ValorRegla>${ambienteRegla}</ValorRegla>` +
    "</ConsideracionesAdicionalesDG>" +
    '<ConsideracionesAdicionalesDG NoConsideracion="5">' +
    "<TipoRegla>0</TipoRegla><ValorRegla>14</ValorRegla>" +
    "</ConsideracionesAdicionalesDG>" +
    "</DatosGenerales>" +
    "<Primas><PrimaNeta/><Derecho/><Recargo/><Impuesto/><PrimaTotal/><Comision/></Primas>" +
    "<CodigoError/></Movimiento></Movimientos>"
  );
}

// Realiza la cotización real contra el web service de Quálitas.
export async function cotizarQualitasReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  descuento: number,
  claveAmis: string,
): Promise<CotizacionResultado> {
  const cfg = getQualitasConfig();
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };

  const estadoId = estadoDesdeCP(request.vehiculo.cp);
  if (!estadoId) {
    return {
      ...base,
      status: "error",
      error: "No se pudo determinar el estado a partir del código postal.",
    };
  }

  const inicio = new Date();
  const fin = new Date();
  fin.setFullYear(fin.getFullYear() + 1);

  // Autos usan Uso 01 (Normal); pickups y otras categorías sólo aceptan 05
  // (Personal) y el WS responde "0288-- Uso invalido para esta categoria".
  let movimiento = "";
  for (const uso of USOS_VEHICULO) {
    const xml = construirXmlCotizacion(
      request,
      descuento,
      claveAmis,
      estadoId,
      inicio,
      fin,
      uso,
    );
    const body =
      `<obtenerNuevaEmision xmlns="${NS}">` +
      `<xmlEmision>${escapeXml(xml)}</xmlEmision>` +
      "</obtenerNuevaEmision>";

    let respuesta: string;
    try {
      respuesta = await soapCall({
        url: cfg.wsEmisionUrl,
        soapAction: SOAP_ACTION,
        body,
        timeoutMs: cfg.timeoutMs,
      });
    } catch (err) {
      return {
        ...base,
        status: "error",
        error:
          err instanceof Error
            ? `No se pudo consultar a Quálitas: ${err.message}`
            : "No se pudo consultar a Quálitas.",
        tiempoRespuestaMs: Date.now() - inicioTiempo,
      };
    }

    const resultInner = extractTag(respuesta, "obtenerNuevaEmisionResult");
    if (!resultInner) {
      return {
        ...base,
        status: "error",
        error: "Respuesta inesperada del web service de Quálitas.",
        tiempoRespuestaMs: Date.now() - inicioTiempo,
      };
    }
    movimiento = unescapeXml(resultInner);
    if (!/^0*288\b/.test((extractTag(movimiento, "CodigoError") || "").trim())) {
      break;
    }
  }

  const errorMsg = interpretarError(extractTag(movimiento, "CodigoError"));
  if (errorMsg) {
    return {
      ...base,
      status: "error",
      error: errorMsg,
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }

  const vehiculoXml =
    movimiento.match(/<DatosVehiculo[\s\S]*?<\/DatosVehiculo>/)?.[0] ?? "";
  const coberturasResp = parseCoberturas(vehiculoXml);
  const coberturas = construirCoberturasDesdeRespuesta(coberturasResp);

  const primasXml =
    movimiento.match(/<Primas>[\s\S]*?<\/Primas>/)?.[0] ?? movimiento;
  const primaNeta = Number(extractTag(primasXml, "PrimaNeta") || 0);
  const derechos = Number(extractTag(primasXml, "Derecho") || 0);
  const recargo = Number(extractTag(primasXml, "Recargo") || 0);
  const iva = Number(extractTag(primasXml, "Impuesto") || 0);
  const primaTotal = Number(extractTag(primasXml, "PrimaTotal") || 0);

  if (!primaTotal) {
    return {
      ...base,
      status: "error",
      error: "Quálitas no devolvió una prima válida para esta cotización.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }

  // Quálitas devuelve la prima neta ya con el descuento aplicado y, por
  // cobertura, la prima sin descuento. El descuento no aplica a todas las
  // coberturas (p. ej. Asistencia Vial), así que la prima "antes del
  // descuento" es la suma de las primas por cobertura, no primaNeta / (1 - %).
  const sumaPrimasCoberturas = round2(
    Array.from(coberturasResp.values()).reduce((t, c) => t + c.prima, 0),
  );
  const primaNetaSinDescuento =
    sumaPrimasCoberturas >= primaNeta ? sumaPrimasCoberturas : round2(primaNeta);
  const descuentoMonto = round2(primaNetaSinDescuento - primaNeta);

  const prima: DesglosePrima = {
    primaNetaSinDescuento,
    descuentoPorcentaje: descuento,
    descuentoMonto,
    primaNeta: round2(primaNeta),
    derechos: round2(derechos),
    recargoPagoFraccionado: round2(recargo),
    iva: round2(iva),
    primaTotal: round2(primaTotal),
  };

  const noCotizacion = extractAttr(movimiento, "NoCotizacion") || undefined;

  return {
    ...base,
    status: "success",
    prima,
    coberturas,
    vigencia: { inicio: fechaISO(inicio), fin: fechaISO(fin) },
    tiempoRespuestaMs: Date.now() - inicioTiempo,
    origen: "real",
    noCotizacion,
  };
}
