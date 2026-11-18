import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import { cotizacionRealHabilitada } from "@/lib/gnp/config";
import { cotizarGnpReal } from "@/lib/gnp/cotizacion";

const cfg: PricingConfig = {
  factorBase: 1.02,
  derechos: 700,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$4,000,000", LIMITADA: "$2,500,000", RC: "$1,500,000" },
  gastosMedicos: "$250,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const gnp: InsurerAdapter = {
  id: "gnp",
  nombre: "GNP Seguros",
  descuentoDefault: 40,
  paquetes: ["AMPLIA_PLUS", "AMPLIA", "LIMITADA", "RC"],
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const claveGnp = request.vehiculo.claveGnp?.trim();
    if (cotizacionRealHabilitada() && claveGnp) {
      return cotizarGnpReal(this.id, this.nombre, request, claveGnp);
    }
    const mock = await cotizarMock(
      this.id,
      this.nombre,
      cfg,
      request,
      resolverDescuento(request, this.id, this.descuentoDefault),
    );
    return { ...mock, origen: "simulado" };
  },
};
