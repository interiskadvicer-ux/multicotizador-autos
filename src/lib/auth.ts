import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { COOKIE_SESION, verificarToken } from "@/lib/session";
import type { Rol, SesionUsuario, Usuario } from "@/domain/admin";

interface UserRow {
  id: number;
  email: string;
  nombre: string;
  password_hash: string;
  rol: string;
  activo: number;
  created_at: string;
}

function mapUsuario(row: UserRow): Usuario {
  return {
    id: row.id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol as Rol,
    activo: row.activo === 1,
    createdAt: row.created_at,
  };
}

export async function hashPassword(plano: string): Promise<string> {
  return bcrypt.hash(plano, 10);
}

export async function verifyPassword(
  plano: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plano, hash);
}

export function buscarUsuarioPorEmail(email: string): UserRow | undefined {
  return db
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(email.trim().toLowerCase()) as UserRow | undefined;
}

export async function crearUsuario(input: {
  email: string;
  nombre: string;
  password: string;
  rol: Rol;
  activo?: boolean;
}): Promise<Usuario> {
  const hash = await hashPassword(input.password);
  const info = db
    .prepare(
      `INSERT INTO users (email, nombre, password_hash, rol, activo)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.email.trim().toLowerCase(),
      input.nombre.trim(),
      hash,
      input.rol,
      input.activo === false ? 0 : 1,
    );
  return obtenerUsuario(Number(info.lastInsertRowid))!;
}

export function obtenerUsuario(id: number): Usuario | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
  return row ? mapUsuario(row) : null;
}

export function listarUsuarios(): Usuario[] {
  const rows = db
    .prepare("SELECT * FROM users ORDER BY created_at DESC")
    .all() as UserRow[];
  return rows.map(mapUsuario);
}

export async function actualizarUsuario(
  id: number,
  cambios: {
    nombre?: string;
    rol?: Rol;
    activo?: boolean;
    password?: string;
  },
): Promise<Usuario | null> {
  const actual = obtenerUsuario(id);
  if (!actual) return null;

  const nombre = cambios.nombre?.trim() ?? actual.nombre;
  const rol = cambios.rol ?? actual.rol;
  const activo = cambios.activo ?? actual.activo;

  if (cambios.password) {
    const hash = await hashPassword(cambios.password);
    db.prepare(
      "UPDATE users SET nombre = ?, rol = ?, activo = ?, password_hash = ? WHERE id = ?",
    ).run(nombre, rol, activo ? 1 : 0, hash, id);
  } else {
    db.prepare(
      "UPDATE users SET nombre = ?, rol = ?, activo = ? WHERE id = ?",
    ).run(nombre, rol, activo ? 1 : 0, id);
  }
  return obtenerUsuario(id);
}

export function contarUsuarios(): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get() as {
    c: number;
  };
  return row.c;
}

// Lee la sesión actual desde la cookie (para server components y route handlers).
export async function getSesion(): Promise<SesionUsuario | null> {
  const token = cookies().get(COOKIE_SESION)?.value;
  if (!token) return null;
  const sesion = await verificarToken(token);
  if (!sesion) return null;
  // Verifica que el usuario siga activo.
  const usuario = obtenerUsuario(sesion.id);
  if (!usuario || !usuario.activo) return null;
  return sesion;
}

export function tieneAcceso(rol: Rol, permitidos: Rol[]): boolean {
  return permitidos.includes(rol);
}
