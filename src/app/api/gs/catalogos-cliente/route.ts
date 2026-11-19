import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { catalogosClienteGs } from "@/lib/gs/catalogos-cliente";
import { GsNoConfigurado } from "@/lib/gs/client";

// Estado civil, ocupación, giro y colonias (por CP) de General de Seguros.
export async function GET(req: Request) {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS", "COTIZADOR", "AGENTE"]);
  if (error) return error;
  const cp = new URL(req.url).searchParams.get("cp")?.trim() || undefined;
  try {
    return NextResponse.json(await catalogosClienteGs(cp));
  } catch (err) {
    if (err instanceof GsNoConfigurado) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error: `No se pudieron consultar los catálogos de General de Seguros${
          err instanceof Error ? `: ${err.message}` : "."
        }`,
      },
      { status: 502 },
    );
  }
}
