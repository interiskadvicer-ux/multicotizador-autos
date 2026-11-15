import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import CotizadorGmm from "@/components/CotizadorGmm";

export default async function CotizarGmmPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  return <CotizadorGmm agente={sesion.nombre} />;
}
