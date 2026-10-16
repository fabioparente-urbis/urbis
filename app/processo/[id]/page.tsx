import { redirect } from "next/navigation";
import ProcessoClient from "../ProcessoClient";

// Slots com ficha do LIP PRÓPRIA (Etapa 2 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md — "5
// programas independentes"): o endereço antigo /processo/<id>?tipo=<slug> só encaminha para a
// ficha do slot, para nenhum link antigo (Pilha, URBI, e-mail, Fatiador) quebrar. Os demais
// slots seguem nesta ficha, sem nenhuma mudança.
const FICHA_PROPRIA: Record<string, string> = {
  slot_03: "/lip-regularizacao-ped",
  slot_04: "/lip-aceite-ped",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tipo = typeof sp.tipo === "string" ? sp.tipo : null;
  const destino = tipo ? FICHA_PROPRIA[tipo] : undefined;
  if (destino) redirect(`${destino}/${encodeURIComponent(decodeURIComponent(id))}`);
  return <ProcessoClient />;
}
