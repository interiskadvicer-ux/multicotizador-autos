import type Database from "better-sqlite3";

// Tablas de bonos de agentes (El Potosí): producción mensual, catálogo de
// agentes y ramos, repartos entre agentes y reportes con su factura.
export function inicializarEsquemaBonos(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS bono_agentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      subpromo TEXT NOT NULL DEFAULT 'SIN ASIGNAR',
      porcentaje REAL NOT NULL DEFAULT 0,
      email TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bono_claves (
      clave TEXT PRIMARY KEY,
      agente_id INTEGER NOT NULL,
      FOREIGN KEY (agente_id) REFERENCES bono_agentes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bono_ramos (
      subgrupo TEXT PRIMARY KEY,
      grupo_bono TEXT NOT NULL,
      porcentaje REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bono_repartos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origen_id INTEGER NOT NULL,
      destino_id INTEGER NOT NULL,
      porcentaje REAL NOT NULL,
      FOREIGN KEY (origen_id) REFERENCES bono_agentes(id) ON DELETE CASCADE,
      FOREIGN KEY (destino_id) REFERENCES bono_agentes(id) ON DELETE CASCADE,
      UNIQUE (origen_id, destino_id)
    );

    CREATE TABLE IF NOT EXISTS bono_config (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bono_cargas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      nombre_original TEXT NOT NULL,
      filas INTEGER NOT NULL,
      prima_cobrada REAL NOT NULL,
      ponderado REAL NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (anio, mes)
    );

    CREATE TABLE IF NOT EXISTS bono_produccion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carga_id INTEGER NOT NULL,
      anio INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      agente_id INTEGER NOT NULL,
      clave TEXT NOT NULL,
      agente TEXT NOT NULL,
      grupo TEXT NOT NULL,
      subgrupo TEXT NOT NULL,
      prima_emitida REAL NOT NULL DEFAULT 0,
      prima_cobrada REAL NOT NULL DEFAULT 0,
      comision REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (carga_id) REFERENCES bono_cargas(id) ON DELETE CASCADE,
      FOREIGN KEY (agente_id) REFERENCES bono_agentes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bono_reportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      anio INTEGER NOT NULL,
      periodo INTEGER NOT NULL,
      agente_id INTEGER,
      nombre TEXT NOT NULL,
      email TEXT,
      base REAL NOT NULL,
      bono REAL NOT NULL,
      iva REAL NOT NULL,
      ret_isr REAL NOT NULL,
      ret_iva REAL NOT NULL,
      total REAL NOT NULL,
      detalle_json TEXT NOT NULL DEFAULT '{}',
      token TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL DEFAULT 'GENERADO',
      enviado_at TEXT,
      factura_pdf TEXT,
      factura_xml TEXT,
      factura_uuid TEXT,
      factura_total REAL,
      factura_rfc TEXT,
      facturado_at TEXT,
      fecha_pago TEXT,
      referencia_pago TEXT,
      pagado_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agente_id) REFERENCES bono_agentes(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_bono_reportes_periodo
      ON bono_reportes(tipo, anio, periodo, IFNULL(agente_id, 0));
    CREATE INDEX IF NOT EXISTS idx_bono_produccion_periodo ON bono_produccion(anio, mes);
  `);
}
