// Tipos de dominio para autenticación, pólizas y auditoría.

export type Rol = "ADMIN" | "POLIZAS" | "COTIZADOR";

export const ROLES: { value: Rol; label: string; descripcion: string }[] = [
  {
    value: "ADMIN",
    label: "Administrador",
    descripcion: "Acceso total: cotizador, pólizas, usuarios y reportes.",
  },
  {
    value: "POLIZAS",
    label: "Gestor de pólizas",
    descripcion: "Administra el catálogo de pólizas y sus vencimientos.",
  },
  {
    value: "COTIZADOR",
    label: "Cotizador",
    descripcion: "Solo puede generar cotizaciones.",
  },
];

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  createdAt: string;
}

// Usuario en sesión (lo que viaja en el token, sin datos sensibles).
export interface SesionUsuario {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
}

// Estatus de cobranza de la póliza. null = sin dato.
export type EstatusPago = "PAGADA" | "PENDIENTE" | "CANCELADA";

export const ESTATUS_PAGO: { value: EstatusPago; label: string }[] = [
  { value: "PAGADA", label: "Pagada" },
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "CANCELADA", label: "Cancelada" },
];

// De dónde viene el estatus de pago: consulta al web service o captura.
export type OrigenPago = "AFIRME" | "MANUAL";

export function esAseguradoraAfirme(aseguradora: string): boolean {
  return /afirme/i.test(aseguradora);
}

// Formato de póliza Afirme: oficina-número-renovación, p. ej. 3401-117764-00.
export function numeroPolizaAfirmeValido(numero: string): boolean {
  return /^\d{4}-\d{5,8}-\d{2}$/.test(numero.trim());
}

export interface Poliza {
  id: number;
  numeroPoliza: string;
  ramo: string;
  aseguradora: string;
  asegurado: string;
  primaNeta: number;
  primaTotal: number;
  vigenciaInicio: string; // ISO yyyy-mm-dd
  vigenciaFin: string; // ISO yyyy-mm-dd
  notas?: string;
  vehiculo?: string;
  numeroSerie?: string;
  estatusPago: EstatusPago | null;
  origenPago: OrigenPago | null;
  // Estatus de la póliza según la aseguradora (p. ej. VIGENTE, CANCELADA).
  estatusAseguradora: string | null;
  pagoActualizadoAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PolizaInput = Omit<
  Poliza,
  | "id"
  | "createdBy"
  | "createdAt"
  | "updatedAt"
  | "origenPago"
  | "estatusAseguradora"
  | "pagoActualizadoAt"
>;

// Situación de un recibo en la aseguradora (Afirme: EMI, PAG, CAN).
export type SituacionRecibo = "EMITIDO" | "PAGADO" | "CANCELADO";

export interface Recibo {
  idRecibo: string;
  folio: string;
  numeroEndoso: number;
  // REC = cargo, RD = devolución (importes negativos).
  tipoRecibo: string;
  situacion: SituacionRecibo;
  incisos: string;
  primaNeta: number;
  recargo: number;
  derechos: number;
  iva: number;
  primaTotal: number;
  vigenciaInicio: string | null;
  vigenciaFin: string | null;
  fechaVencimiento: string | null;
}

export interface ReciboGuardado extends Recibo {
  policyId: number;
  origen: OrigenPago;
  consultadoAt: string;
  consultadoPor: string;
}

// Ramos comunes del mercado mexicano (el usuario puede escribir uno libre).
export const RAMOS = [
  "Autos",
  "Vida",
  "Gastos Médicos Mayores",
  "Daños / Hogar",
  "Responsabilidad Civil",
  "Transporte",
  "Fianzas",
  "Otro",
];

export interface RegistroActividad {
  id: number;
  usuarioId: number | null;
  usuarioEmail: string;
  accion: string;
  detalle: string;
  createdAt: string;
}
