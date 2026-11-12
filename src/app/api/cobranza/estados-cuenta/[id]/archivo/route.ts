import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { leerEstadoCuenta } from "@/lib/pagos";

const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;
  const archivo = leerEstadoCuenta(Number(params.id));
  if (!archivo) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(archivo.datos), {
    headers: {
      "Content-Type": TIPOS[archivo.extension] ?? "application/octet-stream",
      "Content-Disposition": `${archivo.extension === "pdf" ? "inline" : "attachment"}; filename="${encodeURIComponent(archivo.nombreOriginal)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
