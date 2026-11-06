"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ROLES, type Rol, type SesionUsuario } from "@/domain/admin";

interface Props {
  sesion: SesionUsuario;
  solicitudesPendientes: number;
}

const TODOS: Rol[] = ["ADMIN", "POLIZAS", "COTIZADOR", "AGENTE"];

const SECCIONES: {
  titulo: string;
  links: { href: string; label: string; roles: Rol[] }[];
}[] = [
  {
    titulo: "Inicio",
    links: [{ href: "/", label: "Dashboard", roles: TODOS }],
  },
  {
    titulo: "Cotizadores",
    links: [{ href: "/cotizar", label: "Autos", roles: TODOS }],
  },
  {
    titulo: "Oficina virtual",
    links: [
      { href: "/cotizaciones", label: "Cotizaciones", roles: TODOS },
      { href: "/polizas", label: "Pólizas", roles: ["ADMIN", "POLIZAS", "AGENTE"] },
      { href: "/cobranza", label: "Cobranza", roles: ["ADMIN", "POLIZAS"] },
    ],
  },
  {
    titulo: "Administración",
    links: [
      { href: "/admin/agentes", label: "Agentes", roles: ["ADMIN"] },
      { href: "/admin/usuarios", label: "Usuarios", roles: ["ADMIN"] },
      { href: "/admin/actividad", label: "Actividad", roles: ["ADMIN"] },
    ],
  },
];

export default function Sidebar({ sesion, solicitudesPendientes }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [saliendo, setSaliendo] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const etiquetaRol = ROLES.find((r) => r.value === sesion.rol)?.label ?? sesion.rol;

  async function salir() {
    setSaliendo(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white lg:hidden">
        <span className="text-sm font-bold">Interiskad · Portal de agentes</span>
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="rounded-lg border border-slate-600 px-3 py-1 text-xs"
        >
          {abierto ? "Cerrar" : "Menú"}
        </button>
      </div>
      <aside
        className={`${
          abierto ? "block" : "hidden"
        } w-full shrink-0 bg-slate-900 text-slate-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:flex-col`}
      >
        <div className="hidden px-5 py-5 lg:block">
          <div className="text-lg font-bold text-white">Interiskad</div>
          <div className="text-xs text-slate-400">Portal de agentes</div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 lg:py-0">
          {SECCIONES.map((sec) => {
            const links = sec.links.filter((l) => l.roles.includes(sesion.rol));
            if (!links.length) return null;
            return (
              <div key={sec.titulo}>
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {sec.titulo}
                </div>
                {links.map((l) => {
                  const activo =
                    l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setAbierto(false)}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                        activo ? "bg-sky-600 text-white" : "hover:bg-slate-800"
                      }`}
                    >
                      {l.label}
                      {l.href === "/admin/agentes" && solicitudesPendientes > 0 && (
                        <span className="rounded-full bg-amber-400 px-2 text-xs font-bold text-slate-900">
                          {solicitudesPendientes}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-xs">
          <div className="font-semibold text-white">{sesion.nombre}</div>
          <div className="text-slate-400">{etiquetaRol}</div>
          <button
            type="button"
            onClick={salir}
            disabled={saliendo}
            className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-1.5 font-medium transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saliendo ? "Saliendo…" : "Cerrar sesión"}
          </button>
        </div>
      </aside>
    </>
  );
}
