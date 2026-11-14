import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import { cotizacionRealHabilitada, getHdiConfig } from "@/lib/hdi/config";
import { cotizarHdiReal } from "@/lib/hdi/cotizacion";

const cfg: PricingConfig = {
  factorBase: 0.95,
  derechos: 600,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$4,000,000", LIMITADA: "$2,500,000", RC: "$1,500,000" },
  gastosMedicos: "$250,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const hdi: InsurerAdapter = {
  id: "hdi",
  nombre: "HDI Seguros",
  descuentoDefault: getHdiConfig().descuentoDefault,
  // Formas de pago + cálculo del paquete + recálculo con cambios.
  timeoutMs: 60_000,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const descuento = resolverDescuento(request, this.id, this.descuentoDefault);
    const claveHdi = request.vehiculo.claveHdi?.trim();

    // Cotización real vía ObtenerPaquetes cuando está habilitada y el vehículo
    // trae su clave HDI; si no, simulación.
    if (cotizacionRealHabilitada() && claveHdi) {
      return cotizarHdiReal(this.id, this.nombre, request, descuento, claveHdi);
    }

    const mock = await cotizarMock(this.id, this.nombre, cfg, request, descuento);
    return { ...mock, origen: "simulado" };
  },
};
