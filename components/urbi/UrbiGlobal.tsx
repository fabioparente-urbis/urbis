"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import UrbiChat from "./UrbiChat";
import { montarRelatorioMotor } from "@/lib/urbi/motorProducao";
import { calcularSinaleiro, combinarComDicaRt, CORES_SINALEIRO, type EstadoSinaleiro } from "@/lib/urbi/sinaleiro";
import { executarIndeferimentoImovelDuplicado, type ConflitoImovel } from "@/lib/urbi/indeferimentoImovelDuplicado";
import type { Aviso } from "@/lib/bdi/vigia";
import { useAuditoria } from "@/hooks/useAuditoria";

/** "Dispensa esconde NAQUELA tela" — mesmo padrão de `urbi:aberto:${pathname}`, mas para o
 * card grande de condição bloqueante (pedido do Fábio, 08/09/2026). Só vale pra sessão/aba
 * atual; a próxima vez que o processo for aberto, se a condição continuar valendo, reaparece. */
function lerOverlayDispensadoSalvo(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(`urbi:bloqueioDispensado:${pathname}`) === "true"; } catch { return false; }
}

// Presença persistente por sessão do navegador (sessionStorage, não
// localStorage — não sobrevive entre sessões distintas nem entre
// abas/dispositivos), agora por TELA (pathname) — achado real (05/09/2026,
// arquitetura mestra do URBI): a chave era única pra sessão inteira, então
// dispensar o URBI numa tela deixava ele fechado em QUALQUER outra tela
// visitada depois, até reabrir manualmente. "Dispensa esconde NAQUELA
// tela" — outra tela nunca deveria herdar esse fechamento; retorno só
// pela Home ou Shift+U (ver efeito de reset abaixo, que fecha ao trocar
// de pathname). Só o estado visual (aberto/dispensado) persiste, e só pra
// sobreviver a um F5 na MESMA tela; conversa e dados de processo nunca são
// gravados aqui. Inicializador preguiçoso (não um efeito de restauração) —
// seguro contra mismatch de hidratação porque este componente só renderiza
// de fato depois que `usuario` chega via fetch client-side; a passagem de
// SSR/primeira pintura já é `null` independente deste valor, então não há
// divergência entre servidor e cliente a evitar.
function lerUrbiAbertoSalvo(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(`urbi:aberto:${pathname}`) === "true"; } catch { return false; }
}

export default function UrbiGlobal() {
  const [usuario, setUsuario] = useState<any>(null);
  const pathname = usePathname();
  const [urbiAberto, setUrbiAberto] = useState<boolean>(() => lerUrbiAbertoSalvo(pathname));
  const [assuntoId, setAssuntoId] = useState<string | null>(null);
  const [processoCodigo, setProcessoCodigo] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const isHome = pathname === "/";
  // Detecta troca REAL de tela (não a primeira renderização) — só nesse caso o dismiss/abertura
  // da tela anterior é descartado. `null` marca "ainda não vi a primeira tela".
  const pathnameAnteriorRef = useRef<string | null>(null);
  const recRef = useRef<any>(null);
  const urbiAbertoRef = useRef(false);
  const bufferRef = useRef("");
  const timerRef = useRef<any>(null);
  const micAtivoRef = useRef(false);

  // ── Rotina padrão de dicas do URBI ──────────────────────────────────
  // Quando algo no app tem uma dica factual pra dar (ex: histórico do RT
  // no LIP) e o URBI está fechado, ele não abre sozinho: aparece uma
  // bolha escurecida no canto INFERIOR ESQUERDO (o chat normal vive no
  // direito). Se o analista não clicar em 10s, a bolha some — mas a dica
  // fica guardada por processo e é entregue automaticamente na próxima
  // vez que o URBI for reativado naquele mesmo processo.
  const [peekAtivo, setPeekAtivo] = useState(false);
  const [dicaPeek, setDicaPeek] = useState<string | null>(null);
  const [mensagemInicial, setMensagemInicial] = useState<string | null>(null);
  /** Botões que acompanham `mensagemInicial` — hoje só "urbi:explicar" preenche isso (08/09/2026,
   *  tag de documento na Pilha com "Abrir no MDP"). */
  const [acoesIniciais, setAcoesIniciais] = useState<{ rotulo: string; href?: string }[] | undefined>(undefined);
  const dicasPendentesRef = useRef<Map<string, string[]>>(new Map());
  const peekTimerRef = useRef<any>(null);
  const processoIdRef = useRef<string | null>(null);

  // Foco devolvido ao elemento que abriu o URBI, quando existir (só o
  // botão da Home aciona abertura por clique; Shift+U e a bolha de dica
  // não têm um "elemento acionador" de foco a devolver).
  const homeButtonRef = useRef<HTMLButtonElement>(null);
  const origemAberturaRef = useRef<"home" | null>(null);

  // ── Sinal de cor do URBI (ex-"sinaleiro") ───────────────────────────
  // Fase 1 do plano Assessor Ativo revertida: não existe mais um widget separado — a cor do
  // aviso (vermelho/amarelo/verde, vencendo nessa ordem) vira o próprio avatar do URBI, aqui e
  // em qualquer tela. Mesma fonte que já existia: /api/bdi/vigia + /api/urbi/dossie, SQL puro,
  // sem IA nova. "Processo limpo fica sem cor" continua o portão.
  const [estadoSinal, setEstadoSinal] = useState<EstadoSinaleiro | null>(null);
  const [dicaRtSinal, setDicaRtSinal] = useState<string | null>(null);
  const estadoFinal = useMemo(
    () => (estadoSinal ? combinarComDicaRt(estadoSinal, dicaRtSinal) : null),
    [estadoSinal, dicaRtSinal]
  );
  const { registrar } = useAuditoria();
  const [overlayDispensado, setOverlayDispensado] = useState<boolean>(() => lerOverlayDispensadoSalvo(pathname));
  const overlayLogadoRef = useRef<string | null>(null); // processoCodigo já logado como DETECTADA nesta tela

  useEffect(() => { urbiAbertoRef.current = urbiAberto; }, [urbiAberto]);

  useEffect(() => {
    if (urbiAberto) return;
    if (origemAberturaRef.current === "home") {
      origemAberturaRef.current = null;
      requestAnimationFrame(() => homeButtonRef.current?.focus());
    }
  }, [urbiAberto]);

  useEffect(() => {
    try { sessionStorage.setItem(`urbi:aberto:${pathname}`, urbiAberto ? "true" : "false"); } catch {}
  }, [urbiAberto, pathname]);

  /**
   * O URBI ABERTO ACOMPANHA a navegação — corrigido em 08/09/2026: "quando chamo o URBI na home,
   * e mudo de página o URBI tá indo embora" (Fábio). Chamar o URBI e vê-lo sumir ao abrir um
   * processo é o oposto do que ele existe pra fazer: o analista chama justamente pra levar a
   * conversa junto pro processo.
   *
   * O `setUrbiAberto(false)` que ficava aqui vinha da correção de 05/09 ("dispensa esconde NAQUELA
   * tela"): a chave do sessionStorage era ÚNICA pra sessão, então dispensar numa tela deixava o
   * URBI fechado em qualquer outra visitada depois. Aquela causa já foi resolvida na raiz — a
   * chave passou a ser `urbi:aberto:${pathname}`, por tela. Forçar o fechamento aqui virou só
   * efeito colateral, e derrubava também quem tinha sido aberto de propósito.
   *
   * O que continua valendo por tela é a dispensa do CARD GRANDE de condição bloqueante: essa sim
   * é relida a cada troca, senão dispensar o aviso num processo o esconderia no seguinte.
   */
  useEffect(() => {
    if (pathnameAnteriorRef.current !== null && pathnameAnteriorRef.current !== pathname) {
      setOverlayDispensado(lerOverlayDispensadoSalvo(pathname));
    }
    pathnameAnteriorRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    try { sessionStorage.setItem(`urbi:bloqueioDispensado:${pathname}`, overlayDispensado ? "true" : "false"); } catch {}
  }, [overlayDispensado, pathname]);

  /**
   * "urbi:explicar" — qualquer tela pede ao URBI que fale sobre algo, e ele ABRE FALANDO
   * (08/09/2026, pedido do Fábio: clicar na tag do processo na Pilha e o URBI explicar).
   *
   * Diferente de "urbi:dica", que é sinal discreto: dica espera o analista notar uma bolha no
   * canto; aqui ele CLICOU pedindo explicação, então esperar seria só atraso. Com o chat já
   * aberto, entrega na conversa em vez de reabrir (mesmo caminho da dica).
   */
  useEffect(() => {
    function onExplicar(e: Event) {
      const { mensagem, acoes } = (e as CustomEvent).detail || {};
      if (!mensagem) return;
      // Aqui o analista PEDIU (clicou na tag), então não é intervenção espontânea — não abre
      // pedindo veredito. Veredito é pra quando o URBI se mete sozinho; perguntar "faz sentido?"
      // pra quem acabou de perguntar seria devolver a pergunta.
      if (urbiAbertoRef.current) {
        window.dispatchEvent(new CustomEvent("urbi:entregar-dica", { detail: { mensagem, acoes } }));
        return;
      }
      setAcoesIniciais(acoes);
      setMensagemInicial(mensagem);
      setUrbiAberto(true);
    }
    window.addEventListener("urbi:explicar", onExplicar);
    return () => window.removeEventListener("urbi:explicar", onExplicar);
  }, []);

  /**
   * "urbi:intervir" — qualquer tela pede que o URBI INTERVENHA (fale por conta própria sobre algo
   * que acabou de acontecer), e a intervenção nasce com o par concordar/discordar, como toda
   * intervenção desde 08/09/2026. Diferente de "urbi:explicar", que é resposta a um clique do
   * analista e por isso não pede veredito.
   */
  useEffect(() => {
    function onIntervir(e: Event) {
      const detalhe = (e as CustomEvent).detail || {};
      if (!detalhe?.mensagem || !detalhe?.chave) return;
      window.dispatchEvent(new CustomEvent("urbi:entregar-intervencao", { detail: detalhe }));
      if (!urbiAbertoRef.current) setUrbiAberto(true);
    }
    window.addEventListener("urbi:intervir", onIntervir);
    return () => window.removeEventListener("urbi:intervir", onIntervir);
  }, []);

  // Log "detectada" uma vez por processo/tela — nunca a cada re-render/poll do sinal.
  useEffect(() => {
    if (!estadoFinal?.bloqueante || !processoCodigo) return;
    if (overlayLogadoRef.current === processoCodigo) return;
    overlayLogadoRef.current = processoCodigo;
    registrar({
      modulo: "URBI",
      acao: "URBI_CONDICAO_BLOQUEANTE_DETECTADA",
      processo_codigo: processoCodigo,
      origem: "SISTEMA",
      detalhe: { itens: estadoFinal.itens.map(i => ({ titulo: i.titulo, fonte: i.fonte })) },
    });
  }, [estadoFinal, processoCodigo, registrar]);

  useEffect(() => {
    const match = pathname.match(/\/(processo|analise-regularizacao|analise-aceite-sei|analise-aprovacao-projeto)\/([^/?]+)/);
    const codigo = match ? decodeURIComponent(match[2]) : null;
    processoIdRef.current = codigo;
    // Mesmo valor do ref, mas em state — é o que vira prop de UrbiChat (ref não
    // dispara nova leitura de prop; só usado aqui para o chat saber de qual
    // processo pedir o dossiê factual, ver app/api/urbi/dossie).
    setProcessoCodigo(codigo);
  }, [pathname]);

  useEffect(() => {
    function onDica(e: Event) {
      const { processoId, mensagem } = (e as CustomEvent).detail || {};
      if (!processoId || !mensagem) return;
      if (processoId === processoIdRef.current) setDicaRtSinal(mensagem);
      if (urbiAbertoRef.current) {
        window.dispatchEvent(new CustomEvent("urbi:entregar-dica", { detail: { mensagem } }));
        return;
      }
      const fila = dicasPendentesRef.current.get(processoId) ?? [];
      fila.push(mensagem);
      dicasPendentesRef.current.set(processoId, fila);
      setDicaPeek(mensagem);
      setPeekAtivo(true);
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
      peekTimerRef.current = setTimeout(() => setPeekAtivo(false), 10000);
    }
    window.addEventListener("urbi:dica", onDica);
    return () => { window.removeEventListener("urbi:dica", onDica); if (peekTimerRef.current) clearTimeout(peekTimerRef.current); };
  }, []);

  // Clique no avatar do URBI já colorido: abre o chat direto, contextualizado com os motivos da
  // cor (nunca um painel de lista à parte) — o URBI intervém na análise em vez de só apontar.
  function abrirUrbiPeloAvatar() {
    const estado = estadoFinal;
    if (estado?.cor && estado.itens.length > 0) {
      const texto = `Olha o que encontrei neste processo:\n\n${estado.itens
        .map(item => `• ${item.titulo} — ${item.detalhe}`)
        .join("\n")}`;
      setMensagemInicial(texto);
      setDicaRtSinal(null);
    }
    origemAberturaRef.current = isHome ? "home" : null;
    iniciarEscuta();
    setUrbiAberto(true);
  }

  // Card grande dispensado sem ter sido chamado (clique fora, não no card) — some só nesta
  // tela/sessão, o avatar pequeno de canto continua vermelho, e a condição reaparece grande da
  // próxima vez que o processo for reaberto, se ainda valer.
  function dispensarOverlayBloqueio() {
    setOverlayDispensado(true);
    registrar({
      modulo: "URBI",
      acao: "URBI_CONDICAO_BLOQUEANTE_DISPENSADA",
      processo_codigo: processoCodigo ?? undefined,
      origem: "MANUAL",
      detalhe: { itens: estadoFinal?.itens.map(i => ({ titulo: i.titulo })) ?? [] },
    });
  }

  /**
   * "Indeferir" no card do imóvel duplicado (pedido do Fábio, 10/09/2026) — o clique É a
   * autorização (CLAUDE.md: nunca emitir sem o analista autorizar; aqui ele autorizou). Roda o
   * mesmo mecanismo do botão manual "Baixar Indeferimento" das telas do MAC, de qualquer tela
   * onde o card aparecer (LIP incluído).
   */
  const [indeferindoImovel, setIndeferindoImovel] = useState(false);
  const [erroIndeferirImovel, setErroIndeferirImovel] = useState<string | null>(null);

  async function indeferirPorImovelDuplicado(conflito: ConflitoImovel) {
    if (!processoCodigo || indeferindoImovel) return;
    setIndeferindoImovel(true);
    setErroIndeferirImovel(null);
    const resultado = await executarIndeferimentoImovelDuplicado(processoCodigo, conflito);
    setIndeferindoImovel(false);
    if (resultado.ok) {
      registrar({
        modulo: "URBI",
        acao: "URBI_INDEFERIMENTO_IMOVEL_DUPLICADO_EXECUTADO",
        processo_codigo: processoCodigo,
        origem: "MANUAL",
        detalhe: { conflito },
      });
      setOverlayDispensado(true);
      window.location.reload();
      return;
    }
    setErroIndeferirImovel(resultado.erro);
    registrar({
      modulo: "URBI",
      acao: "URBI_INDEFERIMENTO_IMOVEL_DUPLICADO_FALHOU",
      processo_codigo: processoCodigo,
      origem: "MANUAL",
      detalhe: { conflito, erro: resultado.erro },
    });
  }

  function ativarComDica() {
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    setPeekAtivo(false);
    const codigo = processoIdRef.current;
    const fila = codigo ? (dicasPendentesRef.current.get(codigo) ?? []) : [];
    const proxima = fila.shift() ?? dicaPeek ?? null;
    if (codigo) dicasPendentesRef.current.set(codigo, fila);
    setMensagemInicial(proxima);
    setUrbiAberto(true);
  }

  // Entrega dicas pendentes do processo atual sempre que o URBI é
  // reaberto por qualquer caminho (não só pelo clique na bolha).
  useEffect(() => {
    if (!urbiAberto) return;
    const codigo = processoIdRef.current;
    if (!codigo) return;
    const fila = dicasPendentesRef.current.get(codigo);
    if (fila && fila.length > 0) {
      const proxima = fila.shift();
      setMensagemInicial(proxima ?? null);
    }
  }, [urbiAberto]);

  useEffect(() => {
    // Achado real (piloto humano controlado, 05/09/2026): este regex faltava
    // "analise-aceite-sei" e "analise-aprovacao-projeto" — nas telas de MAC do Slot 2 e do
    // Slot 5, assuntoId nunca era resolvido (ficava null), mesmo processoCodigo (regex abaixo,
    // idêntico ao de derivação de processoCodigo) estando correto. Corrigido pra cobrir os
    // mesmos 4 padrões de rota.
    const match = pathname.match(/\/(processo|analise-regularizacao|analise-aceite-sei|analise-aprovacao-projeto)\/([^/?]+)/);
    const codigo = match ? decodeURIComponent(match[2]) : null;
    if (!codigo) { setAssuntoId(null); return; }
    fetch(`/api/processo/carregar?id=${encodeURIComponent(codigo)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.ok) setAssuntoId(j.data?.assunto_id ?? null); })
      .catch(() => {});
  }, [pathname]);

  // Sinal de cor: recalcula ao trocar de processo. Fora de uma tela de processo (Home
  // inclusive), não há cor — o avatar volta ao azul padrão.
  useEffect(() => {
    setDicaRtSinal(null);
    if (!processoCodigo) { setEstadoSinal(null); return; }
    let vivo = true;
    setEstadoSinal(null);
    const codigo = processoCodigo;
    Promise.all([
      fetch(`/api/bdi/vigia?codigo=${encodeURIComponent(codigo)}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/urbi/dossie?codigo=${encodeURIComponent(codigo)}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([vigiaResp, dossieResp]) => {
      if (!vivo) return;
      const avisos: Aviso[] = vigiaResp?.ok ? (vigiaResp.avisos ?? []) : [];
      const acoes = dossieResp?.ok ? montarRelatorioMotor(dossieResp.data).acoes : [];
      setEstadoSinal(calcularSinaleiro(avisos, acoes));
    });
    return () => { vivo = false; };
  }, [processoCodigo]);

  const buscarUsuario = () => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.data?.nome) setUsuario(data.data); })
      .catch(() => {});
  };

  const pararEscuta = useCallback(() => {
    micAtivoRef.current = false;
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} recRef.current = null; }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    bufferRef.current = "";
  }, []);

  const iniciarEscuta = useCallback(() => {
    if (!isHome || urbiAbertoRef.current) return;
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recRef.current) { try { recRef.current.stop(); } catch (_) {} }

    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;
    bufferRef.current = "";

    rec.onresult = (e: any) => {
      let texto = "";
      for (let i = 0; i < e.results.length; i++) {
        texto += e.results[i][0].transcript;
      }
      bufferRef.current = texto.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const b = bufferRef.current;
      const temUrbi = b.includes("urbi") || b.includes("urby") || b.includes("orbi");
      if (temUrbi && !urbiAbertoRef.current) {
        setUrbiAberto(true);
        pararEscuta();
      }
      if (b.includes("ligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_som" }));
      if (b.includes("desligar som")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_som" }));
      if (b.includes("ligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "ligar_bip" }));
      if (b.includes("desligar bip")) window.dispatchEvent(new CustomEvent("urbi:cmd", { detail: "desligar_bip" }));
    };

    rec.onerror = () => {};
    rec.onend = () => {
      if (!micAtivoRef.current) return;
      setTimeout(() => iniciarEscuta(), 300);
    };

    micAtivoRef.current = true;
    try { rec.start(); recRef.current = rec; } catch (_) {}

    // Para após 60 segundos
    timerRef.current = setTimeout(() => {
      pararEscuta();
    }, 60000);
  }, [isHome, pararEscuta]);

  useEffect(() => {
    buscarUsuario();
    window.addEventListener("urbi:refresh", buscarUsuario);
    const fecharUrbi = () => setUrbiAberto(false);
    window.addEventListener("urbi:fechar", fecharUrbi);
    return () => {
      window.removeEventListener("urbi:refresh", buscarUsuario);
      window.removeEventListener("urbi:fechar", fecharUrbi);
    };
  }, []);

  // O layout raiz não remonta entre navegações (App Router só troca
  // {children}), então login/logout não desmonta o URBI sozinho. Sem isso,
  // ao expirar a sessão (useAutoLogout) ou clicar em "Sair", o widget
  // continua vivo com o usuário e a conversa antigos por cima da tela de
  // login.
  useEffect(() => {
    if (pathname?.startsWith("/login") || pathname?.startsWith("/redefinir-senha")) {
      setUsuario(null);
      setUrbiAberto(false);
    }
  }, [pathname]);

  // Microfone só liga com clique — nunca automático
  useEffect(() => {
    return () => pararEscuta();
  }, []);

  // Atalho global Shift+U: abre ou dispensa o URBI em qualquer tela
  // autenticada. Fora da Home não existe botão visível — este é o único
  // jeito de chamar o URBI ali. Nunca dispara com foco em campo de texto,
  // textarea, select ou elemento editável (inclui o próprio input do chat).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.toLowerCase() !== "u") return;
      if (!usuario?.nome || !usuario?.urbi_ativo) return;
      const alvo = document.activeElement as HTMLElement | null;
      const tag = alvo?.tagName;
      const ehEditavel = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!alvo?.isContentEditable;
      if (ehEditavel) return;
      e.preventDefault();
      setUrbiAberto(v => !v);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [usuario]);

  // Telemetria NEUTRA de presença no URBIS (rodada isolada, 05/09/2026) — único significado
  // permitido é "houve interação recente", nunca produtividade/ocioso/ranking. Nada de heartbeat
  // por minuto: um único setTimeout de 30 min, rearmado a cada interação genuína (clique, troca
  // de tela, aba voltando a ficar visível) — só dispara rede quando o ESTADO muda (virou inativo,
  // ou voltou a interagir), nunca a cada clique. Fechar a aba/perder conexão nunca vira conclusão
  // nenhuma aqui: só deixa de haver novo evento. Dedupe contra duplicidade mora no servidor
  // (lib/urbi/presenca.ts), este efeito só decide QUANDO tentar enviar.
  const presencaInativoRef = useRef(false);
  const presencaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presencaSessaoRef = useRef<string>("");
  const presencaRegistrarInteracaoRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!usuario?.nome) return;
    if (!presencaSessaoRef.current) {
      presencaSessaoRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID() : String(Date.now());
    }
    const TRINTA_MIN = 30 * 60_000;
    const enviar = (tipo: "sem_interacao_urbis" | "interacao_retomada") => {
      fetch("/api/urbi/presenca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, sessao_efemera: presencaSessaoRef.current }),
      }).catch(() => {});
    };
    const rearmar = () => {
      if (presencaTimeoutRef.current) clearTimeout(presencaTimeoutRef.current);
      presencaTimeoutRef.current = setTimeout(() => {
        presencaInativoRef.current = true;
        enviar("sem_interacao_urbis");
      }, TRINTA_MIN);
    };
    const registrarInteracao = () => {
      if (presencaInativoRef.current) {
        presencaInativoRef.current = false;
        enviar("interacao_retomada");
      }
      rearmar();
    };
    presencaRegistrarInteracaoRef.current = registrarInteracao;
    const onVisibility = () => { if (document.visibilityState === "visible") registrarInteracao(); };
    window.addEventListener("click", registrarInteracao, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    rearmar();
    return () => {
      window.removeEventListener("click", registrarInteracao);
      document.removeEventListener("visibilitychange", onVisibility);
      if (presencaTimeoutRef.current) clearTimeout(presencaTimeoutRef.current);
    };
  }, [usuario]);

  // Troca de tela também conta como interação (navegação é um dos eventos genéricos previstos) —
  // reaproveita a MESMA função (envia só se realmente estava marcado inativo, e rearma o
  // temporizador de 30 min) em vez de duplicar a lógica de envio/dedupe.
  useEffect(() => {
    if (!usuario?.nome) return;
    presencaRegistrarInteracaoRef.current();
  }, [pathname, usuario]);

  // Radar silencioso incremental (Camada 1) — ACHADO REAL (05/09/2026, rodada de
  // independência de sessão): até aqui, os ticks disparavam DAQUI (client-side), exigindo
  // alguém com sessão válida numa aba aberta — sem isso o Radar simplesmente não rodava. Agora
  // roda por `cron.schedule` (pg_cron + pg_net, dentro do próprio Postgres) chamando
  // `/api/urbi/radar/job` com conta técnica e segredo compartilhado — nunca sessão humana, nunca
  // este componente. `UrbiGlobal` só CONSOME o estado (via /api/urbi/radar/status, já existente)
  // — nunca mais é dependência do Radar. Ver lib/urbi/radarJob.ts.

  // "Atendimento ativo" (Fase 2) — enquanto o URBI está aberto DENTRO de um processo, avisa o
  // servidor (lease técnico, renovado a cada 60s) pra o job do Radar evitar reprocessar ESSE
  // processo especificamente (nunca pausa o Radar inteiro). Se a aba fechar/travar sem avisar, o
  // lease expira sozinho (lib/urbi/atendimento.ts) — nunca fica pausado pra sempre.
  useEffect(() => {
    if (!usuario?.nome || !urbiAberto || !processoCodigo) return;
    const codigo = processoCodigo;
    const enviar = (metodo: "POST" | "DELETE") => {
      fetch("/api/urbi/atendimento", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processo_codigo: codigo }),
      }).catch(() => {});
    };
    enviar("POST");
    const id = setInterval(() => enviar("POST"), 60_000);
    return () => { clearInterval(id); enviar("DELETE"); };
  }, [usuario, urbiAberto, processoCodigo]);

  // Detecta modal crítico aberto (convenção do app: overlay `fixed inset-0`
  // + `z-50` — usada por todos os modais do processo/MAC) para recolher o
  // URBI enquanto ele estiver visível, em vez de cobrir o modal.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function checar() {
      const aberto = !!document.querySelector(".fixed.inset-0.z-50");
      setModalAberto(prev => (prev === aberto ? prev : aberto));
    }
    checar();
    const obs = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; checar(); }, 32);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (timer) clearTimeout(timer); };
  }, []);

  if (!usuario?.nome) return null;
  if (!usuario?.urbi_ativo) return null;

  return (
    <>
      <style>{`
        .urbi-focavel:focus-visible {
          outline: 2px solid #2563eb;
          outline-offset: 2px;
          border-radius: 6px;
        }
        @keyframes urbiPulsoBloqueio {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.55); }
          50% { box-shadow: 0 0 0 18px rgba(220,38,38,0); }
        }
      `}</style>
      {!urbiAberto && !modalAberto && isHome && (() => {
        const tamanho = 130;
        const cor = estadoFinal?.cor ?? null;
        const c = cor ? CORES_SINALEIRO[cor] : null;
        const brilho = c ? `0 4px 26px ${c.borda}aa` : "0 4px 24px #3b82f688";
        return (
          <div style={{
            position: "fixed", bottom: 80, right: 24, zIndex: 1000,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <button
              ref={homeButtonRef}
              className="urbi-focavel"
              onClick={abrirUrbiPeloAvatar}
              aria-label={
                c
                  ? `Abrir o URBI — ${c.rotulo}, ${estadoFinal!.itens.length} ${estadoFinal!.itens.length > 1 ? "itens" : "item"}. Atalho de teclado: Shift + U`
                  : "Abrir o URBI. Atalho de teclado: Shift + U"
              }
              title={c ? `URBI — ${c.rotulo} (Shift + U)` : "Abrir o URBI (Shift + U)"}
              style={{ position: "relative", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
            >
              <div style={{ position: "relative", width: tamanho, height: tamanho, borderRadius: "50%", overflow: "hidden", boxShadow: brilho }}>
                <img src="/urbi/urbi-botao.jpg" alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {/* Filtro de cor: tinge a própria foto (mix-blend-mode preserva o brilho/textura
                    em vez de aplicar hue-rotate, que distorce de forma imprevisível). É o URBI
                    fazendo o papel do antigo sinaleiro — não um widget à parte. */}
                {c && (
                  <div aria-hidden="true" style={{
                    position: "absolute", inset: 0, background: c.borda,
                    mixBlendMode: "color", opacity: 0.8,
                  }} />
                )}
              </div>
              {c && (
                <span aria-hidden="true" style={{
                  position: "absolute", top: -4, right: -4,
                  background: c.borda, color: "#fff", fontSize: 12, fontWeight: 700,
                  borderRadius: 999, minWidth: 22, height: 22, lineHeight: "22px",
                  textAlign: "center", padding: "0 5px", border: "2px solid #fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                }}>{c.forma} {estadoFinal!.itens.length}</span>
              )}
            </button>
            <span aria-hidden="true" style={{
              fontSize: 11, fontWeight: 600, color: "#334155", background: "#ffffffdd",
              padding: "2px 9px", borderRadius: 999, boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
              letterSpacing: 0.3,
            }}>Shift + U</span>
          </div>
        );
      })()}
      {/* Intervenção proativa: aparece sozinha, grande, no meio da tela — exceção deliberada à
          regra "URBI nunca fala sem ser chamado", só para condição que impede a análise (pedido
          do Fábio, 08/09/2026). Clicar no card abre o chat contextualizado; clicar FORA (no
          fundo) dispensa só o card grande — o avatar pequeno de canto continua vermelho. */}
      {!urbiAberto && !modalAberto && estadoFinal?.bloqueante && !overlayDispensado && (
        <div
          onClick={dispensarOverlayBloqueio}
          style={{
            position: "fixed", inset: 0, zIndex: 1100,
            background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => { e.stopPropagation(); abrirUrbiPeloAvatar(); }}
            role="button"
            tabIndex={0}
            className="urbi-focavel"
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); abrirUrbiPeloAvatar(); }
            }}
            aria-label={`URBI precisa te avisar antes de você continuar: ${estadoFinal.itens[0]?.titulo ?? "condição encontrada"}. Clique para abrir a conversa.`}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
              cursor: "pointer", maxWidth: 380, padding: "28px 32px",
              background: "var(--bg-card, #fff)", borderRadius: 20,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{
              position: "relative", width: 150, height: 190,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "urbiPulsoBloqueio 1.6s infinite", borderRadius: "50%",
            }}>
              {/* Boneco de verdade (não a fotinho do botão) — pedido do Fábio, 08/09/2026: "isso
                  é o botão... o URBI é um boneco", depois de ver a intervenção usando a mesma
                  imagem redonda do avatar de canto em vez do personagem ilustrado. */}
              <img src="/urbi/poses/urbi-atencao.png" alt=""
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block",
                  filter: "drop-shadow(0 8px 18px rgba(220,38,38,0.45))" }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#991b1b", textAlign: "center" }}>
              Antes de continuar analisando este processo…
            </div>
            <div style={{ fontSize: 13, color: "var(--text-primary, #334155)", textAlign: "center", lineHeight: 1.5 }}>
              {estadoFinal.itens[0]?.titulo}
              {estadoFinal.itens.length > 1 ? ` (+ ${estadoFinal.itens.length - 1} outro${estadoFinal.itens.length > 2 ? "s" : ""})` : ""}
            </div>
            {(() => {
              const itemImovel = estadoFinal.itens.find(i => i.id === "cond_imovel_duplicado" && i.dados);
              if (!itemImovel) return null;
              const conflito = itemImovel.dados as ConflitoImovel;
              return (
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                  {erroIndeferirImovel && (
                    <div style={{ fontSize: 12, color: "#dc2626", textAlign: "center" }}>{erroIndeferirImovel}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, width: "100%" }}>
                    <button
                      onClick={() => void indeferirPorImovelDuplicado(conflito)}
                      disabled={indeferindoImovel}
                      style={{
                        flex: 1, padding: "10px 12px", borderRadius: 10, border: "none",
                        background: indeferindoImovel ? "#fca5a5" : "#dc2626", color: "#fff",
                        fontWeight: 700, fontSize: 13, cursor: indeferindoImovel ? "default" : "pointer",
                      }}
                    >
                      {indeferindoImovel ? "Indeferindo…" : "❌ Indeferir"}
                    </button>
                    <button
                      onClick={dispensarOverlayBloqueio}
                      disabled={indeferindoImovel}
                      style={{
                        flex: 1, padding: "10px 12px", borderRadius: 10,
                        border: "1px solid var(--border, #cbd5e1)", background: "transparent",
                        color: "var(--text-primary, #334155)", fontWeight: 600, fontSize: 13,
                        cursor: indeferindoImovel ? "default" : "pointer",
                      }}
                    >
                      Analisar processo
                    </button>
                  </div>
                </div>
              );
            })()}
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Clique para o URBI explicar · clique fora para dispensar</div>
          </div>
        </div>
      )}
      {!urbiAberto && peekAtivo && dicaPeek && (
        <div
          onClick={ativarComDica}
          role="button"
          tabIndex={0}
          className="urbi-focavel"
          aria-label="URBI tem uma dica sobre este processo"
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ativarComDica(); }
          }}
          style={{
            position: "fixed", bottom: 24, left: 24, zIndex: 1000,
            display: "flex", alignItems: "flex-end", gap: 8,
            cursor: "pointer", userSelect: "none",
          }}
        >
          <img
            src="/urbi/poses/urbi-atencao.png"
            alt=""
            style={{
              width: 56, height: 72, objectFit: "contain",
              filter: "brightness(0.55) saturate(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.45))",
            }}
          />
          <div style={{
            background: "#0f172a", color: "#e2e8f0", borderRadius: 10,
            padding: "8px 12px", fontSize: 12, lineHeight: 1.4, maxWidth: 220,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}>
            {dicaPeek.length > 90 ? `${dicaPeek.slice(0, 87)}…` : dicaPeek}
          </div>
        </div>
      )}
      <UrbiChat
        usuario={usuario}
        aberto={urbiAberto}
        setAberto={setUrbiAberto}
        modo={isHome ? "center" : "corner"}
        assuntoId={assuntoId}
        processoCodigo={processoCodigo}
        urbiVoz={usuario?.urbi_voz ?? false}
        modalAberto={modalAberto}
        mensagemInicial={mensagemInicial}
        acoesIniciais={acoesIniciais}
        onMensagemInicialConsumida={() => { setMensagemInicial(null); setAcoesIniciais(undefined); }}
      />
    </>
  );
}
