import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { leerCorreos, leerLibro } from "@/lib/bonos/importar";
import { importarCorreos } from "@/lib/bonos/repositorio";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0 || archivo.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Selecciona un Excel de hasta 5 MB." }, { status: 422 });
  }
  try {
    const filas = leerCorreos(await leerLibro(await archivo.arrayBuffer()));
    return NextResponse.json(importarCorreos(filas));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
