import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { leerCaratulaArchivo, obtenerPoliza } from "@/lib/polizas";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS", "AGENTE"]);
  if (error) return error;
  const poliza = obtenerPoliza(Number(params.id));
  if (!poliza || (sesion.rol === "AGENTE" && poliza.agenteId !== sesion.id)) {
    return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  }
  const datos = poliza.caratula ? leerCaratulaArchivo(poliza.caratula) : null;
  if (!datos) return NextResponse.json({ error: "La póliza no tiene PDF." }, { status: 404 });
  return new NextResponse(new Uint8Array(datos), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="poliza-${encodeURIComponent(poliza.numeroPoliza)}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
