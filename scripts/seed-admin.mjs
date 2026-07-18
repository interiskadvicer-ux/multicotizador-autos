// Crea (o reactiva) el usuario administrador inicial a partir de variables de
// entorno. Idempotente: si ya existe un admin con ese correo, actualiza su
// contraseña y lo deja activo.
//
// Uso:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NOMBRE="..." node scripts/seed-admin.mjs
//
// Respeta DATABASE_PATH (por defecto ./data/app.db).

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const nombre = (process.env.ADMIN_NOMBRE ?? "Administrador").trim();

if (!email || !password) {
  console.error(
    "Faltan ADMIN_EMAIL y/o ADMIN_PASSWORD en el entorno. Aborta.",
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD debe tener al menos 8 caracteres. Aborta.");
  process.exit(1);
}

const ruta = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data", "app.db");
fs.mkdirSync(path.dirname(ruta), { recursive: true });

const db = new Database(ruta);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const hash = bcrypt.hashSync(password, 10);
const existente = db
  .prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE")
  .get(email);

if (existente) {
  db.prepare(
    "UPDATE users SET nombre = ?, password_hash = ?, rol = 'ADMIN', activo = 1 WHERE id = ?",
  ).run(nombre, hash, existente.id);
  console.log(`Administrador actualizado: ${email}`);
} else {
  db.prepare(
    "INSERT INTO users (email, nombre, password_hash, rol, activo) VALUES (?, ?, ?, 'ADMIN', 1)",
  ).run(email, nombre, hash);
  console.log(`Administrador creado: ${email}`);
}

db.close();
