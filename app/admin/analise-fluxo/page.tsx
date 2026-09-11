"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2 } from "lucide-react";
import { isPerfilIrrestrito } from "@/lib/perfis";

/**
 * /admin/analise-fluxo — Fase 12 do plano de leitura de PDF (§4.5, "Painel de gestão").
 *
 * Módulo de Análise de Fluxo (Módulo B do plano): mostra, a partir de `fluxo_processo_eventos`
 * (Fase 10) e `agregarPortfolio` (Fase 11), quantos processos ficam em cada faixa de tempo, onde
 * o processo típico trava (mediana por setor — não média, pra um outlier isolado não distorcer o
 * retrato do caso comum) e o retrabalho típico.
 *
 * Mesmo padrão de /admin/mhd: cliente, gate isPerfilIrrestrito redirecionando pra Home, dado vem
 * de uma rota própria (`/api/admin/fluxo/portfolio`). Só leitura — esta tela não escreve nada.
 *
 * Base carregada pela Fase 10: 101 processos / 2441 eventos em 11/09/2026.
 */

type FaixaTempo = "menos de 30 dias" | "30 a 90 dias" | "90 a 365 dias" | "mais de 1 ano";

type Portfolio = {
  totalProcessos: number;
  processosComDuracaoMedida: number;
  contagemPorFaixa: Record<FaixaTempo, number>;
  tempoTipicoPorSetor: { setor: string; medianaDias: number; processos: number }[];
  setoresOcultadosPorAmostra: number;
  retrabalho: {
    processosComRetrabalho: number;
    totalProcessos: number;
    medianaEntreOsQueVoltaram: number;
    maximo: number;
  };
};

type Prontidao = { pronta: boolean; totalProcessos: number; diasDesdePrimeiraCarga: number | null; motivos: string[] };
type SinalFase14 = { correcoesReais: number; processosDistintos: number; primeiraCorrecaoEm: string | null; pronta: boolean };

const ORDEM_FAIXAS: FaixaTempo[] = ["menos de 30 dias", "30 a 90 dias", "90 a 365 dias", "mais de 1 ano"];

export default function AnaliseFluxoPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [prontidao, setProntidao] = useState<Prontidao | null>(null);
  const [sinalFase14, setSinalFase14] = useState<SinalFase14 | null>(null);

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

  useEffect(() => {
    if (autorizado !== true) return;
    fetch("/api/admin/fluxo/portfolio")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setErro(j.erro ?? "Erro ao carregar."); return; }
        setPortfolio(j.portfolio);
      })
      .catch(() => setErro("Erro ao carregar."))
      .finally(() => setCarregando(false));
  }, [autorizado]);

  useEffect(() => {
    if (autorizado !== true) return;
    fetch("/api/admin/fluxo/interpretar")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setProntidao(j.prontidao); })
      .catch(() => {});
  }, [autorizado]);

  useEffect(() => {
    if (autorizado !== true) return;
    fetch("/api/admin/fluxo/fase14-sinal")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSinalFase14(j); })
      .catch(() => {});
  }, [autorizado]);

  if (autorizado !== true) return null;

  const maxFaixa = portfolio ? Math.max(1, ...ORDEM_FAIXAS.map((f) => portfolio.contagemPorFaixa[f])) : 1;
  const maxSetor = portfolio?.tempoTipicoPorSetor.length
    ? Math.max(...portfolio.tempoTipicoPorSetor.map((s) => s.medianaDias))
    : 1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Activity className="h-5 w-5 text-[var(--accent)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Análise de Fluxo</h1>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}
      {erro && <p className="text-sm text-[var(--error)]">{erro}</p>}

      {portfolio && !carregando && (
        <div className="space-y-8">
          <p className="text-sm text-[var(--text-muted)]">
            {portfolio.totalProcessos} processo(s) carregados pela carga do acervo (Fase 10) — amostra ainda pequena, os números tendem a mudar conforme mais processos entrarem.
          </p>

          <section>
            <h2 className="mb-3 text-sm font-medium text-[var(--text-primary)]">Processos por tempo parado</h2>
            <div className="space-y-2">
              {ORDEM_FAIXAS.map((faixa) => {
                const n = portfolio.contagemPorFaixa[faixa];
                return (
                  <div key={faixa} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-[var(--text-muted)]">{faixa}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--bg-secondary)]">
                      <div
                        className="h-full rounded bg-[var(--accent)]"
                        style={{ width: `${(n / maxFaixa) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs text-[var(--text-primary)]">{n}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-medium text-[var(--text-primary)]">Onde trava (típico por setor)</h2>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Tempo que o processo passou esperando cada setor produzir o seu documento. Mediana entre
              os processos que passaram por ele — não média, pra um processo esquecido anos num setor
              não distorcer o retrato do caso comum.
              {portfolio.setoresOcultadosPorAmostra > 0 && (
                <> {portfolio.setoresOcultadosPorAmostra} setor(es) ficaram de fora por aparecerem em
                um único processo — amostra pequena demais pra virar estatística.</>
              )}
            </p>
            {portfolio.tempoTipicoPorSetor.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">Sem dado suficiente ainda.</p>
            )}
            <div className="space-y-2">
              {portfolio.tempoTipicoPorSetor.slice(0, 10).map((s) => (
                <div key={s.setor} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 truncate text-xs text-[var(--text-muted)]" title={s.setor}>{s.setor}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--bg-secondary)]">
                    <div
                      className="h-full rounded bg-[var(--info)]"
                      style={{ width: `${(s.medianaDias / maxSetor) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-[var(--text-primary)]">{s.medianaDias} dias</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-medium text-[var(--text-primary)]">Retrabalho</h2>
            <p className="text-sm text-[var(--text-primary)]">
              {portfolio.retrabalho.processosComRetrabalho} de {portfolio.retrabalho.totalProcessos} processo(s)
              voltaram pelo menos uma vez.
              {portfolio.retrabalho.processosComRetrabalho > 0 && (
                <> Entre os que voltaram, a mediana é de {portfolio.retrabalho.medianaEntreOsQueVoltaram}{" "}
                despacho(s) de pendência/diligência — o pior chegou a {portfolio.retrabalho.maximo}.</>
              )}
            </p>
          </section>

          {prontidao && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-[var(--text-primary)]">Interpretação assistida (Fase 13)</h2>
              {prontidao.pronta ? (
                <p className="text-sm text-[var(--text-primary)]">
                  Base madura ({prontidao.totalProcessos} processos, {prontidao.diasDesdePrimeiraCarga} dias desde a
                  primeira carga). Falta ligar o interruptor <code>urbis_config.interpretacao_assistida_fluxo_ativo</code> por SQL.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-[var(--text-muted)]">
                    Ainda bloqueada — o plano manda esperar a base amadurecer antes de deixar a IA opinar:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-[var(--text-muted)] space-y-1">
                    {prontidao.motivos.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </>
              )}
            </section>
          )}

          {sinalFase14 && (
            <section>
              <h2 className="mb-1 text-sm font-medium text-[var(--text-primary)]">Aprendizado por correção (Fase 14)</h2>
              {sinalFase14.pronta ? (
                <p className="text-sm text-[var(--text-primary)]">
                  ⚡ {sinalFase14.correcoesReais} correção(ões) real(is) já registrada(s) em {sinalFase14.processosDistintos}{" "}
                  processo(s), desde {sinalFase14.primeiraCorrecaoEm ? new Date(sinalFase14.primeiraCorrecaoEm).toLocaleDateString("pt-BR") : "—"}.
                  Já dá pra desenhar a Fase 14 com exemplo real — não precisa mais esperar.
                </p>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  0 correções reais registradas ainda — o Fatiador (`/fatiador-sei`) só foi testado com PDF sintético.
                  Este número sobe sozinho assim que uma correção real acontecer; não precisa lembrar de checar.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
