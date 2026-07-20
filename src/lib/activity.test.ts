import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { listarActividad, registrarActividad } from "./activity";

function seedUsuario(email: string): number {
  const info = db
    .prepare("INSERT INTO users (email, nombre, password_hash, rol) VALUES (?, ?, ?, ?)")
    .run(email, email, "hash", "COTIZADOR");
  return Number(info.lastInsertRowid);
}

let u1: number;
let u2: number;

beforeEach(() => {
  db.exec("DELETE FROM activity_logs; DELETE FROM users;");
  u1 = seedUsuario("u1@x.com");
  u2 = seedUsuario("u2@x.com");
});

describe("registrarActividad", () => {
  it("registra una actividad con usuario, acción y detalle", () => {
    registrarActividad({ id: u1, email: "u1@x.com" }, "LOGIN", "sesión iniciada");
    const [r] = listarActividad();
    expect(r).toMatchObject({
      usuarioId: u1,
      usuarioEmail: "u1@x.com",
      accion: "LOGIN",
      detalle: "sesión iniciada",
    });
  });

  it("usa detalle vacío por defecto y admite usuarioId nulo", () => {
    registrarActividad({ id: null, email: "anon@x.com" }, "INTENTO_LOGIN");
    const [r] = listarActividad();
    expect(r.usuarioId).toBeNull();
    expect(r.detalle).toBe("");
  });

  it("nunca lanza aunque la acción sea inválida para el esquema", () => {
    // accion NOT NULL: pasar undefined provoca un fallo que debe silenciarse.
    expect(() =>
      registrarActividad({ id: u1, email: "u1@x.com" }, undefined as unknown as string),
    ).not.toThrow();
  });
});

describe("listarActividad", () => {
  beforeEach(() => {
    registrarActividad({ id: u1, email: "u1@x.com" }, "A", "");
    registrarActividad({ id: u2, email: "u2@x.com" }, "B", "");
    registrarActividad({ id: u1, email: "u1@x.com" }, "C", "");
  });

  it("devuelve todos los registros sin filtros", () => {
    expect(listarActividad()).toHaveLength(3);
  });

  it("filtra por usuarioId", () => {
    const r = listarActividad({ usuarioId: u1 });
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.usuarioId === u1)).toBe(true);
  });

  it("respeta el límite", () => {
    expect(listarActividad({ limite: 1 })).toHaveLength(1);
  });

  it("filtra por rango de fechas", () => {
    expect(listarActividad({ desde: "3000-01-01" })).toHaveLength(0);
    expect(listarActividad({ hasta: "3000-01-01" })).toHaveLength(3);
  });
});
