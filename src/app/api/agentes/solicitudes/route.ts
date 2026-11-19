import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { listarSolicitudes } from "@/lib/agentes";

export async function GET() {
  const { error } = await requireApiSesion(["ADMIN"]);
  if (error) return error;
  return NextResponse.json({ solicitudes: listarSolicitudes() });
}
