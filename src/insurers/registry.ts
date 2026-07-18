import type { InsurerAdapter } from "./types";
import { qualitas } from "./qualitas";
import { banorte } from "./banorte";
import { hdi } from "./hdi";
import { zurich } from "./zurich";
import { gnp } from "./gnp";
import { elPotosi } from "./elpotosi";
import { afirme } from "./afirme";
import { atlas } from "./atlas";

// Registro central de aseguradoras. Para agregar una nueva, crea su adaptador
// y añádelo aquí.
export const ADAPTERS: InsurerAdapter[] = [
  qualitas,
  banorte,
  hdi,
  zurich,
  gnp,
  elPotosi,
  afirme,
  atlas,
];

export const ASEGURADORAS = ADAPTERS.map((a) => ({
  id: a.id,
  nombre: a.nombre,
  descuentoDefault: a.descuentoDefault,
}));
