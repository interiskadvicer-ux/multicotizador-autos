// Cliente de cotización real de Quálitas (WS obtenerNuevaEmision).
// Arma el XML <Movimientos> (TipoMovimiento=2 = cotización), lo envía al web
// service y mapea la respuesta al modelo del multicotizador.

import type {
  Cobertura,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
  Paquete,
} from "@/domain/types";
import { getQualitasConfig } from "./config";
import { escapeXml, extractAttr, extractTag, soapCall, unescapeXml } from "./soap";
import { interpretarError } from "./errores";
import { estadoDesdeCP } from "./estados";

const SOAP_ACTION = "http://qualitas.com.mx/obtenerNuevaEmision";
const NS = "http://qualitas.com.mx/";

// Paquete del multicotizador -> código de paquete Quálitas (Anexo 5).
const PAQUETE_A_QUALITAS: Record<Paquete, string> = {
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
      sumaAsegurada: formatSuma(c.suma, c.tipoSuma),
      deducible: formatDeducible(c.deducible),
    };
  });
}

function construirXmlCotizacion(
  request: CotizacionRequest,
  descuento: number,
  claveAmis: string,
  estadoId: number,
  inicio: Date,
  fin: Date,
): string {
  const cfg = getQualitasConfig();
  const dv = digitoVerificador(claveAmis);
  const ambienteRegla = cfg.ambiente === "pruebas" ? "1" : "0";
  const cp = (request.vehiculo.cp || "").replace(/\D/g, "");
  const modelo = request.vehiculo.anio;
  const paquete = PAQUETE_A_QUALITAS[request.paquete];

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
    "<Uso>01</Uso><Servicio>01</Servicio>" +
    `<Paquete>${paquete}</Paquete>` +
    "<Motor/><Serie/></DatosVehiculo>" +
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

  const xml = construirXmlCotizacion(
    request,
    descuento,
    claveAmis,
    estadoId,
    inicio,
    fin,
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
  const movimiento = unescapeXml(resultInner);

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
  const coberturas = construirCoberturasDesdeRespuesta(
    parseCoberturas(vehiculoXml),
  );

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

  // Quálitas devuelve la prima neta ya con el descuento aplicado. Reconstruimos
  // el desglose interno (sin descuento / descuento) sólo para la pantalla del
  // broker; el PDF del cliente no muestra descuentos.
  const desc = Math.min(Math.max(descuento, 0), 99);
  const primaNetaSinDescuento =
    desc > 0 ? round2(primaNeta / (1 - desc / 100)) : primaNeta;
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
