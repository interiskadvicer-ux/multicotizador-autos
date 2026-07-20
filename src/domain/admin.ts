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

// Lista de roles válidos para validar entradas en la API.
export const ROLES_VALIDOS: Rol[] = ROLES.map((r) => r.value);

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
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PolizaInput = Omit<
  Poliza,
  "id" | "createdBy" | "createdAt" | "updatedAt"
>;

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
