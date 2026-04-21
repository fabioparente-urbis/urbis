// components/mac/BotaoGerarLaudo.tsx
"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  processoId: string;
  disabled?: boolean;
}

export function BotaoGerarLaudo({ processoId, disabled }: Props) {
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
      className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
    >
      {gerando
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <FileSpreadsheet className="h-4 w-4" />}
      {gerando ? "⏳ Gerando..." : "📊 Gerar Laudo Excel"}
    </button>
  );
}
