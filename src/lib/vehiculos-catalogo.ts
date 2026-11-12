// Catálogo general de marcas y modelos para el formulario de cotización.
// Marcas: catálogo de Banorte (nombres completos). Modelos por marca y año:
// catálogo de Quálitas (WSTarifas) y, si no responde, submarcas de Banorte.
// Si ninguna aseguradora responde se usa el catálogo base interno.

import { MARCAS } from "@/domain/catalogs";
import { listarMarcas, listarSubmarcas } from "@/lib/banorte/catalogos";
import { buscarVehiculos } from "@/lib/qualitas/tarifas";

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expira: number; valor: Promise<string[]> }>();

function conCache(
  clave: string,
  fn: () => Promise<string[]>,
): Promise<string[]> {
  const hit = cache.get(clave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const valor = fn().then((lista) => {
    if (lista.length === 0) throw new Error("Catálogo vacío.");
    return lista;
  });
  cache.set(clave, { expira: Date.now() + TTL_MS, valor });
  valor.catch(() => cache.delete(clave));
  return valor;
}

const normalizar = (s: string) => s.trim().toUpperCase();

function unicos(nombres: string[]): string[] {
  const vistos = new Map<string, string>();
  for (const n of nombres) {
    const limpio = n.trim().replace(/\s+/g, " ");
    if (limpio && !vistos.has(normalizar(limpio)))
      vistos.set(normalizar(limpio), limpio);
  }
  return Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, "es"));
}

function base(marca: string): string[] {
  const clave = Object.keys(MARCAS).find(
    (m) => normalizar(m) === normalizar(marca),
  );
  return clave ? MARCAS[clave] : [];
}

export async function marcasVehiculo(): Promise<string[]> {
  try {
    return await conCache("marcas", async () => unicos(await listarMarcas()));
  } catch {
    return unicos(Object.keys(MARCAS));
  }
}

export async function modelosVehiculo(
  marca: string,
  anio?: number,
): Promise<string[]> {
  const m = normalizar(marca);
  try {
    return await conCache(`modelos:${m}:${anio ?? ""}`, async () =>
      unicos(
        (
          await buscarVehiculos({
            marca: m,
            modelo: anio ? String(anio) : undefined,
          })
        ).map((v) => v.tipo),
      ),
    );
  } catch {
    try {
      return await conCache(`submarcas:${m}`, async () =>
        unicos(await listarSubmarcas(m)),
      );
    } catch {
      return unicos(base(marca));
    }
  }
}
