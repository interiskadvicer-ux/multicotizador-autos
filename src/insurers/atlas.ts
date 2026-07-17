import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, type PricingConfig } from "./base";

const cfg: PricingConfig = {
  factorBase: 0.97,
  derechos: 560,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1, TRIMESTRAL: 0.07, SEMESTRAL: 0.05 },
  rcSumaAsegurada: { AMPLIA: "$3,000,000", LIMITADA: "$2,000,000", RC: "$1,000,000" },
  gastosMedicos: "$200,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

export const atlas: InsurerAdapter = {
  id: "atlas",
  nombre: "Seguros Atlas",
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    // TODO(integración): reemplazar por la llamada real al web service de
    // Seguros Atlas (SOAP). Pasos:
    //   1. Autenticarse con credenciales desde env:
    //      process.env.ATLAS_WS_URL / ATLAS_WS_USER / ATLAS_WS_PASS
    //   2. Mapear `request` al formato de entrada del WS (homologar catálogos
    //      de marca/modelo/versión con los de Seguros Atlas).
    //   3. Llamar al endpoint y mapear la respuesta a `CotizacionResultado`.
    //   4. Manejar errores/timeouts devolviendo { status: "error", error }.
    return cotizarMock(this.id, this.nombre, cfg, request);
  },
};
