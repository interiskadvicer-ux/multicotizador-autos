import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { registrarActividad } from "@/lib/activity";
import {
  PRODUCTOS_BANORTE,
  camposBanorte,
  cotizarBanorte,
  type ProductoBanorte,
  type SolicitudBanorte,
} from "@/lib/gmm/banorte/productos";

const esProducto = (p: unknown): p is ProductoBanorte =>
  PRODUCTOS_BANORTE.includes(p as ProductoBanorte);

export async function GET(req: Request) {
  const { error } = await requireApiSesion();
  if (error) return error;
  const producto = new URL(req.url).searchParams.get("producto");
  if (!esProducto(producto))
    return NextResponse.json({ error: "Producto no válido." }, { status: 400 });
  return NextResponse.json(camposBanorte(producto));
}

export async function POST(req: Request) {
  const { sesion, error } = await requireApiSesion();
  if (error) return error;
  let body: SolicitudBanorte;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!esProducto(body?.producto))
    return NextResponse.json({ error: "Producto no válido." }, { status: 400 });
  if (!Array.isArray(body.asegurados) || body.asegurados.length === 0)
    return NextResponse.json({ error: "Agrega al menos un asegurado." }, { status: 400 });
  for (const a of body.asegurados) {
    if (a?.sexo !== "F" && a?.sexo !== "M")
      return NextResponse.json({ error: "Indica el sexo de cada asegurado." }, { status: 400 });
    if (!Number.isInteger(a.edad) || a.edad < 0 || a.edad > 100)
      return NextResponse.json({ error: "Edad no válida." }, { status: 400 });
  }
  const valores: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(body.valores ?? {}))
    if (typeof v === "string" || typeof v === "number") valores[k] = v;
  try {
    const resultado = cotizarBanorte({
      producto: body.producto,
      valores,
      asegurados: body.asegurados.map((a) => ({
        nombre: String(a.nombre ?? "").slice(0, 120),
        sexo: a.sexo,
        edad: a.edad,
      })),
    });
    registrarActividad(
      sesion,
      "COTIZAR",
      `Cotizó GMM ${resultado.nombre} (${body.asegurados.length} asegurado(s))`,
    );
    return NextResponse.json({ resultado });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo cotizar." },
      { status: 400 },
    );
  }
}
