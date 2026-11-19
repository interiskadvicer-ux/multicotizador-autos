import { requireApiSesion } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { calcularBimestre, calcularMesPromotor, listarReportes, obtenerConfig } from "@/lib/bonos/repositorio";
import { excelAgentes, excelPromotor } from "@/lib/bonos/excel";
import { etiquetaBimestre, etiquetaMes } from "@/lib/bonos/normalizar";
import { leerParametros } from "../parametros";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const p = leerParametros(new URL(req.url));
  if (!p) return NextResponse.json({ error: "Periodo inválido." }, { status: 422 });
  let data: ArrayBuffer;
  let nombre: string;
  if (p.tipo === "AGENTE") {
    const etiqueta = etiquetaBimestre(p.anio, p.periodo);
    data = await excelAgentes(etiqueta, calcularBimestre(p.anio, p.periodo).resultados, listarReportes("AGENTE", p.anio, p.periodo));
    nombre = `bonos-agentes-${p.anio}-bim${p.periodo}.xlsx`;
  } else {
    const config = obtenerConfig();
    data = await excelPromotor(etiquetaMes(p.anio, p.periodo), config.promotorNombre, calcularMesPromotor(p.anio, p.periodo).resultado,
      listarReportes("PROMOTOR", p.anio, p.periodo)[0]);
    nombre = `bono-promotor-${p.anio}-${String(p.periodo).padStart(2, "0")}.xlsx`;
  }
  return new Response(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
