import { describe, expect, it } from "vitest";
import { ANIOS, FORMAS_PAGO, MARCAS, PAQUETES } from "./catalogs";

describe("MARCAS", () => {
  it("cada marca tiene al menos un modelo", () => {
    const marcas = Object.keys(MARCAS);
    expect(marcas.length).toBeGreaterThan(0);
    for (const marca of marcas) {
      expect(MARCAS[marca].length).toBeGreaterThan(0);
    }
  });
});

describe("ANIOS", () => {
  it("lista 26 años ordenados descendentemente e incluye el próximo año", () => {
    expect(ANIOS).toHaveLength(26);
    const proximo = new Date().getFullYear() + 1;
    expect(ANIOS[0]).toBe(proximo);
    expect(ANIOS[ANIOS.length - 1]).toBe(proximo - 25);
    for (let i = 1; i < ANIOS.length; i++) {
      expect(ANIOS[i]).toBeLessThan(ANIOS[i - 1]);
    }
  });
});

describe("PAQUETES", () => {
  it("contiene los tres paquetes estándar con etiqueta y descripción", () => {
    expect(PAQUETES.map((p) => p.value)).toEqual(["AMPLIA", "LIMITADA", "RC"]);
    for (const p of PAQUETES) {
      expect(p.label).toBeTruthy();
      expect(p.descripcion).toBeTruthy();
    }
  });
});

describe("FORMAS_PAGO", () => {
  it("incluye las cuatro formas de pago con etiqueta", () => {
    expect(FORMAS_PAGO.map((f) => f.value)).toEqual([
      "CONTADO",
      "MENSUAL",
      "TRIMESTRAL",
      "SEMESTRAL",
    ]);
    for (const f of FORMAS_PAGO) expect(f.label).toBeTruthy();
  });
});
