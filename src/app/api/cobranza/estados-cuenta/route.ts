import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarPolizas } from "@/lib/polizas";
import { conciliar, mismaAseguradora } from "@/lib/conciliacion";
import { guardarEstadoCuenta, listarEstadosCuenta } from "@/lib/pagos";
import { registrarActividad } from "@/lib/activity";
import { extraerTextoPdf } from "@/lib/pdf-texto";

export const runtime = "nodejs";

const ROLES = ["ADMIN", "POLIZAS"] as const;
const TAMANO_MAXIMO = 15 * 1024 * 1024;

export async function GET() {
  const { error } = await requireApiSesion([...ROLES]);
  if (error) return error;
  return NextResponse.json({ estadosCuenta: listarEstadosCuenta() });
}

// Sube un estado de cuenta (PDF), extrae su texto y propone los pagos de las
// pólizas cuyo número aparece en él. No registra pagos: eso se confirma en
// /api/cobranza/estados-cuenta/[id]/aplicar.
export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion([...ROLES]);
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const aseguradora = String(form?.get("aseguradora") ?? "").trim().slice(0, 80);
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Selecciona el PDF del estado de cuenta." }, { status: 422 });
  }
  const datos = Buffer.from(await archivo.arrayBuffer());
  if (datos.length > TAMANO_MAXIMO || datos.subarray(0, 4).toString() !== "%PDF") {
    return NextResponse.json(
      { error: "El archivo debe ser un PDF de máximo 15 MB." },
      { status: 422 },
    );
  }

  let texto = "";
  try {
    texto = await extraerTextoPdf(datos);
  } catch {
    return NextResponse.json({ error: "No se pudo leer el PDF." }, { status: 422 });
  }

  const id = guardarEstadoCuenta(aseguradora, archivo.name, datos, sesion.id);
  const polizas = listarPolizas()
    .filter((p) => !aseguradora || mismaAseguradora(p.aseguradora, aseguradora))
    .map((p) => ({ ...p, pagado: p.pagado ?? 0 }));
  const coincidencias = conciliar(texto, polizas);
  registrarActividad(
    sesion,
    "ESTADO_CUENTA_CARGAR",
    `${archivo.name} (${aseguradora || "todas"}): ${coincidencias.length} pólizas encontradas`,
  );
  return NextResponse.json({
    estadoCuentaId: id,
    sinTexto: texto.replace(/\s/g, "").length < 20,
    polizasRevisadas: polizas.length,
    coincidencias,
  });
}
