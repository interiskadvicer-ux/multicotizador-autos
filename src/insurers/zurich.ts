import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, type PricingConfig } from "./base";

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
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    // TODO(integración): reemplazar por la llamada real al web service de
    // Zurich (REST/JSON). Pasos:
    //   1. Autenticarse con credenciales desde env:
    //      process.env.ZURICH_WS_URL / ZURICH_WS_USER / ZURICH_WS_PASS
    //   2. Mapear `request` al formato de entrada del WS (homologar catálogos
    //      de marca/modelo/versión con los de Zurich).
    //   3. Llamar al endpoint y mapear la respuesta a `CotizacionResultado`.
    //   4. Manejar errores/timeouts devolviendo { status: "error", error }.
    return cotizarMock(this.id, this.nombre, cfg, request);
  },
};
