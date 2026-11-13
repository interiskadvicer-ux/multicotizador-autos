// Proceso diario de cobranza: consulta a cada aseguradora los pagos del día
// anterior, los registra en las pólizas y genera el reporte de pagadas,
// pendientes y canceladas.

import fs from "node:fs";
import path from "node:path";
import { db, directorioArchivos } from "@/lib/db";
import type { ResultadoFuente } from "@/domain/cobranza";
import { sincronizarAfirme } from "./afirme";
import { sincronizarHdi } from "./hdi";
import { armarReporte, excelReporte, resumenTexto, type ReporteCobranza } from "./reporte";
import { correoConfigurado, enviarReporte } from "./correo";

type Fuente = (fechaCorte: string) => Promise<ResultadoFuente>;

const pendiente =
  (aseguradora: string, mensaje: string): Fuente =>
  async () => ({
    aseguradora,
    estado: "SIN_CONFIGURAR",
    mensaje,
    polizasRevisadas: 0,
    pagosNuevos: 0,
    cancelaciones: 0,
    errores: [],
  });

const SIN_PORTAL = "Conector del portal de agentes pendiente (faltan accesos).";

export const FUENTES: Fuente[] = [
  sincronizarAfirme,
  pendiente("Zurich", "Conector WSInfoRecibosPago pendiente (falta el manual del servicio)."),
  pendiente("Quálitas", SIN_PORTAL),
  pendiente("Banorte", SIN_PORTAL),
  pendiente("El Potosí", SIN_PORTAL),
  sincronizarHdi,
  pendiente("General de Seguros", SIN_PORTAL),
];

// Fecha (yyyy-mm-dd) en la zona horaria del negocio.
export function fechaLocal(desfaseDias = 0, ahora = new Date()): string {
  const d = new Date(ahora.getTime() + desfaseDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.COBRANZA_ZONA_HORARIA || "America/Mexico_City",
  }).format(d);
}

export interface EjecucionCobranza {
  id: number;
  reporte: ReporteCobranza;
  archivo: string;
  correoEnviado: boolean;
  errorCorreo: string | null;
}

export async function ejecutarCobranzaDiaria(opciones: {
  fechaCorte?: string;
  enviarCorreo?: boolean;
} = {}): Promise<EjecucionCobranza> {
  const fechaCorte = opciones.fechaCorte ?? fechaLocal(-1);
  const info = db.prepare("INSERT INTO cobranza_ejecuciones (fecha_corte) VALUES (?)").run(fechaCorte);
  const id = Number(info.lastInsertRowid);
  const { ultimo } = db
    .prepare("SELECT COALESCE(MAX(id), 0) AS ultimo FROM policy_payments")
    .get() as { ultimo: number };

  // Una aseguradora caída no detiene a las demás.
  const fuentes: ResultadoFuente[] = [];
  for (const fuente of FUENTES) {
    try {
      fuentes.push(await fuente(fechaCorte));
    } catch (err) {
      fuentes.push({
        aseguradora: fuente.name || "Desconocida",
        estado: "ERROR",
        mensaje: err instanceof Error ? err.message : String(err),
        polizasRevisadas: 0,
        pagosNuevos: 0,
        cancelaciones: 0,
        errores: [],
      });
    }
  }

  const reporte = armarReporte(fechaCorte, ultimo, fuentes);
  const datos = await excelReporte(reporte);
  const archivo = `cobranza-${fechaCorte}-${id}.xlsx`;
  fs.writeFileSync(path.join(directorioArchivos("reportes-cobranza"), archivo), datos);
  db.prepare(
    "UPDATE cobranza_ejecuciones SET fin = datetime('now'), resultados = ?, reporte = ? WHERE id = ?",
  ).run(JSON.stringify(fuentes), archivo, id);

  let correoEnviado = false;
  let errorCorreo: string | null = null;
  if (opciones.enviarCorreo !== false && correoConfigurado()) {
    const fallas = fuentes.filter((f) => f.estado === "ERROR" || f.errores.length);
    try {
      await enviarReporte({
        asunto: `Reporte de cobranza ${fechaCorte}${fallas.length ? " (con errores)" : ""}`,
        lineas: [
          ...resumenTexto(reporte),
          "",
          ...fuentes.map((f) => `${f.aseguradora}: ${f.mensaje}`),
        ],
        adjunto: { nombre: archivo, datos },
      });
      correoEnviado = true;
    } catch (err) {
      errorCorreo = err instanceof Error ? err.message : String(err);
    }
  }
  return { id, reporte, archivo, correoEnviado, errorCorreo };
}
