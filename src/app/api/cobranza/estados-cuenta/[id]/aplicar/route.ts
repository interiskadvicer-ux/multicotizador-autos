import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { obtenerPoliza } from "@/lib/polizas";
import { pagoDeEstadoCuenta, parsePago, registrarPago, type PagoInput } from "@/lib/pagos";
import { registrarActividad } from "@/lib/activity";

// Registra como pagadas las pólizas confirmadas de un estado de cuenta.
// Una póliza solo se aplica una vez por estado de cuenta.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { sesion, error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;
  const statementId = Number(params.id);
  const existe = db.prepare("SELECT 1 FROM insurer_statements WHERE id = ?").get(statementId);
  if (!existe) return NextResponse.json({ error: "Estado de cuenta no encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { pagos?: unknown[] } | null;
  const pagos = Array.isArray(body?.pagos) ? body!.pagos : [];
  if (pagos.length === 0) {
    return NextResponse.json({ error: "Selecciona al menos una póliza." }, { status: 422 });
  }

  const validos: PagoInput[] = [];
  for (const p of pagos) {
    const parsed = parsePago(p);
    if (parsed.error !== null) return NextResponse.json({ error: parsed.error }, { status: 422 });
    if (!obtenerPoliza(parsed.data.polizaId)) {
      return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
    }
    validos.push(parsed.data);
  }

  let aplicados = 0;
  let omitidos = 0;
  db.transaction(() => {
    for (const p of validos) {
      if (pagoDeEstadoCuenta(p.polizaId, statementId, p.recibo)) {
        omitidos++;
        continue;
      }
      registrarPago({ ...p, origen: "ESTADO_CUENTA", statementId }, sesion.id);
      aplicados++;
    }
  })();
  registrarActividad(
    sesion,
    "ESTADO_CUENTA_APLICAR",
    `Estado de cuenta #${statementId}: ${aplicados} pagos registrados`,
  );
  return NextResponse.json({ aplicados, omitidos });
}
