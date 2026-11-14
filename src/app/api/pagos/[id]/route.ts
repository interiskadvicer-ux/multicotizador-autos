import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { eliminarPago } from "@/lib/pagos";
import { registrarActividad } from "@/lib/activity";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { sesion, error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  if (!eliminarPago(Number(params.id))) {
    return NextResponse.json({ error: "Pago no encontrado." }, { status: 404 });
  }
  registrarActividad(sesion, "PAGO_ELIMINAR", `Pago #${params.id}`);
  return NextResponse.json({ ok: true });
}
