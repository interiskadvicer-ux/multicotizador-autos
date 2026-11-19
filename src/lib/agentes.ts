import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, directorioArchivos } from "@/lib/db";

export type EstadoSolicitud = "PENDIENTE" | "AUTORIZADA" | "RECHAZADA";

export const DOCUMENTOS_REQUERIDOS = [
  { tipo: "CONTRATO_CONFIDENCIALIDAD", label: "Contrato de confidencialidad firmado" },
  { tipo: "CONTRATO_SERVICIOS", label: "Contrato de prestación de servicios firmado" },
  { tipo: "CSF", label: "Constancia de situación fiscal" },
  { tipo: "COMPROBANTE_DOMICILIO", label: "Comprobante de domicilio" },
  { tipo: "IDENTIFICACION", label: "Identificación oficial (INE o pasaporte)" },
] as const;

export type TipoDocumento = (typeof DOCUMENTOS_REQUERIDOS)[number]["tipo"];

export const PLANTILLAS_CONTRATO = [
  { tipo: "confidencialidad", label: "Contrato de confidencialidad" },
  { tipo: "servicios", label: "Contrato de prestación de servicios" },
] as const;

export const MIME_PERMITIDOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
export const TAMANO_MAXIMO = 5 * 1024 * 1024;

export interface DocumentoAgente {
  id: number;
  tipo: string;
  nombreOriginal: string;
  mime: string;
  tamano: number;
  createdAt: string;
}

export interface SolicitudAgente {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  rfc: string;
  estadoRepublica: string;
  cedula: string | null;
  estado: EstadoSolicitud;
  motivoRechazo: string | null;
  usuarioId: number | null;
  revisadoAt: string | null;
  createdAt: string;
  documentos: DocumentoAgente[];
}

interface SolicitudRow {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  rfc: string;
  estado_republica: string;
  cedula: string | null;
  password_hash: string;
  estado: EstadoSolicitud;
  motivo_rechazo: string | null;
  usuario_id: number | null;
  revisado_at: string | null;
  created_at: string;
}

interface DocumentoRow {
  id: number;
  application_id: number;
  tipo: string;
  nombre_original: string;
  mime: string;
  tamano: number;
  archivo: string;
  created_at: string;
}

function documentosDe(id: number): DocumentoAgente[] {
  const rows = db
    .prepare("SELECT * FROM agent_documents WHERE application_id = ? ORDER BY id")
    .all(id) as DocumentoRow[];
  return rows.map((d) => ({
    id: d.id,
    tipo: d.tipo,
    nombreOriginal: d.nombre_original,
    mime: d.mime,
    tamano: d.tamano,
    createdAt: d.created_at,
  }));
}

function mapSolicitud(row: SolicitudRow): SolicitudAgente {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    telefono: row.telefono,
    rfc: row.rfc,
    estadoRepublica: row.estado_republica,
    cedula: row.cedula,
    estado: row.estado,
    motivoRechazo: row.motivo_rechazo,
    usuarioId: row.usuario_id,
    revisadoAt: row.revisado_at,
    createdAt: row.created_at,
    documentos: documentosDe(row.id),
  };
}

export function listarSolicitudes(estado?: EstadoSolicitud): SolicitudAgente[] {
  const rows = (
    estado
      ? db
          .prepare("SELECT * FROM agent_applications WHERE estado = ? ORDER BY created_at DESC")
          .all(estado)
      : db.prepare("SELECT * FROM agent_applications ORDER BY created_at DESC").all()
  ) as SolicitudRow[];
  return rows.map(mapSolicitud);
}

export function obtenerSolicitudRow(id: number): SolicitudRow | undefined {
  return db.prepare("SELECT * FROM agent_applications WHERE id = ?").get(id) as
    | SolicitudRow
    | undefined;
}

export function obtenerSolicitud(id: number): SolicitudAgente | null {
  const row = obtenerSolicitudRow(id);
  return row ? mapSolicitud(row) : null;
}

// Última solicitud registrada con ese correo (para avisar en el login).
export function solicitudPorEmail(email: string): SolicitudRow | undefined {
  return db
    .prepare(
      "SELECT * FROM agent_applications WHERE email = ? COLLATE NOCASE ORDER BY id DESC LIMIT 1",
    )
    .get(email.trim().toLowerCase()) as SolicitudRow | undefined;
}

export function contarSolicitudesPendientes(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM agent_applications WHERE estado = 'PENDIENTE'")
    .get() as { c: number };
  return row.c;
}

export interface ArchivoSubido {
  tipo: TipoDocumento;
  nombre: string;
  mime: string;
  datos: Buffer;
}

export function crearSolicitud(
  input: {
    nombre: string;
    email: string;
    telefono: string;
    rfc: string;
    estadoRepublica: string;
    cedula: string | null;
    passwordHash: string;
  },
  archivos: ArchivoSubido[],
): number {
  const dir = directorioArchivos("agentes");
  const guardados: string[] = [];
  try {
    return db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO agent_applications
            (nombre, email, telefono, rfc, estado_republica, cedula, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.nombre,
          input.email,
          input.telefono,
          input.rfc,
          input.estadoRepublica,
          input.cedula,
          input.passwordHash,
        );
      const id = Number(info.lastInsertRowid);
      const insertarDoc = db.prepare(
        `INSERT INTO agent_documents
          (application_id, tipo, nombre_original, mime, tamano, archivo)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const a of archivos) {
        const archivo = `${id}-${crypto.randomUUID()}.${MIME_PERMITIDOS[a.mime]}`;
        fs.writeFileSync(path.join(dir, archivo), a.datos);
        guardados.push(archivo);
        insertarDoc.run(id, a.tipo, a.nombre.slice(0, 200), a.mime, a.datos.length, archivo);
      }
      return id;
    })();
  } catch (err) {
    for (const g of guardados) fs.rmSync(path.join(dir, g), { force: true });
    throw err;
  }
}

export function leerDocumento(
  solicitudId: number,
  documentoId: number,
): { datos: Buffer; mime: string; nombre: string } | null {
  const row = db
    .prepare("SELECT * FROM agent_documents WHERE id = ? AND application_id = ?")
    .get(documentoId, solicitudId) as DocumentoRow | undefined;
  if (!row) return null;
  const ruta = path.join(directorioArchivos("agentes"), path.basename(row.archivo));
  if (!fs.existsSync(ruta)) return null;
  return { datos: fs.readFileSync(ruta), mime: row.mime, nombre: row.nombre_original };
}

export function marcarSolicitud(
  id: number,
  cambios: {
    estado: EstadoSolicitud;
    revisadoPor: number;
    motivoRechazo?: string | null;
    usuarioId?: number | null;
  },
): void {
  db.prepare(
    `UPDATE agent_applications
       SET estado = ?, motivo_rechazo = ?, usuario_id = COALESCE(?, usuario_id),
           revisado_por = ?, revisado_at = datetime('now')
     WHERE id = ?`,
  ).run(
    cambios.estado,
    cambios.motivoRechazo ?? null,
    cambios.usuarioId ?? null,
    cambios.revisadoPor,
    id,
  );
}

function rutaPlantilla(tipo: string): string {
  return path.join(directorioArchivos("plantillas"), `${tipo}.pdf`);
}

export function existePlantilla(tipo: string): boolean {
  return fs.existsSync(rutaPlantilla(tipo));
}

export function leerPlantilla(tipo: string): Buffer | null {
  const ruta = rutaPlantilla(tipo);
  return fs.existsSync(ruta) ? fs.readFileSync(ruta) : null;
}

export function guardarPlantilla(tipo: string, datos: Buffer): void {
  fs.writeFileSync(rutaPlantilla(tipo), datos);
}

// Autoriza la solicitud y crea el usuario AGENTE con la contraseña que el
// agente eligió al registrarse.
export function autorizarSolicitud(id: number, adminId: number): number {
  return db.transaction(() => {
    const row = obtenerSolicitudRow(id);
    if (!row) throw new Error("Solicitud no encontrada.");
    const existente = db
      .prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
      .get(row.email) as { id: number } | undefined;
    if (existente) throw new Error("Ya existe un usuario con ese correo.");
    const info = db
      .prepare(
        "INSERT INTO users (email, nombre, password_hash, rol, activo) VALUES (?, ?, ?, 'AGENTE', 1)",
      )
      .run(row.email, row.nombre, row.password_hash);
    const usuarioId = Number(info.lastInsertRowid);
    marcarSolicitud(id, { estado: "AUTORIZADA", revisadoPor: adminId, usuarioId });
    return usuarioId;
  })();
}
