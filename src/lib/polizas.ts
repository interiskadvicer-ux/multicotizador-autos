import { db } from "@/lib/db";
import type { Poliza, PolizaInput } from "@/domain/admin";

interface PolicyRow {
  id: number;
  numero_poliza: string;
  ramo: string;
  aseguradora: string;
  asegurado: string;
  prima_neta: number;
  prima_total: number;
  vigencia_inicio: string;
  vigencia_fin: string;
  notas: string | null;
  agente_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

function mapPoliza(row: PolicyRow): Poliza {
  return {
    id: row.id,
    numeroPoliza: row.numero_poliza,
    ramo: row.ramo,
    aseguradora: row.aseguradora,
    asegurado: row.asegurado,
    primaNeta: row.prima_neta,
    primaTotal: row.prima_total,
    vigenciaInicio: row.vigencia_inicio,
    vigenciaFin: row.vigencia_fin,
    notas: row.notas ?? undefined,
    agenteId: row.agente_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// `agenteId` limita el listado a las pólizas de ese agente.
export function listarPolizas(agenteId?: number): Poliza[] {
  const rows = (
    agenteId
      ? db
          .prepare(
            "SELECT * FROM policies WHERE agente_id = ? ORDER BY vigencia_fin ASC",
          )
          .all(agenteId)
      : db.prepare("SELECT * FROM policies ORDER BY vigencia_fin ASC").all()
  ) as PolicyRow[];
  return rows.map(mapPoliza);
}

export function obtenerPoliza(id: number): Poliza | null {
  const row = db.prepare("SELECT * FROM policies WHERE id = ?").get(id) as
    | PolicyRow
    | undefined;
  return row ? mapPoliza(row) : null;
}

export function crearPoliza(input: PolizaInput, createdBy: number): Poliza {
  const info = db
    .prepare(
      `INSERT INTO policies
        (numero_poliza, ramo, aseguradora, asegurado, prima_neta, prima_total,
         vigencia_inicio, vigencia_fin, notas, agente_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.numeroPoliza.trim(),
      input.ramo.trim(),
      input.aseguradora.trim(),
      input.asegurado.trim(),
      input.primaNeta,
      input.primaTotal,
      input.vigenciaInicio,
      input.vigenciaFin,
      input.notas?.trim() || null,
      input.agenteId ?? null,
      createdBy,
    );
  return obtenerPoliza(Number(info.lastInsertRowid))!;
}

export function actualizarPoliza(
  id: number,
  input: PolizaInput,
): Poliza | null {
  const actual = obtenerPoliza(id);
  if (!actual) return null;
  db.prepare(
    `UPDATE policies SET
       numero_poliza = ?, ramo = ?, aseguradora = ?, asegurado = ?,
       prima_neta = ?, prima_total = ?, vigencia_inicio = ?, vigencia_fin = ?,
       notas = ?, agente_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    input.numeroPoliza.trim(),
    input.ramo.trim(),
    input.aseguradora.trim(),
    input.asegurado.trim(),
    input.primaNeta,
    input.primaTotal,
    input.vigenciaInicio,
    input.vigenciaFin,
    input.notas?.trim() || null,
    input.agenteId ?? null,
    id,
  );
  return obtenerPoliza(id);
}

export function eliminarPoliza(id: number): boolean {
  const info = db.prepare("DELETE FROM policies WHERE id = ?").run(id);
  return info.changes > 0;
}

export type EstadoVigencia = "VIGENTE" | "POR_VENCER" | "PROXIMA" | "VENCIDA";

export interface PolizaConEstado extends Poliza {
  estado: EstadoVigencia;
  diasParaVencer: number;
}

// Clasifica la póliza según los días que faltan para su vencimiento.
// Avisos de renovación: <= 30 días (POR_VENCER) y <= 60 días (PROXIMA).
export function estadoVigencia(
  vigenciaFin: string,
  hoy = new Date(),
): { estado: EstadoVigencia; diasParaVencer: number } {
  const fin = new Date(`${vigenciaFin}T00:00:00`);
  const inicioHoy = new Date(
    hoy.getFullYear(),
    hoy.getMonth(),
    hoy.getDate(),
  );
  const dias = Math.round(
    (fin.getTime() - inicioHoy.getTime()) / (1000 * 60 * 60 * 24),
  );
  let estado: EstadoVigencia;
  if (dias < 0) estado = "VENCIDA";
  else if (dias <= 30) estado = "POR_VENCER";
  else if (dias <= 60) estado = "PROXIMA";
  else estado = "VIGENTE";
  return { estado, diasParaVencer: dias };
}

export function listarPolizasConEstado(agenteId?: number): PolizaConEstado[] {
  return listarPolizas(agenteId).map((p) => ({
    ...p,
    ...estadoVigencia(p.vigenciaFin),
  }));
}

// Pólizas que requieren aviso de renovación (vencidas o dentro de 60 días).
export function vencimientos(agenteId?: number): PolizaConEstado[] {
  return listarPolizasConEstado(agenteId)
    .filter((p) => p.estado !== "VIGENTE")
    .sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}
