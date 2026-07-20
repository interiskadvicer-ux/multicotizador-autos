import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buscarUsuarioPorEmail, verifyPassword } from "@/lib/auth";
import { crearToken, COOKIE_SESION, MAX_AGE_SESION } from "@/lib/session";
import { registrarActividad } from "@/lib/activity";
import type { Rol } from "@/domain/admin";
import { jsonError, parseJsonBody } from "@/lib/http";

export async function POST(req: Request) {
  const { data: body, error: bodyError } = await parseJsonBody<{
    email?: string;
    password?: string;
  }>(req);
  if (bodyError) return bodyError;

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return jsonError("Correo y contraseña son obligatorios.", 400);
  }

  const row = buscarUsuarioPorEmail(email);
  const ok = row ? await verifyPassword(password, row.password_hash) : false;

  if (!row || !ok) {
    return jsonError("Correo o contraseña incorrectos.", 401);
  }
  if (row.activo !== 1) {
    return jsonError(
      "Tu cuenta está desactivada. Contacta al administrador.",
      403,
    );
  }

  const sesion = {
    id: row.id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol as Rol,
  };
  const token = await crearToken(sesion);

  cookies().set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SESION,
  });

  registrarActividad(sesion, "LOGIN", "Inicio de sesión");

  return NextResponse.json({ usuario: sesion });
}
