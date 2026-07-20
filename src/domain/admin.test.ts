import { describe, expect, it } from "vitest";
import { RAMOS, ROLES, type Rol } from "./admin";

describe("ROLES", () => {
  it("define los tres roles con etiqueta y descripción", () => {
    expect(ROLES.map((r) => r.value)).toEqual(["ADMIN", "POLIZAS", "COTIZADOR"] satisfies Rol[]);
    for (const r of ROLES) {
      expect(r.label).toBeTruthy();
      expect(r.descripcion).toBeTruthy();
    }
  });
});

describe("RAMOS", () => {
  it("incluye ramos comunes del mercado", () => {
    expect(RAMOS).toContain("Autos");
    expect(RAMOS).toContain("Vida");
    expect(RAMOS.length).toBeGreaterThan(3);
  });
});
