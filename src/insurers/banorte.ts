import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import {
  cotizacionRealHabilitada,
  getBanorteConfig,
} from "@/lib/banorte/config";
import { cotizarBanorteReal } from "@/lib/banorte/cotizacion";

const cfg: PricingConfig = {
  factorBase: 1.05,
  derechos: 500,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$3,000,000", LIMITADA: "$2,000,000", RC: "$1,000,000" },
  gastosMedicos: "$150,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const banorte: InsurerAdapter = {
  id: "banorte",
  nombre: "Banorte Seguros",
  descuentoDefault: 30,
  // Cotizar + recalcular con descuento son dos llamadas secuenciales de ~10 s
  // cada una en el ambiente de Banorte.
  timeoutMs: 60_000,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const descuento = resolverDescuento(request, this.id, this.descuentoDefault);
    const claveBanorte = request.vehiculo.claveBanorte?.trim();

    // Cotización real vía servicios REST cuando está habilitada y el vehículo
    // trae su clave del catálogo de Banorte. Si no, se usa la simulación para
    // no bloquear el resto del multicotizador.
    if (cotizacionRealHabilitada() && claveBanorte) {
      const cfgB = getBanorteConfig();
      const descReal = Math.min(descuento, cfgB.descuentoDefault);
      return cotizarBanorteReal(
        this.id,
        this.nombre,
        request,
        descReal,
        claveBanorte,
      );
    }

    const mock = await cotizarMock(this.id, this.nombre, cfg, request, descuento);
    return { ...mock, origen: "simulado" };
  },
};
