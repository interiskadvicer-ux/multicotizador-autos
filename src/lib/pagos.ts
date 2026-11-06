import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, directorioArchivos } from "@/lib/db";

export type OrigenPago = "MANUAL" | "ESTADO_CUENTA";

export interface Pago {
  id: number;
  polizaId: number;
  numeroPoliza: string;
  asegurado: string;
  aseguradora: string;
  fechaPago: string;
  monto: number;
  referencia: string | null;
  origen: OrigenPago;
  statementId: number | null;
  notas: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface PagoInput {
  polizaId: number;
  fechaPago: string;
  monto: number;
  referencia?: string | null;
  notas?: string | null;
  origen?: OrigenPago;
  statementId?: number | null;
}

export interface EstadoCuenta {
  id: number;
  aseguradora: string;
  nombreOriginal: string;
  tamano: number;
  pagosAplicados: number;
  montoAplicado: number;
  createdAt: string;
}

interface PagoRow {
  id: number;
  poliza_id: number;
  numero_poliza: string;
  asegurado: string;
  aseguradora: string;
  fecha_pago: string;
  monto: number;
  referencia: string | null;
  origen: OrigenPago;
  statement_id: number | null;
  notas: string | null;
  created_by: number | null;
  created_at: string;
}

function mapPago(r: PagoRow): Pago {
  return {
    id: r.id,
    polizaId: r.poliza_id,
    numeroPoliza: r.numero_poliza,
    asegurado: r.asegurado,
    aseguradora: r.aseguradora,
    fechaPago: r.fecha_pago,
    monto: r.monto,
    referencia: r.referencia,
    origen: r.origen,
    statementId: r.statement_id,
    notas: r.notas,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

const SELECT_PAGOS = `SELECT pp.*, p.numero_poliza, p.asegurado, p.aseguradora
  FROM policy_payments pp JOIN policies p ON p.id = pp.poliza_id`;

export function listarPagos(polizaId?: number, limite = 200): Pago[] {
  const rows = (
    polizaId
      ? db
          .prepare(`${SELECT_PAGOS} WHERE pp.poliza_id = ? ORDER BY pp.fecha_pago DESC, pp.id DESC`)
          .all(polizaId)
      : db
          .prepare(`${SELECT_PAGOS} ORDER BY pp.created_at DESC, pp.id DESC LIMIT ?`)
          .all(limite)
  ) as PagoRow[];
  return rows.map(mapPago);
}

export function registrarPago(input: PagoInput, usuarioId: number): number {
  const info = db
    .prepare(
      `INSERT INTO policy_payments
        (poliza_id, fecha_pago, monto, referencia, origen, statement_id, notas, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.polizaId,
      input.fechaPago,
      Math.round(input.monto * 100) / 100,
      input.referencia?.trim() || null,
      input.origen ?? "MANUAL",
      input.statementId ?? null,
      input.notas?.trim() || null,
      usuarioId,
    );
  return Number(info.lastInsertRowid);
}

export function eliminarPago(id: number): boolean {
  return db.prepare("DELETE FROM policy_payments WHERE id = ?").run(id).changes > 0;
}

export function pagoDeEstadoCuenta(polizaId: number, statementId: number): boolean {
  return !!db
    .prepare("SELECT 1 FROM policy_payments WHERE poliza_id = ? AND statement_id = ?")
    .get(polizaId, statementId);
}

// Prima cobrada en un periodo (por fecha de pago), opcionalmente de un agente.
export function totalCobrado(desde: string, agenteId?: number): number {
  const row = (
    agenteId
      ? db
          .prepare(
            `SELECT COALESCE(SUM(pp.monto), 0) AS t FROM policy_payments pp
             JOIN policies p ON p.id = pp.poliza_id
             WHERE pp.fecha_pago >= ? AND p.agente_id = ?`,
          )
          .get(desde, agenteId)
      : db
          .prepare("SELECT COALESCE(SUM(monto), 0) AS t FROM policy_payments WHERE fecha_pago >= ?")
          .get(desde)
  ) as { t: number };
  return row.t;
}

// Un mismo archivo (por SHA-256) se guarda una sola vez: si ya se había
// cargado, regresa el registro existente para no duplicar sus pagos.
export function guardarEstadoCuenta(
  aseguradora: string,
  nombreOriginal: string,
  extension: "pdf" | "csv" | "xlsx",
  datos: Buffer,
  usuarioId: number,
): { id: number; cargadoEl: string | null } {
  const hash = crypto.createHash("sha256").update(datos).digest("hex");
  const previo = db
    .prepare("SELECT id, created_at FROM insurer_statements WHERE hash = ?")
    .get(hash) as { id: number; created_at: string } | undefined;
  if (previo) return { id: previo.id, cargadoEl: previo.created_at };
  const archivo = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
  fs.writeFileSync(path.join(directorioArchivos("estados-cuenta"), archivo), datos);
  const info = db
    .prepare(
      `INSERT INTO insurer_statements (aseguradora, nombre_original, archivo, tamano, hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(aseguradora, nombreOriginal.slice(0, 200), archivo, datos.length, hash, usuarioId);
  return { id: Number(info.lastInsertRowid), cargadoEl: null };
}

export function listarEstadosCuenta(): EstadoCuenta[] {
  const rows = db
    .prepare(
      `SELECT s.*, COUNT(pp.id) AS pagos, COALESCE(SUM(pp.monto), 0) AS monto
       FROM insurer_statements s LEFT JOIN policy_payments pp ON pp.statement_id = s.id
       GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC LIMIT 100`,
    )
    .all() as {
    id: number;
    aseguradora: string;
    nombre_original: string;
    tamano: number;
    pagos: number;
    monto: number;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    aseguradora: r.aseguradora,
    nombreOriginal: r.nombre_original,
    tamano: r.tamano,
    pagosAplicados: r.pagos,
    montoAplicado: r.monto,
    createdAt: r.created_at,
  }));
}

export function leerEstadoCuenta(
  id: number,
): { nombreOriginal: string; extension: string; datos: Buffer } | null {
  const row = db
    .prepare("SELECT nombre_original, archivo FROM insurer_statements WHERE id = ?")
    .get(id) as { nombre_original: string; archivo: string } | undefined;
  if (!row) return null;
  const ruta = path.join(directorioArchivos("estados-cuenta"), path.basename(row.archivo));
  if (!fs.existsSync(ruta)) return null;
  return {
    nombreOriginal: row.nombre_original,
    extension: path.extname(ruta).slice(1),
    datos: fs.readFileSync(ruta),
  };
}

// Valida un pago capturado (manual o desde la conciliación).
export function parsePago(b: unknown): { data: PagoInput; error: null } | { data: null; error: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  const polizaId = Number(o.polizaId);
  const monto = Number(o.monto);
  const fechaPago = String(o.fechaPago ?? "");
  if (!Number.isInteger(polizaId) || polizaId <= 0) return { data: null, error: "Selecciona la póliza." };
  if (!Number.isFinite(monto) || monto <= 0) return { data: null, error: "El monto debe ser mayor a 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) return { data: null, error: "Fecha de pago inválida." };
  const texto = (v: unknown, max: number) => (v == null ? null : String(v).trim().slice(0, max) || null);
  return {
    data: { polizaId, monto, fechaPago, referencia: texto(o.referencia, 120), notas: texto(o.notas, 500) },
    error: null,
  };
}
