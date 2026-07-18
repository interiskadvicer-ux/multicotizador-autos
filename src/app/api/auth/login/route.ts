import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buscarUsuarioPorEmail, verifyPassword } from "@/lib/auth";
import { crearToken, COOKIE_SESION, MAX_AGE_SESION } from "@/lib/session";
import { registrarActividad } from "@/lib/activity";
import type { Rol } from "@/domain/admin";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Correo y contraseña son obligatorios." },
      { status: 400 },
    );
  }

  const row = buscarUsuarioPorEmail(email);
  const ok = row ? await verifyPassword(password, row.password_hash) : false;

  if (!row || !ok) {
    return NextResponse.json(
      { error: "Correo o contraseña incorrectos." },
      { status: 401 },
    );
  }
  if (row.activo !== 1) {
    return NextResponse.json(
      { error: "Tu cuenta está desactivada. Contacta al administrador." },
      { status: 403 },
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
