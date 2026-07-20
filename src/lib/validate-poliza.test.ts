import { describe, expect, it } from "vitest";
import { parsePolizaInput } from "./validate-poliza";

function validoBase() {
  return {
    numeroPoliza: "POL-001",
    ramo: "Autos",
    aseguradora: "Quálitas",
    asegurado: "Juan Pérez",
    primaNeta: 1000,
    primaTotal: 1160,
    vigenciaInicio: "2025-01-01",
    vigenciaFin: "2026-01-01",
  };
}

describe("parsePolizaInput - casos válidos", () => {
  it("acepta y normaliza un cuerpo válido", () => {
    const r = parsePolizaInput(validoBase());
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({
      numeroPoliza: "POL-001",
      ramo: "Autos",
      aseguradora: "Quálitas",
      asegurado: "Juan Pérez",
      primaNeta: 1000,
      primaTotal: 1160,
    });
  });

  it("recorta espacios en los campos de texto", () => {
    const r = parsePolizaInput({
      ...validoBase(),
      numeroPoliza: "  POL-002  ",
      asegurado: "  Ana  ",
    });
    expect(r.data?.numeroPoliza).toBe("POL-002");
    expect(r.data?.asegurado).toBe("Ana");
  });

  it("incluye notas recortadas cuando se proporcionan", () => {
    const r = parsePolizaInput({ ...validoBase(), notas: "  renovación  " });
    expect(r.data?.notas).toBe("renovación");
  });

  it("deja notas indefinidas cuando están vacías o en blanco", () => {
    expect(parsePolizaInput({ ...validoBase(), notas: "   " }).data?.notas).toBeUndefined();
    expect(parsePolizaInput({ ...validoBase(), notas: 123 }).data?.notas).toBeUndefined();
    expect(parsePolizaInput(validoBase()).data?.notas).toBeUndefined();
  });

  it("acepta vigencia inicial igual a la final", () => {
    const r = parsePolizaInput({
      ...validoBase(),
      vigenciaInicio: "2025-05-01",
      vigenciaFin: "2025-05-01",
    });
    expect(r.error).toBeNull();
  });

  it("acepta primas en cero", () => {
    const r = parsePolizaInput({ ...validoBase(), primaNeta: 0, primaTotal: 0 });
    expect(r.error).toBeNull();
    expect(r.data?.primaNeta).toBe(0);
  });

  it("convierte primas numéricas en texto", () => {
    const r = parsePolizaInput({ ...validoBase(), primaNeta: "1500", primaTotal: "1740" });
    expect(r.data?.primaNeta).toBe(1500);
    expect(r.data?.primaTotal).toBe(1740);
  });
});

describe("parsePolizaInput - cuerpos inválidos", () => {
  it("rechaza valores no-objeto", () => {
    for (const body of [null, undefined, "x", 42, true]) {
      const r = parsePolizaInput(body);
      expect(r.data).toBeNull();
      expect(r.error).toBe("Solicitud inválida.");
    }
  });
});

describe("parsePolizaInput - campos obligatorios", () => {
  const casos: [string, Record<string, unknown>, string][] = [
    ["numeroPoliza", { numeroPoliza: "" }, "El número de póliza es obligatorio."],
    ["ramo", { ramo: "" }, "El ramo es obligatorio."],
    ["aseguradora", { aseguradora: "  " }, "La aseguradora es obligatoria."],
    ["asegurado", { asegurado: "" }, "El asegurado es obligatorio."],
  ];
  it.each(casos)("rechaza %s vacío", (_campo, override, mensaje) => {
    const r = parsePolizaInput({ ...validoBase(), ...override });
    expect(r.data).toBeNull();
    expect(r.error).toBe(mensaje);
  });
});

describe("parsePolizaInput - primas inválidas", () => {
  it("rechaza prima neta no numérica o negativa", () => {
    expect(parsePolizaInput({ ...validoBase(), primaNeta: "abc" }).error).toBe(
      "La prima neta no es válida.",
    );
    expect(parsePolizaInput({ ...validoBase(), primaNeta: -1 }).error).toBe(
      "La prima neta no es válida.",
    );
  });

  it("rechaza prima total no numérica o negativa", () => {
    expect(parsePolizaInput({ ...validoBase(), primaTotal: NaN }).error).toBe(
      "La prima total no es válida.",
    );
    expect(parsePolizaInput({ ...validoBase(), primaTotal: -0.01 }).error).toBe(
      "La prima total no es válida.",
    );
  });
});

describe("parsePolizaInput - vigencias inválidas", () => {
  it("rechaza formatos de fecha inválidos", () => {
    expect(parsePolizaInput({ ...validoBase(), vigenciaInicio: "01-01-2025" }).error).toBe(
      "La vigencia inicial no es válida.",
    );
    expect(parsePolizaInput({ ...validoBase(), vigenciaFin: "2026/01/01" }).error).toBe(
      "La vigencia final no es válida.",
    );
  });

  it("rechaza vigencia final anterior a la inicial", () => {
    const r = parsePolizaInput({
      ...validoBase(),
      vigenciaInicio: "2026-01-01",
      vigenciaFin: "2025-01-01",
    });
    expect(r.error).toBe("La vigencia final no puede ser anterior a la inicial.");
  });
});
