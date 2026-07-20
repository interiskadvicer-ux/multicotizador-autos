import { db } from "@/lib/db";
import type { RegistroActividad, SesionUsuario } from "@/domain/admin";

interface ActivityRow {
  id: number;
  usuario_id: number | null;
  usuario_email: string;
  accion: string;
  detalle: string;
  created_at: string;
}

function mapRegistro(row: ActivityRow): RegistroActividad {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    usuarioEmail: row.usuario_email,
    accion: row.accion,
    detalle: row.detalle,
    createdAt: row.created_at,
  };
}

// Registra una actividad de usuario para auditoría. Nunca lanza excepción:
// el registro de auditoría no debe tumbar la operación principal.
export function registrarActividad(
  usuario: SesionUsuario | { id: number | null; email: string },
  accion: string,
  detalle = "",
): void {
  try {
    db.prepare(
      `INSERT INTO activity_logs (usuario_id, usuario_email, accion, detalle)
       VALUES (?, ?, ?, ?)`,
    ).run(usuario.id ?? null, usuario.email, accion, detalle);
  } catch {
    // Silencioso a propósito.
  }
}

export interface FiltrosActividad {
  usuarioId?: number;
  desde?: string;
  hasta?: string;
  limite?: number;
}

// Extrae los filtros de auditoría (usuarioId, desde, hasta) desde los query
// params de la petición.
export function filtrosActividadDesdeUrl(req: Request): FiltrosActividad {
  const params = new URL(req.url).searchParams;
  const usuarioId = params.get("usuarioId");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  return {
    usuarioId: usuarioId ? Number(usuarioId) : undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  };
}

export function listarActividad(filtros?: FiltrosActividad): RegistroActividad[] {
  const condiciones: string[] = [];
  const params: (string | number)[] = [];

  if (filtros?.usuarioId) {
    condiciones.push("usuario_id = ?");
    params.push(filtros.usuarioId);
  }
  if (filtros?.desde) {
    condiciones.push("created_at >= ?");
    params.push(filtros.desde);
  }
  if (filtros?.hasta) {
    condiciones.push("created_at <= ?");
    params.push(filtros.hasta);
  }

  const where =
    condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
  const limite = filtros?.limite ?? 1000;

  const rows = db
    .prepare(
      `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params, limite) as ActivityRow[];
  return rows.map(mapRegistro);
}
