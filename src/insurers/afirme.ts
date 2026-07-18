import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";

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
  descuentoDefault: 30,
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    // TODO(integración): reemplazar por la llamada real al web service de
    // Afirme Seguros (REST/JSON). Pasos:
    //   1. Autenticarse con credenciales desde env:
    //      process.env.AFIRME_WS_URL / AFIRME_WS_USER / AFIRME_WS_PASS
    //   2. Mapear `request` al formato de entrada del WS (homologar catálogos
    //      de marca/modelo/versión con los de Afirme Seguros).
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
