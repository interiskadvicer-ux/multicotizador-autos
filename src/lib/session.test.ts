import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SesionUsuario } from "@/domain/admin";
import { COOKIE_SESION, MAX_AGE_SESION, crearToken, verificarToken } from "./session";

const sesion: SesionUsuario = {
  id: 7,
  email: "admin@interiskad.com",
  nombre: "Admin",
  rol: "ADMIN",
};

describe("constantes de sesión", () => {
  it("expone el nombre de la cookie y la duración (8 horas)", () => {
    expect(COOKIE_SESION).toBe("cotizador_sesion");
    expect(MAX_AGE_SESION).toBe(60 * 60 * 8);
  });
});

describe("crearToken / verificarToken", () => {
  it("crea un JWT firmado y lo verifica de ida y vuelta", async () => {
    const token = await crearToken(sesion);
    expect(token.split(".")).toHaveLength(3);

    const recuperada = await verificarToken(token);
    expect(recuperada).toEqual(sesion);
  });

  it("devuelve null para un token con formato inválido", async () => {
    expect(await verificarToken("no-es-un-jwt")).toBeNull();
  });

  it("devuelve null cuando la firma no coincide (otro secreto)", async () => {
    const token = await crearToken(sesion);
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "otro-secreto-completamente-distinto";
    try {
      expect(await verificarToken(token)).toBeNull();
    } finally {
      process.env.AUTH_SECRET = original;
    }
  });
});

describe("validación del secreto", () => {
  const original = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = original;
  });
  afterEach(() => {
    process.env.AUTH_SECRET = original;
  });

  it("lanza error si AUTH_SECRET falta o es demasiado corto", async () => {
    process.env.AUTH_SECRET = "corto";
    await expect(crearToken(sesion)).rejects.toThrow(/AUTH_SECRET/);

    delete process.env.AUTH_SECRET;
    await expect(crearToken(sesion)).rejects.toThrow(/AUTH_SECRET/);
  });
});
