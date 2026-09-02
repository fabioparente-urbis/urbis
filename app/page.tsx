"use client";

// ============================================================
// Home — v3 — header grande com logo + barra de entrada de processo
// (compacta) + grid de cards de módulos.
//
// Visibilidade dos cards controlada pelos perfis do usuário,
// idêntica às gates anteriores (BIP só irrestrito, BACKUPS só
// Administrador).
// ============================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ScanSearch,
  ClipboardCheck,
  TrendingUp,
  BrainCircuit,
  BookOpen,
  HardDrive,
  Wand2,
  Settings2,
  LogOut,
  ClipboardList,
  FileText,
  type LucideIcon,
  Route,
} from "lucide-react";
import { isPerfilIrrestrito } from "@/lib/perfis";
import { perfilDe, validarNumero, normalizarNumero } from "@/lib/numeracao";

// `tipo` enviado ao backend continua sendo uma string canonica (ex.:
// "REGULARIZACAO"). A Sessao 3 substituiu o dropdown fixo por uma
// lista dinamica vinda de /api/admin/assuntos — usamos slug.toUpperCase()
// como tipo, mantendo compat com o backend ("regularizacao" -> "REGULARIZACAO").
type TipoProcesso = string;

type AssuntoAtivo = {
  id: string;
  slug: string;
  nome: string;
  /** 'sei' | 'alvara' — ver lib/numeracao.ts. Ausente = 'sei'. */
  numeracao?: string | null;
};

type Card = {
  chave: string;
  nome: string;
  descricao: string;
  Icone: LucideIcon;
  rota: string;
  visivel: boolean;
  /** Destaca o nome do card — hoje só o de Processos, a pedido do usuário. */
  destaque?: boolean;
};

const SLUG_REGULARIZACAO = "regularizacao";

export default function Home() {
  const router = useRouter();
  const [perfis, setPerfis] = useState<string[]>([]);
  const [carregandoAuth, setCarregandoAuth] = useState(true);

  // ── Entrada de processo (barra compacta) ──────────────────
  // Default = REGULARIZACAO ate o GET /api/admin/assuntos resolver.
  // Regularizacao e sempre ativo (slot fixo), entao sera o default
  // selecionado depois da carga tambem.
  const [tipo, setTipo] = useState<TipoProcesso>("regularizacao");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState("");

  // ── Assuntos ativos (dropdown dinamico) ───────────────────
  const [assuntosAtivos, setAssuntosAtivos] = useState<AssuntoAtivo[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/assuntos");
        const json = await res.json();
        if (!json.ok || !Array.isArray(json.data)) return;
        const ativos: AssuntoAtivo[] = json.data
          .filter((a: any) => a?.ativo === true)
          .map((a: any) => ({ id: a.id, slug: a.slug, nome: a.nome, numeracao: a.numeracao }));
        setAssuntosAtivos(ativos);
        // Garante que Regularizacao fica selecionada por padrao se
        // estiver presente; caso contrario, mantem o que ja estava.
        const reg = ativos.find((a) => a.slug === SLUG_REGULARIZACAO);
        if (reg) setTipo(reg.slug);
      } catch {
        // Silencioso — se falhar, o dropdown fica vazio mas o resto da
        // tela continua funcionando. O default ja e REGULARIZACAO.
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.ok) {
          // Combina ambos os campos (perfis[] + perfil string legado) para que
          // o gate funcione mesmo se só um deles estiver populado no banco.
          const perfisArr: string[] = Array.isArray(json.data?.perfis) ? json.data.perfis : [];
          const perfilLegado: string[] = json.data?.perfil ? [json.data.perfil] : [];
          const arr = Array.from(new Set([...perfisArr, ...perfilLegado].filter(Boolean)));
          setPerfis(arr);
        }
      } catch {
        // mantém [] -> só vê módulos sem gate
      } finally {
        setCarregandoAuth(false);
      }
    })();
  }, []);

  // ── Validação do número ───────────────────────────────────
  // A regra vem do assunto selecionado (`assuntos.numeracao`), não de uma
  // lista de slugs no código: era assim que todo slot novo caía na regra
  // do SEI. Ver lib/numeracao.ts.
  const numeracaoAtual = assuntosAtivos.find((a) => a.slug === tipo)?.numeracao;
  const perfilNum = perfilDe(numeracaoAtual);

  async function validar() {
    const resultado = validarNumero(numeracaoAtual, numero);
    if (!resultado.ok) {
      setErro(resultado.erro ?? "Número inválido.");
      return;
    }
    setErro("");
    const id = normalizarNumero(numero);
    await fetch("/api/processo/salvar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tipo }),
    });
    router.push(`/processo/${encodeURIComponent(id)}?tipo=${encodeURIComponent(tipo)}`);
  }

  // ── Gates de visibilidade ─────────────────────────────────
  const irrestrito = isPerfilIrrestrito(perfis);
  const souAdmin = perfis.includes("Administrador");

  const cards: Card[] = [
    { chave: "lip", nome: "PILHA DE PROCESSO", descricao: "", Icone: ScanSearch, rota: "/processos", visivel: true, destaque: true },
    { chave: "mac", nome: "MAC", descricao: "Análise e Conformidades", Icone: ClipboardCheck, rota: "/processos?destino=mac", visivel: false },
    { chave: "mrp", nome: "MRP", descricao: "Minha Produtividade", Icone: TrendingUp, rota: "/mrp", visivel: true },
    { chave: "mdp", nome: "MDP", descricao: "Despachos e Pareceres", Icone: FileText, rota: "/mdp", visivel: true },
    { chave: "bdi", nome: "BDI", descricao: "Banco de Dados e Inteligência", Icone: BrainCircuit, rota: "/admin/bdi", visivel: souAdmin || irrestrito },
    { chave: "bip", nome: "BIP", descricao: "Biblioteca de Leis", Icone: BookOpen, rota: "/admin/bdi/leis", visivel: irrestrito },
    { chave: "configuracoes", nome: "CONFIGURAÇÕES", descricao: "Aparência do sistema", Icone: Settings2, rota: "/configuracoes/aparencia", visivel: true },
    { chave: "map", nome: "MAP", descricao: "Auditoria e Produtividade", Icone: ClipboardList, rota: "/admin/configuracoes?aba=auditoria", visivel: souAdmin },
    { chave: "admin", nome: "ADMIN", descricao: "Configurações do sistema", Icone: Settings2, rota: "/admin/configuracoes", visivel: souAdmin || irrestrito },
    // Matriz de rastreabilidade: a especificação de como o URBIS decide cada campo.
    { chave: "rastreabilidade", nome: "RASTREABILIDADE", descricao: "Slot 5 — como cada campo é preenchido", Icone: Route, rota: "/admin/rastreabilidade", visivel: souAdmin || irrestrito },
  ];

  const visiveis = cards.filter((c) => c.visivel);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* HEADER — logo grande centralizado + Sair no canto direito */}
      <header className="relative bg-[var(--surface)] border-b border-[var(--border)] px-6 md:px-10 py-8">
        <div className="flex flex-col items-center gap-2">
          <img src="/logo_urbis.png" alt="URBIS" className="h-40 w-auto" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Sistema de Análise de Projetos — Prefeitura de Goiânia
          </p>
        </div>
        <button
          onClick={sair}
          className="absolute top-4 right-4 md:top-6 md:right-6 inline-flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-red-50 hover:text-red-700 hover:border-red-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          <LogOut size={16} />
          Sair
        </button>
      </header>

      {/* CONTEÚDO — barra de entrada + grid de cards */}
      <main className="flex-1 px-6 md:px-10 py-8">
        <div className="w-full max-w-6xl mx-auto space-y-6">

          {/* Barra compacta — assunto + número + ENTRAR */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-sm p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <label className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-semibold md:mr-1">
                Abrir processo
              </label>
              <select
                value={tipo}
                onChange={(e) => { setTipo(e.target.value as TipoProcesso); setErro(""); }}
                className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] min-w-[180px]">
                {assuntosAtivos.length === 0 ? (
                  // Fallback enquanto o GET nao retornou: mostra Regularizacao
                  // (sempre ativa) para nao deixar o select vazio.
                  <option value="regularizacao">Regularização</option>
                ) : (
                  assuntosAtivos.map((a) => (
                    <option key={a.id} value={a.slug}>
                      {a.nome}
                    </option>
                  ))
                )}
              </select>
              <input
                type="text"
                value={numero}
                onChange={(e) => { setNumero(e.target.value); setErro(""); }}
                onKeyDown={(e) => e.key === "Enter" && validar()}
                placeholder={perfilNum.exemplo}
                className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                onClick={validar}
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] font-semibold px-6 py-2 rounded-lg text-sm transition-colors whitespace-nowrap">
                CADASTRAR
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-[var(--text-muted)]">{perfilNum.ajuda}</p>
              {erro && <p className="text-xs text-red-600 font-medium">{erro}</p>}
            </div>
          </section>

          {/* Grid de cards de módulos */}
          {carregandoAuth ? (
            <p className="text-center text-[var(--text-muted)] text-sm">Carregando…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {visiveis.map(({ chave, nome, descricao, Icone, rota, destaque }) => (
                <button
                  key={chave}
                  onClick={() => router.push(rota)}
                  className="group bg-[var(--surface)] rounded-lg border border-[var(--border)] p-6 text-left shadow-sm hover:shadow-md hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-[var(--bg-secondary)] group-hover:bg-[var(--border)] flex items-center justify-center mb-4 transition-colors">
                    <Icone className="text-[var(--accent)]" size={24} aria-hidden="true" />
                  </div>
                  <h2 className={`text-lg font-bold tracking-wide ${destaque ? "text-red-600" : "text-[var(--text-primary)]"}`}>{nome}</h2>
                  {descricao && <p className="text-sm text-[var(--text-muted)] mt-1 leading-snug">{descricao}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* RODAPÉ */}
      <footer className="px-6 md:px-10 py-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">by Fábio Parente — Prefeitura de Goiânia</p>
      </footer>
    </div>
  );
}
