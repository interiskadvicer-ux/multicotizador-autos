// Catálogo de errores del web service de Quálitas (CatalogoErroresSW.xlsx).
// El WS devuelve un CodigoError que puede venir como "N", "NNNN--desc", etc.
// Aquí lo normalizamos a un mensaje legible para el broker.

import catalogo from "../qualitas-errores.json";

const ERRORES = catalogo as Record<string, string>;

// Interpreta el contenido del nodo <CodigoError> de la respuesta.
// Devuelve null si la transacción fue exitosa (código vacío).
export function interpretarError(codigoError: string | null): string | null {
  if (!codigoError) return null;
  const raw = codigoError.trim();
  if (!raw) return null;

  // El WS a veces regresa el detalle en el mismo nodo, ej:
  // "0005-- No esta dada de alta su tarifa ...". Tomamos el código numérico
  // inicial para enriquecer el mensaje con el catálogo cuando exista.
  const m = raw.match(/^0*(\d+)/);
  const codigo = m ? m[1] : null;
  const descCatalogo = codigo ? ERRORES[codigo] : undefined;

  // Texto que trae la propia respuesta (después de "--" si existe).
  const detalle = raw.replace(/^0*\d+\s*-*\s*/, "").trim();

  if (descCatalogo && detalle && detalle !== descCatalogo) {
    return `Quálitas: ${descCatalogo} (${detalle})`;
  }
  if (descCatalogo) return `Quálitas: ${descCatalogo}`;
  if (detalle) return `Quálitas: ${detalle}`;
  return `Quálitas: error ${raw}`;
}
