import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de GNP
// Seguros (SOAP): autenticarse con GNP_WS_URL / GNP_WS_USER / GNP_WS_PASS,
// homologar catálogos de marca/modelo/versión, llamar al endpoint y mapear la
// respuesta a `CotizacionResultado`, manejando errores/timeouts con
// { status: "error", error }.
export const gnp = createMockAdapter({
  id: "gnp",
  nombre: "GNP Seguros",
  descuentoDefault: 40,
  pricing: {
    factorBase: 1.02,
    derechos: 700,
    rcSumaAsegurada: {
      AMPLIA: "$4,000,000",
      LIMITADA: "$2,500,000",
      RC: "$1,500,000",
    },
    gastosMedicos: "$250,000",
  },
});
