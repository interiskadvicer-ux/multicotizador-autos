import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import {
  cotizacionRealHabilitada,
  getAfirmeConfig,
} from "@/lib/afirme/config";
import { cotizarAfirmeReal } from "@/lib/afirme/cotizacion";

const cfg: PricingConfig = {
  factorBase: 0.93,
  derechos: 520,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$3,000,000", LIMITADA: "$2,000,000", RC: "$1,000,000" },
  gastosMedicos: "$200,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const afirme: InsurerAdapter = {
  id: "afirme",
  nombre: "Afirme Seguros",
  descuentoDefault: 25,
  // Catálogo + ubicación + paquetes + dos cotizaciones (con y sin descuento).
  timeoutMs: 45_000,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const descuento = resolverDescuento(request, this.id, this.descuentoDefault);
    const claveAfirme = request.vehiculo.claveAfirme?.trim();

    // Cotización real vía Midas Autos cuando está habilitada y el vehículo
    // trae su idEstilo del catálogo de Afirme; si no, simulación.
    if (cotizacionRealHabilitada() && claveAfirme) {
      const cfgA = getAfirmeConfig();
      return cotizarAfirmeReal(
        this.id,
        this.nombre,
        request,
        Math.min(descuento, cfgA.descuentoDefault),
        claveAfirme,
      );
    }

    const mock = await cotizarMock(this.id, this.nombre, cfg, request, descuento);
    return { ...mock, origen: "simulado" };
  },
};
