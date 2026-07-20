import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Secret de sesión determinístico para las pruebas de JWT.
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET ?? "test-secret-para-pruebas-1234567890";

// Cada archivo de prueba usa su propia base SQLite temporal para que las
// pruebas con base de datos queden aisladas entre sí.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cotizador-test-"));
process.env.DATABASE_PATH = path.join(dir, "app.db");
