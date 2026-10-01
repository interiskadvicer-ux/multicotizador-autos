import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarRecibos } from "@/lib/polizas";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Póliza no válida." }, { status: 400 });
  }
  return NextResponse.json({ recibos: listarRecibos(id) });
}
