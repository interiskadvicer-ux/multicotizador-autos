// Catálogo de vehículos de Afirme (Midas Autos): marcas → submarcas → estilos.
// La clave que identifica al vehículo para cotizar es el `idEstilo`; para
// cotizar también se requieren la línea de negocio y la marca, que se
// resuelven aquí a partir de marca/submarca/año.

import { getAfirmeConfig } from "./config";
import { llamarAfirme } from "./client";

export interface VehiculoAfirme {
  idEstilo: string;
  idLineaNegocio: string;
  idMarca: string;
  idSubMarca?: string;
  marca: string;
  submarca: string;
  anio: number;
  descripcion: string;
}

export interface BusquedaVehiculoAfirme {
  marca: string;
  submarca?: string;
  anio: number;
}

type Catalogo = Record<string, string>;

function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function soloAlfanumerico(nombre: string): string {
  return normalizar(nombre).replace(/[^A-Z0-9]/g, "");
}

// Busca en un catálogo {id: nombre} la entrada equivalente al nombre dado:
// primero coincidencia exacta alfanumérica, después el nombre del catálogo
// más largo que sea prefijo del buscado ("Mazda 2" ↔ "MAZDA2", "Bronco
// Sport" ↔ "BRONCO").
function buscarEquivalente(
  catalogo: Catalogo,
  buscado: string,
): { id: string; nombre: string } | undefined {
  const objetivo = soloAlfanumerico(buscado);
  const entradas = Object.entries(catalogo);
  const exacta = entradas.find(([, n]) => soloAlfanumerico(n) === objetivo);
  if (exacta) return { id: exacta[0], nombre: exacta[1] };

  const prefijos = entradas
    .filter(([, n]) => soloAlfanumerico(n) && objetivo.startsWith(soloAlfanumerico(n)))
    .sort((a, b) => soloAlfanumerico(b[1]).length - soloAlfanumerico(a[1]).length);
  return prefijos[0] ? { id: prefijos[0][0], nombre: prefijos[0][1] } : undefined;
}

async function buscarEnLinea(
  idLineaNegocio: string,
  filtros: BusquedaVehiculoAfirme,
): Promise<VehiculoAfirme[]> {
  const marcas = await llamarAfirme<Catalogo>("getListMarcas", { idLineaNegocio });
  const marca = buscarEquivalente(marcas, filtros.marca);
  if (!marca) return [];

  let submarca: { id: string; nombre: string } | undefined;
  if (filtros.submarca) {
    const submarcas = await llamarAfirme<Catalogo>("getListSubMarcas", {
      idMarca: marca.id,
      idLineaNegocio,
    });
    submarca = buscarEquivalente(submarcas, filtros.submarca);
    if (!submarca) return [];
  }

  const estilos = await llamarAfirme<Catalogo>("buscarEstilo", {
    json: JSON.stringify({
      idLineaNegocio,
      idMarca: marca.id,
      idSubMarca: submarca?.id ?? "",
      modelo: String(filtros.anio),
      descripcion: "",
    }),
  });

  return Object.entries(estilos).map(([idEstilo, desc]) => ({
    idEstilo,
    idLineaNegocio,
    idMarca: marca.id,
    idSubMarca: submarca?.id,
    marca: marca.nombre,
    submarca: submarca?.nombre ?? "",
    anio: filtros.anio,
    descripcion: desc.replace(new RegExp(`^${idEstilo}\\s*-\\s*`), "").trim(),
  }));
}

// Recorre las líneas de negocio configuradas (automóviles, pick ups…) hasta
// encontrar el vehículo.
export async function buscarVehiculos(
  filtros: BusquedaVehiculoAfirme,
): Promise<VehiculoAfirme[]> {
  const cfg = getAfirmeConfig();
  for (const linea of cfg.lineasNegocio) {
    const encontrados = await buscarEnLinea(linea, filtros);
    if (encontrados.length) return encontrados;
  }
  return [];
}

// Devuelve los datos completos del vehículo a partir de su idEstilo.
export async function resolverVehiculo(
  idEstilo: string,
  filtros: BusquedaVehiculoAfirme,
): Promise<VehiculoAfirme | undefined> {
  const porSubmarca = await buscarVehiculos(filtros);
  const directo = porSubmarca.find((v) => v.idEstilo === idEstilo);
  if (directo || !filtros.submarca) return directo;

  const porMarca = await buscarVehiculos({ ...filtros, submarca: undefined });
  return porMarca.find((v) => v.idEstilo === idEstilo);
}
