// Portal de agentes HDI (SmartOffice): API JSON que usa la propia página.
// Solo consultas: lista de pólizas y recibos (pagados/pendientes).

const BASE = "https://smartoffice.hdi.com.mx/";
// El portal responde primero con una clave de caché y hay que volver a
// preguntar hasta que el resultado esté listo (la página espera 5 s, 36 veces).
const ESPERA_CACHE_MS = 5_000;
const INTENTOS_CACHE = 36;

export const ESTATUS_RECIBO_HDI = { PENDIENTE: 982, PAGADO: 984 } as const;

export interface PolizaPortalHdi {
  numPoliza: string;
  numCertificado: number;
  descEstatusDocumento: string;
  descFormaPago: string;
  fechaInicioVigencia: string;
  fechaFinVigencia: string;
  fechaEmision: string;
  montoPrimaTotal: number;
  nombreCliente: string;
  rfcPoliza: string;
  idLineaNegocio: string;
}

export interface ReciboPortalHdi {
  IdPoliza: string;
  NodeRecibo: string;
  Tab_Status_Rbo: number;
  FormaPago: string;
  Total: number;
  Titular: string;
  Status_Fecha: string;
  Certificado: number;
  Documento: number;
}

export function portalHdiConfigurado(): boolean {
  return Boolean(process.env.HDI_PORTAL_USUARIO && process.env.HDI_PORTAL_PASSWORD);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Respuesta<T> {
  data?: { Error?: boolean; Mensaje?: string; Objeto?: T };
}

export class PortalHdi {
  private constructor(
    private readonly token: string,
    readonly nip: string,
    readonly agencia: string,
  ) {}

  // Un solo intento por corrida: el portal cuenta intentos fallidos.
  static async entrar(): Promise<PortalHdi> {
    const usuario = process.env.HDI_PORTAL_USUARIO ?? "";
    const r = await fetch(BASE + "services/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        usuario,
        usuarioPwd: process.env.HDI_PORTAL_PASSWORD ?? "",
        nIntentos: "0",
        hostGuid: "hostGuid",
      }),
    });
    const j = (await r.json().catch(() => null)) as
      | { data?: { Token?: { token?: string; mensaje?: string } }; message?: string }
      | null;
    const token = j?.data?.Token?.token;
    if (!token) {
      throw new Error(`El portal HDI rechazó el acceso: ${j?.data?.Token?.mensaje || j?.message || r.status}`);
    }
    const portal = new PortalHdi(token, usuario, "");
    const agente = await portal.llamar<{ AgeId?: string }>("services4/Proxy/GetAgentsByPromoter", {
      CLI_NIP: usuario,
    });
    if (!agente?.AgeId) throw new Error("El portal HDI no regresó la agencia del agente.");
    return new PortalHdi(token, usuario, agente.AgeId.trim());
  }

  private async llamar<T>(ruta: string, cuerpo: Record<string, unknown>): Promise<T | undefined> {
    const r = await fetch(BASE + ruta, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error(`Portal HDI ${ruta}: HTTP ${r.status}`);
    const j = (await r.json()) as Respuesta<T>;
    if (j.data?.Error) throw new Error(`Portal HDI ${ruta}: ${j.data.Mensaje || "error"}`);
    return j.data?.Objeto;
  }

  private async llamarConCache<T extends object>(ruta: string, cuerpo: Record<string, unknown>): Promise<T> {
    const c: Record<string, unknown> = { ...cuerpo, idfileCache: null };
    for (let i = 0; i <= INTENTOS_CACHE; i++) {
      const o = await this.llamar<T | string>(ruta, c);
      if (o && typeof o === "object") return o;
      if (typeof o !== "string") break;
      c.idfileCache = o;
      await dormir(ESPERA_CACHE_MS);
    }
    throw new Error(`Portal HDI ${ruta}: el resultado no estuvo listo a tiempo.`);
  }

  // Pólizas del agente en la línea de negocio (AUTR = autos residentes).
  async polizas(lineaNegocio = "AUTR"): Promise<PolizaPortalHdi[]> {
    const todas: PolizaPortalHdi[] = [];
    const inicio = new Date().toISOString().slice(0, 19).replace(/-/g, "").replace("T", " ");
    for (let pagina = 1; ; pagina++) {
      const o = await this.llamarConCache<{
        paginacion?: { totalPaginas: number }[];
        polizas?: PolizaPortalHdi[] | null;
      }>("services4/Proxy/ObtOperaciones", {
        cli_Nip: this.nip,
        fechaBusquedaInical: inicio,
        tipoSeleccion: 1,
        idGrupo: 2,
        numeroPagina: pagina,
        idSubGrupo: 0,
        tab_Linea_Neg: lineaNegocio,
        prd_Cve_Producto: null,
        ordenamientoPor: 0,
        orden: 0,
        limpiarBusqueda: 0,
        mostrarTodas: 0,
        agE_ID: this.agencia,
        excel: 0,
        Busqueda: "",
        SiniestroActivo: "E",
        FechaInicio: null,
        FechaFin: null,
      });
      todas.push(...(o.polizas ?? []));
      if (pagina >= (o.paginacion?.[0]?.totalPaginas ?? 1)) return todas;
    }
  }

  // Recibos (pagados y pendientes) de las pólizas emitidas en el rango.
  async recibosPorEmision(desde: string, hasta: string, lineaNegocio = "AUTR"): Promise<ReciboPortalHdi[]> {
    const o = await this.llamar<ReciboPortalHdi[]>("services4/Proxy/ObtRecibosPortalAgentes", {
      User: this.nip,
      Cli_Nip: this.nip,
      TabLineaNeg: lineaNegocio,
      CPolIdPoliza: "",
      Rfc: "",
      idTipoPersona: "",
      FecIniVig1: desde,
      FecFinVig1: hasta,
      EstatusRecib: "0",
      NumCis: "0",
      NumDoc: "0",
    });
    return Array.isArray(o) ? o : [];
  }
}
