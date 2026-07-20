import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de Seguros
// Atlas (SOAP): autenticarse con ATLAS_WS_URL / ATLAS_WS_USER / ATLAS_WS_PASS,
// homologar catálogos de marca/modelo/versión, llamar al endpoint y mapear la
// respuesta a `CotizacionResultado`, manejando errores/timeouts con
// { status: "error", error }.
export const atlas = createMockAdapter({
  id: "atlas",
  nombre: "Seguros Atlas",
  descuentoDefault: 25,
  pricing: {
    factorBase: 0.97,
    derechos: 560,
    rcSumaAsegurada: {
      AMPLIA: "$3,000,000",
      LIMITADA: "$2,000,000",
      RC: "$1,000,000",
    },
    gastosMedicos: "$200,000",
  },
});
