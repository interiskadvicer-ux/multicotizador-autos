// Limitador de tasa en memoria (ventana deslizante) pensado para el
// despliegue de un solo servidor de esta app. Evita ataques de fuerza bruta
// contra endpoints sensibles como el login. No es apto para despliegues
// multi-instancia sin un backend compartido (Redis, etc.).

interface Registro {
  hits: number;
  expira: number;
}

const almacen = new Map<string, Registro>();

// Evita crecimiento no acotado del mapa en procesos de larga vida.
function limpiar(ahora: number): void {
  almacen.forEach((reg, clave) => {
    if (reg.expira <= ahora) almacen.delete(clave);
  });
}

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  reintentarEnSegundos: number;
}

// Registra un intento para `clave` y devuelve si está permitido dentro de la
// ventana. `maximo` intentos por `ventanaMs` milisegundos.
export function consumir(
  clave: string,
  maximo: number,
  ventanaMs: number,
): ResultadoLimite {
  const ahora = Date.now();
  if (almacen.size > 5000) limpiar(ahora);

  const reg = almacen.get(clave);
  if (!reg || reg.expira <= ahora) {
    almacen.set(clave, { hits: 1, expira: ahora + ventanaMs });
    return { permitido: true, restantes: maximo - 1, reintentarEnSegundos: 0 };
  }

  reg.hits += 1;
  if (reg.hits > maximo) {
    return {
      permitido: false,
      restantes: 0,
      reintentarEnSegundos: Math.ceil((reg.expira - ahora) / 1000),
    };
  }
  return {
    permitido: true,
    restantes: maximo - reg.hits,
    reintentarEnSegundos: 0,
  };
}

// Extrae la IP del cliente desde las cabeceras de proxy habituales.
export function ipCliente(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "desconocida";
}
