import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SesionUsuario } from "@/domain/admin";

const authState = vi.hoisted(() => ({ sesion: null as SesionUsuario | null }));
vi.mock("@/lib/auth", () => ({
  getSesion: async () => authState.sesion,
  tieneAcceso: (rol: string, permitidos: string[]) => permitidos.includes(rol),
}));

import { requireApiSesion } from "./api-auth";

const admin: SesionUsuario = { id: 1, email: "a@x.com", nombre: "A", rol: "ADMIN" };
const cotizador: SesionUsuario = { id: 2, email: "c@x.com", nombre: "C", rol: "COTIZADOR" };

beforeEach(() => {
  authState.sesion = null;
});

describe("requireApiSesion", () => {
  it("responde 401 cuando no hay sesión", async () => {
    const r = await requireApiSesion();
    expect(r.sesion).toBeNull();
    expect(r.error?.status).toBe(401);
  });

  it("permite el paso cuando hay sesión y no se exigen roles", async () => {
    authState.sesion = cotizador;
    const r = await requireApiSesion();
    expect(r.error).toBeNull();
    expect(r.sesion).toEqual(cotizador);
  });

  it("permite el paso cuando el rol está autorizado", async () => {
    authState.sesion = admin;
    const r = await requireApiSesion(["ADMIN", "POLIZAS"]);
    expect(r.error).toBeNull();
    expect(r.sesion).toEqual(admin);
  });

  it("responde 403 cuando el rol no está autorizado", async () => {
    authState.sesion = cotizador;
    const r = await requireApiSesion(["ADMIN"]);
    expect(r.sesion).toBeNull();
    expect(r.error?.status).toBe(403);
  });
});
