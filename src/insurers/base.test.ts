import { describe, expect, it } from "vitest";
import type { CotizacionRequest, Paquete } from "@/domain/types";
import {
  construirCoberturas,
  cotizarMock,
  resolverDescuento,
  type PricingConfig,
} from "./base";

const cfg: PricingConfig = {
  factorBase: 1,
  derechos: 500,
  recargoFraccionado: { CONTADO: 0, MENSUAL: 0.1 },
  rcSumaAsegurada: { AMPLIA: "$3,000,000", LIMITADA: "$2,000,000", RC: "$1,500,000" },
  gastosMedicos: "$200,000",
  deducibleDanos: "5%",
  deducibleRobo: "10%",
};

function coberturaPorNombre(paquete: Paquete, nombre: string) {
  return construirCoberturas(cfg, paquete).find((c) => c.nombre === nombre)!;
}

function requestBase(overrides: Partial<CotizacionRequest> = {}): CotizacionRequest {
  return {
    vehiculo: {
      marca: "Nissan",
      modelo: "Versa",
      anio: 2022,
      version: "Sense",
      uso: "PARTICULAR",
      valorFactura: 300_000,
      cp: "64000",
    },
    conductor: {
      nombre: "Juan",
      fechaNacimiento: "1990-01-01",
      genero: "M",
      cp: "64000",
    },
    paquete: "AMPLIA",
    formaPago: "CONTADO",
    ...overrides,
  };
}

describe("construirCoberturas", () => {
  it("AMPLIA incluye daños materiales, robo, RC, gastos médicos y asistencia", () => {
    expect(coberturaPorNombre("AMPLIA", "Daños Materiales").incluida).toBe(true);
    expect(coberturaPorNombre("AMPLIA", "Daños Materiales").deducible).toBe("5%");
    expect(coberturaPorNombre("AMPLIA", "Robo Total").incluida).toBe(true);
    expect(coberturaPorNombre("AMPLIA", "Gastos Médicos Ocupantes").incluida).toBe(true);
    expect(coberturaPorNombre("AMPLIA", "Asistencia Vial y Legal").incluida).toBe(true);
  });

  it("LIMITADA excluye daños materiales pero incluye robo", () => {
    expect(coberturaPorNombre("LIMITADA", "Daños Materiales").incluida).toBe(false);
    expect(coberturaPorNombre("LIMITADA", "Daños Materiales").deducible).toBe("N/A");
    expect(coberturaPorNombre("LIMITADA", "Robo Total").incluida).toBe(true);
    expect(coberturaPorNombre("LIMITADA", "Robo Total").deducible).toBe("10%");
  });

  it("RC solo incluye RC y Defensa Jurídica", () => {
    expect(coberturaPorNombre("RC", "Daños Materiales").incluida).toBe(false);
    expect(coberturaPorNombre("RC", "Robo Total").incluida).toBe(false);
    expect(coberturaPorNombre("RC", "Gastos Médicos Ocupantes").incluida).toBe(false);
    expect(coberturaPorNombre("RC", "Asistencia Vial y Legal").incluida).toBe(false);
    expect(coberturaPorNombre("RC", "Responsabilidad Civil").incluida).toBe(true);
    expect(coberturaPorNombre("RC", "Defensa Jurídica").incluida).toBe(true);
  });

  it("usa la suma asegurada de RC configurada por paquete", () => {
    expect(coberturaPorNombre("AMPLIA", "Responsabilidad Civil").sumaAsegurada).toBe("$3,000,000");
    expect(coberturaPorNombre("RC", "Responsabilidad Civil").sumaAsegurada).toBe("$1,500,000");
  });
});

describe("resolverDescuento", () => {
  it("usa el descuento por defecto cuando la solicitud no trae ninguno", () => {
    expect(resolverDescuento(requestBase(), "qualitas", 40)).toBe(40);
  });

  it("prioriza el descuento enviado por aseguradora", () => {
    const req = requestBase({ descuentos: { qualitas: 25 } });
    expect(resolverDescuento(req, "qualitas", 40)).toBe(25);
  });

  it("acepta un descuento de 0 explícito de la solicitud", () => {
    const req = requestBase({ descuentos: { qualitas: 0 } });
    expect(resolverDescuento(req, "qualitas", 40)).toBe(0);
  });

  it("recae en el default si el valor es NaN o de otra aseguradora", () => {
    expect(resolverDescuento(requestBase({ descuentos: { qualitas: NaN } }), "qualitas", 40)).toBe(40);
    expect(resolverDescuento(requestBase({ descuentos: { hdi: 10 } }), "qualitas", 40)).toBe(40);
  });
});

describe("cotizarMock", () => {
  it("devuelve una cotización exitosa con desglose y coberturas", async () => {
    const r = await cotizarMock("qualitas", "Quálitas", cfg, requestBase(), 0);
    expect(r.status).toBe("success");
    expect(r.aseguradoraId).toBe("qualitas");
    expect(r.moneda).toBe("MXN");
    expect(r.coberturas.length).toBeGreaterThan(0);
    expect(r.vigencia?.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof r.tiempoRespuestaMs).toBe("number");
    expect(r.prima).toBeDefined();
  });

  it("mantiene la relación IVA/subtotal en el desglose de prima", async () => {
    const { prima } = await cotizarMock("qualitas", "Quálitas", cfg, requestBase(), 0);
    const p = prima!;
    const subtotal = p.primaNeta + p.recargoPagoFraccionado + p.derechos;
    expect(p.iva).toBeCloseTo(subtotal * 0.16, 1);
    expect(p.primaTotal).toBeCloseTo(subtotal * 1.16, 1);
    expect(p.derechos).toBe(500);
  });

  it("aplica el descuento comercial sobre la prima neta", async () => {
    const { prima } = await cotizarMock("qualitas", "Quálitas", cfg, requestBase(), 20);
    const p = prima!;
    expect(p.descuentoPorcentaje).toBe(20);
    expect(p.descuentoMonto).toBeCloseTo(p.primaNetaSinDescuento * 0.2, 2);
    expect(p.primaNeta).toBeCloseTo(p.primaNetaSinDescuento * 0.8, 2);
  });

  it("acota el descuento al rango 0-100", async () => {
    const alto = await cotizarMock("q", "Q", cfg, requestBase(), 150);
    expect(alto.prima!.descuentoPorcentaje).toBe(100);
    const bajo = await cotizarMock("q", "Q", cfg, requestBase(), -30);
    expect(bajo.prima!.descuentoPorcentaje).toBe(0);
  });

  it("aplica el piso mínimo por paquete a autos de bajo valor", async () => {
    const req = requestBase({ paquete: "RC" });
    req.vehiculo.valorFactura = 1;
    const { prima } = await cotizarMock("q", "Q", cfg, req, 0);
    expect(prima!.primaNetaSinDescuento).toBeGreaterThanOrEqual(1500);
  });

  it("agrega recargo por pago fraccionado", async () => {
    const contado = await cotizarMock("q", "Q", cfg, requestBase({ formaPago: "CONTADO" }), 0);
    const mensual = await cotizarMock("q", "Q", cfg, requestBase({ formaPago: "MENSUAL" }), 0);
    expect(contado.prima!.recargoPagoFraccionado).toBe(0);
    expect(mensual.prima!.recargoPagoFraccionado).toBeGreaterThan(0);
  });
});
