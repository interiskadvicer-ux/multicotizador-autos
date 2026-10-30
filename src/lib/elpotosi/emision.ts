// Emisión de Seguros El Potosí (Cotizador Dinámico):
//   Poliza/Emitir (folio + plan de pago de Cotizar) → "idePol|numeroPoliza"
//   Documentos/DescargarPoliza (idePol) → PDF de la carátula.
// No hay cobro en línea: la póliza se emite y el recibo queda pendiente de pago.
import {
  ElPotosiError,
  getElPotosiConfig,
  llamarElPotosiBinario,
  llamarElPotosiTexto,
  urlCotizador,
} from "./client";
import { domicilioPorCp } from "./catalogos";

export interface PersonaEmisionElPotosi {
  tipoPersona: "F" | "M";
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  rfc: string;
  fechaNacimiento: string;
  telefono: string;
  telefono2?: string;
  email: string;
  calle: string;
  numeroExterior: string;
  numeroInterior?: string;
  cp: string;
  colonia?: string;
}

export interface EmisionElPotosi {
  folioCotizacion: string;
  formaPagoId: string;
  inicioVigencia: string;
  serie: string;
  motor?: string;
  placa?: string;
  descuento: number;
  contratante: PersonaEmisionElPotosi;
  responsablePago?: PersonaEmisionElPotosi;
  facturacion: {
    nombre: string;
    cpFiscal: string;
    regimenFiscal: string;
    usoCFDI: string;
  };
}

export interface PolizaElPotosi {
  idePol: string;
  numeroPoliza: string;
}

async function persona(p: PersonaEmisionElPotosi) {
  const d = await domicilioPorCp(p.cp, p.colonia);
  return {
    nombre: p.nombre,
    apellidoPatern: p.apellidoPaterno,
    apellidoMaterno: p.apellidoMaterno,
    rfC_Completo: p.rfc.toUpperCase(),
    codEstado: d.estado,
    codCiudad: d.ciudad,
    codMunicipio: d.municipio,
    codLocalidad: d.localidad,
    numero: p.numeroExterior,
    numInt: p.numeroInterior ?? "",
    fecNacimiento: p.fechaNacimiento,
    tipoPersona: p.tipoPersona,
    telefono1: p.telefono,
    telefono2: p.telefono2 ?? p.telefono,
    cp: p.cp,
    email: p.email,
    nombreCalle: p.calle,
  };
}

export async function emitirElPotosi(e: EmisionElPotosi): Promise<PolizaElPotosi> {
  const serie = e.serie.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (serie.length !== 17)
    throw new ElPotosiError("El número de serie debe tener 17 caracteres.");
  const cfg = getElPotosiConfig();
  const contratante = await persona(e.contratante);
  const body = {
    folioCotizacion: Number(e.folioCotizacion),
    fecIniVig: e.inicioVigencia,
    formaPagoId: e.formaPagoId,
    codUsr: cfg.usuario,
    CodInter: cfg.intermediario,
    numSerie: serie,
    numMotor: (e.motor ?? "").slice(0, 25),
    numPlaca: (e.placa ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9),
    descuento: String(e.descuento),
    contratante,
    responsablePago: e.responsablePago ? await persona(e.responsablePago) : contratante,
    datosFacturacion: {
      nombreContribuyente: e.facturacion.nombre,
      codigoPostalFiscal: e.facturacion.cpFiscal,
      regimenFiscal: e.facturacion.regimenFiscal,
      usoCFDI: e.facturacion.usoCFDI,
    },
  };
  const texto = (await llamarElPotosiTexto(urlCotizador("Poliza/Emitir", {}), body))
    .trim()
    .replace(/^"|"$/g, "");
  const [idePol, numeroPoliza] = texto.split("|");
  if (!idePol || !numeroPoliza)
    throw new ElPotosiError(`Respuesta inesperada de El Potosí al emitir: ${texto.slice(0, 200)}`);
  return { idePol, numeroPoliza };
}

export async function descargarPolizaElPotosi(idePol: string): Promise<Buffer> {
  const { usuario } = getElPotosiConfig();
  const { contentType, datos } = await llamarElPotosiBinario(
    urlCotizador("Documentos/DescargarPoliza", { CodUsr: usuario, IdePol: idePol }),
  );
  if (datos.subarray(0, 4).toString() === "%PDF") return datos;
  const texto = datos.toString("utf8").trim().replace(/^"|"$/g, "");
  if (/json|text/.test(contentType) && /^[A-Za-z0-9+/=\s]+$/.test(texto)) {
    const pdf = Buffer.from(texto, "base64");
    if (pdf.subarray(0, 4).toString() === "%PDF") return pdf;
  }
  throw new ElPotosiError(
    `El Potosí no devolvió el PDF de la póliza ${idePol}: ${texto.slice(0, 200)}`,
  );
}
