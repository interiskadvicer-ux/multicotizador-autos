import { describe, expect, it } from "vitest";
import type { CotizacionRequest } from "@/domain/types";
import { ADAPTERS, ASEGURADORAS } from "./registry";

function requestBase(): CotizacionRequest {
  return {
    vehiculo: {
      marca: "Toyota",
      modelo: "Corolla",
      anio: 2021,
      version: "LE",
      uso: "PARTICULAR",
      cp: "01000",
    },
    conductor: { nombre: "Ana", fechaNacimiento: "1988-06-15", genero: "F", cp: "01000" },
    paquete: "AMPLIA",
    formaPago: "CONTADO",
  };
}

describe("ADAPTERS", () => {
  it("registra las 8 aseguradoras esperadas", () => {
    expect(ADAPTERS).toHaveLength(8);
    expect(ADAPTERS.map((a) => a.id)).toEqual([
      "qualitas",
      "banorte",
      "hdi",
      "zurich",
      "gnp",
      "elpotosi",
      "afirme",
      "atlas",
    ]);
  });

  it("cada adaptador tiene id, nombre y descuento por defecto en rango", () => {
    for (const a of ADAPTERS) {
      expect(a.id).toBeTruthy();
      expect(a.nombre).toBeTruthy();
      expect(a.descuentoDefault).toBeGreaterThanOrEqual(0);
      expect(a.descuentoDefault).toBeLessThanOrEqual(100);
      expect(typeof a.cotizar).toBe("function");
    }
  });

  it("no hay ids duplicados", () => {
    const ids = ADAPTERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada adaptador cotiza y reporta su propio id", async () => {
    const resultados = await Promise.all(ADAPTERS.map((a) => a.cotizar(requestBase())));
    resultados.forEach((r, i) => {
      expect(r.aseguradoraId).toBe(ADAPTERS[i].id);
      expect(r.aseguradora).toBe(ADAPTERS[i].nombre);
      expect(r.status).toBe("success");
      expect(r.prima?.primaTotal).toBeGreaterThan(0);
    });
  });
});

describe("ASEGURADORAS", () => {
  it("expone el resumen público de cada aseguradora", () => {
    expect(ASEGURADORAS).toHaveLength(ADAPTERS.length);
    expect(ASEGURADORAS[0]).toEqual({
      id: ADAPTERS[0].id,
      nombre: ADAPTERS[0].nombre,
      descuentoDefault: ADAPTERS[0].descuentoDefault,
    });
    expect(ASEGURADORAS[0]).not.toHaveProperty("cotizar");
  });
});
