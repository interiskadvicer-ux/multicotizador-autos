import { NextResponse } from "next/server";
import { requireApiSesion } from "@/lib/api-auth";
import { leerDocumento, tipoDeArchivo } from "@/lib/documento-estado";
import { leerCaratula } from "@/lib/caratula";
import { guardarCaratula } from "@/lib/polizas";

const TAMANO_MAXIMO = 15 * 1024 * 1024;

// Lee la carátula de una póliza (PDF) y devuelve los datos detectados para
// prellenar el alta; el archivo queda guardado para asociarlo a la póliza.
export async function POST(req: Request) {
  const { error } = await requireApiSesion(["ADMIN", "POLIZAS"]);
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Selecciona el PDF de la póliza." }, { status: 422 });
  }
  const datos = Buffer.from(await archivo.arrayBuffer());
  if (datos.length > TAMANO_MAXIMO || tipoDeArchivo(archivo.name, datos) !== "pdf") {
    return NextResponse.json({ error: "El archivo debe ser PDF de máximo 15 MB." }, { status: 422 });
  }
  let doc;
  try {
    doc = await leerDocumento("pdf", datos);
  } catch {
    return NextResponse.json({ error: "No se pudo leer el PDF." }, { status: 422 });
  }
  const sinTexto = doc.renglones.reduce((s, r) => s + r.celdas.length, 0) < 5;
  return NextResponse.json({
    datos: sinTexto ? {} : leerCaratula(doc),
    sinTexto,
    caratula: guardarCaratula(datos),
  });
}
