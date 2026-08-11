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
    ruta: rutaProducto(`/marca/${encodeURIComponent(marca)}/submarca`),
  });
  const cat = categoriaDelNegocio(data.categorias);
  return (cat?.submarcas ?? []).map((s) => s.nombre);
}

// Busca versiones de vehículo. Banorte recomienda filtrar por marca (y de
// preferencia submarca) porque el parque vehicular completo es muy grande.
export async function buscarVehiculos(
  filtros: BusquedaVehiculoBanorte,
): Promise<VehiculoBanorte[]> {
  asegurarCredenciales();

  const params = new URLSearchParams({ nombreMarca: filtros.marca });
  if (filtros.submarca) params.set("nombreSubmarca", filtros.submarca);

  const data = await llamarBanorte<{ categorias?: CategoriaVehiculos[] }>({
    metodo: "GET",
    ruta: rutaProducto(`/vehiculo?${params.toString()}`),
  });

  const modelos = categoriaDelNegocio(data.categorias)?.modelosVehiculo ?? [];
  const porAnio = filtros.anio
    ? modelos.filter((m) => m.anio === filtros.anio)
    : modelos;
  return porAnio;
}
