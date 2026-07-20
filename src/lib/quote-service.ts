import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import type { InsurerAdapter } from "@/insurers/types";
import { ADAPTERS } from "@/insurers/registry";

const TIMEOUT_MS = 15_000;

function resultadoError(
  adapter: InsurerAdapter,
  paquete: CotizacionRequest["paquete"],
  mensaje: string,
): CotizacionResultado {
  return {
    aseguradoraId: adapter.id,
    aseguradora: adapter.nombre,
    status: "error",
    paquete,
    moneda: "MXN",
    coberturas: [],
    error: mensaje,
  };
}

// Cotiza con una aseguradora acotando el tiempo de respuesta. Nunca rechaza:
// tanto el timeout como un error del adaptador se convierten en un resultado
// con status "error", de modo que una falla no tumba al resto ni deja una
// promesa rechazada sin manejar.
function cotizarConTimeout(
  adapter: InsurerAdapter,
  request: CotizacionRequest,
): Promise<CotizacionResultado> {
  const timeout = new Promise<CotizacionResultado>((resolve) =>
    setTimeout(
      () =>
        resolve(
          resultadoError(
            adapter,
            request.paquete,
            "Tiempo de espera agotado al consultar el web service.",
          ),
        ),
      TIMEOUT_MS,
    ),
  );

  const cotizacion = adapter
    .cotizar(request)
    .catch((err): CotizacionResultado => {
      // El error del adaptador se propaga al cliente vía el resultado, pero
      // también se registra en el servidor para no perder la causa raíz.
      console.error(
        `[quote-service] Falló la cotización de ${adapter.nombre} (${adapter.id}):`,
        err,
      );
      return resultadoError(
        adapter,
        request.paquete,
        err instanceof Error ? err.message : "Error desconocido.",
      );
    });

  return Promise.race([cotizacion, timeout]);
}

// Consulta todas las aseguradoras en paralelo. Una falla no tumba al resto.
export async function cotizarTodas(
  request: CotizacionRequest,
): Promise<CotizacionResultado[]> {
  const resultados = await Promise.all(
    ADAPTERS.map((adapter) => cotizarConTimeout(adapter, request)),
  );

  // Ordena: primero las exitosas por prima ascendente, luego las que fallaron.
  return resultados.sort((a, b) => {
    if (a.status !== b.status) return a.status === "success" ? -1 : 1;
    const pa = a.prima?.primaTotal ?? Infinity;
    const pb = b.prima?.primaTotal ?? Infinity;
    return pa - pb;
  });
}
