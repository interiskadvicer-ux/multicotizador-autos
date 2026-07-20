import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de Banorte
// Seguros (REST/JSON): autenticarse con BANORTE_WS_URL / BANORTE_WS_USER /
// BANORTE_WS_PASS, homologar catálogos de marca/modelo/versión, llamar al
// endpoint y mapear la respuesta a `CotizacionResultado`, manejando
// errores/timeouts con { status: "error", error }.
export const banorte = createMockAdapter({
  id: "banorte",
  nombre: "Banorte Seguros",
  descuentoDefault: 30,
  pricing: {
    factorBase: 1.05,
    derechos: 500,
    rcSumaAsegurada: {
      AMPLIA: "$3,000,000",
      LIMITADA: "$2,000,000",
      RC: "$1,000,000",
    },
    gastosMedicos: "$150,000",
  },
});
