// Cotización real de Banorte (Autos Individual, servicios REST).
// Flujo: `auto/cotizacion` devuelve la prima de lista y la lista de descuentos
// discrecionales disponibles; para aplicar un descuento se requiere un
// recálculo con `auto/recalcular/cotizacion`.

import type {
  Cobertura,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
  Paquete,
} from "@/domain/types";
import { masCercano } from "@/lib/coberturas";
import { credencialesConfiguradas, getBanorteConfig } from "./config";
import { BanorteError, BanorteNoConfigurado, llamarBanorte } from "./client";

// Paquete del multicotizador -> plan de Banorte.
const PAQUETE_A_BANORTE: Record<Paquete, string> = {
  AMPLIA: "INTEGRAL",
  LIMITADA: "PROTEGIDO",
  RC: "PREVENTIVO",
};

// Coberturas de Banorte -> nombres homologados del multicotizador, para que la
// tabla comparativa y el PDF queden alineados entre aseguradoras.
const COBERTURA_HOMOLOGADA: Record<string, string> = {
  "DAÑOS MATERIALES": "Daños Materiales",
  "ROBO TOTAL": "Robo Total",
  "RESPONSABILIDAD CIVIL DAÑOS A TERCEROS": "Responsabilidad Civil",
  "GASTOS MÉDICOS OCUPANTES": "Gastos Médicos Ocupantes",
  "ASISTENCIA VEHICULAR": "Asistencia Vial y Legal",
  "ASISTENCIA JURÍDICA": "Defensa Jurídica",
};

// Orden en que se muestran las coberturas homologadas.
const ORDEN_COBERTURAS = [
  "Daños Materiales",
  "Robo Total",
  "Responsabilidad Civil",
  "Gastos Médicos Ocupantes",
  "Asistencia Vial y Legal",
  "Defensa Jurídica",
];

interface ItemCobertura {
  indice: number;
  habilitada: boolean;
  nombreTipoCobertura: string;
  obligatoria?: boolean;
  leyendaSumaAsegurada?: string;
  montoSumaAsegurada?: number;
  leyendaDeducible?: string;
  montoDeducible?: number;
  sumasAseguradas?: Array<{ valor?: number }>;
  deducibles?: Array<{ valor?: number; unidad?: string }>;
}

interface ResumenCotizacion {
  nombreFormaPago?: string;
  primaNeta?: number;
  montoDerecho?: number;
  montoRecargo?: number;
  iva?: number;
  primaTotal?: number;
}

interface PolizaBanorte {
  vigencia?: string;
  resumenCotizacion?: ResumenCotizacion;
  certificado?: {
    nombrePlan?: string;
    items?: ItemCobertura[];
  };
  descuentosDiscrecionales?: Array<{ valor?: string }>;
}

interface RespuestaCotizacion {
  polizas?: PolizaBanorte[];
}

interface Respuesta {
  enunciado: string;
  valor: string;
  indice: number;
}

// Cuestionario mínimo requerido por el producto de Autos Residentes.
function respuestas(request: CotizacionRequest): Respuesta[] {
  return [
    { enunciado: "TIPO VALOR VEHICULO", valor: "1", indice: 41 },
    {
      enunciado: "INDIQUE EL SEXO DEL ASEGURADO",
      valor: request.conductor.genero === "F" ? "FEMENINO" : "MASCULINO",
      indice: 10,
    },
    {
      enunciado: "¿DESEA COTIZAR PLANES COMPLEMENTARIOS?",
      valor: "NO",
      indice: 11,
    },
    {
      enunciado: "¿EL VEHÍCULO CUENTA CON ADAPTACIONES/EQUIPO ESPECIAL?",
      valor: "false",
      indice: 7,
    },
  ];
}

function cuerpoBase(
  request: CotizacionRequest,
  claveBanorte: string,
): Record<string, unknown> {
  const cfg = getBanorteConfig();
  return {
    nombreProducto: cfg.nombreProducto,
    claveIntermediario: cfg.claveIntermediario,
    nombreCategoria: cfg.nombreCategoria,
    codigoPostal: request.vehiculo.cp,
    municipio: "",
    estado: "",
    claveBanorte,
    anio: String(request.vehiculo.anio),
    nombreUso: "PARTICULAR",
    nombreServicio: "PARTICULAR",
    respuestas: respuestas(request),
    nombrePaquete: PAQUETE_A_BANORTE[request.paquete],
  };
}

// Banorte expone los descuentos como texto ("30 %"), pero el recálculo espera
// un número. Se toma el mayor descuento disponible que no exceda el solicitado.
function descuentoAplicable(
  poliza: PolizaBanorte,
  solicitado: number,
): number | undefined {
  const disponibles = (poliza.descuentosDiscrecionales ?? [])
    .map((d) => Number(String(d.valor ?? "").replace(/[^\d.]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!disponibles.length) return undefined;

  const permitidos = disponibles.filter((n) => n <= solicitado);
  if (!permitidos.length) return undefined;
  return Math.max(...permitidos);
}

function coberturas(items: ItemCobertura[]): Cobertura[] {
  const porNombre = new Map<string, ItemCobertura>();
  for (const it of items) {
    const nombre = COBERTURA_HOMOLOGADA[it.nombreTipoCobertura.toUpperCase()];
    if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, it);
  }

  return ORDEN_COBERTURAS.map((nombre) => {
    const it = porNombre.get(nombre);
    if (!it || !it.habilitada) {
      return { nombre, incluida: false, deducible: "N/A" };
    }
    return {
      nombre,
      incluida: true,
      sumaAsegurada: it.leyendaSumaAsegurada || undefined,
      deducible: it.leyendaDeducible || "N/A",
    };
  });
}

function opciones(lista: Array<{ valor?: number }> | undefined): number[] {
  return (lista ?? [])
    .map((o) => o.valor)
    .filter((v): v is number => typeof v === "number");
}

// Aplica las coberturas personalizadas sobre los ítems devueltos por Banorte.
// Banorte rechaza valores fuera de su catálogo, así que se elige la opción
// más cercana que ofrece cada cobertura. Devuelve true si algo cambió.
function aplicarCoberturas(
  items: ItemCobertura[],
  request: CotizacionRequest,
  ajustes: string[],
): boolean {
  const cob = request.coberturasPersonalizadas;
  if (!cob) return false;
  let cambio = false;
  for (const it of items) {
    if (!it.habilitada) continue;
    const nombre = it.nombreTipoCobertura.toUpperCase();
    if (
      nombre === "RESPONSABILIDAD CIVIL DAÑOS A TERCEROS" &&
      cob.responsabilidadCivil !== undefined
    ) {
      const v = masCercano(
        "responsabilidadCivil",
        cob.responsabilidadCivil,
        opciones(it.sumasAseguradas),
        ajustes,
      );
      if (v !== it.montoSumaAsegurada) {
        it.montoSumaAsegurada = v;
        cambio = true;
      }
    } else if (
      nombre === "GASTOS MÉDICOS OCUPANTES" &&
      cob.gastosMedicos !== undefined
    ) {
      const v = masCercano(
        "gastosMedicos",
        cob.gastosMedicos,
        opciones(it.sumasAseguradas),
        ajustes,
      );
      if (v !== it.montoSumaAsegurada) {
        it.montoSumaAsegurada = v;
        cambio = true;
      }
    } else if (
      nombre === "DAÑOS MATERIALES" &&
      cob.deducibleDanosMateriales !== undefined
    ) {
      const v = masCercano(
        "deducibleDanosMateriales",
        cob.deducibleDanosMateriales,
        opciones(it.deducibles),
        ajustes,
      );
      if (v !== it.montoDeducible) {
        it.montoDeducible = v;
        cambio = true;
      }
    } else if (nombre === "ROBO TOTAL" && cob.deducibleRoboTotal !== undefined) {
      const v = masCercano(
        "deducibleRoboTotal",
        cob.deducibleRoboTotal,
        opciones(it.deducibles),
        ajustes,
      );
      if (v !== it.montoDeducible) {
        it.montoDeducible = v;
        cambio = true;
      }
    }
  }
  return cambio;
}

// Para recalcular hay que reenviar los ítems tal como los devolvió cotizar,
// pero solo con los campos que acepta el servicio de recálculo.
function itemsParaRecalculo(items: ItemCobertura[]): unknown[] {
  return items.map((it) => ({
    indice: it.indice,
    habilitada: it.habilitada,
    nombreTipoCobertura: it.nombreTipoCobertura,
    montoSumaAsegurada: it.montoSumaAsegurada ?? 0,
    montoDeducible: it.montoDeducible ?? 0,
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function cotizarBanorteReal(
  aseguradoraId: string,
  aseguradora: string,
  request: CotizacionRequest,
  descuento: number,
  claveBanorte: string,
): Promise<CotizacionResultado> {
  const cfg = getBanorteConfig();
  const inicioTiempo = Date.now();
  const base: Omit<CotizacionResultado, "status"> = {
    aseguradoraId,
    aseguradora,
    paquete: request.paquete,
    moneda: "MXN",
    coberturas: [],
  };

  if (!credencialesConfiguradas(cfg)) {
    return {
      ...base,
      status: "error",
      error: new BanorteNoConfigurado().message,
    };
  }

  const cuerpo = cuerpoBase(request, claveBanorte);

  let poliza: PolizaBanorte;
  try {
    const data = await llamarBanorte<RespuestaCotizacion>({
      metodo: "POST",
      ruta: "/auto/cotizacion",
      body: cuerpo,
    });
    const primera = data.polizas?.[0];
    if (!primera) throw new BanorteError("Banorte no devolvió cotización.");
    poliza = primera;
  } catch (err) {
    return {
      ...base,
      status: "error",
      error:
        err instanceof Error
          ? `No se pudo consultar a Banorte: ${err.message}`
          : "No se pudo consultar a Banorte.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }

  let items = poliza.certificado?.items ?? [];
  const ajustes: string[] = [];
  const coberturasModificadas = aplicarCoberturas(items, request, ajustes);
  const descReal = descuentoAplicable(poliza, descuento);

  // Con descuento autorizado o coberturas modificadas se recalcula para que
  // Banorte devuelva la prima definitiva. Si el recálculo falla se conserva la
  // prima de lista.
  let resumen = poliza.resumenCotizacion ?? {};
  let primaLista = resumen.primaNeta ?? 0;
  let descuentoAplicado = 0;
  let errorRecalculo: string | undefined;
  if ((descReal || coberturasModificadas) && items.length) {
    try {
      const data = await llamarBanorte<RespuestaCotizacion>({
        metodo: "POST",
        ruta: "/auto/recalcular/cotizacion",
        body: {
          ...cuerpo,
          items: itemsParaRecalculo(items),
          nombreVigencia: poliza.vigencia || "ANUAL",
          nombreFormaPago: resumen.nombreFormaPago,
          valorDescuento: descReal ?? 0,
        },
      });
      const recalculada = data.polizas?.[0];
      if (recalculada?.resumenCotizacion?.primaTotal) {
        resumen = recalculada.resumenCotizacion;
        descuentoAplicado = descReal ?? 0;
        items = recalculada.certificado?.items ?? items;
        if (coberturasModificadas) {
          // La prima de lista cambió con las coberturas; se reconstruye a
          // partir de la prima recalculada y el descuento aplicado.
          const neta = resumen.primaNeta ?? 0;
          primaLista =
            descuentoAplicado > 0 ? neta / (1 - descuentoAplicado / 100) : neta;
        }
      }
    } catch (err) {
      errorRecalculo = err instanceof Error ? err.message : String(err);
    }
  }

  if (coberturasModificadas && errorRecalculo) {
    return {
      ...base,
      status: "error",
      error: `Banorte no aceptó las coberturas solicitadas: ${errorRecalculo}`,
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }

  if (!resumen.primaTotal) {
    return {
      ...base,
      status: "error",
      error: "Banorte no devolvió una prima válida para esta cotización.",
      tiempoRespuestaMs: Date.now() - inicioTiempo,
    };
  }

  const primaNeta = round2(resumen.primaNeta ?? 0);
  const primaNetaSinDescuento = round2(primaLista || primaNeta);

  const prima: DesglosePrima = {
    primaNetaSinDescuento,
    descuentoPorcentaje: descuentoAplicado,
    descuentoMonto: round2(primaNetaSinDescuento - primaNeta),
    primaNeta,
    derechos: round2(resumen.montoDerecho ?? 0),
    recargoPagoFraccionado: round2(resumen.montoRecargo ?? 0),
    iva: round2(resumen.iva ?? 0),
    primaTotal: round2(resumen.primaTotal),
  };

  const inicio = new Date();
  const fin = new Date();
  fin.setFullYear(fin.getFullYear() + 1);

  return {
    ...base,
    status: "success",
    prima,
    coberturas: coberturas(items),
    vigencia: { inicio: fechaISO(inicio), fin: fechaISO(fin) },
    tiempoRespuestaMs: Date.now() - inicioTiempo,
    origen: "real",
    ajustes: ajustes.length ? ajustes : undefined,
  };
}
