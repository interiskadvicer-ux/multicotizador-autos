import fs from "node:fs";
import path from "node:path";
import { ESTADOS_QUALITAS, estadoDesdeCP } from "@/lib/qualitas/estados";

// Catálogo generado por scripts/sepomex.mjs (vive junto a la base de datos).
interface Catalogo {
  estados: string[];
  municipios: string[];
  // [estado, municipio, colonia, código municipio, código colonia]
  cps: Record<string, [number, number, string, string?, string?][]>;
}

export interface ColoniaCp {
  colonia: string;
  municipio: string;
  codigoMunicipio?: string;
  codigoColonia?: string;
}

export interface UbicacionCp {
  estado: string;
  municipio: string;
  colonias: ColoniaCp[];
}

let catalogo: Catalogo | null = null;

function rutaCatalogo(): string {
  const rutaConfig = process.env.DATABASE_PATH;
  const base = rutaConfig ? path.dirname(path.resolve(rutaConfig)) : path.join(process.cwd(), "data");
  return path.join(base, "sepomex.json");
}

function cargar(): Catalogo | null {
  if (catalogo) return catalogo;
  const ruta = rutaCatalogo();
  if (!fs.existsSync(ruta)) return null;
  catalogo = JSON.parse(fs.readFileSync(ruta, "utf8")) as Catalogo;
  return catalogo;
}

// Estado, municipio y colonias de un CP. Sin catálogo solo se deduce el
// estado por el rango del CP.
export function ubicacionPorCp(cp: string): UbicacionCp | null {
  if (!/^\d{5}$/.test(cp)) return null;
  const cat = cargar();
  const filas = cat?.cps[cp];
  if (cat && filas?.length) {
    const colonias = filas
      .map(([, m, colonia, codigoMunicipio, codigoColonia]) => ({
        colonia,
        municipio: cat.municipios[m],
        codigoMunicipio: codigoMunicipio || undefined,
        codigoColonia: codigoColonia || undefined,
      }))
      .sort((a, b) => a.colonia.localeCompare(b.colonia, "es"));
    return {
      estado: cat.estados[filas[0][0]],
      municipio: cat.municipios[filas[0][1]],
      colonias,
    };
  }
  if (cat) return null;
  const estado = estadoDesdeCP(cp);
  return estado ? { estado: ESTADOS_QUALITAS[estado], municipio: "", colonias: [] } : null;
}
