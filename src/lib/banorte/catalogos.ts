// Catálogo de vehículos de Banorte. La `claveBanorte` es el equivalente a la
// ClaveAmis de Quálitas: identifica la versión exacta del vehículo y es
// obligatoria para cotizar.

import { credencialesConfiguradas, getBanorteConfig } from "./config";
import { BanorteNoConfigurado, llamarBanorte } from "./client";

export interface VehiculoBanorte {
  claveBanorte: string;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

interface CategoriaVehiculos {
  id: number;
  nombre: string;
  modelosVehiculo?: VehiculoBanorte[];
}

interface CategoriaMarcas {
  id: number;
  nombre: string;
  marcas?: Array<{ id: number; nombre: string }>;
}

interface CategoriaSubmarcas {
  id: number;
  nombre: string;
  submarcas?: Array<{ id: number; nombre: string }>;
}

export interface BusquedaVehiculoBanorte {
  marca: string;
  submarca?: string;
  anio?: number;
}

// Los catálogos de Banorte están en mayúsculas y filtran de forma sensible a
// mayúsculas: un nombre en otra caja devuelve EXITOSO con `data` vacío en vez
// de un error, así que hay que normalizar antes de consultar.
function normalizar(nombre: string): string {
  return nombre.trim().toUpperCase();
}

function rutaProducto(sufijo: string): string {
  const cfg = getBanorteConfig();
  return `/producto/${encodeURIComponent(cfg.nombreProducto)}${sufijo}`;
}

// La respuesta agrupa por categoría; nos interesa la configurada para el
// negocio (AUTOS RESIDENTES) y, si no aparece, la primera disponible.
function categoriaDelNegocio<T extends { nombre: string }>(
  categorias: T[] | undefined,
): T | undefined {
  const cfg = getBanorteConfig();
  return (
    categorias?.find((c) => c.nombre === cfg.nombreCategoria) ?? categorias?.[0]
  );
}

function asegurarCredenciales(): void {
  if (!credencialesConfiguradas(getBanorteConfig())) {
    throw new BanorteNoConfigurado();
  }
}

export async function listarMarcas(): Promise<string[]> {
  asegurarCredenciales();
  const data = await llamarBanorte<{ categorias?: CategoriaMarcas[] }>({
    metodo: "GET",
    ruta: rutaProducto("/marca"),
  });
  const cat = categoriaDelNegocio(data.categorias);
  return (cat?.marcas ?? []).map((m) => m.nombre);
}

export async function listarSubmarcas(marca: string): Promise<string[]> {
  asegurarCredenciales();
  const data = await llamarBanorte<{ categorias?: CategoriaSubmarcas[] }>({
    metodo: "GET",
    ruta: rutaProducto(
      `/marca/${encodeURIComponent(normalizar(marca))}/submarca`,
    ),
  });
  const cat = categoriaDelNegocio(data.categorias);
  return (cat?.submarcas ?? []).map((s) => s.nombre);
}

async function consultarVehiculos(
  marca: string,
  submarca?: string,
): Promise<VehiculoBanorte[]> {
  const params = new URLSearchParams({ nombreMarca: normalizar(marca) });
  if (submarca) params.set("nombreSubmarca", normalizar(submarca));

  const data = await llamarBanorte<{ categorias?: CategoriaVehiculos[] }>({
    metodo: "GET",
    ruta: rutaProducto(`/vehiculo?${params.toString()}`),
  });
  return categoriaDelNegocio(data.categorias)?.modelosVehiculo ?? [];
}

// Solo letras y dígitos, para comparar nombres cuya única diferencia es el
// espaciado o la puntuación ("Mazda 2" vs "MAZDA2").
function soloAlfanumerico(nombre: string): string {
  return normalizar(nombre).replace(/[^A-Z0-9]/g, "");
}

// Encuentra el nombre real de la submarca en el catálogo de Banorte cuando no
// coincide literalmente con el del catálogo interno.
function submarcaEquivalente(
  buscada: string,
  disponibles: string[],
): string | undefined {
  const objetivo = soloAlfanumerico(buscada);
  const exacta = disponibles.find((s) => soloAlfanumerico(s) === objetivo);
  if (exacta) return exacta;

  // "Bronco Sport" -> "BRONCO": se toma el prefijo más largo para no confundir
  // "CX-3" con "CX-30".
  const prefijos = disponibles
    .filter((s) => objetivo.startsWith(soloAlfanumerico(s)))
    .sort((a, b) => soloAlfanumerico(b).length - soloAlfanumerico(a).length);
  return prefijos[0];
}

// Busca versiones de vehículo. El filtro por submarca es obligatorio en la
// práctica: consultar solo por marca devuelve una respuesta vacía.
//
// Los nombres no siempre coinciden con los del catálogo interno (Banorte usa
// "MAZDA2" y no "Mazda 2"), así que cuando la submarca no devuelve nada se
// resuelve su nombre real contra el catálogo de submarcas y se reintenta.
export async function buscarVehiculos(
  filtros: BusquedaVehiculoBanorte,
): Promise<VehiculoBanorte[]> {
  asegurarCredenciales();

  let modelos = await consultarVehiculos(filtros.marca, filtros.submarca);

  if (modelos.length === 0 && filtros.submarca) {
    const equivalente = submarcaEquivalente(
      filtros.submarca,
      await listarSubmarcas(filtros.marca),
    );
    if (equivalente) {
      modelos = await consultarVehiculos(filtros.marca, equivalente);
    }
  }

  return filtros.anio
    ? modelos.filter((m) => m.anio === filtros.anio)
    : modelos;
}
