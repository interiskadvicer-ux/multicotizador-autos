// Cotización real de Afirme (Midas Autos, operación SOAP cotizarPoliza).
// Flujo: resolver vehículo (idEstilo → línea/marca) → ubicación por CP →
// paquete disponible para el vehículo → cotizar con y sin descuento.

import type {
  Cobertura,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
  FormaPago,
  Paquete,
} from "@/domain/types";
import { credencialesConfiguradas, getAfirmeConfig } from "./config";
import { AfirmeError, AfirmeNoConfigurado, llamarAfirme } from "./client";
import { resolverVehiculo, type VehiculoAfirme } from "./catalogos";

// Formas de pago del multicotizador -> idFormaPago de Afirme.
const FORMA_PAGO_AFIRME: Record<FormaPago, string> = {
  CONTADO: "1",
  SEMESTRAL: "2",
  TRIMESTRAL: "3",
  MENSUAL: "4",
};

// Palabra clave con la que Afirme nombra cada paquete ("ELITE AMPLIA", …).
const PAQUETE_AFIRME: Record<Paquete, RegExp> = {
  AMPLIA: /AMPLIA/i,
  LIMITADA: /LIMITADA/i,
  RC: /\bRC\b|RESPONSABILIDAD CIVIL/i,
};

// Suma asegurada a valor comercial.
const TIPO_VALOR_COMERCIAL = "11";
const TIPO_INDEMNIZACION = 2;

// Prefijo de la cobertura de Afirme -> nombre homologado del multicotizador.
const COBERTURA_HOMOLOGADA: Array<[RegExp, string]> = [
  [/^DAÑOS MATERIALES/, "Daños Materiales"],
  [/^ROBO TOTAL/, "Robo Total"],
  [/^RESPONSABILIDAD CIVIL DAÑOS A TERCEROS/, "Responsabilidad Civil"],
  [/^GASTOS M[EÉ]DICOS OCUPANTES/, "Gastos Médicos Ocupantes"],
  [/^ASISTENCIA EN VIAJES/, "Asistencia Vial y Legal"],
  [/^ASISTENCIA JUR[IÍ]DICA/, "Defensa Jurídica"],
];

const ORDEN_COBERTURAS = [
  "Daños Materiales",
  "Robo Total",
  "Responsabilidad Civil",
  "Gastos Médicos Ocupantes",
  "Asistencia Vial y Legal",
  "Defensa Jurídica",
];

interface Ubicacion {
  stateId?: string;
  cityId?: string;
}

interface CoberturaAfirme {
  descripcion?: string;
  sumaAsegurada?: string | number;
  deducible?: number | string;
  primaNeta?: number;
}

interface RespuestaCotizacion {
  RESPUESTA?: string;
  idToCotizacion?: number | string;
  primaNeta?: number;
  iva?: number;
  derechoPago?: number;
  recargo?: number;
  primaTotal?: number;
  coberturas?: Record<string, CoberturaAfirme>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function edad(fechaNacimiento: string): number {
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return 35;
  const diff = Date.now() - nacimiento.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function formatearSuma(valor: string | number | undefined): string | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = Number(valor);
  if (Number.isFinite(n) && n > 0) {
    return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
  }
  return String(valor);
}

function formatearDeducible(valor: number | string | undefined): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `${n}%`;
}

function coberturas(items: Record<string, CoberturaAfirme>): Cobertura[] {
  const porNombre = new Map<string, CoberturaAfirme>();
  for (const it of Object.values(items)) {
    const desc = (it.descripcion ?? "").toUpperCase().trim();
    const match = COBERTURA_HOMOLOGADA.find(([re]) => re.test(desc));
    if (match && !porNombre.has(match[1])) porNombre.set(match[1], it);
  }
  return ORDEN_COBERTURAS.map((nombre) => {
    const it = porNombre.get(nombre);
    if (!it) return { nombre, incluida: false, deducible: "N/A" };
    return {
      nombre,
      incluida: true,
      sumaAsegurada: formatearSuma(it.sumaAsegurada),
      deducible: formatearDeducible(it.deducible),
    };
  });
}

async function paqueteAfirme(
  vehiculo: VehiculoAfirme,
  paquete: Paquete,
): Promise<string> {
  const paquetes = await llamarAfirme<Record<string, string>>("getListPaquetes", {
    idLineaNegocio: vehiculo.idLineaNegocio,
    anioVehiculo: vehiculo.anio,
    vehiculo: vehiculo.idEstilo,
  });
  const encontrado = Object.entries(paquetes).find(([, nombre]) =>
    PAQUETE_AFIRME[paquete].test(nombre),
  );
  if (!encontrado) {
    throw new AfirmeError(
      `Afirme no ofrece el paquete ${paquete} para este vehículo.`,
    );
  }
  return encontrado[0];
}

function cuerpoCotizacion(
  request: CotizacionRequest,
  vehiculo: VehiculoAfirme,
  ubicacion: Ubicacion,
  idPaquete: string,
  descuento: number,
): string {
  const cfg = getAfirmeConfig();
  return JSON.stringify({
    idTipoPersona: "1",
    datosPoliza: {
      idNegocio: cfg.idNegocio,
      idProducto: cfg.idProducto,
      idTipoPoliza: cfg.idTipoPoliza,
    },
    zonaCirculacion: {
      idEstadoCirculacion: ubicacion.stateId,
      idMunicipioCirculacion: ubicacion.cityId,
      codigoPostalCirculacion: request.vehiculo.cp,
    },
    vehiculo: {
      idLineaNegocio: vehiculo.idLineaNegocio,
      idMarca: vehiculo.idMarca,
      idSubMarca: vehiculo.idSubMarca,
      modelo: String(vehiculo.anio),
      idEstilo: vehiculo.idEstilo,
      unidadSalvamento: "NO",
      beneficiarioPreferente: "NO",
      tipoIndemnizacion: TIPO_INDEMNIZACION,
      tipoValor: TIPO_VALOR_COMERCIAL,
    },
    paquete: {
      idPaquete,
      idFormaPago: FORMA_PAGO_AFIRME[request.formaPago],
      pctDescuentoEstado: descuento,
    },
    asegurado: {
      edadAsegurado: String(edad(request.conductor.fechaNacimiento)),
      generoAsegurado: request.conductor.genero,
    },
  });
}

async function cotizar(json: string): Promise<RespuestaCotizacion> {
  const data = await llamarAfirme<RespuestaCotizacion>("cotizarPoliza", { json });
  if (data.RESPUESTA && data.RESPUESTA.toUpperCase() !== "EXITOSA") {
    throw new AfirmeError(`Afirme respondió ${data.RESPUESTA}.`);
  }
  if (!data.primaTotal) {
    throw new AfirmeError("Afirme no devolvió una prima válida.");
  }
  return data;
}

// Afirme rechaza el descuento cuando excede el tope del agente (indicando el
// máximo permitido) o cuando el paquete no admite descuento. En ambos casos
// se reintenta con el descuento que sí acepta.
async function cotizarConDescuento(
  construir: (descuento: number) => string,
  descuento: number,
): Promise<{ data: RespuestaCotizacion; descuento: number }> {
  try {
    return { data: await cotizar(construir(descuento)), descuento };
  } catch (err) {
    if (!(err instanceof AfirmeError) || descuento === 0) throw err;
    const excede = err.message.match(/excede el porcentaje permitido.*?(\d+(?:\.\d+)?)/i);
    if (excede) {
      const permitido = Math.floor(Number(excede[1]));
      if (permitido < descuento) return cotizarConDescuento(construir, permitido);
    }
    if (/no esta disponible para el paquete/i.test(err.message)) {
      return { data: await cotizar(construir(0)), descuento: 0 };
    }
    throw err;
  }
}

export async function cotizarAfirmeReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  descuento: number,
  idEstilo: string,
): Promise<CotizacionResultado> {
  const cfg = getAfirmeConfig();
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };

  if (!credencialesConfiguradas(cfg)) {
    return { ...base, status: "error", error: new AfirmeNoConfigurado().message };
  }

  try {
    const [vehiculo, ubicacion] = await Promise.all([
      resolverVehiculo(idEstilo, {
        marca: request.vehiculo.marca,
        submarca: request.vehiculo.modelo,
        anio: request.vehiculo.anio,
      }),
      llamarAfirme<Ubicacion>("getLocationByCP", {
        codigoPostal: request.vehiculo.cp,
      }),
    ]);
    if (!vehiculo) {
      throw new AfirmeError(
        `La clave ${idEstilo} no corresponde a un ${request.vehiculo.marca} ${request.vehiculo.modelo} ${request.vehiculo.anio} en el catálogo de Afirme.`,
      );
    }
    if (!ubicacion.stateId || !ubicacion.cityId) {
      throw new AfirmeError(
        `Afirme no reconoce el código postal ${request.vehiculo.cp}.`,
      );
    }

    const idPaquete = await paqueteAfirme(vehiculo, request.paquete);
    const construir = (d: number) =>
      cuerpoCotizacion(request, vehiculo, ubicacion, idPaquete, d);

    // La prima de lista (0 %) se pide en paralelo para mostrar el desglose del
    // descuento; Afirme siempre reporta `descuentos: 0` en la respuesta.
    const [conDescuento, lista] = await Promise.all([
      cotizarConDescuento(construir, Math.max(0, descuento)),
      descuento > 0 ? cotizar(construir(0)) : undefined,
    ]);
    const data = conDescuento.data;
    const primaNeta = round2(data.primaNeta ?? 0);
    const primaNetaSinDescuento = round2(
      conDescuento.descuento > 0 && lista?.primaNeta ? lista.primaNeta : primaNeta,
    );

    const prima: DesglosePrima = {
      primaNetaSinDescuento,
      descuentoPorcentaje: conDescuento.descuento,
      descuentoMonto: round2(primaNetaSinDescuento - primaNeta),
      primaNeta,
      derechos: round2(data.derechoPago ?? 0),
      recargoPagoFraccionado: round2(data.recargo ?? 0),
      iva: round2(data.iva ?? 0),
      primaTotal: round2(data.primaTotal ?? 0),
    };

    const inicio = new Date();
    const fin = new Date();
    fin.setFullYear(fin.getFullYear() + 1);

    return {
      ...base,
      status: "success",
      prima,
      coberturas: coberturas(data.coberturas ?? {}),
      vigencia: { inicio: fechaISO(inicio), fin: fechaISO(fin) },
      tiempoRespuestaMs: Date.now() - inicioTiempo,
      origen: "real",
      noCotizacion: data.idToCotizacion ? String(data.idToCotizacion) : undefined,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error:
        err instanceof Error
          ? `No se pudo consultar a Afirme: ${err.message}`
          : "No se pudo consultar a Afirme.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }
}
