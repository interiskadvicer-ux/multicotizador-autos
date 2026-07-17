import type { FormaPago, Paquete } from "./types";

// Catálogos base para poblar el formulario. En producción estos catálogos
// suelen venir de los web services de cada aseguradora (o de AMIS).

export const MARCAS: Record<string, string[]> = {
  Nissan: ["Versa", "Sentra", "March", "Kicks", "X-Trail", "NP300"],
  Volkswagen: ["Jetta", "Vento", "Virtus", "Tiguan", "Polo", "Taos"],
  Chevrolet: ["Aveo", "Onix", "Beat", "Trax", "Cavalier", "Tahoe"],
  Toyota: ["Corolla", "Yaris", "RAV4", "Hilux", "Camry", "Avanza"],
  Kia: ["Rio", "Forte", "Sportage", "Sorento", "Seltos"],
  Honda: ["Civic", "City", "CR-V", "HR-V", "BR-V"],
  Mazda: ["Mazda 2", "Mazda 3", "CX-3", "CX-5", "CX-30"],
  Ford: ["Figo", "Escape", "Ranger", "F-150", "Bronco Sport"],
};

export const ANIOS: number[] = Array.from(
  { length: 26 },
  (_, i) => new Date().getFullYear() + 1 - i,
);

export const PAQUETES: { value: Paquete; label: string; descripcion: string }[] =
  [
    {
      value: "AMPLIA",
      label: "Cobertura Amplia",
      descripcion: "Daños materiales, robo total, RC, gastos médicos y asistencia.",
    },
    {
      value: "LIMITADA",
      label: "Cobertura Limitada",
      descripcion: "Robo total, RC, gastos médicos y asistencia (sin daños materiales).",
    },
    {
      value: "RC",
      label: "Responsabilidad Civil",
      descripcion: "Solo daños a terceros (cobertura mínima).",
    },
  ];

export const FORMAS_PAGO: { value: FormaPago; label: string }[] = [
  { value: "CONTADO", label: "Contado (anual)" },
  { value: "MENSUAL", label: "Mensual" },
  { value: "TRIMESTRAL", label: "Trimestral" },
  { value: "SEMESTRAL", label: "Semestral" },
];
