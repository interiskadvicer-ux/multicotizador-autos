import type {
  Cobertura,
  CoberturasPersonalizadas,
  CotizacionRequest,
  CotizacionResultado,
  DesglosePrima,
  Paquete,
} from "@/domain/types";

// Configuración por aseguradora que alimenta el generador de cotización
// simulada. Cuando conectes el web service real, cada adaptador reemplazará
// `cotizarMock` por la llamada HTTP/SOAP correspondiente y mapeará la
// respuesta a `CotizacionResultado`. Esta configuración deja de usarse en
// ese momento (queda solo como fallback / demo).
export interface PricingConfig {
  // Factor multiplicador base de la prima (permite diferenciar precios entre
  // aseguradoras de forma determinística para la demo).
  factorBase: number;
  // Derechos de póliza fijos en MXN.
  derechos: number;
  // Recargo por pago fraccionado (porcentaje sobre prima neta).
  recargoFraccionado: Record<string, number>;
  // Suma asegurada de Responsabilidad Civil por paquete.
  rcSumaAsegurada: Record<Paquete, string>;
  // Suma asegurada de Gastos Médicos Ocupantes.
  gastosMedicos: string;
  // Deducibles por paquete.
  deducibleDanos: string;
  deducibleRobo: string;
}

const IVA = 0.16;

// Estima un valor comercial cuando el usuario no lo captura, en función del año.
function estimarValor(anio: number): number {
  const edad = Math.max(0, new Date().getFullYear() - anio);
  const base = 380_000;
  return Math.round(base * Math.pow(0.88, edad));
}

// Genera un número pseudo-aleatorio estable a partir de una cadena, para que
// la misma cotización devuelva siempre el mismo precio (demo determinística).
function hashFactor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 100000;
  }
  return 0.9 + (h % 200) / 1000; // rango ~[0.9, 1.1]
}

function edadConductor(fechaNacimiento: string): number {
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return 35;
  const diff = Date.now() - nacimiento.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export function formatoMoneda(n: number): string {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });
}

function montoDesdeTexto(texto: string): number {
  return Number(texto.replace(/[^\d.]/g, "")) || 0;
}

// Aplica las coberturas personalizadas sobre la configuración base de la
// aseguradora simulada, devolviendo la configuración efectiva para el paquete.
function configEfectiva(
  cfg: PricingConfig,
  paquete: Paquete,
  cob: CoberturasPersonalizadas | undefined,
): PricingConfig {
  if (!cob) return cfg;
  return {
    ...cfg,
    rcSumaAsegurada: {
      ...cfg.rcSumaAsegurada,
      [paquete]:
        cob.responsabilidadCivil !== undefined
          ? formatoMoneda(cob.responsabilidadCivil)
          : cfg.rcSumaAsegurada[paquete],
    },
    gastosMedicos:
      cob.gastosMedicos !== undefined
        ? formatoMoneda(cob.gastosMedicos)
        : cfg.gastosMedicos,
    deducibleDanos:
      cob.deducibleDanosMateriales !== undefined
        ? `${cob.deducibleDanosMateriales}%`
        : cfg.deducibleDanos,
    deducibleRobo:
      cob.deducibleRoboTotal !== undefined
        ? `${cob.deducibleRoboTotal}%`
        : cfg.deducibleRobo,
  };
}

// Factor de ajuste de la prima simulada según las coberturas elegidas frente
// a las del plan base: más suma asegurada encarece, más deducible abarata.
function factorCoberturas(
  base: PricingConfig,
  paquete: Paquete,
  cob: CoberturasPersonalizadas | undefined,
): number {
  if (!cob) return 1;
  let f = 1;
  if (cob.responsabilidadCivil !== undefined) {
    const rcBase = montoDesdeTexto(base.rcSumaAsegurada[paquete]);
    f *= 1 + 0.035 * ((cob.responsabilidadCivil - rcBase) / 1_000_000);
  }
  if (cob.gastosMedicos !== undefined && paquete !== "RC") {
    const gmBase = montoDesdeTexto(base.gastosMedicos);
    f *= 1 + 0.012 * ((cob.gastosMedicos - gmBase) / 100_000);
  }
  if (cob.deducibleDanosMateriales !== undefined && paquete === "AMPLIA") {
    const dBase = montoDesdeTexto(base.deducibleDanos);
    f *= 1 - 0.018 * (cob.deducibleDanosMateriales - dBase);
  }
  if (cob.deducibleRoboTotal !== undefined && paquete !== "RC") {
    const dBase = montoDesdeTexto(base.deducibleRobo);
    f *= 1 - 0.008 * (cob.deducibleRoboTotal - dBase);
  }
  return Math.max(f, 0.5);
}

export function construirCoberturas(
  cfg: PricingConfig,
  paquete: Paquete,
): Cobertura[] {
  const amplia = paquete === "AMPLIA";
  const limitada = paquete === "LIMITADA";

  return [
    {
      nombre: "Daños Materiales",
      incluida: amplia,
      sumaAsegurada: amplia ? "Valor comercial" : undefined,
      deducible: amplia ? cfg.deducibleDanos : "N/A",
    },
    {
      nombre: "Robo Total",
      incluida: amplia || limitada,
      sumaAsegurada: amplia || limitada ? "Valor comercial" : undefined,
      deducible: amplia || limitada ? cfg.deducibleRobo : "N/A",
    },
    {
      nombre: "Responsabilidad Civil",
      incluida: true,
      sumaAsegurada: cfg.rcSumaAsegurada[paquete],
      deducible: "N/A",
    },
    {
      nombre: "Gastos Médicos Ocupantes",
      incluida: paquete !== "RC",
      sumaAsegurada: paquete !== "RC" ? cfg.gastosMedicos : undefined,
      deducible: "N/A",
    },
    {
      nombre: "Asistencia Vial y Legal",
      incluida: paquete !== "RC",
      sumaAsegurada: paquete !== "RC" ? "AMPARADA" : undefined,
      deducible: "N/A",
    },
    {
      nombre: "Defensa Jurídica",
      incluida: true,
      sumaAsegurada: "AMPARADA",
      deducible: "N/A",
    },
  ];
}

function calcularPrima(
  cfg: PricingConfig,
  request: CotizacionRequest,
  descuentoPct: number,
): DesglosePrima {
  const { vehiculo, conductor, paquete, formaPago } = request;
  const valor = vehiculo.valorFactura ?? estimarValor(vehiculo.anio);

  // Tasa base sobre el valor del vehículo según paquete.
  const tasaPaquete: Record<Paquete, number> = {
    AMPLIA: 0.045,
    LIMITADA: 0.028,
    RC: 0.012,
  };

  // Factores de riesgo simples.
  const edad = edadConductor(conductor.fechaNacimiento);
  const factorEdad = edad < 25 ? 1.25 : edad > 70 ? 1.15 : 1.0;
  const factorUso = vehiculo.uso === "COMERCIAL" ? 1.2 : 1.0;
  const factorAseguradora = cfg.factorBase;
  const factorEstable = hashFactor(
    `${vehiculo.marca}${vehiculo.modelo}${vehiculo.cp}`,
  );

  let primaNetaSinDescuento =
    valor *
    tasaPaquete[paquete] *
    factorEdad *
    factorUso *
    factorAseguradora *
    factorEstable *
    factorCoberturas(cfg, paquete, request.coberturasPersonalizadas);

  // Piso mínimo por paquete para evitar primas irreales en autos viejos.
  const minimo: Record<Paquete, number> = {
    AMPLIA: 4500,
    LIMITADA: 2800,
    RC: 1500,
  };
  primaNetaSinDescuento = Math.max(primaNetaSinDescuento, minimo[paquete]);

  // Descuento comercial de la aseguradora (0–100 %), acotado a un rango válido.
  const descuento = Math.min(Math.max(descuentoPct, 0), 100);
  const descuentoMonto = primaNetaSinDescuento * (descuento / 100);
  const primaNeta = primaNetaSinDescuento - descuentoMonto;

  const recargoPct = cfg.recargoFraccionado[formaPago] ?? 0;
  const recargoPagoFraccionado = primaNeta * recargoPct;
  const derechos = cfg.derechos;
  const subtotal = primaNeta + recargoPagoFraccionado + derechos;
  const iva = subtotal * IVA;

  return {
    primaNetaSinDescuento: round2(primaNetaSinDescuento),
    descuentoPorcentaje: descuento,
    descuentoMonto: round2(descuentoMonto),
    primaNeta: round2(primaNeta),
    derechos: round2(derechos),
    recargoPagoFraccionado: round2(recargoPagoFraccionado),
    iva: round2(iva),
    primaTotal: round2(subtotal + iva),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Devuelve el descuento (%) a aplicar para una aseguradora: el que el broker
// envió en la solicitud o, si no viene, el descuento por defecto de la
// aseguradora.
export function resolverDescuento(
  request: CotizacionRequest,
  aseguradoraId: string,
  descuentoDefault: number,
): number {
  const d = request.descuentos?.[aseguradoraId];
  return typeof d === "number" && !Number.isNaN(d) ? d : descuentoDefault;
}

// Genera una cotización simulada determinística. Reemplaza esta función por la
// llamada real al web service en cada adaptador cuando tengas credenciales.
export async function cotizarMock(
  aseguradoraId: string,
  aseguradora: string,
  cfg: PricingConfig,
  request: CotizacionRequest,
  descuentoPct: number,
): Promise<CotizacionResultado> {
  const inicioTiempo = Date.now();
  // Simula latencia de red variable de un web service real.
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 500));

  const inicio = new Date();
  const fin = new Date();
  fin.setFullYear(fin.getFullYear() + 1);

  return {
    aseguradoraId,
    aseguradora,
    status: "success",
    paquete: request.paquete,
    moneda: "MXN",
    prima: calcularPrima(cfg, request, descuentoPct),
    coberturas: construirCoberturas(
      configEfectiva(cfg, request.paquete, request.coberturasPersonalizadas),
      request.paquete,
    ),
    vigencia: {
      inicio: inicio.toISOString().slice(0, 10),
      fin: fin.toISOString().slice(0, 10),
    },
    tiempoRespuestaMs: Date.now() - inicioTiempo,
  };
}
