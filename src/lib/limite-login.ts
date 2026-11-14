// Límite de intentos fallidos de inicio de sesión (en memoria del proceso).
const VENTANA_MS = 15 * 60 * 1000;
const MAX_POR_CORREO = 5;
const MAX_POR_IP = 20;

const fallos = new Map<string, { n: number; desde: number }>();

function vigente(clave: string, ahora: number) {
  const f = fallos.get(clave);
  if (!f || ahora - f.desde > VENTANA_MS) {
    fallos.delete(clave);
    return undefined;
  }
  return f;
}

function sumar(clave: string, ahora: number) {
  const f = vigente(clave, ahora);
  if (f) f.n += 1;
  else fallos.set(clave, { n: 1, desde: ahora });
}

export function loginBloqueado(email: string, ip: string): boolean {
  const ahora = Date.now();
  return (
    (vigente(`c:${email}`, ahora)?.n ?? 0) >= MAX_POR_CORREO ||
    (vigente(`i:${ip}`, ahora)?.n ?? 0) >= MAX_POR_IP
  );
}

export function registrarFalloLogin(email: string, ip: string): void {
  const ahora = Date.now();
  sumar(`c:${email}`, ahora);
  sumar(`i:${ip}`, ahora);
  if (fallos.size > 10_000) {
    fallos.forEach((_, clave) => vigente(clave, ahora));
  }
}

export function limpiarFallosLogin(email: string): void {
  fallos.delete(`c:${email}`);
}

// nginx sobrescribe X-Real-IP con la IP del cliente.
export function ipCliente(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}
