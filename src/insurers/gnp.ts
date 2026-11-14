import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";

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
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    // TODO(integración): reemplazar por la llamada real al web service de
    // GNP Seguros (SOAP). Pasos:
    //   1. Autenticarse con credenciales desde env:
    //      process.env.GNP_WS_URL / GNP_WS_USER / GNP_WS_PASS
    //   2. Mapear `request` al formato de entrada del WS (homologar catálogos
    //      de marca/modelo/versión con los de GNP Seguros).
    //   3. Llamar al endpoint y mapear la respuesta a `CotizacionResultado`.
    //   4. Manejar errores/timeouts devolviendo { status: "error", error }.
    return cotizarMock(
      this.id,
      this.nombre,
      cfg,
      request,
      resolverDescuento(request, this.id, this.descuentoDefault),
    );
  },
};
