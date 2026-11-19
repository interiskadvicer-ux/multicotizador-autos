import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { directorioArchivos } from "@/lib/db";
import { leerCfdi } from "@/lib/bonos/cfdi";
import { registrarFactura, reportePorToken } from "@/lib/bonos/repositorio";
import { registrarActividad } from "@/lib/activity";

export const runtime = "nodejs";
const TAMANO_MAXIMO = 5 * 1024 * 1024;

// Público: el agente sube su factura con el enlace personal del correo.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const r = reportePorToken(params.token);
  if (!r) return NextResponse.json({ error: "Enlace inválido." }, { status: 404 });
  if (r.estado === "PAGADO") return NextResponse.json({ error: "Este bono ya fue pagado." }, { status: 409 });
  const form = await req.formData().catch(() => null);
  const pdf = form?.get("pdf");
  const xml = form?.get("xml");
  if (!(pdf instanceof File) || !(xml instanceof File) || pdf.size === 0 || xml.size === 0) {
    return NextResponse.json({ error: "Adjunta el PDF y el XML de tu factura." }, { status: 422 });
  }
  if (pdf.size > TAMANO_MAXIMO || xml.size > TAMANO_MAXIMO) {
    return NextResponse.json({ error: "Cada archivo debe pesar menos de 5 MB." }, { status: 413 });
  }
  const pdfBuf = Buffer.from(await pdf.arrayBuffer());
  if (pdfBuf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "El archivo PDF no es válido." }, { status: 422 });
  }
  const xmlTexto = Buffer.from(await xml.arrayBuffer()).toString("utf8");
  const cfdi = leerCfdi(xmlTexto);
  if (!cfdi) return NextResponse.json({ error: "El XML no es un CFDI válido." }, { status: 422 });
  if (cfdi.total !== null && Math.abs(cfdi.total - r.total) > 1) {
    return NextResponse.json(
      { error: `El total del XML (${cfdi.total.toFixed(2)}) no coincide con el total a facturar (${r.total.toFixed(2)}).` },
      { status: 422 },
    );
  }
  const dir = directorioArchivos("bonos", "facturas");
  const base = `${r.id}-${crypto.randomBytes(8).toString("hex")}`;
  fs.writeFileSync(path.join(dir, `${base}.pdf`), pdfBuf);
  fs.writeFileSync(path.join(dir, `${base}.xml`), xmlTexto, "utf8");
  registrarFactura(r.id, { pdf: `${base}.pdf`, xml: `${base}.xml`, uuid: cfdi.uuid, total: cfdi.total, rfc: cfdi.rfcEmisor });
  registrarActividad({ id: null, email: r.email ?? r.nombre }, "BONOS_FACTURA", `${r.nombre} ${r.anio}-${r.periodo} UUID ${cfdi.uuid ?? "?"}`);
  return NextResponse.json({ ok: true });
}
