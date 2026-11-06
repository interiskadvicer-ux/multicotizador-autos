import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, directorioArchivos } from "@/lib/db";
import type { FormaPagoPoliza, Poliza, PolizaInput } from "@/domain/admin";

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
  forma_pago: FormaPagoPoliza | null;
  caratula: string | null;
  agente_id: number | null;
  pagado: number | null;
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
    formaPago: row.forma_pago ?? "ANUAL",
    caratula: row.caratula,
    agenteId: row.agente_id,
    pagado: row.pagado ?? 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_POLIZAS = `SELECT p.*,
  (SELECT COALESCE(SUM(monto), 0) FROM policy_payments WHERE poliza_id = p.id) AS pagado
  FROM policies p`;

// `agenteId` limita el listado a las pólizas de ese agente.
export function listarPolizas(agenteId?: number): Poliza[] {
  const rows = (
    agenteId
      ? db
          .prepare(
            `${SELECT_POLIZAS} WHERE p.agente_id = ? ORDER BY p.vigencia_fin ASC`,
          )
          .all(agenteId)
      : db.prepare(`${SELECT_POLIZAS} ORDER BY p.vigencia_fin ASC`).all()
  ) as PolicyRow[];
  return rows.map(mapPoliza);
}

export function obtenerPoliza(id: number): Poliza | null {
  const row = db.prepare(`${SELECT_POLIZAS} WHERE p.id = ?`).get(id) as
    | PolicyRow
    | undefined;
  return row ? mapPoliza(row) : null;
}

export function crearPoliza(input: PolizaInput, createdBy: number): Poliza {
  const info = db
    .prepare(
      `INSERT INTO policies
        (numero_poliza, ramo, aseguradora, asegurado, prima_neta, prima_total,
         vigencia_inicio, vigencia_fin, notas, forma_pago, caratula, agente_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.formaPago ?? "ANUAL",
      input.caratula ?? null,
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
       notas = ?, forma_pago = ?, caratula = COALESCE(?, caratula), agente_id = ?, updated_at = datetime('now')
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
    input.formaPago ?? "ANUAL",
    input.caratula ?? null,
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

export type EstadoPago = "PENDIENTE" | "PARCIAL" | "PAGADA";

export interface PolizaConEstado extends Poliza {
  estado: EstadoVigencia;
  diasParaVencer: number;
  pagado: number;
  saldo: number;
  estadoPago: EstadoPago;
}

// Tolerancia de redondeo entre lo cobrado y la prima total.
const TOLERANCIA_PAGO = 1;

export function estadoPago(primaTotal: number, pagado: number): EstadoPago {
  if (pagado <= 0) return "PENDIENTE";
  return pagado + TOLERANCIA_PAGO >= primaTotal ? "PAGADA" : "PARCIAL";
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
  return listarPolizas(agenteId).map((p) => {
    const pagado = p.pagado ?? 0;
    return {
      ...p,
      ...estadoVigencia(p.vigenciaFin),
      pagado,
      saldo: Math.max(0, Math.round((p.primaTotal - pagado) * 100) / 100),
      estadoPago: estadoPago(p.primaTotal, pagado),
    };
  });
}

// Pólizas que requieren aviso de renovación (vencidas o dentro de 60 días).
export function vencimientos(agenteId?: number): PolizaConEstado[] {
  return listarPolizasConEstado(agenteId)
    .filter((p) => p.estado !== "VIGENTE")
    .sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}

const RE_CARATULA = /^\d+-[a-f0-9]{12}\.pdf$/;

// Guarda el PDF de una carátula y devuelve el nombre con que se asocia a la
// póliza al guardarla.
export function guardarCaratula(datos: Buffer): string {
  const archivo = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(directorioArchivos("polizas"), archivo), datos);
  return archivo;
}

export function caratulaValida(archivo: string): boolean {
  return RE_CARATULA.test(archivo) && fs.existsSync(path.join(directorioArchivos("polizas"), archivo));
}

export function leerCaratulaArchivo(archivo: string): Buffer | null {
  if (!RE_CARATULA.test(archivo)) return null;
  const ruta = path.join(directorioArchivos("polizas"), archivo);
  return fs.existsSync(ruta) ? fs.readFileSync(ruta) : null;
}
