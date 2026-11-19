import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  actualizarAgente,
  guardarConfig,
  guardarRamo,
  listarAgentes,
  listarRamos,
  listarRepartos,
  obtenerConfig,
} from "@/lib/bonos/repositorio";
import { smtpConfigurado } from "@/lib/bonos/correo";

export const runtime = "nodejs";

function catalogo() {
  return {
    agentes: listarAgentes(),
    repartos: listarRepartos(),
    ramos: listarRamos(),
    config: obtenerConfig(),
    smtp: smtpConfigurado(),
  };
}

export async function GET() {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  return NextResponse.json(catalogo());
}

export async function PATCH(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.agente) {
      const a = body.agente;
      actualizarAgente(Number(a.id), {
        subpromo: typeof a.subpromo === "string" ? a.subpromo : undefined,
        porcentaje: a.porcentaje === undefined ? undefined : Number(a.porcentaje),
        email: a.email === undefined ? undefined : String(a.email ?? ""),
        activo: typeof a.activo === "boolean" ? a.activo : undefined,
      });
    } else if (body.ramo) {
      guardarRamo({ subgrupo: String(body.ramo.subgrupo), grupo: String(body.ramo.grupo), porcentaje: Number(body.ramo.porcentaje) });
    } else if (body.config) {
      guardarConfig(body.config);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
  return NextResponse.json(catalogo());
}
