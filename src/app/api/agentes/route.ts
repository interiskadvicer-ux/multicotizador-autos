import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarUsuarios } from "@/lib/auth";

// Agentes autorizados (para asignarles pólizas).
export async function GET() {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;
  const agentes = listarUsuarios()
    .filter((u) => u.rol === "AGENTE")
    .map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, activo: u.activo }));
  return NextResponse.json({ agentes });
}
