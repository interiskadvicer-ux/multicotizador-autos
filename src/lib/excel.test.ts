import { describe, expect, it } from "vitest";
import type { PolizaConEstado } from "@/lib/polizas";
import type { RegistroActividad } from "@/domain/admin";
import { excelActividad, excelPolizas, nombreArchivo } from "./excel";

function poliza(): PolizaConEstado {
  return {
    id: 1,
    numeroPoliza: "POL-1",
    ramo: "Autos",
    aseguradora: "Quálitas",
    asegurado: "Cliente",
    primaNeta: 1000,
    primaTotal: 1160,
    vigenciaInicio: "2025-01-01",
    vigenciaFin: "2026-01-01",
    notas: undefined,
    createdBy: 1,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    estado: "VIGENTE",
    diasParaVencer: 200,
  };
}

// Firma ZIP: los .xlsx son contenedores zip que empiezan con "PK".
function esXlsx(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf);
  return buf.byteLength > 0 && b[0] === 0x50 && b[1] === 0x4b;
}

describe("excelPolizas", () => {
  it("genera un workbook xlsx válido a partir de pólizas", async () => {
    const buf = await excelPolizas([poliza()]);
    expect(esXlsx(buf)).toBe(true);
  });

  it("funciona con lista vacía", async () => {
    const buf = await excelPolizas([]);
    expect(esXlsx(buf)).toBe(true);
  });
});

describe("excelActividad", () => {
  it("genera un workbook xlsx válido a partir de actividad", async () => {
    const registros: RegistroActividad[] = [
      { id: 1, usuarioId: 1, usuarioEmail: "a@x.com", accion: "LOGIN", detalle: "", createdAt: "2025-01-01" },
    ];
    const buf = await excelActividad(registros);
    expect(esXlsx(buf)).toBe(true);
  });
});

describe("nombreArchivo", () => {
  it("agrega la fecha actual y la extensión xlsx", () => {
    const fecha = new Date().toISOString().slice(0, 10);
    expect(nombreArchivo("polizas")).toBe(`polizas-${fecha}.xlsx`);
  });
});
