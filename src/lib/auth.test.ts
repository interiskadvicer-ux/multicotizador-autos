import { beforeEach, describe, expect, it, vi } from "vitest";

// Cookie controlable para probar getSesion sin un servidor Next real.
const cookieState = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === "cotizador_sesion" && cookieState.token
        ? { value: cookieState.token }
        : undefined,
  }),
}));

import { db } from "@/lib/db";
import { crearToken } from "@/lib/session";
import {
  actualizarUsuario,
  buscarUsuarioPorEmail,
  contarUsuarios,
  crearUsuario,
  getSesion,
  hashPassword,
  listarUsuarios,
  obtenerUsuario,
  tieneAcceso,
  verifyPassword,
} from "./auth";

beforeEach(() => {
  db.exec("DELETE FROM users;");
  cookieState.token = undefined;
});

describe("hash de contraseñas", () => {
  it("hashea y verifica correctamente", async () => {
    const hash = await hashPassword("secreta123");
    expect(hash).not.toBe("secreta123");
    expect(await verifyPassword("secreta123", hash)).toBe(true);
    expect(await verifyPassword("incorrecta", hash)).toBe(false);
  });
});

describe("gestión de usuarios", () => {
  it("crea un usuario normalizando email y nombre", async () => {
    const u = await crearUsuario({
      email: "  ADMIN@X.com ",
      nombre: "  Admin ",
      password: "pw123456",
      rol: "ADMIN",
    });
    expect(u.email).toBe("admin@x.com");
    expect(u.nombre).toBe("Admin");
    expect(u.rol).toBe("ADMIN");
    expect(u.activo).toBe(true);
    expect(contarUsuarios()).toBe(1);
  });

  it("busca por email sin distinguir mayúsculas", async () => {
    await crearUsuario({ email: "user@x.com", nombre: "U", password: "pw123456", rol: "COTIZADOR" });
    expect(buscarUsuarioPorEmail("USER@X.COM")?.email).toBe("user@x.com");
    expect(buscarUsuarioPorEmail("nadie@x.com")).toBeUndefined();
  });

  it("crea usuarios inactivos cuando activo=false", async () => {
    const u = await crearUsuario({
      email: "off@x.com",
      nombre: "Off",
      password: "pw123456",
      rol: "POLIZAS",
      activo: false,
    });
    expect(u.activo).toBe(false);
  });

  it("lista usuarios y obtiene por id", async () => {
    await crearUsuario({ email: "a@x.com", nombre: "A", password: "pw123456", rol: "ADMIN" });
    const lista = listarUsuarios();
    expect(lista).toHaveLength(1);
    expect(obtenerUsuario(lista[0].id)?.email).toBe("a@x.com");
    expect(obtenerUsuario(9999)).toBeNull();
  });

  it("actualiza nombre, rol y estado sin tocar la contraseña", async () => {
    const u = await crearUsuario({ email: "b@x.com", nombre: "B", password: "pw123456", rol: "COTIZADOR" });
    const upd = await actualizarUsuario(u.id, { nombre: "B2", rol: "ADMIN", activo: false });
    expect(upd).toMatchObject({ nombre: "B2", rol: "ADMIN", activo: false });
    // La contraseña anterior sigue siendo válida.
    expect(await verifyPassword("pw123456", buscarUsuarioPorEmail("b@x.com")!.password_hash)).toBe(true);
  });

  it("actualiza la contraseña cuando se envía", async () => {
    const u = await crearUsuario({ email: "c@x.com", nombre: "C", password: "old12345", rol: "ADMIN" });
    await actualizarUsuario(u.id, { password: "new12345" });
    const row = buscarUsuarioPorEmail("c@x.com")!;
    expect(await verifyPassword("new12345", row.password_hash)).toBe(true);
    expect(await verifyPassword("old12345", row.password_hash)).toBe(false);
  });

  it("devuelve null al actualizar un usuario inexistente", async () => {
    expect(await actualizarUsuario(9999, { nombre: "X" })).toBeNull();
  });
});

describe("tieneAcceso", () => {
  it("comprueba pertenencia del rol a la lista permitida", () => {
    expect(tieneAcceso("ADMIN", ["ADMIN"])).toBe(true);
    expect(tieneAcceso("COTIZADOR", ["ADMIN", "POLIZAS"])).toBe(false);
  });
});

describe("getSesion", () => {
  it("devuelve null cuando no hay cookie", async () => {
    expect(await getSesion()).toBeNull();
  });

  it("devuelve null cuando el token es inválido", async () => {
    cookieState.token = "token-basura";
    expect(await getSesion()).toBeNull();
  });

  it("devuelve la sesión de un usuario activo con token válido", async () => {
    const u = await crearUsuario({ email: "s@x.com", nombre: "S", password: "pw123456", rol: "ADMIN" });
    cookieState.token = await crearToken({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol });
    const sesion = await getSesion();
    expect(sesion).toMatchObject({ id: u.id, email: "s@x.com", rol: "ADMIN" });
  });

  it("devuelve null si el usuario del token está inactivo", async () => {
    const u = await crearUsuario({ email: "d@x.com", nombre: "D", password: "pw123456", rol: "ADMIN", activo: false });
    cookieState.token = await crearToken({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol });
    expect(await getSesion()).toBeNull();
  });
});
