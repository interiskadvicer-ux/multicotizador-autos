import { createMockAdapter } from "./base";

// TODO(integración): reemplazar por la llamada real al web service de Seguros
// El Potosí (SOAP): autenticarse con EL_POTOSI_WS_URL / EL_POTOSI_WS_USER /
// EL_POTOSI_WS_PASS, homologar catálogos de marca/modelo/versión, llamar al
// endpoint y mapear la respuesta a `CotizacionResultado`, manejando
// errores/timeouts con { status: "error", error }.
export const elPotosi = createMockAdapter({
  id: "elpotosi",
  nombre: "Seguros El Potosí",
  descuentoDefault: 20,
  pricing: {
    factorBase: 0.9,
    derechos: 480,
    rcSumaAsegurada: {
      AMPLIA: "$3,000,000",
      LIMITADA: "$1,500,000",
      RC: "$1,000,000",
    },
    gastosMedicos: "$150,000",
  },
});
