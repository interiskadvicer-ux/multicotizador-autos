import { db } from "@/lib/db";
import type {
  EstatusPago,
  OrigenPago,
  Poliza,
  PolizaInput,
  Recibo,
  ReciboGuardado,
  SituacionRecibo,
} from "@/domain/admin";

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
  vehiculo: string | null;
  numero_serie: string | null;
  estatus_pago: EstatusPago | null;
  origen_pago: OrigenPago | null;
  estatus_aseguradora: string | null;
  pago_actualizado_at: string | null;
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
    vehiculo: row.vehiculo ?? undefined,
    numeroSerie: row.numero_serie ?? undefined,
    estatusPago: row.estatus_pago,
    origenPago: row.origen_pago,
    estatusAseguradora: row.estatus_aseguradora,
    pagoActualizadoAt: row.pago_actualizado_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listarPolizas(): Poliza[] {
  const rows = db
    .prepare("SELECT * FROM policies ORDER BY vigencia_fin ASC")
    .all() as PolicyRow[];
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
         vigencia_inicio, vigencia_fin, notas, vehiculo, numero_serie,
         estatus_pago, origen_pago, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.vehiculo?.trim() || null,
      input.numeroSerie?.trim() || null,
      input.estatusPago,
      input.estatusPago ? "MANUAL" : null,
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
  // El estatus consultado a la aseguradora conserva su origen mientras no se
  // cambie a mano.
  const cambioPago = input.estatusPago !== actual.estatusPago;
  const origenPago: OrigenPago | null = !input.estatusPago
    ? null
    : cambioPago
      ? "MANUAL"
      : actual.origenPago;
  db.prepare(
    `UPDATE policies SET
       numero_poliza = ?, ramo = ?, aseguradora = ?, asegurado = ?,
       prima_neta = ?, prima_total = ?, vigencia_inicio = ?, vigencia_fin = ?,
       notas = ?, vehiculo = ?, numero_serie = ?, estatus_pago = ?,
       origen_pago = ?, updated_at = datetime('now')
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
    input.vehiculo?.trim() || null,
    input.numeroSerie?.trim() || null,
    input.estatusPago,
    origenPago,
    id,
  );
  return obtenerPoliza(id);
}

export function eliminarPoliza(id: number): boolean {
  const info = db.prepare("DELETE FROM policies WHERE id = ?").run(id);
  return info.changes > 0;
}

export type EstadoVigencia =
  | "VIGENTE"
  | "POR_VENCER"
  | "PROXIMA"
  | "VENCIDA"
  | "CANCELADA";

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

export function listarPolizasConEstado(): PolizaConEstado[] {
  return listarPolizas().map((p) => {
    const vigencia = estadoVigencia(p.vigenciaFin);
    return {
      ...p,
      ...vigencia,
      estado: p.estatusPago === "CANCELADA" ? "CANCELADA" : vigencia.estado,
    };
  });
}

// Pólizas que requieren aviso de renovación (vencidas o dentro de 60 días).
export function vencimientos(): PolizaConEstado[] {
  return listarPolizasConEstado()
    .filter((p) => p.estado !== "VIGENTE" && p.estado !== "CANCELADA")
    .sort((a, b) => a.diasParaVencer - b.diasParaVencer);
}

interface ReceiptRow {
  policy_id: number;
  id_recibo: string;
  folio: string;
  numero_endoso: number;
  tipo_recibo: string;
  situacion: SituacionRecibo;
  incisos: string;
  prima_neta: number;
  recargo: number;
  derechos: number;
  iva: number;
  prima_total: number;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  fecha_vencimiento: string | null;
  origen: OrigenPago;
  consultado_at: string;
  consultado_por: string;
}

function mapRecibo(row: ReceiptRow): ReciboGuardado {
  return {
    policyId: row.policy_id,
    idRecibo: row.id_recibo,
    folio: row.folio,
    numeroEndoso: row.numero_endoso,
    tipoRecibo: row.tipo_recibo,
    situacion: row.situacion,
    incisos: row.incisos,
    primaNeta: row.prima_neta,
    recargo: row.recargo,
    derechos: row.derechos,
    iva: row.iva,
    primaTotal: row.prima_total,
    vigenciaInicio: row.vigencia_inicio,
    vigenciaFin: row.vigencia_fin,
    fechaVencimiento: row.fecha_vencimiento,
    origen: row.origen,
    consultadoAt: row.consultado_at,
    consultadoPor: row.consultado_por,
  };
}

export function listarRecibos(policyId?: number): ReciboGuardado[] {
  const rows = (
    policyId === undefined
      ? db
          .prepare(
            "SELECT * FROM policy_receipts ORDER BY policy_id, numero_endoso, fecha_vencimiento",
          )
          .all()
      : db
          .prepare(
            "SELECT * FROM policy_receipts WHERE policy_id = ? ORDER BY numero_endoso, fecha_vencimiento",
          )
          .all(policyId)
  ) as ReceiptRow[];
  return rows.map(mapRecibo);
}

// Reemplaza los recibos de la póliza con los consultados a la aseguradora y
// actualiza su estatus de pago.
export function guardarConsultaPagos(
  policyId: number,
  consulta: {
    recibos: Recibo[];
    estatusPago: EstatusPago | null;
    estatusAseguradora: string | null;
  },
  origen: OrigenPago,
  consultadoPor: string,
): Poliza | null {
  const insertar = db.prepare(
    `INSERT INTO policy_receipts
      (policy_id, id_recibo, folio, numero_endoso, tipo_recibo, situacion,
       incisos, prima_neta, recargo, derechos, iva, prima_total,
       vigencia_inicio, vigencia_fin, fecha_vencimiento, origen, consultado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare("DELETE FROM policy_receipts WHERE policy_id = ?").run(policyId);
    for (const r of consulta.recibos) {
      insertar.run(
        policyId,
        r.idRecibo,
        r.folio,
        r.numeroEndoso,
        r.tipoRecibo,
        r.situacion,
        r.incisos,
        r.primaNeta,
        r.recargo,
        r.derechos,
        r.iva,
        r.primaTotal,
        r.vigenciaInicio,
        r.vigenciaFin,
        r.fechaVencimiento,
        origen,
        consultadoPor,
      );
    }
    db.prepare(
      `UPDATE policies SET estatus_pago = ?, origen_pago = ?,
         estatus_aseguradora = ?, pago_actualizado_at = datetime('now')
       WHERE id = ?`,
    ).run(
      consulta.estatusPago,
      consulta.estatusPago ? origen : null,
      consulta.estatusAseguradora,
      policyId,
    );
  })();
  return obtenerPoliza(policyId);
}
