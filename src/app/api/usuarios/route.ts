import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  buscarUsuarioPorEmail,
  crearUsuario,
  listarUsuarios,
} from "@/lib/auth";
import { registrarActividad } from "@/lib/activity";
import type { Rol } from "@/domain/admin";

const ROLES_VALIDOS: Rol[] = ["ADMIN", "POLIZAS", "COTIZADOR"];
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  return NextResponse.json({ usuarios: listarUsuarios() });
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  let body: {
    email?: string;
    nombre?: string;
    password?: string;
    rol?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const nombre = (body.nombre ?? "").trim();
  const password = body.password ?? "";
  const rol = body.rol as Rol;

  if (!RE_EMAIL.test(email))
    return NextResponse.json({ error: "Correo no válido." }, { status: 422 });
  if (!nombre)
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 422 });
  if (password.length < 8)
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 422 },
    );
  if (!ROLES_VALIDOS.includes(rol))
    return NextResponse.json({ error: "Rol no válido." }, { status: 422 });
  if (buscarUsuarioPorEmail(email))
    return NextResponse.json(
      { error: "Ya existe un usuario con ese correo." },
      { status: 409 },
    );

  const usuario = await crearUsuario({ email, nombre, password, rol });
  registrarActividad(
    sesion,
    "USUARIO_CREAR",
    `Alta de usuario ${usuario.email} (${usuario.rol})`,
  );
  return NextResponse.json({ usuario }, { status: 201 });
}
