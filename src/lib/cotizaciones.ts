import { db } from "@/lib/db";
import { crearPoliza, obtenerPoliza } from "@/lib/polizas";
import type { CotizacionRequest, CotizacionResultado, Paquete } from "@/domain/types";

export type EstadoCotizacion =
  | "GUARDADA"
  | "EMISION_SOLICITADA"
  | "EMITIDA"
  | "CANCELADA";

export const ESTADOS_COTIZACION: { value: EstadoCotizacion; label: string }[] = [
  { value: "GUARDADA", label: "Guardada" },
  { value: "EMISION_SOLICITADA", label: "Emisión solicitada" },
  { value: "EMITIDA", label: "Emitida" },
  { value: "CANCELADA", label: "Cancelada" },
];

export interface SeleccionCotizacion {
  aseguradoraId: string;
  paquete: Paquete;
}

export interface Contratante {
  tipoPersona: "FISICA" | "MORAL";
  nombre: string;
  rfc: string;
  email: string;
  telefono: string;
  calle: string;
  colonia: string;
  municipio: string;
  estado: string;
  cp: string;
}

export interface DetalleVehiculo {
  serie: string;
  motor: string;
  placas: string;
  color: string;
}

export interface CotizacionGuardada {
  id: number;
  usuarioId: number;
  usuarioNombre: string;
  estado: EstadoCotizacion;
  cliente: string;
  vehiculo: string;
  request: CotizacionRequest;
  resultados: CotizacionResultado[];
  seleccion: SeleccionCotizacion | null;
  contratante: Contratante | null;
  detalleVehiculo: DetalleVehiculo | null;
  primaTotal: number | null;
  aseguradora: string | null;
  paquete: string | null;
  numeroPoliza: string | null;
  // Póliza creada en el control de pólizas al marcarla como emitida.
  polizaId: number | null;
  notasAdmin: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ResumenCotizacion = Omit<CotizacionGuardada, "request" | "resultados">;

interface QuoteRow {
  id: number;
  usuario_id: number;
  usuario_nombre: string | null;
  estado: EstadoCotizacion;
  cliente: string;
  vehiculo: string;
  request_json: string;
  resultados_json: string;
  seleccion_json: string | null;
  contratante_json: string | null;
  detalle_vehiculo_json: string | null;
  prima_total: number | null;
  aseguradora: string | null;
  paquete: string | null;
  numero_poliza: string | null;
  poliza_id: number | null;
  notas_admin: string | null;
  created_at: string;
  updated_at: string;
}

function parse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function mapResumen(row: QuoteRow): ResumenCotizacion {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    usuarioNombre: row.usuario_nombre ?? "",
    estado: row.estado,
    cliente: row.cliente,
    vehiculo: row.vehiculo,
    seleccion: parse<SeleccionCotizacion>(row.seleccion_json),
    contratante: parse<Contratante>(row.contratante_json),
    detalleVehiculo: parse<DetalleVehiculo>(row.detalle_vehiculo_json),
    primaTotal: row.prima_total,
    aseguradora: row.aseguradora,
    paquete: row.paquete,
    numeroPoliza: row.numero_poliza,
    polizaId: row.poliza_id ?? null,
    notasAdmin: row.notas_admin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_BASE = `SELECT q.*, u.nombre AS usuario_nombre
  FROM quotes q LEFT JOIN users u ON u.id = q.usuario_id`;

// `usuarioId` limita el listado a las cotizaciones de ese usuario.
export function listarCotizaciones(usuarioId?: number): ResumenCotizacion[] {
  const rows = (
    usuarioId
      ? db.prepare(`${SELECT_BASE} WHERE q.usuario_id = ? ORDER BY q.updated_at DESC`).all(usuarioId)
      : db.prepare(`${SELECT_BASE} ORDER BY q.updated_at DESC`).all()
  ) as QuoteRow[];
  return rows.map(mapResumen);
}

export function obtenerCotizacion(id: number): CotizacionGuardada | null {
  const row = db.prepare(`${SELECT_BASE} WHERE q.id = ?`).get(id) as QuoteRow | undefined;
  if (!row) return null;
  return {
    ...mapResumen(row),
    request: JSON.parse(row.request_json) as CotizacionRequest,
    resultados: JSON.parse(row.resultados_json) as CotizacionResultado[],
  };
}

export interface DatosCotizacion {
  request: CotizacionRequest;
  resultados: CotizacionResultado[];
  seleccion: SeleccionCotizacion | null;
  contratante: Contratante | null;
  detalleVehiculo: DetalleVehiculo | null;
  estado: EstadoCotizacion;
}

function derivados(d: DatosCotizacion) {
  const v = d.request.vehiculo;
  const elegido = d.seleccion
    ? d.resultados.find(
        (r) =>
          r.aseguradoraId === d.seleccion!.aseguradoraId &&
          r.paquete === d.seleccion!.paquete &&
          r.status === "success",
      )
    : undefined;
  return {
    cliente: (d.contratante?.nombre || d.request.conductor.nombre || "").trim(),
    vehiculo: `${v.marca} ${v.modelo} ${v.anio} ${v.version ?? ""}`.trim(),
    primaTotal: elegido?.prima?.primaTotal ?? null,
    aseguradora: elegido?.aseguradora ?? null,
    paquete: elegido?.paquete ?? null,
  };
}

export function crearCotizacion(usuarioId: number, d: DatosCotizacion): number {
  const x = derivados(d);
  const info = db
    .prepare(
      `INSERT INTO quotes
        (usuario_id, estado, cliente, vehiculo, request_json, resultados_json,
         seleccion_json, contratante_json, detalle_vehiculo_json, prima_total,
         aseguradora, paquete)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      usuarioId,
      d.estado,
      x.cliente,
      x.vehiculo,
      JSON.stringify(d.request),
      JSON.stringify(d.resultados),
      d.seleccion ? JSON.stringify(d.seleccion) : null,
      d.contratante ? JSON.stringify(d.contratante) : null,
      d.detalleVehiculo ? JSON.stringify(d.detalleVehiculo) : null,
      x.primaTotal,
      x.aseguradora,
      x.paquete,
    );
  return Number(info.lastInsertRowid);
}

export function actualizarCotizacion(id: number, d: DatosCotizacion): void {
  const x = derivados(d);
  db.prepare(
    `UPDATE quotes SET
       estado = ?, cliente = ?, vehiculo = ?, request_json = ?, resultados_json = ?,
       seleccion_json = ?, contratante_json = ?, detalle_vehiculo_json = ?,
       prima_total = ?, aseguradora = ?, paquete = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    d.estado,
    x.cliente,
    x.vehiculo,
    JSON.stringify(d.request),
    JSON.stringify(d.resultados),
    d.seleccion ? JSON.stringify(d.seleccion) : null,
    d.contratante ? JSON.stringify(d.contratante) : null,
    d.detalleVehiculo ? JSON.stringify(d.detalleVehiculo) : null,
    x.primaTotal,
    x.aseguradora,
    x.paquete,
    id,
  );
}

export function cambiarEstadoCotizacion(
  id: number,
  estado: EstadoCotizacion,
  numeroPoliza: string | null,
  notasAdmin: string | null,
): void {
  db.prepare(
    `UPDATE quotes SET estado = ?, numero_poliza = ?, notas_admin = ?,
       updated_at = datetime('now') WHERE id = ?`,
  ).run(estado, numeroPoliza, notasAdmin, id);
}

export function contarCotizacionesPorEstado(
  usuarioId?: number,
): Record<EstadoCotizacion, number> {
  const rows = (
    usuarioId
      ? db.prepare("SELECT estado, COUNT(*) AS c FROM quotes WHERE usuario_id = ? GROUP BY estado").all(usuarioId)
      : db.prepare("SELECT estado, COUNT(*) AS c FROM quotes GROUP BY estado").all()
  ) as { estado: EstadoCotizacion; c: number }[];
  const base: Record<EstadoCotizacion, number> = {
    GUARDADA: 0,
    EMISION_SOLICITADA: 0,
    EMITIDA: 0,
    CANCELADA: 0,
  };
  for (const r of rows) base[r.estado] = r.c;
  return base;
}

function sumarUnAnio(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const fin = new Date(Date.UTC(a + 1, m - 1, d));
  return fin.toISOString().slice(0, 10);
}

// Marca la cotización como emitida y la registra en el control de pólizas
// (asignada al agente dueño de la cotización). Si ya tenía póliza ligada, no
// la duplica.
export function emitirCotizacion(
  cot: CotizacionGuardada,
  numeroPoliza: string,
  vigenciaInicio: string,
  notasAdmin: string | null,
  adminId: number,
): number {
  const elegido = cot.seleccion
    ? cot.resultados.find(
        (r) =>
          r.aseguradoraId === cot.seleccion!.aseguradoraId &&
          r.paquete === cot.seleccion!.paquete &&
          r.status === "success",
      )
    : undefined;
  const dueno = db.prepare("SELECT rol FROM users WHERE id = ?").get(cot.usuarioId) as
    | { rol: string }
    | undefined;
  const serie = cot.detalleVehiculo?.serie ? ` · Serie ${cot.detalleVehiculo.serie}` : "";

  return db.transaction(() => {
    let polizaId = cot.polizaId && obtenerPoliza(cot.polizaId) ? cot.polizaId : null;
    if (!polizaId) {
      polizaId = crearPoliza(
        {
          numeroPoliza,
          ramo: "Autos",
          aseguradora: cot.aseguradora ?? elegido?.aseguradora ?? "",
          asegurado: cot.contratante?.nombre || cot.cliente || "Sin nombre",
          primaNeta: elegido?.prima?.primaNeta ?? cot.primaTotal ?? 0,
          primaTotal: cot.primaTotal ?? elegido?.prima?.primaTotal ?? 0,
          vigenciaInicio,
          vigenciaFin: sumarUnAnio(vigenciaInicio),
          notas: `Emitida desde cotización #${cot.id} · ${cot.vehiculo}${serie}${
            cot.paquete ? ` · ${cot.paquete}` : ""
          }`,
          agenteId: dueno?.rol === "AGENTE" ? cot.usuarioId : null,
        },
        adminId,
      ).id;
    }
    db.prepare(
      `UPDATE quotes SET estado = 'EMITIDA', numero_poliza = ?, notas_admin = ?, poliza_id = ?,
         updated_at = datetime('now') WHERE id = ?`,
    ).run(numeroPoliza, notasAdmin, polizaId, cot.id);
    return polizaId;
  })();
}
