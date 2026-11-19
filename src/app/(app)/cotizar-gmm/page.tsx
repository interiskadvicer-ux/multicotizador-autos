import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import CotizadorGmmProductos from "@/components/CotizadorGmmProductos";

export default async function CotizarGmmPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  return <CotizadorGmmProductos agente={sesion.nombre} />;
}
