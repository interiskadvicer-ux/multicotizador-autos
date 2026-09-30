import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import {
  cotizacionRealHabilitada,
  getZurichConfig,
} from "@/lib/zurich/config";
import { cotizarZurichReal } from "@/lib/zurich/cotizacion";

const cfg: PricingConfig = {
  factorBase: 1.08,
  derechos: 650,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$5,000,000", LIMITADA: "$3,000,000", RC: "$2,000,000" },
  gastosMedicos: "$300,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const zurich: InsurerAdapter = {
  id: "zurich",
  nombre: "Zurich",
  descuentoDefault: 35,
  // Detalle de clave + solicitud + hasta dos recotizaciones encadenadas.
  timeoutMs: 60_000,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const descuento = resolverDescuento(request, this.id, this.descuentoDefault);
    const claveZurich = request.vehiculo.claveZurich?.trim();

    // Cotización real vía Web Service V2 cuando está habilitada y el vehículo
    // trae su clave Zurich; si no, simulación.
    if (cotizacionRealHabilitada() && claveZurich) {
      const cfgZ = getZurichConfig();
      return cotizarZurichReal(
        this.id,
        this.nombre,
        request,
        Math.min(descuento, cfgZ.descuentoDefault),
        claveZurich,
      );
    }

    const mock = await cotizarMock(this.id, this.nombre, cfg, request, descuento);
    return { ...mock, origen: "simulado" };
  },
};
