import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import { cotizacionRealHabilitada } from "@/lib/gs/config";
import { cotizarGsReal } from "@/lib/gs/cotizacion";

const cfg: PricingConfig = {
  factorBase: 0.97,
  derechos: 600,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$3,000,000", LIMITADA: "$3,000,000", RC: "$3,000,000" },
  gastosMedicos: "$300,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const generalSeguros: InsurerAdapter = {
  id: "generalseguros",
  nombre: "General de Seguros",
  descuentoDefault: 20,
  // Token + cotización con y sin descuento (con reintentos si excede el tope).
  timeoutMs: 45_000,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const descuento = resolverDescuento(request, this.id, this.descuentoDefault);
    const claveGs = request.vehiculo.claveGs?.trim();

    // Cotización real vía CotizacionEmisionWS cuando está habilitada y el
    // vehículo trae su claveGs del catálogo; si no, simulación.
    if (cotizacionRealHabilitada() && claveGs) {
      return cotizarGsReal(this.id, this.nombre, request, descuento, claveGs);
    }

    const mock = await cotizarMock(this.id, this.nombre, cfg, request, descuento);
    return { ...mock, origen: "simulado" };
  },
};
