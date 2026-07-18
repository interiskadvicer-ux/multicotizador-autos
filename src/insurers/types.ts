import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";

// Contrato que TODA aseguradora debe implementar. El multicotizador solo
// conoce esta interfaz: para agregar una nueva aseguradora basta con crear
// un archivo que exporte un objeto que cumpla `InsurerAdapter` y registrarlo
// en `registry.ts`.
export interface InsurerAdapter {
  id: string;
  nombre: string;
  // Descuento comercial (%) por defecto que ofrece la aseguradora. El broker
  // puede sobreescribirlo por cotización desde el formulario.
  descuentoDefault: number;
  cotizar(request: CotizacionRequest): Promise<CotizacionResultado>;
}
