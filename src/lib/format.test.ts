import { describe, expect, it } from "vitest";
import { formatMXN } from "./format";

describe("formatMXN", () => {
  it("formatea enteros como pesos mexicanos con 2 decimales", () => {
    const s = formatMXN(1234);
    expect(s).toContain("1,234.00");
    expect(s).toContain("$");
  });

  it("formatea cero", () => {
    expect(formatMXN(0)).toContain("0.00");
  });

  it("redondea a 2 decimales", () => {
    expect(formatMXN(9.999)).toContain("10.00");
    expect(formatMXN(2.5)).toContain("2.50");
  });

  it("formatea montos negativos", () => {
    const s = formatMXN(-1500.5);
    expect(s).toContain("1,500.50");
    expect(s).toMatch(/-|\(/);
  });

  it("agrupa miles en cantidades grandes", () => {
    expect(formatMXN(1234567.89)).toContain("1,234,567.89");
  });
});
