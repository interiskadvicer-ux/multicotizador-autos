import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de Zurich
// (REST/JSON): autenticarse con ZURICH_WS_URL / ZURICH_WS_USER /
// ZURICH_WS_PASS, homologar catálogos de marca/modelo/versión, llamar al
// endpoint y mapear la respuesta a `CotizacionResultado`, manejando
// errores/timeouts con { status: "error", error }.
export const zurich = createMockAdapter({
  id: "zurich",
  nombre: "Zurich",
  descuentoDefault: 25,
  pricing: {
    factorBase: 1.08,
    derechos: 650,
    rcSumaAsegurada: {
      AMPLIA: "$5,000,000",
      LIMITADA: "$3,000,000",
      RC: "$2,000,000",
    },
    gastosMedicos: "$300,000",
  },
});
