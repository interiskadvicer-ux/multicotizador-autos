import type { InsurerAdapter } from "./types";
import { qualitas } from "./qualitas";
import { banorte } from "./banorte";
import { hdi } from "./hdi";
import { zurich } from "./zurich";
import { gnp } from "./gnp";
import { elPotosi } from "./elpotosi";
import { afirme } from "./afirme";
import { atlas } from "./atlas";
import { generalSeguros } from "./generalseguros";

// Registro central de aseguradoras. Para agregar una nueva, crea su adaptador
// y añádelo aquí.
const TODAS: InsurerAdapter[] = [
  qualitas,
  banorte,
  hdi,
  zurich,
  gnp,
  elPotosi,
  afirme,
  atlas,
  generalSeguros,
];

// Aseguradoras que aún no cotizan en real y no deben mostrarse (ids separados
// por coma). Se fija al compilar porque también la usan componentes cliente.
const OCULTAS = (process.env.NEXT_PUBLIC_ASEGURADORAS_OCULTAS ?? "gnp,atlas")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const ADAPTERS = TODAS.filter((a) => !OCULTAS.includes(a.id));

export const ASEGURADORAS = ADAPTERS.map((a) => ({
  id: a.id,
  nombre: a.nombre,
  descuentoDefault: a.descuentoDefault,
}));
