// Catálogo de estados de Quálitas (Anexo 1) y derivación del estado a partir
// del código postal. El WS de cotización exige el ID de estado (1–32); el
// formulario del broker sólo captura el CP, así que lo derivamos con los
// rangos oficiales de SEPOMEX (primeros dos dígitos del CP).

export const ESTADOS_QUALITAS: Record<number, string> = {
  1: "Aguascalientes",
  2: "Baja California",
  3: "Baja California Sur",
  4: "Campeche",
  5: "Coahuila",
  6: "Colima",
  7: "Chiapas",
  8: "Chihuahua",
  9: "Ciudad de México",
  10: "Durango",
  11: "Guanajuato",
  12: "Guerrero",
  13: "Hidalgo",
  14: "Jalisco",
  15: "Estado de México",
  16: "Michoacán",
  17: "Morelos",
  18: "Nayarit",
  19: "Nuevo León",
  20: "Oaxaca",
  21: "Puebla",
  22: "Querétaro",
  23: "Quintana Roo",
  24: "San Luis Potosí",
  25: "Sinaloa",
  26: "Sonora",
  27: "Tabasco",
  28: "Tamaulipas",
  29: "Tlaxcala",
  30: "Veracruz",
  31: "Yucatán",
  32: "Zacatecas",
};

// Mapa prefijo de CP (2 dígitos) -> ID de estado Quálitas (rangos SEPOMEX).
const CP_PREFIJO_A_ESTADO: Array<[number, number, number]> = [
  // [inicio, fin, idEstado]
  [0, 16, 9], // Ciudad de México
  [20, 20, 1], // Aguascalientes
  [21, 22, 2], // Baja California
  [23, 23, 3], // Baja California Sur
  [24, 24, 4], // Campeche
  [25, 27, 5], // Coahuila
  [28, 28, 6], // Colima
  [29, 30, 7], // Chiapas
  [31, 33, 8], // Chihuahua
  [34, 35, 10], // Durango
  [36, 38, 11], // Guanajuato
  [39, 41, 12], // Guerrero
  [42, 43, 13], // Hidalgo
  [44, 49, 14], // Jalisco
  [50, 57, 15], // Estado de México
  [58, 61, 16], // Michoacán
  [62, 62, 17], // Morelos
  [63, 63, 18], // Nayarit
  [64, 67, 19], // Nuevo León
  [68, 71, 20], // Oaxaca
  [72, 75, 21], // Puebla
  [76, 76, 22], // Querétaro
  [77, 77, 23], // Quintana Roo
  [78, 79, 24], // San Luis Potosí
  [80, 82, 25], // Sinaloa
  [83, 85, 26], // Sonora
  [86, 86, 27], // Tabasco
  [87, 89, 28], // Tamaulipas
  [90, 90, 29], // Tlaxcala
  [91, 96, 30], // Veracruz
  [97, 97, 31], // Yucatán
  [98, 99, 32], // Zacatecas
];

// Devuelve el ID de estado Quálitas a partir de un CP, o null si no se puede
// determinar (CP inválido).
export function estadoDesdeCP(cp: string): number | null {
  const limpio = (cp || "").replace(/\D/g, "");
  if (limpio.length < 2) return null;
  const prefijo = Number(limpio.slice(0, 2));
  for (const [inicio, fin, id] of CP_PREFIJO_A_ESTADO) {
    if (prefijo >= inicio && prefijo <= fin) return id;
  }
  return null;
}
