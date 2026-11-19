// Descarga el Catálogo Nacional de Códigos Postales de Correos de México
// (SEPOMEX) y lo guarda compacto en sepomex.json, junto a la base de datos
// (fuera del repositorio: el catálogo no se puede redistribuir).
//
// Uso:
//   node scripts/sepomex.mjs                 # descarga de correosdemexico.gob.mx
//   node scripts/sepomex.mjs CPdescarga.zip  # o .txt ya descargado
//
// Respeta DATABASE_PATH (por defecto ./data/app.db). Conviene correrlo cada
// pocos meses para tomar colonias nuevas.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const URL_EXPORTAR =
  "https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx";

async function descargar() {
  const pagina = await fetch(URL_EXPORTAR);
  const html = await pagina.text();
  const cookie = (pagina.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const campo = (n) => html.match(new RegExp(`id="${n}" value="([^"]*)"`))?.[1] ?? "";
  const form = new URLSearchParams({
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    __LASTFOCUS: "",
    __VIEWSTATE: campo("__VIEWSTATE"),
    __VIEWSTATEGENERATOR: campo("__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: campo("__EVENTVALIDATION"),
    cboEdo: "00",
    rblTipo: "txt",
    "btnDescarga.x": "10",
    "btnDescarga.y": "10",
  });
  const res = await fetch(URL_EXPORTAR, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: form,
  });
  if (!res.ok) throw new Error(`Correos de México respondió ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Extrae el primer archivo de un ZIP (el de SEPOMEX trae solo CPdescarga.txt).
function primerArchivoZip(zip) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP inválido");
  const central = zip.readUInt32LE(eocd + 16);
  const metodo = zip.readUInt16LE(central + 10);
  const tamano = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const datos = zip.subarray(inicio, inicio + tamano);
  return metodo === 0 ? datos : zlib.inflateRawSync(datos);
}

const entrada = process.argv[2];
let datos = entrada ? fs.readFileSync(entrada) : await descargar();
if (datos[0] === 0x50 && datos[1] === 0x4b) datos = primerArchivoZip(datos);
const lineas = new TextDecoder("latin1").decode(datos).split(/\r?\n/);
const encabezado = lineas.findIndex((l) => l.startsWith("d_codigo|"));
if (encabezado < 0) throw new Error("No se encontró el encabezado del catálogo");

const estados = [];
const municipios = [];
const indice = (lista, valor) => {
  let i = lista.indexOf(valor);
  if (i < 0) i = lista.push(valor) - 1;
  return i;
};
const cps = {};
for (const linea of lineas.slice(encabezado + 1)) {
  const c = linea.split("|");
  const [cp, colonia, , municipio, estado] = c;
  if (!/^\d{5}$/.test(cp ?? "") || !colonia) continue;
  // c_mnpio e id_asenta_cpcons: códigos que Quálitas pide en la emisión
  // (consideración 40, reglas 7 y 8).
  (cps[cp] ??= []).push([indice(estados, estado), indice(municipios, municipio), colonia, c[11] ?? "", c[12] ?? ""]);
}

const base = process.env.DATABASE_PATH
  ? path.dirname(path.resolve(process.env.DATABASE_PATH))
  : path.join(process.cwd(), "data");
fs.mkdirSync(base, { recursive: true });
const destino = path.join(base, "sepomex.json");
fs.writeFileSync(destino, JSON.stringify({ actualizado: new Date().toISOString(), estados, municipios, cps }));
console.log(`Catálogo SEPOMEX: ${Object.keys(cps).length} códigos postales → ${destino}`);
