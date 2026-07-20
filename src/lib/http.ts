import { NextResponse } from "next/server";

// Helpers compartidos para los route handlers de la API. Centralizan los
// patrones que se repetían en cada endpoint (respuestas de error, parseo del
// cuerpo JSON y descargas de Excel) para mantener las rutas concisas y
// consistentes.

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

type BodyResult<T> =
  | { data: T; error: null }
  | { data: null; error: NextResponse };

// Lee y parsea el cuerpo JSON de la petición. Si el JSON es inválido devuelve
// un `error` (NextResponse 400) listo para retornar desde el handler.
export async function parseJsonBody<T = unknown>(
  req: Request,
  mensajeError = "Solicitud inválida.",
): Promise<BodyResult<T>> {
  try {
    return { data: (await req.json()) as T, error: null };
  } catch {
    return { data: null, error: jsonError(mensajeError, 400) };
  }
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Construye la respuesta de descarga para un archivo Excel generado en memoria.
export function excelResponse(
  buffer: ArrayBuffer,
  filename: string,
): NextResponse {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
