import { redirect } from "next/navigation";
import ProcessoClient from "../ProcessoClient";

// Slots com ficha do LIP PRÓPRIA (Etapa 2 do plano docs/URBIS_PLANO_SLOTS_3_4_PED.md — "5
// programas independentes"): o endereço antigo /processo/<id>?tipo=<slug> só encaminha para a
// ficha do slot, para nenhum link antigo (Pilha, URBI, e-mail, Fatiador) quebrar. Os demais
// slots seguem nesta ficha, sem nenhuma mudança.
const FICHA_PROPRIA: Record<string, string> = {
  regularizacao: "/lip-regularizacao-sei",
  aceite_sei: "/lip-aceite-sei",
  slot_03: "/lip-regularizacao-ped",
  slot_05: "/lip-aprovacao-projeto",
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
  // Sem `?tipo=` a ficha comum sempre abriu como Regularização — o encaminhamento segue a mesma regra.
  const tipo = typeof sp.tipo === "string" && sp.tipo ? sp.tipo : "regularizacao";
  const destino = FICHA_PROPRIA[tipo];
  if (destino) redirect(`${destino}/${encodeURIComponent(decodeURIComponent(id))}`);
  return <ProcessoClient />;
}
