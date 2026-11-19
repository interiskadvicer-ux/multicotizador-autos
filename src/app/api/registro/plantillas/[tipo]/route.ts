import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import {
  PLANTILLAS_CONTRATO,
  TAMANO_MAXIMO,
  guardarPlantilla,
  leerPlantilla,
} from "@/lib/agentes";
import { registrarActividad } from "@/lib/activity";

function plantilla(tipo: string) {
  return PLANTILLAS_CONTRATO.find((p) => p.tipo === tipo);
}

// Público: el agente descarga el contrato para firmarlo.
export async function GET(_req: Request, { params }: { params: { tipo: string } }) {
  const meta = plantilla(params.tipo);
  const datos = meta ? leerPlantilla(meta.tipo) : null;
  if (!meta || !datos) {
    return NextResponse.json({ error: "Plantilla no disponible." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(datos), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${meta.tipo}.pdf"`,
    },
  });
}

export async function POST(req: Request, { params }: { params: { tipo: string } }) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const meta = plantilla(params.tipo);
  if (!meta) return NextResponse.json({ error: "Plantilla no válida." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const f = form?.get("archivo");
  if (!f || typeof f === "string" || f.size === 0) {
    return NextResponse.json({ error: "Selecciona un PDF." }, { status: 422 });
  }
  const datos = Buffer.from(await f.arrayBuffer());
  if (f.size > TAMANO_MAXIMO || datos.subarray(0, 4).toString() !== "%PDF") {
    return NextResponse.json({ error: "El archivo debe ser un PDF de máximo 5 MB." }, { status: 422 });
  }
  guardarPlantilla(meta.tipo, datos);
  registrarActividad(sesion, "PLANTILLA_CONTRATO", `Actualizó plantilla: ${meta.label}`);
  return NextResponse.json({ ok: true });
}
