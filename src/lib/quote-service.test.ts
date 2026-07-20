import { afterEach, describe, expect, it, vi } from "vitest";
import type { CotizacionRequest, CotizacionResultado, Paquete } from "@/domain/types";
import type { InsurerAdapter } from "@/insurers/types";

// El registro se sustituye por adaptadores controlados en cada prueba.
const mockAdapters = vi.hoisted(() => ({ list: [] as InsurerAdapter[] }));
vi.mock("@/insurers/registry", () => ({
  get ADAPTERS() {
    return mockAdapters.list;
  },
}));

import { cotizarTodas } from "./quote-service";

const request: CotizacionRequest = {
  vehiculo: { marca: "Kia", modelo: "Rio", anio: 2020, version: "LX", uso: "PARTICULAR", cp: "06000" },
  conductor: { nombre: "Luis", fechaNacimiento: "1985-03-03", genero: "M", cp: "06000" },
  paquete: "AMPLIA",
  formaPago: "CONTADO",
};

function resultadoExito(id: string, primaTotal: number): CotizacionResultado {
  return {
    aseguradoraId: id,
    aseguradora: id.toUpperCase(),
    status: "success",
    paquete: "AMPLIA" as Paquete,
    moneda: "MXN",
    prima: {
      primaNetaSinDescuento: primaTotal,
      descuentoPorcentaje: 0,
      descuentoMonto: 0,
      primaNeta: primaTotal,
      derechos: 0,
      recargoPagoFraccionado: 0,
      iva: 0,
      primaTotal,
    },
    coberturas: [],
  };
}

function adapter(id: string, cotizar: InsurerAdapter["cotizar"]): InsurerAdapter {
  return { id, nombre: id.toUpperCase(), descuentoDefault: 0, cotizar };
}

afterEach(() => {
  mockAdapters.list = [];
  vi.useRealTimers();
});

describe("cotizarTodas", () => {
  it("ordena las exitosas por prima total ascendente", async () => {
    mockAdapters.list = [
      adapter("cara", async () => resultadoExito("cara", 9000)),
      adapter("barata", async () => resultadoExito("barata", 3000)),
      adapter("media", async () => resultadoExito("media", 5000)),
    ];
    const res = await cotizarTodas(request);
    expect(res.map((r) => r.aseguradoraId)).toEqual(["barata", "media", "cara"]);
  });

  it("coloca las cotizaciones con error al final", async () => {
    mockAdapters.list = [
      adapter("falla", async () => ({ ...resultadoExito("falla", 0), status: "error", prima: undefined, error: "ws caído" })),
      adapter("ok", async () => resultadoExito("ok", 4000)),
    ];
    const res = await cotizarTodas(request);
    expect(res[0].aseguradoraId).toBe("ok");
    expect(res[1].status).toBe("error");
  });

  it("captura excepciones de un adaptador sin tumbar al resto", async () => {
    mockAdapters.list = [
      adapter("explota", async () => {
        throw new Error("boom");
      }),
      adapter("ok", async () => resultadoExito("ok", 4000)),
    ];
    const res = await cotizarTodas(request);
    expect(res).toHaveLength(2);
    const explota = res.find((r) => r.aseguradoraId === "explota")!;
    expect(explota.status).toBe("error");
    expect(explota.error).toBe("boom");
  });

  it("usa un mensaje genérico cuando la excepción no es un Error", async () => {
    mockAdapters.list = [
      adapter("raro", async () => {
        throw "cadena";
      }),
    ];
    const [res] = await cotizarTodas(request);
    expect(res.status).toBe("error");
    expect(res.error).toBe("Error desconocido.");
  });

  it("devuelve un error de timeout si el adaptador no responde a tiempo", async () => {
    vi.useFakeTimers();
    mockAdapters.list = [adapter("lento", () => new Promise<CotizacionResultado>(() => {}))];
    const promesa = cotizarTodas(request);
    await vi.advanceTimersByTimeAsync(15_000);
    const [res] = await promesa;
    expect(res.status).toBe("error");
    expect(res.error).toMatch(/Tiempo de espera/);
  });

  it("devuelve arreglo vacío si no hay aseguradoras registradas", async () => {
    mockAdapters.list = [];
    expect(await cotizarTodas(request)).toEqual([]);
  });
});
