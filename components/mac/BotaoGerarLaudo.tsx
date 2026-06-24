// components/mac/BotaoGerarLaudo.tsx
"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  processoId: string;
  disabled?: boolean;
  mrpData?: { assuntoNome?: string; interessado?: string | null; areaConstruida?: number; bairro?: string | null; numeroSei?: string | null; numeroFisico?: string | null; };
  // Callback opcional disparado APÓS o download bem-sucedido do laudo.
  // Usado, por exemplo, para gravar uma tag permanente no processo.
  onSuccess?: () => void;
}

export function BotaoGerarLaudo({ processoId, disabled, onSuccess, mrpData }: Props) {
  const [gerando, setGerando] = useState(false);

  async function handleGerar() {
    if (!processoId || gerando) return;
    setGerando(true);
    try {
      const res = await fetch("/api/mac/gerar-laudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processoId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detalhe ?? err.erro ?? "Erro desconhecido");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? "laudo.xlsm";
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Laudo gerado com sucesso!");
      onSuccess?.();
      // Registro MRP
      if (mrpData) {
        fetch("/api/mrp/registros", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processo_codigo: processoId,
            tipo_despacho: "laudo",
            assunto: mrpData.assuntoNome ?? "Regularização SEI",
            interessado: mrpData.interessado ?? null,
            area_construida: mrpData.areaConstruida ?? 0,
            bairro: mrpData.bairro ?? null,
            numero_sei: mrpData.numeroSei ?? processoId,
            numero_fisico: mrpData.numeroFisico ?? null,
            auto_gerado: true,
          }),
        }).then(async r => { const j = await r.json(); console.log("[MRP-LAUDO]", r.status, JSON.stringify(j)); }).catch(e => console.error("[MRP-LAUDO] ERRO:", e?.message));
      }
      // Registro MAP
      fetch("/api/auditoria/registrar", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: "DESPACHO", acao: "LAUDO_EXCEL_GERADO", processo_codigo: processoId, origem: "MANUAL" }),
      }).catch(() => {});
    } catch (e: any) {
      toast.error(`Erro ao gerar laudo: ${e.message}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <button
      onClick={handleGerar}
      disabled={disabled || gerando}
      className="w-full bg-[var(--success)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--primary-text)] font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
    >
      {gerando
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <FileSpreadsheet className="h-4 w-4" />}
      {gerando ? "⏳ Gerando..." : "📊 Gerar Laudo Excel"}
    </button>
  );
}
