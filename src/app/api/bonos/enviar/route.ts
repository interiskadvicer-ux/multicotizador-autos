import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { enviarReporteBono, smtpConfigurado } from "@/lib/bonos/correo";
import { listarAgentes, marcarEnviado, obtenerConfig, obtenerReporte } from "@/lib/bonos/repositorio";

export const runtime = "nodejs";

function urlPortal(req: Request, configurada: string): string {
  if (configurada) return configurada.replace(/\/+$/, "");
  if (process.env.PORTAL_URL) return process.env.PORTAL_URL.replace(/\/+$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// Envía por correo el reporte con el enlace personal para subir la factura.
export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  if (!smtpConfigurado()) {
    return NextResponse.json({ error: "El correo (SMTP) no está configurado en el servidor." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger).slice(0, 200) : [];
  const config = obtenerConfig();
  const base = urlPortal(req, config.portalUrl);
  const emails = new Map(listarAgentes().map((a) => [a.id, a.email]));
  const enviados: string[] = [];
  const errores: string[] = [];
  for (const id of ids) {
    const r = obtenerReporte(id);
    if (!r) continue;
    const para = r.tipo === "PROMOTOR" ? config.promotorEmail : (r.agenteId ? emails.get(r.agenteId) : null) ?? r.email;
    if (!para) {
      errores.push(`${r.nombre}: sin correo`);
      continue;
    }
    try {
      await enviarReporteBono(r, para, `${base}/bonos/factura/${r.token}`, config);
      marcarEnviado(r.id, para);
      enviados.push(r.nombre);
    } catch (e) {
      errores.push(`${r.nombre}: ${(e as Error).message}`);
    }
  }
  registrarActividad(sesion, "BONOS_ENVIAR", `${enviados.length} enviados, ${errores.length} con error`);
  return NextResponse.json({ enviados, errores });
}
