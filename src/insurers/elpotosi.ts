import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";
import { cotizacionRealHabilitada, getElPotosiConfig } from "@/lib/elpotosi/client";
import { cotizarElPotosiReal } from "@/lib/elpotosi/cotizacion";

const cfg: PricingConfig = {
  factorBase: 0.9,
  derechos: 480,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$3,000,000", LIMITADA: "$1,500,000", RC: "$1,000,000" },
  gastosMedicos: "$150,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const elPotosi: InsurerAdapter = {
  id: "elpotosi",
  nombre: "Seguros El Potosí",
  descuentoDefault: getElPotosiConfig().descuentoDefault,
  // Coberturas del paquete + recálculo de coberturas editadas + cotizar.
  timeoutMs: 60_000,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    const descuento = resolverDescuento(request, this.id, this.descuentoDefault);
    const clave = request.vehiculo.claveElPotosi?.trim();
    if (cotizacionRealHabilitada() && clave) {
      return cotizarElPotosiReal(this.id, this.nombre, request, descuento, clave);
    }
    const mock = await cotizarMock(this.id, this.nombre, cfg, request, descuento);
    return { ...mock, origen: "simulado" };
  },
};
