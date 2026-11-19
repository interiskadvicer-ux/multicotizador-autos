import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { directorioArchivos } from "@/lib/db";
import { marcarPagado, obtenerReporte, revertirPago } from "@/lib/bonos/repositorio";

export const runtime = "nodejs";

// Descarga el PDF o XML de la factura subida por el agente.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const r = obtenerReporte(Number(params.id));
  const tipo = new URL(req.url).searchParams.get("archivo") === "xml" ? "xml" : "pdf";
  const nombre = tipo === "xml" ? r?.facturaXml : r?.facturaPdf;
  if (!r || !nombre) return NextResponse.json({ error: "Sin factura." }, { status: 404 });
  const ruta = path.join(directorioArchivos("bonos", "facturas"), path.basename(nombre));
  if (!fs.existsSync(ruta)) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  return new Response(fs.readFileSync(ruta), {
    headers: {
      "Content-Type": tipo === "xml" ? "application/xml" : "application/pdf",
      "Content-Disposition": `inline; filename="factura-${r.anio}-${r.periodo}-${r.id}.${tipo}"`,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const r = obtenerReporte(Number(params.id));
  if (!r) return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.accion === "pagar") {
      marcarPagado(r.id, String(body.fechaPago ?? ""), String(body.referencia ?? ""));
      registrarActividad(sesion, "BONOS_PAGAR", `${r.nombre} ${r.anio}-${r.periodo} ${r.total}`);
    } else if (body.accion === "revertir") {
      revertirPago(r.id);
      registrarActividad(sesion, "BONOS_REVERTIR_PAGO", `${r.nombre} ${r.anio}-${r.periodo}`);
    } else {
      return NextResponse.json({ error: "Acción inválida." }, { status: 422 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
  return NextResponse.json({ reporte: obtenerReporte(r.id) });
}
