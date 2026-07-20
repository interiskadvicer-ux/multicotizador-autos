import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de Quálitas
// (Cotizador / WS SOAP): autenticarse con QUALITAS_WS_URL / QUALITAS_WS_USER /
// QUALITAS_WS_PASS, homologar catálogos de marca/modelo/versión, llamar al
// endpoint y mapear la respuesta a `CotizacionResultado`, manejando
// errores/timeouts con { status: "error", error }.
export const qualitas = createMockAdapter({
  id: "qualitas",
  nombre: "Quálitas",
  descuentoDefault: 45,
  pricing: {
    factorBase: 0.98,
    derechos: 550,
    rcSumaAsegurada: {
      AMPLIA: "$3,000,000",
      LIMITADA: "$2,000,000",
      RC: "$1,500,000",
    },
    gastosMedicos: "$200,000",
  },
});
