import nodemailer from "nodemailer";
import { formatMXN } from "@/lib/format";
import type { ConfigBonos, ReporteBono } from "./repositorio";
import { etiquetaBimestre, etiquetaMes } from "./normalizar";

export function smtpConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function etiquetaPeriodo(r: Pick<ReporteBono, "tipo" | "anio" | "periodo">): string {
  return r.tipo === "AGENTE" ? etiquetaBimestre(r.anio, r.periodo) : etiquetaMes(r.anio, r.periodo);
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function lineasImporte(r: ReporteBono): [string, string][] {
  const filas: [string, string][] = [
    [r.tipo === "AGENTE" ? "Prima computable cobrada Autos/Daños" : "Bono sin agentes (antes de ponderado)", formatMXN(r.base)],
    ["Bono", formatMXN(r.bono)],
    ["IVA", formatMXN(r.iva)],
  ];
  if (r.retIsr) filas.push(["Retención ISR", `-${formatMXN(r.retIsr)}`]);
  if (r.retIva) filas.push(["Retención IVA", `-${formatMXN(r.retIva)}`]);
  filas.push(["Total a facturar", formatMXN(r.total)]);
  return filas;
}

export async function enviarReporteBono(r: ReporteBono, para: string, enlace: string, config: ConfigBonos): Promise<void> {
  const puerto = Number(process.env.SMTP_PORT) || 587;
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const periodo = etiquetaPeriodo(r);
  const filas = lineasImporte(r);
  const html = `
<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px">
  <p>Hola ${escapar(r.nombre)},</p>
  <p>Estas son tus cifras de bono El Potosí del <b>${escapar(periodo)}</b>:</p>
  <table style="border-collapse:collapse;width:100%">
    ${filas.map(([k, v], i) => `<tr style="${i === filas.length - 1 ? "font-weight:bold;border-top:2px solid #0369a1" : ""}"><td style="padding:6px 8px">${escapar(k)}</td><td style="padding:6px 8px;text-align:right">${escapar(v)}</td></tr>`).join("")}
  </table>
  ${config.datosFacturacion ? `<p><b>Datos para tu factura:</b><br>${escapar(config.datosFacturacion).replace(/\n/g, "<br>")}</p>` : ""}
  <p>Sube tu factura (PDF y XML) en este enlace:</p>
  <p><a href="${escapar(enlace)}" style="background:#0369a1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Ver mi reporte y subir factura</a></p>
  <p style="color:#64748b;font-size:12px">Este enlace es personal; no lo compartas.</p>
  <p>Interiskad</p>
</div>`;
  const texto = [
    `Hola ${r.nombre},`,
    `Tus cifras de bono El Potosí del ${periodo}:`,
    ...filas.map(([k, v]) => `${k}: ${v}`),
    config.datosFacturacion ? `\nDatos para tu factura:\n${config.datosFacturacion}` : "",
    `\nSube tu factura (PDF y XML) en: ${enlace}`,
  ].join("\n");
  await transporte.sendMail({
    from: process.env.BONOS_CORREO_DE || process.env.COBRANZA_CORREO_DE || process.env.SMTP_USER,
    to: para,
    cc: config.correoCopia || undefined,
    subject: `Bono El Potosí ${periodo} – ${r.nombre}`,
    text: texto,
    html,
  });
}
