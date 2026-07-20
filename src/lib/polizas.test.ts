import { beforeEach, describe, expect, it } from "vitest";
import type { PolizaInput } from "@/domain/admin";
import { db } from "@/lib/db";
import {
  actualizarPoliza,
  crearPoliza,
  eliminarPoliza,
  estadoVigencia,
  listarPolizas,
  listarPolizasConEstado,
  obtenerPoliza,
  vencimientos,
} from "./polizas";

const HOY = new Date(2025, 5, 15); // 15 de junio de 2025

describe("estadoVigencia", () => {
  it.each([
    ["2025-06-10", "VENCIDA", -5],
    ["2025-06-15", "POR_VENCER", 0],
    ["2025-07-15", "POR_VENCER", 30],
    ["2025-07-16", "PROXIMA", 31],
    ["2025-08-14", "PROXIMA", 60],
    ["2025-08-15", "VIGENTE", 61],
  ] as const)("clasifica %s como %s", (fin, estado, dias) => {
    const r = estadoVigencia(fin, HOY);
    expect(r.estado).toBe(estado);
    expect(r.diasParaVencer).toBe(dias);
  });
});

function seedUsuario(): number {
  const info = db
    .prepare(
      "INSERT INTO users (email, nombre, password_hash, rol) VALUES (?, ?, ?, ?)",
    )
    .run("gestor@x.com", "Gestor", "hash", "POLIZAS");
  return Number(info.lastInsertRowid);
}

function input(overrides: Partial<PolizaInput> = {}): PolizaInput {
  return {
    numeroPoliza: "POL-100",
    ramo: "Autos",
    aseguradora: "Quálitas",
    asegurado: "Cliente",
    primaNeta: 1000,
    primaTotal: 1160,
    vigenciaInicio: "2025-01-01",
    vigenciaFin: "2026-01-01",
    ...overrides,
  };
}

describe("CRUD de pólizas", () => {
  let userId: number;

  beforeEach(() => {
    db.exec("DELETE FROM policies; DELETE FROM users;");
    userId = seedUsuario();
  });

  it("crea y recupera una póliza normalizando espacios", () => {
    const creada = crearPoliza(input({ numeroPoliza: "  POL-1  ", notas: "  hola  " }), userId);
    expect(creada.id).toBeGreaterThan(0);
    expect(creada.numeroPoliza).toBe("POL-1");
    expect(creada.notas).toBe("hola");
    expect(creada.createdBy).toBe(userId);

    const recuperada = obtenerPoliza(creada.id);
    expect(recuperada).toMatchObject({ numeroPoliza: "POL-1", ramo: "Autos" });
  });

  it("guarda notas vacías como undefined", () => {
    const creada = crearPoliza(input({ notas: "   " }), userId);
    expect(creada.notas).toBeUndefined();
  });

  it("devuelve null al buscar una póliza inexistente", () => {
    expect(obtenerPoliza(9999)).toBeNull();
  });

  it("lista las pólizas ordenadas por vigencia fin ascendente", () => {
    crearPoliza(input({ numeroPoliza: "B", vigenciaFin: "2026-12-01" }), userId);
    crearPoliza(input({ numeroPoliza: "A", vigenciaFin: "2026-01-01" }), userId);
    const nums = listarPolizas().map((p) => p.numeroPoliza);
    expect(nums).toEqual(["A", "B"]);
  });

  it("actualiza una póliza existente", () => {
    const creada = crearPoliza(input(), userId);
    const actualizada = actualizarPoliza(creada.id, input({ asegurado: "Nuevo", primaTotal: 2000 }));
    expect(actualizada?.asegurado).toBe("Nuevo");
    expect(actualizada?.primaTotal).toBe(2000);
  });

  it("devuelve null al actualizar una póliza inexistente", () => {
    expect(actualizarPoliza(9999, input())).toBeNull();
  });

  it("elimina una póliza y devuelve el resultado", () => {
    const creada = crearPoliza(input(), userId);
    expect(eliminarPoliza(creada.id)).toBe(true);
    expect(obtenerPoliza(creada.id)).toBeNull();
    expect(eliminarPoliza(creada.id)).toBe(false);
  });
});

describe("estado y vencimientos", () => {
  let userId: number;
  beforeEach(() => {
    db.exec("DELETE FROM policies; DELETE FROM users;");
    userId = seedUsuario();
  });

  it("listarPolizasConEstado agrega estado y días", () => {
    crearPoliza(input(), userId);
    const [p] = listarPolizasConEstado();
    expect(p).toHaveProperty("estado");
    expect(p).toHaveProperty("diasParaVencer");
  });

  it("vencimientos excluye las vigentes y ordena por urgencia", () => {
    const lejana = new Date();
    lejana.setFullYear(lejana.getFullYear() + 5);
    crearPoliza(input({ numeroPoliza: "VIGENTE", vigenciaFin: lejana.toISOString().slice(0, 10) }), userId);
    crearPoliza(input({ numeroPoliza: "VENCIDA", vigenciaFin: "2000-01-01" }), userId);

    const v = vencimientos();
    expect(v.map((p) => p.numeroPoliza)).toContain("VENCIDA");
    expect(v.map((p) => p.numeroPoliza)).not.toContain("VIGENTE");
  });
});
