import { NextResponse } from "next/server";
import { getSesion, tieneAcceso } from "@/lib/auth";
import type { Rol, SesionUsuario } from "@/domain/admin";

type Resultado =
  | { sesion: SesionUsuario; error: null }
  | { sesion: null; error: NextResponse };

// Valida la sesión (y opcionalmente el rol) para route handlers de API.
export async function requireApiSesion(roles?: Rol[]): Promise<Resultado> {
  const sesion = await getSesion();
  if (!sesion) {
    return {
      sesion: null,
      error: NextResponse.json({ error: "No autenticado." }, { status: 401 }),
    };
  }
  if (roles && !tieneAcceso(sesion.rol, roles)) {
    return {
      sesion: null,
      error: NextResponse.json(
        { error: "No tienes permiso para esta acción." },
        { status: 403 },
      ),
    };
  }
  return { sesion, error: null };
}
