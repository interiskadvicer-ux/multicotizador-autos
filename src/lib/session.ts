import { SignJWT, jwtVerify } from "jose";
import type { Rol, SesionUsuario } from "@/domain/admin";

// Utilidades de sesión seguras para edge (solo dependen de `jose`).
// El token JWT firmado se guarda en una cookie httpOnly.

export const COOKIE_SESION = "cotizador_sesion";
const DURACION_SESION = 60 * 60 * 8; // 8 horas

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET no está configurado (mínimo 16 caracteres). Defínelo en el entorno.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function crearToken(sesion: SesionUsuario): Promise<string> {
  return new SignJWT({
    email: sesion.email,
    nombre: sesion.nombre,
    rol: sesion.rol,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(sesion.id))
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION}s`)
    .sign(getSecret());
}

export async function verificarToken(
  token: string,
): Promise<SesionUsuario | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    const id = Number(payload.sub);
    const rol = payload.rol as Rol;
    if (!id || !rol) return null;
    return {
      id,
      email: String(payload.email ?? ""),
      nombre: String(payload.nombre ?? ""),
      rol,
    };
  } catch {
    return null;
  }
}

export const MAX_AGE_SESION = DURACION_SESION;
