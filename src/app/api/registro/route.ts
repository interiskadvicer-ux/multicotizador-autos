import { NextResponse } from "next/server";
import { hashPassword, buscarUsuarioPorEmail } from "@/lib/auth";
import {
  DOCUMENTOS_REQUERIDOS,
  MIME_PERMITIDOS,
  TAMANO_MAXIMO,
  crearSolicitud,
  solicitudPorEmail,
  type ArchivoSubido,
} from "@/lib/agentes";
import { registrarActividad } from "@/lib/activity";

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const VENTANA_MS = 60 * 60 * 1000;
const MAX_POR_VENTANA = 5;
const intentos = new Map<string, number[]>();

function excedeLimite(ip: string): boolean {
  const ahora = Date.now();
  const recientes = (intentos.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  recientes.push(ahora);
  intentos.set(ip, recientes);
  return recientes.length > MAX_POR_VENTANA;
}

function firmaValida(mime: string, datos: Buffer): boolean {
  if (mime === "application/pdf") return datos.subarray(0, 4).toString() === "%PDF";
  if (mime === "image/png")
    return datos.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (mime === "image/jpeg")
    return datos.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return false;
}

function texto(form: FormData, campo: string): string {
  const v = form.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (excedeLimite(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo más tarde." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const nombre = texto(form, "nombre");
  const email = texto(form, "email").toLowerCase();
  const telefono = texto(form, "telefono").replace(/[^0-9]/g, "");
  const rfc = texto(form, "rfc").toUpperCase();
  const estadoRepublica = texto(form, "estadoRepublica");
  const cedula = texto(form, "cedula") || null;
  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";

  if (nombre.length < 3) return NextResponse.json({ error: "Escribe tu nombre completo." }, { status: 422 });
  if (!RE_EMAIL.test(email)) return NextResponse.json({ error: "El correo no es válido." }, { status: 422 });
  if (telefono.length !== 10) return NextResponse.json({ error: "El teléfono debe tener 10 dígitos." }, { status: 422 });
  if (!RE_RFC.test(rfc)) return NextResponse.json({ error: "El RFC no es válido." }, { status: 422 });
  if (password.length < 8)
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 422 });
  if (form.get("aceptaAviso") !== "true")
    return NextResponse.json({ error: "Debes aceptar el aviso de privacidad." }, { status: 422 });

  const previa = solicitudPorEmail(email);
  if (buscarUsuarioPorEmail(email) || (previa && previa.estado !== "RECHAZADA")) {
    return NextResponse.json(
      { error: "Ya existe un registro con ese correo." },
      { status: 409 },
    );
  }

  const archivos: ArchivoSubido[] = [];
  for (const doc of DOCUMENTOS_REQUERIDOS) {
    const f = form.get(doc.tipo);
    if (!f || typeof f === "string" || f.size === 0) {
      return NextResponse.json({ error: `Falta: ${doc.label}.` }, { status: 422 });
    }
    if (!MIME_PERMITIDOS[f.type]) {
      return NextResponse.json(
        { error: `${doc.label}: solo se aceptan PDF, JPG o PNG.` },
        { status: 422 },
      );
    }
    if (f.size > TAMANO_MAXIMO) {
      return NextResponse.json(
        { error: `${doc.label}: el archivo supera 5 MB.` },
        { status: 422 },
      );
    }
    const datos = Buffer.from(await f.arrayBuffer());
    if (!firmaValida(f.type, datos)) {
      return NextResponse.json(
        { error: `${doc.label}: el archivo está dañado o no es del tipo indicado.` },
        { status: 422 },
      );
    }
    archivos.push({ tipo: doc.tipo, nombre: f.name, mime: f.type, datos });
  }

  const id = crearSolicitud(
    {
      nombre,
      email,
      telefono,
      rfc,
      estadoRepublica,
      cedula,
      passwordHash: await hashPassword(password),
    },
    archivos,
  );
  registrarActividad(
    { id: null, email },
    "AGENTE_REGISTRO",
    `Solicitud de registro de agente #${id} (${nombre})`,
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}
