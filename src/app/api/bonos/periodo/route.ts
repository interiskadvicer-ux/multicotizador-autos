import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import {
  calcularBimestre,
  calcularMesPromotor,
  generarReportePromotor,
  generarReportesBimestre,
  listarReportes,
} from "@/lib/bonos/repositorio";
import { etiquetaBimestre, etiquetaMes } from "@/lib/bonos/normalizar";
import { leerParametros } from "./parametros";

export const runtime = "nodejs";

function datos(p: NonNullable<ReturnType<typeof leerParametros>>) {
  const reportes = listarReportes(p.tipo, p.anio, p.periodo);
  if (p.tipo === "AGENTE") {
    return { etiqueta: etiquetaBimestre(p.anio, p.periodo), ...calcularBimestre(p.anio, p.periodo), reportes };
  }
  return { etiqueta: etiquetaMes(p.anio, p.periodo), ...calcularMesPromotor(p.anio, p.periodo), reportes };
}

export async function GET(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const p = leerParametros(new URL(req.url));
  if (!p) return NextResponse.json({ error: "Periodo inválido." }, { status: 422 });
  return NextResponse.json(datos(p));
}

// Genera (o actualiza) los reportes del periodo con las cifras calculadas.
export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const p = leerParametros(await req.json().catch(() => ({})));
  if (!p) return NextResponse.json({ error: "Periodo inválido." }, { status: 422 });
  const r = p.tipo === "AGENTE" ? generarReportesBimestre(p.anio, p.periodo) : generarReportePromotor(p.anio, p.periodo);
  registrarActividad(sesion, "BONOS_GENERAR", `${p.tipo} ${p.anio}-${p.periodo}: ${r.creados} nuevos, ${r.actualizados} actualizados`);
  return NextResponse.json({ ...datos(p), generacion: r });
}
