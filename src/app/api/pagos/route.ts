import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { obtenerPoliza } from "@/lib/polizas";
import { listarPagos, pagoDeEstadoCuenta, parsePago, registrarPago } from "@/lib/pagos";
import { registrarActividad } from "@/lib/activity";
import { formatMXN } from "@/lib/format";

const ROLES = ["ADMIN", "POLIZAS"] as const;

export async function GET(req: Request) {
  const { error } = await requireApiSesion([...ROLES]);
  if (error) return error;
  const polizaId = Number(new URL(req.url).searchParams.get("polizaId")) || undefined;
  return NextResponse.json({ pagos: listarPagos(polizaId) });
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion([...ROLES]);
  if (error) return error;
  const parsed = parsePago(await req.json().catch(() => null));
  if (parsed.error !== null) return NextResponse.json({ error: parsed.error }, { status: 422 });
  const poliza = obtenerPoliza(parsed.data.polizaId);
  if (!poliza) return NextResponse.json({ error: "Póliza no encontrada." }, { status: 404 });
  if (parsed.data.recibo && pagoDeEstadoCuenta(poliza.id, 0, parsed.data.recibo)) {
    return NextResponse.json(
      { error: `El recibo ${parsed.data.recibo} ya está registrado en esta póliza.` },
      { status: 409 },
    );
  }
  const id = registrarPago({ ...parsed.data, origen: "MANUAL" }, sesion.id);
  registrarActividad(
    sesion,
    "PAGO_REGISTRAR",
    `Pago ${formatMXN(parsed.data.monto)} a póliza ${poliza.numeroPoliza}`,
  );
  return NextResponse.json({ id }, { status: 201 });
}
