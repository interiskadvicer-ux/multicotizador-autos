import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, type PricingConfig } from "./base";

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
  async cotizar(request: CotizacionRequest): Promise<CotizacionResultado> {
    // TODO(integración): reemplazar por la llamada real al web service de
    // Seguros El Potosí (SOAP). Pasos:
    //   1. Autenticarse con credenciales desde env:
    //      process.env.EL_POTOSI_WS_URL / EL_POTOSI_WS_USER / EL_POTOSI_WS_PASS
    //   2. Mapear `request` al formato de entrada del WS (homologar catálogos
    //      de marca/modelo/versión con los de Seguros El Potosí).
    //   3. Llamar al endpoint y mapear la respuesta a `CotizacionResultado`.
    //   4. Manejar errores/timeouts devolviendo { status: "error", error }.
    return cotizarMock(this.id, this.nombre, cfg, request);
  },
};
