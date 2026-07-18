"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { Rol, SesionUsuario } from "@/domain/admin";

interface Props {
  sesion: SesionUsuario;
}

const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Administrador",
  POLIZAS: "Gestor de pólizas",
  COTIZADOR: "Cotizador",
};

export default function NavBar({ sesion }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [saliendo, setSaliendo] = useState(false);

  const links: { href: string; label: string; roles: Rol[] }[] = [
    { href: "/", label: "Cotizador", roles: ["ADMIN", "POLIZAS", "COTIZADOR"] },
    { href: "/polizas", label: "Pólizas", roles: ["ADMIN", "POLIZAS"] },
    { href: "/admin/usuarios", label: "Usuarios", roles: ["ADMIN"] },
    { href: "/admin/actividad", label: "Actividad", roles: ["ADMIN"] },
  ];

  const visibles = links.filter((l) => l.roles.includes(sesion.rol));

  async function salir() {
    setSaliendo(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="text-sm font-bold text-sky-700">Interiskad</span>
        <nav className="flex flex-wrap gap-1">
          {visibles.map((l) => {
            const activo =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  activo
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="hidden sm:inline">
            {sesion.nombre} · {ETIQUETA_ROL[sesion.rol]}
          </span>
          <button
            type="button"
            onClick={salir}
            disabled={saliendo}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {saliendo ? "Saliendo…" : "Salir"}
          </button>
        </div>
      </div>
    </header>
  );
}
