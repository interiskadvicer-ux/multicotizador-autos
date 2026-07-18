import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "./types";
import { cotizarMock, resolverDescuento, type PricingConfig } from "./base";

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
    // TODO(integración): reemplazar por la llamada real al web service de
    // Quálitas (Cotizador / WS SOAP). Pasos:
    //   1. Autenticarse con las credenciales (usuario/pwd/token) desde env:
    //      process.env.QUALITAS_WS_URL / QUALITAS_WS_USER / QUALITAS_WS_PASS
    //   2. Mapear `request` al formato de entrada del WS (catálogos de marca/
    //      modelo/versión propios de Quálitas -> requiere homologación).
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
