import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { leerDocumento } from "@/lib/agentes";

export async function GET(
  _req: Request,
  { params }: { params: { id: string; docId: string } },
) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const doc = leerDocumento(Number(params.id), Number(params.docId));
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(doc.datos), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.nombre)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
