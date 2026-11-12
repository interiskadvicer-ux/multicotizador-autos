// Catálogo de vehículos de General de Seguros: marcas → submarcas →
// versiones por modelo. La clave de la versión (`amis`) es la claveGs que
// requiere la cotización.

import { bloques, llamarGs, valor } from "./client";

const SERVICIO = "catalogoAutosWS";
const MODULO = "catalogoAutos";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface VehiculoGs {
  claveGs: string;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

export interface BusquedaVehiculoGs {
  marca: string;
  submarca?: string;
  anio: number;
}

interface Entrada {
  id: string;
  nombre: string;
}

const cache = new Map<string, { expira: number; valor: Promise<Entrada[]> }>();

function conCache(clave: string, cargar: () => Promise<Entrada[]>): Promise<Entrada[]> {
  const hit = cache.get(clave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const promesa = cargar();
  cache.set(clave, { expira: Date.now() + TTL_MS, valor: promesa });
  promesa.catch(() => cache.delete(clave));
  return promesa;
}

function soloAlfanumerico(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Coincidencia exacta alfanumérica ("Mazda 2" ↔ "MAZDA2"); si no hay, el
// nombre de catálogo más corto que sea prefijo del buscado o lo contenga.
function buscarEquivalente(entradas: Entrada[], buscado: string): Entrada | undefined {
  const objetivo = soloAlfanumerico(buscado);
  const exacta = entradas.find((e) => soloAlfanumerico(e.nombre) === objetivo);
  if (exacta) return exacta;
  return entradas
    .filter((e) => {
      const n = soloAlfanumerico(e.nombre);
      return n && (objetivo.startsWith(n) || n.startsWith(objetivo));
    })
    .sort((a, b) => soloAlfanumerico(a.nombre).length - soloAlfanumerico(b.nombre).length)[0];
}

function entradas(xml: string, bloque: string, campoId: string, campoNombre: string): Entrada[] {
  return bloques(xml, bloque)
    .map((b) => ({ id: valor(b, campoId), nombre: valor(b, campoNombre) }))
    .filter((e) => e.id && e.id !== "0" && e.nombre);
}

function marcas(): Promise<Entrada[]> {
  return conCache("marcas", async () =>
    entradas(await llamarGs(SERVICIO, MODULO, "wsListarMarcas", []), "marcas", "id", "nombre"),
  );
}

function submarcas(idMarca: string): Promise<Entrada[]> {
  return conCache(`submarcas:${idMarca}`, async () =>
    entradas(
      await llamarGs(SERVICIO, MODULO, "wsListarSubMarcas", [["idMarca", idMarca]]),
      "submarcas",
      "id",
      "nombre",
    ),
  );
}

async function versiones(idSubmarca: string, anio: number): Promise<Entrada[]> {
  const xml = await llamarGs(SERVICIO, MODULO, "wsListarVersiones", [
    ["idSubmarca", idSubmarca],
    ["modelo", anio],
  ]);
  return entradas(xml, "versiones", "amis", "descripcion");
}

export async function buscarVehiculos(filtros: BusquedaVehiculoGs): Promise<VehiculoGs[]> {
  const marca = buscarEquivalente(await marcas(), filtros.marca);
  if (!marca) return [];
  const lista = await submarcas(marca.id);
  const elegidas = filtros.submarca
    ? [buscarEquivalente(lista, filtros.submarca)].filter((s): s is Entrada => Boolean(s))
    : lista;
  const porSubmarca = await Promise.all(
    elegidas.map(async (sub) =>
      (await versiones(sub.id, filtros.anio)).map((v) => ({
        claveGs: v.id,
        marca: marca.nombre,
        submarca: sub.nombre,
        anio: filtros.anio,
        descripcion: v.nombre,
      })),
    ),
  );
  return porSubmarca.flat();
}
