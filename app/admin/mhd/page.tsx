"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Search, Loader2 } from "lucide-react";
import { isPerfilIrrestrito } from "@/lib/perfis";

/**
 * /admin/mhd — primeira tela própria do MHD (Histórico e Documentos).
 *
 * Até 06/09/2026 o MHD só era visível DENTRO de um processo aberto (botão
 * "🗂 HISTÓRICO DOCUMENTAL" em app/processo/ProcessoClient.tsx) — sem entrada na Home, o Fábio
 * não encontrava. Esta tela busca o mesmo `/api/mhd?processo=<codigo>` que a tela do processo já
 * usa; a renderização do resultado foi reproduzida por leitura daquele modal (não compartilhada
 * — é tela nova, evita acoplar a este arquivo com o ProcessoClient, que já é enorme).
 *
 * Mesmo padrão visual e mesmo gate de visibilidade de /admin/urbi e /admin/bdi/leis (BIP):
 * só perfil irrestrito, redireciona pra Home se não autorizado.
 *
 * SÓ LEITURA. Nenhuma escrita acontece aqui.
 */

const INPUT = "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]";

type MhdResposta = {
  ok: boolean;
  ativo: boolean;
  aviso?: string;
  documentos: any[];
  eventos: any[];
  totais?: { documentos: number; versoes: number; paginasIA: number };
};

export default function MhdAdminPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [processo, setProcesso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<MhdResposta | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json().catch(() => null);
        const perfis = json?.data?.perfis?.length ? json.data.perfis : json?.data?.perfil;
        if (!json?.ok || !isPerfilIrrestrito(perfis)) { router.push("/"); return; }
        setAutorizado(true);
      } catch { router.push("/"); }
    })();
  }, [router]);

  async function buscar() {
    const codigo = processo.trim();
    if (!codigo) return;
    setCarregando(true);
    setErro(null);
    setDados(null);
    try {
      const r = await fetch(`/api/mhd?processo=${encodeURIComponent(codigo)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro || "Falha ao consultar o MHD");
      setDados(j);
    } catch (e: any) {
      setErro(e?.message ?? String(e));
    } finally {
      setCarregando(false);
    }
  }

  if (autorizado === null) return <div className="p-8 text-sm text-[var(--text-muted)]">Carregando…</div>;
  if (!autorizado) return null;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")}
              className="bg-[var(--primary)] hover:bg-[var(--accent-hover)] text-white font-bold px-3 py-1.5 rounded text-sm transition-colors">
              🏠 Home
            </button>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="bg-[var(--error-bg)] hover:bg-[var(--error)] hover:text-white text-[var(--error)] font-bold px-3 py-1.5 rounded text-sm transition-colors border border-[var(--error)]">
              🚪 Sair
            </button>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
              <HardDrive size={22} /> MHD — Histórico e Documentos
            </h1>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Módulo satélite: a memória de que documento já entrou em qual processo, por versão
            e por hash. Só leitura — quem grava é a leitura de pasta/arquivo, dentro do processo.
          </p>
        </div>

        <div className="mb-5 flex gap-2">
          <input
            value={processo}
            onChange={(e) => setProcesso(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Número do processo — ex.: 25.5.000012012-9"
            className={`${INPUT} flex-1`}
          />
          <button
            onClick={buscar}
            disabled={carregando || !processo.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {carregando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>

        {erro && (
          <p className="text-sm text-[var(--error)] bg-[var(--error-bg)] rounded-lg p-3 mb-4">⚠ {erro}</p>
        )}

        {dados && !dados.ativo && (
          <p className="text-sm text-[var(--warning)] bg-[var(--warning-bg)] rounded-lg p-3">{dados.aviso}</p>
        )}

        {dados && dados.ativo && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-muted)]">
              {dados.totais?.documentos ?? 0} documento(s) · {dados.totais?.versoes ?? 0} versão(ões) ·{" "}
              {dados.totais?.paginasIA ?? 0} página(s) enviadas à IA no total
            </p>

            {!dados.documentos.length && !dados.eventos?.length && (
              <p className="text-sm text-[var(--text-muted)]">
                Nada encontrado ainda para este processo — nem documento versionado, nem evento na
                linha do tempo (ex.: uma organização de PDF do SEI).
              </p>
            )}
            {!dados.documentos.length && !!dados.eventos?.length && (
              <p className="text-sm text-[var(--text-muted)]">
                Nenhum documento VERSIONADO (ART, laudo etc.) neste processo ainda — mas há linha
                do tempo abaixo.
              </p>
            )}

            {dados.documentos.map((d: any) => (
              <div key={d.id} className="border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-card)]">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {d.rotulo} <span className="text-[var(--text-muted)] font-normal">· {d.versoes.length} versão(ões)</span>
                </p>
                <div className="mt-1 space-y-1">
                  {d.versoes.map((v: any) => (
                    <div key={v.id} className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-x-2">
                      <span className={v.vigente ? "text-[#16A34A] font-semibold" : "text-[var(--text-muted)]"}>
                        v{v.versao}{v.vigente ? " (vigente)" : ""}
                      </span>
                      <span>{v.nome_arquivo}</span>
                      <span className="text-[var(--text-muted)]">
                        rodada {v.rodada}
                        {v.revisao ? ` · ${v.revisao}` : ""}
                        {v.data_documento ? ` · emitido ${v.data_documento}` : ""}
                        {v.paginas ? ` · ${v.paginas}p` : ""}
                        {` · ${v.origem}`}
                        {v.custo_paginas_ia ? ` · ${v.custo_paginas_ia}p de IA` : " · sem IA"}
                      </span>
                      <span className="text-[var(--text-muted)]">
                        lido em {new Date(v.lido_em).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!!dados.eventos?.length && (
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">Linha do tempo</p>
                <div className="space-y-1">
                  {dados.eventos.map((e: any) => (
                    <p key={e.id} className="text-xs text-[var(--text-secondary)]">
                      <span className="text-[var(--text-muted)]">
                        {new Date(e.criado_em).toLocaleString("pt-BR")}
                      </span>{" "}
                      <span className="text-[var(--text-muted)]">[{e.tipo}]</span> {e.titulo}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
