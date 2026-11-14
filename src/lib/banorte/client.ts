// Cliente REST de los servicios de Seguros Banorte (Autos Individual).
// Toda llamada requiere Basic Auth del usuario de servicios más tres headers:
// `usuario` (usuario de Espacio), `numOficina` y `nombreRamo`.

import { getBanorteConfig, type BanorteConfig } from "./config";

// Envoltura estándar de las respuestas de Banorte.
export interface RespuestaBanorte<T> {
  data?: T;
  operacion?: {
    codigoOperacion?: string;
    mensaje?: string;
  };
}

// Error de negocio devuelto por Banorte (codigoOperacion distinto de "1").
export class BanorteError extends Error {}

export class BanorteNoConfigurado extends Error {
  constructor() {
    super(
      "Faltan las credenciales de Banorte. Configura BANORTE_WS_USER, " +
        "BANORTE_WS_PASS, BANORTE_USUARIO_ESPACIO, BANORTE_NUM_OFICINA y " +
        "BANORTE_INTERMEDIARIO.",
    );
  }
}

function headers(cfg: BanorteConfig): Record<string, string> {
  const basic = Buffer.from(
    `${cfg.usuarioServicio}:${cfg.passwordServicio}`,
  ).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    usuario: cfg.usuarioEspacio,
    numOficina: cfg.numOficina,
    nombreRamo: cfg.nombreRamo,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface PeticionOpciones {
  metodo: "GET" | "POST";
  ruta: string;
  body?: unknown;
}

// Ejecuta una llamada al API de Banorte y devuelve `data` ya desenvuelto.
// Lanza `BanorteError` cuando la operación no fue exitosa.
export async function llamarBanorte<T>(opts: PeticionOpciones): Promise<T> {
  const cfg = getBanorteConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${opts.ruta}`, {
      method: opts.metodo,
      headers: headers(cfg),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }

  const texto = await res.text();
  let json: RespuestaBanorte<T>;
  try {
    json = JSON.parse(texto) as RespuestaBanorte<T>;
  } catch {
    throw new BanorteError(
      `Respuesta no válida de Banorte (HTTP ${res.status}).`,
    );
  }

  if (json.operacion?.codigoOperacion !== "1") {
    throw new BanorteError(
      limpiarMensaje(json.operacion?.mensaje) ||
        `Banorte rechazó la solicitud (HTTP ${res.status}).`,
    );
  }
  if (!json.data) {
    throw new BanorteError("Banorte no devolvió datos para esta solicitud.");
  }
  return json.data;
}

// Los mensajes de Banorte llegan prefijados con el tipo de excepción interna
// ("BusinessError: ...", "BusinessException: ..."), que no aporta al usuario.
function limpiarMensaje(mensaje: string | undefined): string {
  if (!mensaje) return "";
  return mensaje.replace(/^\w*(Error|Exception):\s*/, "").trim();
}
