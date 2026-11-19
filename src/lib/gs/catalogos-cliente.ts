// Catálogos de CatalogosWS que General de Seguros pide para dar de alta al
// cliente al emitir: estado civil, ocupación (títulos), giro y colonia por CP.

import { bloques, llamarGs, valor } from "./client";

const SERVICIO = "catalogosWS";
const MODULO = "catalogos";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface OpcionGs {
  id: string;
  nombre: string;
}

export interface CatalogosClienteGs {
  estadosCiviles: OpcionGs[];
  ocupaciones: OpcionGs[];
  giros: OpcionGs[];
  colonias: OpcionGs[];
}

const cache = new Map<string, { expira: number; datos: Promise<OpcionGs[]> }>();

function conCache(clave: string, cargar: () => Promise<OpcionGs[]>): Promise<OpcionGs[]> {
  const actual = cache.get(clave);
  if (actual && actual.expira > Date.now()) return actual.datos;
  const datos = cargar().catch((err) => {
    cache.delete(clave);
    throw err;
  });
  cache.set(clave, { expira: Date.now() + TTL_MS, datos });
  return datos;
}

async function listar(
  operacion: string,
  bloque: string,
  campoId: string,
  campoNombre: string,
  campos: Array<[string, string | number]> = [],
): Promise<OpcionGs[]> {
  const xml = await llamarGs(SERVICIO, MODULO, operacion, campos);
  return bloques(xml, bloque)
    .map((b) => ({ id: valor(b, campoId), nombre: valor(b, campoNombre) }))
    .filter((o) => o.id && o.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function catalogosClienteGs(cp?: string): Promise<CatalogosClienteGs> {
  const [estadosCiviles, ocupaciones, giros, colonias] = await Promise.all([
    conCache("estadosCivil", () => listar("wsListarEstadosCivil", "estadosCivil", "id", "descripcion")),
    conCache("titulos", () => listar("wsListarTitulos", "titulos", "cveTit", "desTit")),
    conCache("giros", () => listar("wsListarGiros", "giros", "cveGir", "descGir")),
    cp && /^\d{5}$/.test(cp)
      ? conCache(`colonias-${cp}`, () =>
          listar("wsListarColonias", "colonias", "idcolonia", "nomcolonia", [["codpos", Number(cp)]]),
        )
      : Promise.resolve([]),
  ]);
  return { estadosCiviles, ocupaciones, giros, colonias };
}
