// Proceso diario de cobranza. Uso:
//   npm run cobranza:diaria [-- --fecha 2026-11-12] [-- --sin-correo]
// Lee el mismo .env que la aplicación (dotenv de Next).
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--fecha");
  const fechaCorte = i >= 0 ? args[i + 1] : undefined;
  if (fechaCorte !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
    throw new Error("--fecha debe tener el formato AAAA-MM-DD");
  }
  // Import dinámico: db.ts abre la base con DATABASE_PATH ya cargado.
  const { ejecutarCobranzaDiaria } = await import("../src/lib/cobranza-diaria");
  const r = await ejecutarCobranzaDiaria({ fechaCorte, enviarCorreo: !args.includes("--sin-correo") });
  console.log(`Corte ${r.reporte.fechaCorte} (ejecución ${r.id}): reporte ${r.archivo}`);
  for (const f of r.reporte.fuentes) console.log(`  ${f.aseguradora} [${f.estado}] ${f.mensaje}`);
  for (const f of r.reporte.fuentes) {
    for (const e of f.errores) console.log(`    ${e.numeroPoliza}: ${e.mensaje}`);
  }
  console.log(
    `  Pagadas ${r.reporte.pagadas.length}, pendientes ${r.reporte.pendientes.length}, canceladas ${r.reporte.canceladas.length}`,
  );
  if (r.correoEnviado) console.log("  Correo enviado.");
  if (r.errorCorreo) console.error(`  No se pudo enviar el correo: ${r.errorCorreo}`);
  const fallo = r.reporte.fuentes.some((f) => f.estado === "ERROR") || r.errorCorreo;
  process.exitCode = fallo ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
