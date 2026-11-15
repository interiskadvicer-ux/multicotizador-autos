import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import { cotizarAura } from "@/lib/gmm/aura";
import {
  COASEGUROS,
  DEDUCIBLES,
  EDAD_MAXIMA,
  ESTADOS,
  FORMAS_PAGO,
  MAX_ASEGURADOS,
  NIVELES_HOSPITALARIOS,
  PARENTESCOS,
  SUMAS_ASEGURADAS,
  TABULADORES,
  TOPES_COASEGURO,
  type SolicitudGmm,
} from "@/lib/gmm/opciones";

const incluye = (lista: readonly unknown[], v: unknown) => lista.includes(v);

function validar(b: SolicitudGmm): string | null {
  if (!incluye(SUMAS_ASEGURADAS, b.sumaAsegurada)) return "Suma asegurada no válida.";
  if (!incluye(DEDUCIBLES, b.deducible)) return "Deducible no válido.";
  if (!incluye(COASEGUROS, b.coaseguro)) return "Coaseguro no válido.";
  if (!incluye(TOPES_COASEGURO, b.topeCoaseguro)) return "Tope de coaseguro no válido.";
  if (!incluye(NIVELES_HOSPITALARIOS, b.nivelHospitalario)) return "Nivel hospitalario no válido.";
  if (!incluye(ESTADOS, b.estado)) return "Estado no válido.";
  if (!incluye(TABULADORES, b.tabulador)) return "Tabulador de honorarios no válido.";
  if (!incluye(FORMAS_PAGO, b.formaPago)) return "Forma de pago no válida.";
  if (!Array.isArray(b.asegurados) || b.asegurados.length === 0)
    return "Agrega al menos un asegurado.";
  if (b.asegurados.length > MAX_ASEGURADOS) return `Máximo ${MAX_ASEGURADOS} asegurados.`;
  for (const a of b.asegurados) {
    if (!incluye(PARENTESCOS, a.parentesco)) return "Parentesco no válido.";
    if (a.sexo !== "F" && a.sexo !== "M") return "Indica el sexo de cada asegurado.";
    if (!Number.isInteger(a.edad) || a.edad < 0 || a.edad > EDAD_MAXIMA)
      return `La edad debe estar entre 0 y ${EDAD_MAXIMA} años.`;
  }
  return null;
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion();
  if (error) return error;
  let body: SolicitudGmm;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const invalido = validar(body);
  if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });
  body.emergenciaExtranjero = body.emergenciaExtranjero === true;
  body.asegurados = body.asegurados.map((a) => ({
    nombre: String(a.nombre ?? "").slice(0, 120),
    parentesco: a.parentesco,
    sexo: a.sexo,
    edad: a.edad,
  }));
  const resultado = cotizarAura(body);
  registrarActividad(
    sesion,
    "COTIZAR",
    `Cotizó GMM AURA (${body.asegurados.length} asegurado(s), SA ${body.sumaAsegurada})`,
  );
  return NextResponse.json({ resultado });
}
