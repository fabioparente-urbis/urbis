// ============================================================
// components/mac/aceiteSei/BotaoGerarLaudoAceiteSei.tsx
// Botão "Gerar Laudo Excel" do ALVARÁ DE ACEITE (Slot 2).
//
// ISOLAMENTO DE SLOT (CLAUDE.md): cópia própria do Slot 2. NÃO é
// `components/mac/BotaoGerarLaudo.tsx` com uma prop nova — aquele
// arquivo continua servindo o Slot 1 byte a byte igual, e nada aqui
// pode mudar o comportamento dele. Reproduzido por leitura.
//
// Diferenças em relação ao botão do Slot 1, todas deliberadas:
//
//   • Sem o modal de "ÁREA DIVERGENTE": o 409 de área é verificação do
//     Slot 1 (projeto × laudo × ART × vistoria) e a rota do Aceite não
//     o emite. Menos código, não menos função.
//   • Trata o 409 "SLOT_INCORRETO" da guarda de slot da rota.
//   • Mostra o que a rota devolve nos cabeçalhos em vez de engolir:
//     campos que o laudo saiu sem, como a comprovação do tempo de
//     existência foi resolvida, e falha de MDP/MRP. Nada sai em
//     silêncio.
// ============================================================
"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  processoId: string;
  disabled?: boolean;
  mrpData?: {
    assuntoNome?: string;
    interessado?: string | null;
    areaConstruida?: number;
    bairro?: string | null;
    numeroSei?: string | null;
    numeroFisico?: string | null;
  };
  /** Disparado após o download bem-sucedido (ex.: gravar a tag do processo). */
  onSuccess?: () => void;
  /** Portão de pendências da tela. Devolve false para desistir da emissão. */
  onAntesDeGerar?: () => Promise<boolean>;
}

/** Lê um cabeçalho que a rota manda percent-encoded, sem estourar se vier torto. */
function lerHeader(res: Response, nome: string): string | null {
  const v = res.headers.get(nome);
  if (!v) return null;
  try { return decodeURIComponent(v); } catch { return v; }
}

export function BotaoGerarLaudoAceiteSei({ processoId, disabled, onSuccess, mrpData, onAntesDeGerar }: Props) {
  const [gerando, setGerando] = useState(false);

  async function handleGerar() {
    if (!processoId || gerando) return;
    if (onAntesDeGerar && !(await onAntesDeGerar())) return;
    setGerando(true);
    try {
      const res = await fetch("/api/mac/aceite-sei/gerar-laudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processoId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        /* Railway serve por HTTP/2 e `res.statusText` vem sempre vazio —
         * sem o status numérico, 502/504 de proxy fica indistinguível de
         * erro da própria rota. Mesmo achado de 08/09 e 16/09/2026. */
        throw new Error(err?.detalhe ?? err?.erro ?? `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      a.download = cd.match(/filename="?([^"]+)"?/)?.[1] ?? "laudo_aceite.xlsx";
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Laudo do Aceite gerado!");

      // Nada sai em silêncio: o que a rota reportou vira aviso na tela.
      const comprovacao = lerHeader(res, "X-Comprovacao");
      if (comprovacao?.startsWith("ausente")) {
        toast.warning("Laudo emitido SEM comprovação do tempo de existência — confira antes de assinar.");
      } else if (comprovacao) {
        toast.info(`Comprovação do tempo de existência — ${comprovacao}`);
      }
      const vazios = lerHeader(res, "X-Campos-Vazios");
      if (vazios) toast.warning(`Laudo saiu com campos vazios: ${vazios}`);
      const avisos = lerHeader(res, "X-Avisos");
      if (avisos) toast.warning(avisos);
      const mdpFalhou = lerHeader(res, "X-MDP-Falhou");
      if (mdpFalhou) toast.error(`MDP não registrou o laudo: ${mdpFalhou}`);
      const mrpFalhou = lerHeader(res, "X-MRP-Falhou");
      if (mrpFalhou) toast.error(`MRP não registrou o laudo: ${mrpFalhou}`);

      onSuccess?.();

      // MRP pelo cliente — a rota também grava e as duas convergem para a
      // MESMA linha (dedupe na tabela). Redundância proposital.
      if (mrpData) {
        fetch("/api/mrp/registros", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processo_codigo: processoId,
            tipo_despacho: "laudo",
            assunto: mrpData.assuntoNome ?? "Aceite SEI",
            interessado: mrpData.interessado ?? null,
            area_construida: mrpData.areaConstruida ?? 0,
            bairro: mrpData.bairro ?? null,
            numero_sei: mrpData.numeroSei ?? processoId,
            numero_fisico: mrpData.numeroFisico ?? null,
            auto_gerado: true,
          }),
        }).catch((e) => console.error("[MRP-LAUDO-ACEITE] ERRO:", e?.message));
      }

      // MAP (auditoria)
      fetch("/api/auditoria/registrar", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modulo: "DESPACHO",
          acao: "LAUDO_EXCEL_GERADO",
          processo_codigo: processoId,
          origem: "MANUAL",
        }),
      }).catch(() => {});
    } catch (e: any) {
      toast.error(`Erro ao gerar laudo do Aceite: ${e.message}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <button
      onClick={() => void handleGerar()}
      disabled={disabled || gerando}
      className="w-full bg-[var(--success)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--primary-text)] font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
    >
      {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      {gerando ? "⏳ Gerando..." : "📊 Gerar Laudo Excel"}
    </button>
  );
}
