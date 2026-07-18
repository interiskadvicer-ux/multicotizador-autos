import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  actualizarUsuario,
  listarUsuarios,
  obtenerUsuario,
} from "@/lib/auth";
import { registrarActividad } from "@/lib/activity";
import type { Rol } from "@/domain/admin";

const ROLES_VALIDOS: Rol[] = ["ADMIN", "POLIZAS", "COTIZADOR"];

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;

  const id = Number(params.id);
  const usuario = Number.isInteger(id) ? obtenerUsuario(id) : null;
  if (!usuario) {
    return NextResponse.json(
      { error: "Usuario no encontrado." },
      { status: 404 },
    );
  }

  let body: {
    nombre?: string;
    rol?: string;
    activo?: boolean;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (body.rol !== undefined && !ROLES_VALIDOS.includes(body.rol as Rol)) {
    return NextResponse.json({ error: "Rol no válido." }, { status: 422 });
  }
  if (body.password !== undefined && body.password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 422 },
    );
  }

  // Evita que el administrador se quede sin acceso: no puede desactivarse
  // ni quitarse el rol ADMIN a sí mismo si es el único administrador activo.
  const esUltimoAdmin =
    usuario.rol === "ADMIN" &&
    listarUsuarios().filter((u) => u.rol === "ADMIN" && u.activo).length === 1;
  const quedariaSinAdmin =
    esUltimoAdmin &&
    ((body.rol !== undefined && body.rol !== "ADMIN") ||
      body.activo === false);
  if (quedariaSinAdmin) {
    return NextResponse.json(
      { error: "No puedes dejar el sistema sin un administrador activo." },
      { status: 409 },
    );
  }

  const actualizado = await actualizarUsuario(id, {
    nombre: body.nombre,
    rol: body.rol as Rol | undefined,
    activo: body.activo,
    password: body.password,
  });
  registrarActividad(
    sesion,
    "USUARIO_EDITAR",
    `Editó usuario ${actualizado?.email}`,
  );
  return NextResponse.json({ usuario: actualizado });
}
