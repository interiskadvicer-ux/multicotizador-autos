import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  buscarUsuarioPorEmail,
  crearUsuario,
  listarUsuarios,
} from "@/lib/auth";
import { registrarActividad } from "@/lib/activity";
import { ROLES_VALIDOS, type Rol } from "@/domain/admin";
import { jsonError, parseJsonBody } from "@/lib/http";

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  return NextResponse.json({ usuarios: listarUsuarios() });
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  const { data: body, error: bodyError } = await parseJsonBody<{
    email?: string;
    nombre?: string;
    password?: string;
    rol?: string;
  }>(req);
  if (bodyError) return bodyError;

  const email = (body.email ?? "").trim().toLowerCase();
  const nombre = (body.nombre ?? "").trim();
  const password = body.password ?? "";
  const rol = body.rol as Rol;

  if (!RE_EMAIL.test(email)) return jsonError("Correo no válido.", 422);
  if (!nombre) return jsonError("El nombre es obligatorio.", 422);
  if (password.length < 8)
    return jsonError("La contraseña debe tener al menos 8 caracteres.", 422);
  if (!ROLES_VALIDOS.includes(rol)) return jsonError("Rol no válido.", 422);
  if (buscarUsuarioPorEmail(email))
    return jsonError("Ya existe un usuario con ese correo.", 409);

  const usuario = await crearUsuario({ email, nombre, password, rol });
  registrarActividad(
    sesion,
    "USUARIO_CREAR",
    `Alta de usuario ${usuario.email} (${usuario.rol})`,
  );
  return NextResponse.json({ usuario }, { status: 201 });
}
