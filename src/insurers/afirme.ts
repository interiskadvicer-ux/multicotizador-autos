import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de Afirme
// Seguros (REST/JSON): autenticarse con AFIRME_WS_URL / AFIRME_WS_USER /
// AFIRME_WS_PASS, homologar catálogos de marca/modelo/versión, llamar al
// endpoint y mapear la respuesta a `CotizacionResultado`, manejando
// errores/timeouts con { status: "error", error }.
export const afirme = createMockAdapter({
  id: "afirme",
  nombre: "Afirme Seguros",
  descuentoDefault: 30,
  pricing: {
    factorBase: 0.93,
    derechos: 520,
    rcSumaAsegurada: {
      AMPLIA: "$3,000,000",
      LIMITADA: "$2,000,000",
      RC: "$1,000,000",
    },
    gastosMedicos: "$200,000",
  },
});
