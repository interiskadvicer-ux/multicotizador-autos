import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { leerEstadoCuenta } from "@/lib/pagos";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;
  const archivo = leerEstadoCuenta(Number(params.id));
  if (!archivo) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(archivo.datos), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(archivo.nombreOriginal)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
