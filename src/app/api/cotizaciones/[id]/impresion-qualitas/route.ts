import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { obtenerCotizacion } from "@/lib/cotizaciones";
import { ambienteEmision } from "@/lib/qualitas/emision";
import { recuperarImpresion } from "@/lib/qualitas/impresion";

// Ligas a los PDF de póliza, recibo y anexos de una póliza emitida en Quálitas.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS", "COTIZADOR", "AGENTE"]);
  if (error) return error;
  const cot = obtenerCotizacion(Number(params.id));
  if (
    !cot ||
    (sesion.rol !== "ADMIN" && cot.usuarioId !== sesion.id) ||
    cot.estado !== "EMITIDA" ||
    !cot.numeroPoliza ||
    cot.seleccion?.aseguradoraId !== "qualitas"
  ) {
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }
  try {
    const ligas = await recuperarImpresion(cot.numeroPoliza, ambienteEmision());
    return NextResponse.json(ligas, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo obtener la impresión: ${err instanceof Error ? err.message : "error"}` },
      { status: 502 },
    );
  }
}
