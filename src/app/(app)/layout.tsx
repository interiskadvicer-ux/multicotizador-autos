import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import { contarSolicitudesPendientes } from "@/lib/agentes";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  const pendientes = sesion.rol === "ADMIN" ? contarSolicitudesPendientes() : 0;

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar sesion={sesion} solicitudesPendientes={pendientes} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
