// Envío del reporte diario por correo (SMTP). Sin SMTP_HOST o sin
// destinatarios no se envía y el reporte solo queda guardado en el servidor.

import nodemailer from "nodemailer";

export interface CorreoReporte {
  asunto: string;
  lineas: string[];
  adjunto: { nombre: string; datos: Buffer };
}

export function correoConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.COBRANZA_CORREO_PARA);
}

export async function enviarReporte(c: CorreoReporte): Promise<void> {
  const puerto = Number(process.env.SMTP_PORT) || 587;
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transporte.sendMail({
    from: process.env.COBRANZA_CORREO_DE || process.env.SMTP_USER,
    to: process.env.COBRANZA_CORREO_PARA,
    subject: c.asunto,
    text: c.lineas.join("\n"),
    attachments: [{ filename: c.adjunto.nombre, content: c.adjunto.datos }],
  });
}
