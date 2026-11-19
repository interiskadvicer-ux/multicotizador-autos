import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarPolizas } from "@/lib/polizas";
import { conciliar, mismaAseguradora } from "@/lib/conciliacion";
import { guardarEstadoCuenta, listarEstadosCuenta, pagoDeEstadoCuenta } from "@/lib/pagos";
import { registrarActividad } from "@/lib/activity";
import { leerDocumento, tipoDeArchivo, type DocumentoEstado } from "@/lib/documento-estado";

export const runtime = "nodejs";

const ROLES = ["ADMIN", "POLIZAS"] as const;
const TAMANO_MAXIMO = 15 * 1024 * 1024;

export async function GET() {
  const { error } = await requireApiSesion([...ROLES]);
  if (error) return error;
  return NextResponse.json({ estadosCuenta: listarEstadosCuenta() });
}

// Sube un estado de cuenta (PDF, CSV o Excel), extrae su texto y propone los pagos de las
// pólizas cuyo número aparece en él. No registra pagos: eso se confirma en
// /api/cobranza/estados-cuenta/[id]/aplicar.
export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion([...ROLES]);
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const aseguradora = String(form?.get("aseguradora") ?? "").trim().slice(0, 80);
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Selecciona el archivo del estado de cuenta." }, { status: 422 });
  }
  const datos = Buffer.from(await archivo.arrayBuffer());
  const tipo = tipoDeArchivo(archivo.name, datos);
  if (datos.length > TAMANO_MAXIMO || !tipo) {
    return NextResponse.json(
      { error: "El archivo debe ser PDF, CSV o Excel (.xlsx) de máximo 15 MB." },
      { status: 422 },
    );
  }

  let doc: DocumentoEstado;
  try {
    doc = await leerDocumento(tipo, datos);
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 422 });
  }
  const caracteres = doc.renglones.reduce(
    (s, r) => s + r.celdas.reduce((t, c) => t + c.texto.length, 0),
    0,
  );

  const { id, cargadoEl } = guardarEstadoCuenta(aseguradora, archivo.name, tipo, datos, sesion.id);
  const polizas = listarPolizas()
    .filter((p) => !aseguradora || mismaAseguradora(p.aseguradora, aseguradora))
    .map((p) => ({ ...p, pagado: p.pagado ?? 0 }));
  const coincidencias = conciliar(doc, polizas).map((c) => ({
    ...c,
    yaAplicado: pagoDeEstadoCuenta(c.polizaId, id, c.recibo),
  }));
  registrarActividad(
    sesion,
    "ESTADO_CUENTA_CARGAR",
    `${archivo.name} (${aseguradora || "todas"}): ${coincidencias.length} pagos encontrados`,
  );
  return NextResponse.json({
    estadoCuentaId: id,
    cargadoEl,
    sinTexto: caracteres < 20,
    polizasRevisadas: polizas.length,
    coincidencias,
  });
}
