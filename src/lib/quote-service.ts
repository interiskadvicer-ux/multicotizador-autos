import type {
  CotizacionRequest,
  CotizacionResultado,
  Paquete,
} from "@/domain/types";
import { ADAPTERS } from "@/insurers/registry";

const TIMEOUT_MS = 15_000;

function withTimeout(
  adapterId: string,
  aseguradora: string,
  paquete: CotizacionRequest["paquete"],
  promise: Promise<CotizacionResultado>,
  timeoutMs: number,
): Promise<CotizacionResultado> {
  const timeout = new Promise<CotizacionResultado>((resolve) =>
    setTimeout(
      () =>
        resolve({
          aseguradoraId: adapterId,
          aseguradora,
          status: "error",
          paquete,
          moneda: "MXN",
          coberturas: [],
          error: "Tiempo de espera agotado al consultar el web service.",
        }),
      timeoutMs,
    ),
  );
  return Promise.race([promise, timeout]);
}

// Consulta todas las aseguradoras en paralelo. Una falla no tumba al resto.
export async function cotizarTodas(
  request: CotizacionRequest,
): Promise<CotizacionResultado[]> {
  const filtro = request.aseguradoras;
  const adapters = filtro?.length
    ? ADAPTERS.filter((a) => filtro.includes(a.id))
    : ADAPTERS;
  const resultados = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        return await withTimeout(
          adapter.id,
          adapter.nombre,
          request.paquete,
          adapter.cotizar(request),
          adapter.timeoutMs ?? TIMEOUT_MS,
        );
      } catch (err) {
        return {
          aseguradoraId: adapter.id,
          aseguradora: adapter.nombre,
          status: "error" as const,
          paquete: request.paquete,
          moneda: "MXN" as const,
          coberturas: [],
          error: err instanceof Error ? err.message : "Error desconocido.",
        };
      }
    }),
  );

  // Ordena: primero las exitosas por prima ascendente, luego las que fallaron.
  return resultados.sort((a, b) => {
    if (a.status !== b.status) return a.status === "success" ? -1 : 1;
    const pa = a.prima?.primaTotal ?? Infinity;
    const pb = b.prima?.primaTotal ?? Infinity;
    return pa - pb;
  });
}

// Cotiza cada paquete solicitado (`paquetes`, o solo `paquete`) con todas las
// aseguradoras. Devuelve la lista plana; cada resultado trae su `paquete`.
export async function cotizarPaquetes(
  request: CotizacionRequest,
): Promise<CotizacionResultado[]> {
  const paquetes: Paquete[] = request.paquetes?.length
    ? Array.from(new Set(request.paquetes))
    : [request.paquete];
  const porPaquete = await Promise.all(
    paquetes.map((paquete) => cotizarTodas({ ...request, paquete })),
  );
  return porPaquete.flat();
}
