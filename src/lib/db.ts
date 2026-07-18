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
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  inicializarEsquema(database);
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

    CREATE INDEX IF NOT EXISTS idx_policies_vigencia_fin ON policies(vigencia_fin);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
  `);
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
