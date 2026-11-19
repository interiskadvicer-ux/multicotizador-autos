// Mercedes-Benz: el formulario usa el modelo con número (Quálitas: "C-200"),
// pero Zurich, Afirme, El Potosí y GS lo agrupan por clase ("CLASE C",
// "MERCEDES CLASE C") y el número viene en la descripción ("CLASE C 200 …").
function lineaPorClase(
  marca: string,
  submarca: string,
): { clases: string[]; patron: RegExp } | undefined {
  if (!/MERCEDES/i.test(marca)) return undefined;
  const m = submarca
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{1,3})[\s-]?(\d{2,3}[A-Z]?)$/);
  if (!m) return undefined;
  const [, clase, numero] = m;
  return {
    clases: [`CLASE ${clase}`, `MERCEDES CLASE ${clase}`],
    patron: new RegExp(`\\b${clase}\\s*-?\\s*${numero}\\b`, "i"),
  };
}

// Busca con la submarca tal cual; si no hay resultados, por la clase y deja
// solo las versiones con el número del modelo.
export async function conLineaPorClase<T extends { descripcion: string }>(
  filtros: { marca: string; submarca?: string },
  buscar: (submarca?: string) => Promise<T[]>,
): Promise<T[]> {
  const directos = await buscar(filtros.submarca);
  const linea =
    directos.length === 0 && filtros.submarca
      ? lineaPorClase(filtros.marca, filtros.submarca)
      : undefined;
  if (!linea) return directos;
  for (const clase of linea.clases) {
    const delModelo = (await buscar(clase)).filter((v) =>
      linea.patron.test(v.descripcion),
    );
    if (delModelo.length) return delModelo;
  }
  return [];
}
