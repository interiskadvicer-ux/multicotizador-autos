import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import { cotizacionRealHabilitada, getQualitasConfig } from "@/lib/qualitas/config";
import { cotizarQualitasReal } from "@/lib/qualitas/cotizacion";

const cfg: PricingConfig = {
  factorBase: 0.98,
  derechos: 550,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$3,000,000", LIMITADA: "$2,000,000", RC: "$1,500,000" },
  gastosMedicos: "$200,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const qualitas: InsurerAdapter = {
  id: "qualitas",
  nombre: "Quálitas",
  descuentoDefault: 45,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const descuento = resolverDescuento(request, this.id, this.descuentoDefault);
    const claveAmis = request.vehiculo.claveAmis?.trim();

    // Cotización real vía web service cuando está habilitada y el vehículo trae
    // su ClaveAmis (del catálogo de Quálitas). Si no, se usa la simulación para
    // no bloquear el resto del multicotizador.
    if (cotizacionRealHabilitada() && claveAmis) {
      const cfgQ = getQualitasConfig();
      const descReal = Math.min(descuento, cfgQ.descuentoDefault);
      return cotizarQualitasReal(
        this.id,
        this.nombre,
        request,
        descReal,
        claveAmis,
      );
    }

    const mock = await cotizarMock(this.id, this.nombre, cfg, request, descuento);
    return { ...mock, origen: "simulado" };
  },
};
