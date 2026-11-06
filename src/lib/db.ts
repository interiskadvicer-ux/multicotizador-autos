import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// Capa de acceso a datos con SQLite (better-sqlite3). Una sola base de datos
// en archivo, en el mismo servidor. La ruta se puede configurar con
// DATABASE_PATH; por defecto ./data/app.db.

function crearConexion(): Database.Database {
  const rutaConfig = process.env.DATABASE_PATH;
  const ruta = rutaConfig
    ? path.resolve(rutaConfig)
    : path.join(process.cwd(), "data", "app.db");

  fs.mkdirSync(path.dirname(ruta), { recursive: true });

  const database = new Database(ruta);
  // El build de Next abre la base en varios procesos a la vez.
  database.pragma("busy_timeout = 10000");
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  // Inmediata para que las migraciones no compitan entre procesos.
  database.transaction(() => inicializarEsquema(database)).immediate();
  return database;
}

function inicializarEsquema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_poliza TEXT NOT NULL,
      ramo TEXT NOT NULL,
      aseguradora TEXT NOT NULL,
      asegurado TEXT NOT NULL,
      prima_neta REAL NOT NULL,
      prima_total REAL NOT NULL,
      vigencia_inicio TEXT NOT NULL,
      vigencia_fin TEXT NOT NULL,
      notas TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      usuario_email TEXT NOT NULL,
      accion TEXT NOT NULL,
      detalle TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS agent_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT NOT NULL,
      rfc TEXT NOT NULL,
      estado_republica TEXT NOT NULL DEFAULT '',
      cedula TEXT,
      password_hash TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE',
      motivo_rechazo TEXT,
      usuario_id INTEGER,
      revisado_por INTEGER,
      revisado_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (revisado_por) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS agent_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      nombre_original TEXT NOT NULL,
      mime TEXT NOT NULL,
      tamano INTEGER NOT NULL,
      archivo TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES agent_applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'GUARDADA',
      cliente TEXT NOT NULL DEFAULT '',
      vehiculo TEXT NOT NULL DEFAULT '',
      request_json TEXT NOT NULL,
      resultados_json TEXT NOT NULL,
      seleccion_json TEXT,
      contratante_json TEXT,
      detalle_vehiculo_json TEXT,
      prima_total REAL,
      aseguradora TEXT,
      paquete TEXT,
      numero_poliza TEXT,
      notas_admin TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS insurer_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aseguradora TEXT NOT NULL DEFAULT '',
      nombre_original TEXT NOT NULL,
      archivo TEXT NOT NULL,
      tamano INTEGER NOT NULL,
      hash TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS policy_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poliza_id INTEGER NOT NULL,
      fecha_pago TEXT NOT NULL,
      monto REAL NOT NULL,
      referencia TEXT,
      origen TEXT NOT NULL DEFAULT 'MANUAL',
      statement_id INTEGER,
      notas TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (poliza_id) REFERENCES policies(id) ON DELETE CASCADE,
      FOREIGN KEY (statement_id) REFERENCES insurer_statements(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_policies_vigencia_fin ON policies(vigencia_fin);
    CREATE INDEX IF NOT EXISTS idx_payments_poliza ON policy_payments(poliza_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_statement
      ON policy_payments(poliza_id, statement_id) WHERE statement_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_quotes_usuario ON quotes(usuario_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_applications_email ON agent_applications(email);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
  `);

  const columnasPolizas = database
    .prepare("PRAGMA table_info(policies)")
    .all() as { name: string }[];
  if (!columnasPolizas.some((c) => c.name === "agente_id")) {
    database.exec(
      "ALTER TABLE policies ADD COLUMN agente_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  }
  const columnasCotizaciones = database
    .prepare("PRAGMA table_info(quotes)")
    .all() as { name: string }[];
  if (!columnasCotizaciones.some((c) => c.name === "poliza_id")) {
    database.exec(
      "ALTER TABLE quotes ADD COLUMN poliza_id INTEGER REFERENCES policies(id) ON DELETE SET NULL",
    );
  }
  const columnasEstados = database
    .prepare("PRAGMA table_info(insurer_statements)")
    .all() as { name: string }[];
  if (!columnasEstados.some((c) => c.name === "hash")) {
    database.exec("ALTER TABLE insurer_statements ADD COLUMN hash TEXT");
  }
  database.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_statements_hash ON insurer_statements(hash) WHERE hash IS NOT NULL",
  );
}

// Carpeta para archivos subidos (documentos de agentes, plantillas de
// contrato). Vive junto a la base de datos, fuera de `public/`.
export function directorioArchivos(...partes: string[]): string {
  const rutaConfig = process.env.DATABASE_PATH;
  const base = rutaConfig
    ? path.dirname(path.resolve(rutaConfig))
    : path.join(process.cwd(), "data");
  const dir = path.join(base, "uploads", ...partes);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// En desarrollo Next recarga módulos; reutilizamos una sola conexión global
// para no abrir múltiples handles al archivo.
const globalForDb = globalThis as unknown as {
  __cotizadorDb?: Database.Database;
};

export const db: Database.Database =
  globalForDb.__cotizadorDb ?? crearConexion();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__cotizadorDb = db;
}
