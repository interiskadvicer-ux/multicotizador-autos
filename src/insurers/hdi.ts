import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de HDI
// Seguros (SOAP): autenticarse con HDI_WS_URL / HDI_WS_USER / HDI_WS_PASS,
// homologar catálogos de marca/modelo/versión, llamar al endpoint y mapear la
// respuesta a `CotizacionResultado`, manejando errores/timeouts con
// { status: "error", error }.
export const hdi = createMockAdapter({
  id: "hdi",
  nombre: "HDI Seguros",
  descuentoDefault: 35,
  pricing: {
    factorBase: 0.95,
    derechos: 600,
    rcSumaAsegurada: {
      AMPLIA: "$4,000,000",
      LIMITADA: "$2,500,000",
      RC: "$1,500,000",
    },
    gastosMedicos: "$250,000",
  },
});
