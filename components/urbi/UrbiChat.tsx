"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWebSpeech } from "./useWebSpeech";
import intencoesJson from "./urbi-intencoes.json";
import {
  interpretar,
  pareceComando,
  AJUDA_COMANDOS,
  aplicarFiltrosLocais,
  filtrosParaQuery,
  type ComandoNavegacao,
  type FiltrosPilha,
} from "@/lib/urbi/navegacao";

type IntencaoAcao =
  | { tipo: "navegar"; rota: string }
  | { tipo: "fechar" }
  | { tipo: "mudo"; valor: boolean }
  | { tipo: "pose"; valor: string }
  | { tipo: "parar_fala" };

type Intencao = {
  id: string;
  frases: string[];
  acao: IntencaoAcao;
  resposta?: string;
};

const INTENCOES: Intencao[] = (intencoesJson as { comandos: Intencao[] }).comandos;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function casarIntencao(texto: string): Intencao | null {
  const alvo = normalizar(texto);
  if (!alvo) return null;
  for (const intencao of INTENCOES) {
    for (const frase of intencao.frases) {
      const fraseNorm = normalizar(frase);
      if (alvo === fraseNorm || alvo.includes(fraseNorm)) {
        return intencao;
      }
    }
  }
  return null;
}

const POSE_MAP: Record<string, string> = {
  sucesso:          "/urbi/poses/urbi-sucesso.png",
  "tudo-ok":        "/urbi/poses/urbi-tudo-ok.png",
  oops:             "/urbi/poses/urbi-oops.png",
  "oh-nao":         "/urbi/poses/urbi-oh-nao.png",
  atencao:          "/urbi/poses/urbi-atencao.png",
  "algo-errado":    "/urbi/poses/urbi-algo-errado.png",
  analisando:       "/urbi/poses/urbi-analisando.png",
  planejando:       "/urbi/poses/urbi-planejando.png",
  "dados-errados":  "/urbi/poses/urbi-dados-errados.png",
  bravo:            "/urbi/poses/urbi-bravo.png",
  euforia:          "/urbi/poses/urbi-euforia.png",
  corrigindo:       "/urbi/poses/urbi-corrigindo.png",
  medindo:          "/urbi/poses/urbi-medindo.png",
  manutencao:       "/urbi/poses/urbi-manutencao.png",
  pressao:          "/urbi/poses/urbi-pressao.png",
  checklist:        "/urbi/poses/urbi-checklist.png",
  reprovado:        "/urbi/poses/urbi-reprovado.png",
  bip:              "/urbi/poses/urbi-bip.png",
  falando:          "/urbi/poses/urbi-falando.png",
  idle:             "/urbi/poses/urbi-idle.png",
};

function selectPose(tipo: "pensando"|"positivo"|"negativo"|"atencao"|"critico"|"idle"|"bip"|"checklist"|"falando"|"pressao"|"euforia", atual?: string): string {
  const map: Record<string, string[]> = {
    pensando:  ["analisando", "planejando", "medindo", "manutencao"],
    positivo:  ["sucesso", "tudo-ok", "euforia"],
    negativo:  ["oops", "algo-errado", "reprovado"],
    atencao:   ["atencao", "oh-nao", "pressao"],
    critico:   ["bravo", "dados-errados", "corrigindo"],
    idle:      ["idle", "sucesso", "tudo-ok"],
    bip:       ["bip", "medindo", "analisando"],
    checklist: ["checklist", "planejando", "analisando"],
    falando:   ["falando", "tudo-ok", "sucesso"],
    pressao:   ["pressao", "atencao", "oh-nao"],
    euforia:   ["euforia", "sucesso", "tudo-ok"],
  };
  const ids = map[tipo] ?? map["positivo"];
  const opcoes = ids.filter(id => id !== atual);
  return opcoes.length > 0 ? opcoes[Math.floor(Math.random() * opcoes.length)] : ids[0];
}

function detectTipo(texto: string): "positivo"|"negativo"|"atencao"|"critico"|"bip"|"checklist"|"pressao"|"euforia" {
  const t = texto.toLowerCase();
  if (t.includes("parabéns") || t.includes("excelente") || t.includes("rápido") || t.includes("bateu a meta")) return "euforia";
  if (t.includes("lei") || t.includes("artigo") || t.includes("lc ") || t.includes("nbr") || t.includes("plano diretor")) return "bip";
  if (t.includes("checklist") || t.includes("mac") || t.includes("item")) return "checklist";
  if (t.includes("prazo") || t.includes("urgente") || t.includes("atrasado")) return "pressao";
  if (t.includes("erro crítico") || t.includes("inválido") || t.includes("reprovado")) return "critico";
  if (t.includes("atenção") || t.includes("pendência") || t.includes("verificar")) return "atencao";
  if (t.includes("erro") || t.includes("não encontrado") || t.includes("falhou")) return "negativo";
  return "positivo";
}

// Como o comando chegou até o URBI — espelha a coluna `origem` de
// urbi_comandos_voz (ver a migration 2026_09_02_urbi_comandos_voz.sql).
type OrigemComando = "webspeech" | "whisper" | "texto";

type Msg = { role: "user"|"urbi"; texto: string };
type GeminiMsg = { role: string; parts: { text: string }[] };
type Props = {
  usuario: { nome: string; perfil: string; id?: string; urbi_mudo?: boolean; urbi_bip?: boolean; urbi_modo_audio?: "nenhum" | "navegador" };
  aberto: boolean;
  setAberto: (v: boolean) => void;
  modo?: "center" | "corner";
  assuntoId?: string | null;
  // Código do processo da rota atual (ver UrbiGlobal) — quando presente, o chat pede o dossiê
  // factual do processo (app/api/urbi/dossie) e passa a responder como Co-Analista: só leitura,
  // detecção, explicação e sugestão, nunca decisão/emissão/pontuação (ver system prompt da rota).
  processoCodigo?: string | null;
  urbiVoz?: boolean;
  // Um modal crítico do processo está aberto — recolhe o URBI para um
  // ícone discreto em vez de cobrir o modal. Só se aplica no modo "corner".
  modalAberto?: boolean;
  // Rotina padrão de dicas: quando o URBI é aberto já carregando uma
  // mensagem pronta (dica pendente de um processo), pula a saudação via
  // IA e mostra essa mensagem direto. Consumida uma vez e limpa pelo pai.
  mensagemInicial?: string | null;
  onMensagemInicialConsumida?: () => void;
};

const DEFAULT_CORNER = { bottom: 24, right: 24 };

// Inicializador preguiçoso do useState (não um efeito de restauração) —
// seguro contra mismatch de hidratação pelo mesmo motivo do UrbiGlobal:
// este componente só renderiza de fato (fase !== "fora") depois de um
// efeito client-side; a primeira pintura já é `null` independente deste
// valor.
function lerCornerPosSalvo(): { bottom: number; right: number } {
  if (typeof window === "undefined") return DEFAULT_CORNER;
  try {
    const salvo = sessionStorage.getItem("urbi:cornerPos");
    if (salvo) {
      const pos = JSON.parse(salvo);
      if (typeof pos?.bottom === "number" && typeof pos?.right === "number") return pos;
    }
  } catch {}
  return DEFAULT_CORNER;
}

export default function UrbiChat({ usuario, aberto: abertoProp, setAberto, modo = "center", assuntoId = null, processoCodigo = null, urbiVoz = false, modalAberto = false, mensagemInicial = null, onMensagemInicialConsumida }: Props) {
  const router = useRouter();
  // Permissão de áudio: decidida só pelo administrador (urbi_modo_audio) pra
  // qualquer usuário, ele mesmo incluído — o Administrador concede ou remove
  // essa permissão, mas não é obrigado a ter voz, e não tem tratamento
  // especial aqui. Opt-in — "nenhum" é o padrão do banco pra todo mundo,
  // então ausente/indefinido conta como BLOQUEADO, não permitido (a voz só
  // existe quando o admin escolhe "navegador" explicitamente pra aquela
  // pessoa — único modo de voz que existe (ElevenLabs descartado em
  // 02/09/2026, custo por caractere imprevisível). Bloqueado significa: o
  // botão de som some da tela e nenhum caminho (comando falado, texto
  // digitado, evento global) consegue religar. Ver
  // supabase/migrations/2026_09_01_urbi_modo_audio.sql.
  const permiteAudio = usuario?.urbi_modo_audio === "navegador";
  const [fase, setFase] = useState<"fora"|"entrando"|"idle"|"saindo">("fora");
  const [poseId, setPoseId] = useState("sucesso");
  const [input, setInput] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [poseOpacity, setPoseOpacity] = useState(1);
  const [videoAtivo, setVideoAtivo] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [overlayVisivel, setOverlayVisivel] = useState(false);
  const [balaoVisivel, setBalaoVisivel] = useState(false);
  // O botão BIP é o seletor real e explícito de modo — ligado: BIP /
  // Especialista em Legislação; desligado: Assistente de análise. Cada modo
  // mantém sua própria conversa (mensagens exibidas + histórico enviado ao
  // modelo), isoladas uma da outra — nunca vazam entre si. Nada disso é
  // persistido além da sessão do componente (fechar o URBI já zera as duas).
  const [modoBip, setModoBip] = useState(false);
  const [msgsBip, setMsgsBip] = useState<Msg[]>([]);
  const [historyBip, setHistoryBip] = useState<GeminiMsg[]>([]);
  const [msgsAssistente, setMsgsAssistente] = useState<Msg[]>([]);
  const [historyAssistente, setHistoryAssistente] = useState<GeminiMsg[]>([]);
  const msgs = modoBip ? msgsBip : msgsAssistente;
  const setMsgs = modoBip ? setMsgsBip : setMsgsAssistente;
  const history = modoBip ? historyBip : historyAssistente;
  const setHistory = modoBip ? setHistoryBip : setHistoryAssistente;
  const prefsCarregadasRef = useRef(false);
  const [cornerPos, setCornerPos] = useState(lerCornerPosSalvo);
  const dragStart = useRef<{ mouseX: number; mouseY: number; bottom: number; right: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Anúncios discretos para leitor de tela (região aria-live, sem conteúdo
  // visual próprio). Limpa antes de setar para garantir que o leitor
  // re-anuncie mesmo quando o texto é igual ao anterior.
  const [anuncio, setAnuncio] = useState("");
  // Registro do comando no Supabase. Guarda o TEXTO entendido e a AÇÃO —
  // nunca o áudio. Falha aqui não pode atrapalhar o comando: o registro é
  // observação, não parte da execução, então erro vira só log no console.
  function registrarComando(dados: {
    texto: string;
    origem: OrigemComando;
    intencao_id?: string;
    acao_tipo?: string;
    acao_alvo?: string;
    executado: boolean;
    erro?: string;
  }) {
    if (!usuario?.id) return;
    // A tabela é de COMANDO, não de conversa. Pergunta digitada que virou papo
    // com o modelo já está inteira em urbi_historico — repetir aqui só
    // duplicaria texto do usuário em dois lugares. Entra no registro o que
    // executou uma ação (de qualquer origem) e o que veio por voz, inclusive
    // quando não casou intenção: é assim que se enxerga o comando falado que o
    // URBI ainda não entende.
    const veioPorVoz = dados.origem === "webspeech" || dados.origem === "whisper";
    if (!dados.executado && !veioPorVoz) return;
    fetch("/api/urbi/comandos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    }).catch(() => {});
  }

  // Último resultado de busca/filtro, para o "abrir o primeiro" funcionar sem
  // refazer a consulta. Ref, não estado: nada na tela depende disso.
  const ultimoResultadoRef = useRef<any[]>([]);

  /** Rota de leitura do processo — a mesma que a Pilha usa ao clicar na linha. */
  function rotaDoProcesso(p: any): string {
    const tipo = p?.tipo_processo || "regularizacao";
    return `/processo/${encodeURIComponent(p.codigo)}?tipo=${encodeURIComponent(tipo)}`;
  }

  function descreverProcesso(p: any): string {
    const interessado = p?.dados?.proprietario?.valor;
    return interessado ? `${p.codigo} — ${interessado}` : String(p?.codigo ?? "");
  }

  /**
   * Executa um comando de navegação já interpretado. Só leitura: navega,
   * consulta e conta. A consulta vai por /api/processos, que é onde mora a
   * regra de permissão — um analista não alcança processo de outro nem
   * pedindo, porque a rota ignora qualquer filtro de analista vindo do
   * cliente e prende a consulta ao próprio usuário.
   */
  async function executarComandoNavegacao(c: ComandoNavegacao, texto: string, origem: OrigemComando) {
    const responder = (msg: string) => {
      setMsgs(m => [...m, { role: "urbi", texto: msg }]);
      anunciar("URBI respondeu.");
      if (permiteAudio && !speech.mudo) falar(msg);
    };

    if (c.tipo === "navegar") {
      responder(c.resposta);
      router.push(c.rota);
      registrarComando({ texto, origem, intencao_id: `nav:${c.rota}`, acao_tipo: "navegar", acao_alvo: c.rota, executado: true });
      return;
    }

    if (c.tipo === "voltar") {
      responder(c.resposta);
      router.back();
      registrarComando({ texto, origem, intencao_id: "nav:voltar", acao_tipo: "voltar", acao_alvo: "", executado: true });
      return;
    }

    if (c.tipo === "limpar_filtros") {
      responder(c.resposta);
      router.push("/processos");
      registrarComando({ texto, origem, intencao_id: "nav:limpar", acao_tipo: "limpar_filtros", acao_alvo: "/processos", executado: true });
      return;
    }

    if (c.tipo === "abrir_resultado") {
      const alvo = ultimoResultadoRef.current[c.indice];
      if (!alvo) {
        responder("Não tenho esse resultado na lista. Faça a busca primeiro.");
        registrarComando({ texto, origem, intencao_id: "nav:abrir_resultado", acao_tipo: "abrir_resultado", acao_alvo: "", executado: false });
        return;
      }
      responder(`Abrindo ${descreverProcesso(alvo)}.`);
      const rota = rotaDoProcesso(alvo);
      router.push(rota);
      registrarComando({ texto, origem, intencao_id: "nav:abrir_resultado", acao_tipo: "abrir_resultado", acao_alvo: rota, executado: true });
      return;
    }

    // buscar | filtrar — os dois consultam a mesma rota e mostram a pilha.
    const filtros: FiltrosPilha = c.tipo === "buscar" ? { busca: c.termo } : c.filtros;
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (filtros.busca) params.set("busca", filtros.busca);
      if (filtros.tipo) params.set("tipo", filtros.tipo);
      const res = await fetch(`/api/processos?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) {
        responder("Não consegui consultar a pilha agora.");
        registrarComando({ texto, origem, acao_tipo: c.tipo, acao_alvo: "", executado: false, erro: "consulta falhou" });
        return;
      }

      // tag/análise/ordenação são recorte sobre o que a rota JÁ autorizou.
      const achados = aplicarFiltrosLocais(json.data ?? [], filtros);
      ultimoResultadoRef.current = achados;

      const query = filtrosParaQuery(filtros);
      let msg: string;
      if (achados.length === 0) {
        msg = c.tipo === "buscar"
          ? `Não encontrei nenhum processo com "${c.termo}".`
          : "Nenhum processo com esse filtro.";
      } else if (achados.length === 1) {
        msg = `Encontrei 1 processo: ${descreverProcesso(achados[0])}. Diga "abrir o primeiro" para abrir.`;
      } else {
        const amostra = achados.slice(0, 3).map(descreverProcesso).join("; ");
        msg = `Encontrei ${achados.length} processos. Os primeiros: ${amostra}.`;
      }
      responder(msg);
      router.push(`/processos${query}`);
      registrarComando({
        texto, origem,
        intencao_id: c.tipo === "buscar" ? "nav:buscar" : "nav:filtrar",
        acao_tipo: c.tipo,
        acao_alvo: query || "/processos",
        executado: true,
      });
    } catch {
      responder("Sem conexão para consultar a pilha.");
      registrarComando({ texto, origem, acao_tipo: c.tipo, acao_alvo: "", executado: false, erro: "sem conexao" });
    } finally {
      setCarregando(false);
    }
  }

  function anunciar(texto: string) {
    setAnuncio("");
    requestAnimationFrame(() => setAnuncio(texto));
  }
  // Não anuncia troca de modo no carregamento inicial da preferência salva —
  // só a partir da primeira troca feita de fato pelo usuário nesta sessão.
  const modoBipMontadoRef = useRef(false);
  useEffect(() => {
    if (!modoBipMontadoRef.current) { modoBipMontadoRef.current = true; return; }
    anunciar(modoBip ? "Modo alterado para BIP, Especialista em Legislação." : "Modo alterado para Assistente de análise.");
  }, [modoBip]);
  useEffect(() => {
    if (carregando) anunciar("URBI está processando sua pergunta.");
  }, [carregando]);
  // Foco vai para o campo de mensagem sempre que o balão fica visível —
  // tanto na abertura automática quanto ao reexpandir clicando no
  // personagem. Não dispara enquanto um modal mantém o URBI recolhido.
  useEffect(() => {
    if (balaoVisivel && !modalAberto) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [balaoVisivel, modalAberto]);

  // Posição arrastada persiste pela sessão do navegador (não entre sessões
  // distintas) — gravada a cada mudança; a leitura já acontece no
  // inicializador preguiçoso do useState acima (ver lerCornerPosSalvo).
  useEffect(() => {
    try { sessionStorage.setItem("urbi:cornerPos", JSON.stringify(cornerPos)); } catch {}
  }, [cornerPos]);

  // ----- Web Speech (STT + TTS) ------------------------------------------
  // Carregar preferências ao montar
  useEffect(() => {
    if (!prefsCarregadasRef.current && usuario?.id) {
      prefsCarregadasRef.current = true;
      // Sem permissão de áudio, o estado de mudo nunca vem do valor salvo:
      // fica travado em true, independente do que a preferência antiga guardava.
      if (!permiteAudio) setMudo(true);
      else if (usuario.urbi_mudo !== undefined) setMudo(usuario.urbi_mudo);
      if (usuario.urbi_bip !== undefined) setModoBip(usuario.urbi_bip);
    }
  }, [usuario]);

  // Ref, e não o estado direto: o callback `aoTranscrever` é montado DENTRO da
  // chamada do hook, então `speech` ainda não existe naquele ponto.
  const motorSTTRef = useRef<"webspeech" | null>(null);

  const { estado: speech, alternarEscuta, pararEscuta, falar, pararFala, alternarMudo, setMudo } =
    useWebSpeech({
      idioma: "pt-BR",
      aoTranscrever: (texto) => {
        const norm = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (norm.includes("ligar microfone") || norm.includes("ligar o microfone")) {
          if (!speech.ouvindo) alternarEscuta(); return;
        }
        if (norm.includes("desligar microfone") || norm.includes("desligar o microfone")) {
          if (speech.ouvindo) pararEscuta(); return;
        }
        if (norm.includes("ligar som") || norm.includes("ligar o som") || norm.includes("ligar alto falante")) {
          if (permiteAudio) setMudo(false); return;
        }
        if (norm.includes("desligar som") || norm.includes("desligar o som")) {
          setMudo(true); return;
        }
        if (norm.includes("ligar bip") || norm.includes("ligar o bip")) {
          setModoBip(true); return;
        }
        if (norm.includes("desligar bip") || norm.includes("desligar o bip")) {
          setModoBip(false); return;
        }
        if (norm.includes("tchau") || norm.includes("pode ir") || norm.includes("dispensado")) {
          setTimeout(() => fechar(), 500); return;
        }
        setInput(texto);
        // A origem diz por qual motor o texto chegou — o nativo do navegador
        // ou a transcrição no servidor. É o que permite ver depois em quais
        // máquinas o URBI está sendo ouvido por qual caminho.
        void enviar(texto, "webspeech");
      },
    });

  useEffect(() => { motorSTTRef.current = speech.motorSTT; }, [speech.motorSTT]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  // Escutar comandos globais de voz
  useEffect(() => {
    const handler = (e: Event) => {
      const cmd = (e as CustomEvent).detail;
      if (cmd === "ligar_som") { if (permiteAudio) setMudo(false); }
      if (cmd === "desligar_som") { setMudo(true); }
      if (cmd === "ligar_mic") { if (!speech.ouvindo) alternarEscuta(); }
      if (cmd === "desligar_mic") { if (speech.ouvindo) pararEscuta(); }
      if (cmd === "ligar_bip") { setModoBip(true); }
      if (cmd === "desligar_bip") { setModoBip(false); }
      if (cmd === "tchau") { setTimeout(() => fechar(), 500); }
    };
    window.addEventListener("urbi:cmd", handler);
    return () => window.removeEventListener("urbi:cmd", handler);
  }, [speech.ouvindo]);

  // Rotina padrão de dicas: se o URBI já está aberto quando uma dica chega
  // (disparada pelo UrbiGlobal), entrega direto na conversa em vez de
  // reabrir/reiniciar. Se estiver fechado, quem trata é o UrbiGlobal (peek).
  useEffect(() => {
    const handler = (e: Event) => {
      const { mensagem } = (e as CustomEvent).detail || {};
      if (!mensagem || fase === "fora") return;
      setPoseOpacity(0);
      setTimeout(() => { setPoseId(selectPose("atencao", poseId)); setPoseOpacity(1); }, 200);
      setMsgs(m => [...m, { role: "urbi", texto: mensagem }]);
      setHistory(h => [...h, { role: "model", parts: [{ text: mensagem }] }]);
      anunciar("URBI respondeu.");
      if (permiteAudio && !speech.mudo) falar(mensagem);
    };
    window.addEventListener("urbi:entregar-dica", handler);
    return () => window.removeEventListener("urbi:entregar-dica", handler);
  }, [fase, poseId, speech.mudo]);

  useEffect(() => {
    if (abertoProp && fase === "fora") abrir();
    if (!abertoProp && (fase === "idle" || fase === "entrando")) fechar();
  }, [abertoProp]);

  useEffect(() => {
    if (speech.falando) {
      setPoseOpacity(0);
      setTimeout(() => { setPoseId("falando"); setPoseOpacity(1); }, 200);
    }
  }, [speech.falando]);


  function resetIdleTimer() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setPoseOpacity(0);
      setTimeout(() => { setPoseId("idle"); setPoseOpacity(1); }, 200);
    }, 120000); // 2 minutos
  }

  // CUSTO ZERO (02/09/2026): a saudação era gerada pelo Gemini a cada abertura
  // — abrir o robô, sozinho, já custava uma chamada paga que ninguém pediu.
  // Agora é local: monta a frase aqui, sem rede. A saudação sempre foi
  // descartável (havia esta mesma frase como fallback quando a API falhava),
  // então não se perde nada além do improviso sobre o tempo em Goiânia.
  function saudacaoOnMount(comVoz?: boolean) {
    if (comVoz) { if (permiteAudio) setMudo(false); if (!speech.ouvindo) alternarEscuta(); }
    const primeiroNome = (usuario.nome ?? "").split(" ")[0] || "colega";
    setMsgs([{ role: "urbi", texto: `Fala, ${primeiroNome}! Diga o que procura ou peça uma tela.` }]);
    anunciar("URBI respondeu.");
    resetIdleTimer();
  }
  function abrir() {
    anunciar("URBI aberto.");
    if (modo === "corner") {
      setFase("idle");
      setPoseId("atencao");
      setBalaoVisivel(true);
      if (mensagemInicial) {
        setMsgs([{ role: "urbi", texto: mensagemInicial }]);
        setHistory([{ role: "model", parts: [{ text: mensagemInicial }] }]);
        anunciar("URBI respondeu.");
        resetIdleTimer();
        if (permiteAudio && !speech.mudo) falar(mensagemInicial);
        onMensagemInicialConsumida?.();
        return;
      }
      setPoseId("tudo-ok");
      setMsgs([{ role: "urbi", texto: "..." }]);
      saudacaoOnMount(urbiVoz);
      return;
    }
    setOverlayVisivel(true);
    setTimeout(() => setOverlayOpacity(1), 10);
    setTimeout(() => setVideoAtivo(true), 600);
  }

  function onVideoEnd() {
    setVideoAtivo(false);
    setTimeout(() => setOverlayOpacity(0), 200);
    setTimeout(() => {
      setOverlayVisivel(false);
      setFase("entrando");
      setPoseId("planejando");
      setTimeout(() => {
        setPoseId("tudo-ok");
        setFase("idle");
        setBalaoVisivel(true);
        setMsgs([{ role: "urbi", texto: "..." }]);
        saudacaoOnMount(urbiVoz);
      }, 900);
    }, 800);
  }

  function fechar() {
    anunciar("URBI fechado.");
    pararFala();
    // Limpar idle timer
    if (idleTimer.current) clearTimeout(idleTimer.current);

    // Sessão do URBI NÃO é registrada em mrp_registros: essa tabela é a régua
    // de pontuação de despachos/pareceres reais (pontos calculados por área).
    // Não existe tipo_despacho que signifique "conversou com o URBI" sem
    // inventar um valor — e usar um valor real existente (ex.: "interno")
    // daria pontos de produtividade indevidos só por abrir o chat. A
    // tentativa antiga também usava nomes de campo errados (tipo/descricao/
    // data em vez de tipo_despacho/observacoes/data_despacho) e falhava
    // sempre com 400, engolido em silêncio — removida, não corrigida.

    // Salvar preferências
    if (usuario?.id) {
      fetch("/api/urbi/preferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: usuario.id, urbi_mudo: speech.mudo, urbi_bip: modoBip }),
      }).catch(() => {});
    }
    setBalaoVisivel(false);
    setFase("saindo");
    setAberto(false);
    setTimeout(() => {
      setFase("fora");
      // Zera as duas conversas (BIP e Assistente) — nada de conversa
      // sobrevive a um "dispensar", nas duas linhas.
      setMsgsBip([]);
      setHistoryBip([]);
      setMsgsAssistente([]);
      setHistoryAssistente([]);
      setPoseId("sucesso");
      setModoBip(false);
    }, 500);
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, bottom: cornerPos.bottom, right: cornerPos.right };

    function onMove(ev: MouseEvent) {
      if (!dragStart.current) return;
      const dx = ev.clientX - dragStart.current.mouseX;
      const dy = ev.clientY - dragStart.current.mouseY;
      setCornerPos({
        bottom: Math.max(0, dragStart.current.bottom - dy),
        right: Math.max(0, dragStart.current.right - dx),
      });
    }

    function onUp() {
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function aplicarAcaoIntencao(acao: IntencaoAcao) {
    switch (acao.tipo) {
      case "navegar":
        router.push(acao.rota);
        break;
      case "fechar":
        setTimeout(() => fechar(), 1500);
        break;
      case "mudo":
        // "ativar som"/"tirar mudo" digitado também é bloqueado sem permissão
        // — só o sentido de silenciar (valor true) sempre passa.
        if (permiteAudio || (acao as any).valor === true) setMudo((acao as any).valor);
        break;
      case "pose":
        setPoseOpacity(0);
        setTimeout(() => { setPoseId((acao as any).valor); setPoseOpacity(1); }, 200);
        break;
      case "parar_fala":
        pararFala();
        break;
    }
  }

  async function enviar(textoForcado?: string, origem: OrigemComando = "texto") {
    const texto = (textoForcado ?? input).trim();
    if (!texto || carregando) return;
    resetIdleTimer();
    setInput("");
    setMsgs(m => [...m, { role: "user", texto }]);
    setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("pensando", poseId)); setPoseOpacity(1); }, 200);

    // 1º) Navegador determinístico: rotas, busca, filtros e ordenação da
    // pilha. Vem ANTES do casador de intenções porque ele casa por substring —
    // "pilha de processos indeferidos" bateria em "pilha de processos" e o
    // filtro se perderia no caminho. Nenhuma IA aqui: é tabela e regex.
    const comandoNav = interpretar(texto);
    if (comandoNav) {
      setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("positivo", poseId)); setPoseOpacity(1); }, 200);
      await executarComandoNavegacao(comandoNav, texto, origem);
      return;
    }

    // 2º) Intenções fixas do catálogo (silenciar, tchau, poses) — várias têm
    // mp3 pré-gravado, e o texto da resposta é o que faz o áudio tocar.
    const intencao = casarIntencao(texto);

    // 2.5º) Tinha cara de comando e não casou em lugar nenhum: responde de
    // graça com a lista do que ele entende, em vez de mandar para o chat com
    // IA — que é pago. Custo zero é regra, então tentativa de comando escrita
    // torto não pode virar chamada cobrada sem ninguém pedir.
    if (!intencao && pareceComando(texto)) {
      setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("atencao", poseId)); setPoseOpacity(1); }, 200);
      setMsgs(m => [...m, { role: "urbi", texto: AJUDA_COMANDOS }]);
      anunciar("URBI respondeu.");
      if (permiteAudio && !speech.mudo) falar(AJUDA_COMANDOS);
      registrarComando({ texto, origem, acao_tipo: "nao_entendido", executado: false });
      return;
    }
    if (intencao) {
      const resposta = intencao.resposta ?? "Ok.";
      setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("positivo", poseId)); setPoseOpacity(1); }, 200);
      setMsgs(m => [...m, { role: "urbi", texto: resposta }]);
      anunciar("URBI respondeu.");
      if (permiteAudio && !speech.mudo) falar(resposta);
      aplicarAcaoIntencao(intencao.acao);
      registrarComando({
        texto,
        origem,
        intencao_id: intencao.id,
        acao_tipo: intencao.acao.tipo,
        acao_alvo: (intencao.acao as any).rota ?? String((intencao.acao as any).valor ?? ""),
        executado: true,
      });
      return;
    }

    // Não casou intenção nenhuma: vira pergunta ao modelo, não comando. Fica
    // registrado assim mesmo (executado=false) — é o que mostra quais comandos
    // as pessoas tentam dar e o URBI ainda não entende.
    registrarComando({ texto, origem, executado: false });

    setCarregando(true);
    const novoHistory: GeminiMsg[] = [...history, { role: "user", parts: [{ text: texto }] }];
    try {
      const res = await fetch("/api/urbi/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // history é só a conversa do modo ATIVO — trocar de modo troca de
        // qual histórico este `history` aponta (ver derivação acima), então
        // o modo anterior nunca é enviado ao modelo.
        body: JSON.stringify({ message: texto, history, usuario, assunto_id: assuntoId, modo_bip: modoBip, codigo: processoCodigo }),
      });
      const json = await res.json();
      if (json.ok) {
        const tipo = detectTipo(json.resposta);
        setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose(tipo, poseId)); setPoseOpacity(1); }, 200);
        setMsgs(m => [...m, { role: "urbi", texto: json.resposta }]);
        setHistory([...novoHistory, { role: "model", parts: [{ text: json.resposta }] }]);
        anunciar("URBI respondeu.");
        if (permiteAudio && !speech.mudo) falar(json.resposta);
        await fetch("/api/urbi/historico", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario_id: usuario.id ?? null, usuario_nome: usuario.nome, mensagem_usuario: texto, resposta_urbi: json.resposta, linha: "geral", pose_usada: poseId }),
        });
        if (json.sair) setTimeout(() => fechar(), 1800);
      } else {
        setPoseOpacity(0); setTimeout(() => { setPoseId(selectPose("negativo", poseId)); setPoseOpacity(1); }, 200);
        // BUDGET_EXCEDIDO/BUDGET_INDISPONIVEL já vêm com mensagem pronta em
        // `detalhe` (ver app/api/urbi/chat/route.ts) — não é "problema
        // técnico", é limite de uso, e o analista merece saber a diferença.
        const fallback = typeof json?.detalhe === "string" ? json.detalhe : "Tive um problema técnico. Tenta de novo.";
        setMsgs(m => [...m, { role: "urbi", texto: fallback }]);
        anunciar(json?.erro === "BUDGET_EXCEDIDO" ? "URBI atingiu o limite de uso." : "URBI encontrou um problema técnico.");
        if (permiteAudio && !speech.mudo) falar(fallback);
      }
    } catch {
      setPoseId(selectPose("negativo"));
      const fallback = "Sem conexão. Verifica a rede.";
      setMsgs(m => [...m, { role: "urbi", texto: fallback }]);
      anunciar("URBI encontrou um problema técnico.");
      if (permiteAudio && !speech.mudo) falar(fallback);
    }
    setCarregando(false);
  }

  if (fase === "fora" && !videoAtivo) return null;

  const css = `
    @keyframes urbiEntrada {
      0%   { transform: translateX(160%); opacity: 0; }
      60%  { opacity: 1; }
      75%  { transform: translateX(-12px); }
      90%  { transform: translateX(6px); }
      100% { transform: translateX(0); }
    }
    @keyframes urbiSaida {
      0%   { transform: translateX(0); opacity: 1; }
      100% { transform: translateX(160%); opacity: 0; }
    }
    @keyframes urbiIdle {
      0%, 100% { transform: translateY(0); }
      50%       { transform: translateY(-6px); }
    }
    @keyframes balaoEntrada {
      0%   { opacity: 0; transform: scale(0.85) translateX(16px); }
      100% { opacity: 1; transform: scale(1) translateX(0); }
    }
    .urbi-entrando { animation: urbiEntrada 0.8s cubic-bezier(0.25,1,0.5,1) forwards; }
    .urbi-idle     { animation: urbiIdle 3s ease-in-out infinite; }
    .urbi-saindo   { animation: urbiSaida 0.5s ease-in forwards; }
    .urbi-balao    { animation: balaoEntrada 0.3s ease-out forwards; }
    .urbi-focavel:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
      border-radius: 6px;
    }
  `;

  // Visualmente oculto, mas presente para leitor de tela — anúncios de
  // abertura/fechamento/troca de modo/carregamento/resposta.
  const srOnlyStyle: React.CSSProperties = {
    position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
    overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0,
  };

  function aoTeclarEscape(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); fechar(); }
  }

  const chatContent = (small?: boolean) => (
    <>
      {/* Modo ativo — sempre visível, nunca muda sozinho por palavra-chave */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #f1f5f9",
        fontSize: 11, fontWeight: 700,
        color: modoBip ? "#7c3aed" : "#1d4ed8",
      }}>
        <span aria-hidden="true">{modoBip ? "⚖️ " : "🧭 "}</span>
        {modoBip ? "Modo: BIP — Especialista em Legislação" : "Modo: Assistente de análise"}
      </div>
      <div style={{
        flex: 1, overflowY: "auto", maxHeight: small ? 220 : 300,
        display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8,
      }}>
        {msgs.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%",
              background: msg.role === "user" ? "#1d4ed8" : "#f1f5f9",
              color: msg.role === "user" ? "#ffffff" : "#1e293b",
              borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              padding: "7px 11px", fontSize: 12, lineHeight: 1.6,
              fontFamily: "system-ui, sans-serif", whiteSpace: "pre-wrap",
            }}>{msg.texto}</div>
          </div>
        ))}
        {carregando && (
          <div aria-hidden="true" style={{ background: "#f1f5f9", borderRadius: "12px 12px 12px 2px", padding: "7px 14px", fontSize: 16, color: "#94a3b8", width: "fit-content" }}>···</div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 6, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
        <input
          ref={inputRef}
          className="urbi-focavel"
          aria-label="Mensagem para o URBI"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && enviar()}
          placeholder={speech.ouvindo ? "Ouvindo..." : "Pergunte ao URBI..."}
          style={{
            flex: 1, border: "1px solid #e2e8f0", borderRadius: 8,
            padding: "7px 10px", fontSize: 12,
            fontFamily: "system-ui, sans-serif",
            color: "#1e293b", background: "#f8fafc",
          }}
        />
        <button
          className="urbi-focavel"
          aria-label="Enviar mensagem"
          onClick={() => enviar()}
          disabled={carregando || !input.trim()}
          style={{
            background: carregando ? "#94a3b8" : "#1d4ed8", border: "none",
            borderRadius: 8, color: "#fff", padding: "7px 12px",
            cursor: carregando ? "not-allowed" : "pointer", fontSize: 13,
          }}
        ><span aria-hidden="true">→</span></button>
        <button
          className="urbi-focavel"
          aria-label="Fechar o URBI"
          onClick={fechar}
          style={{
            background: "transparent", border: "1px solid #e2e8f0",
            borderRadius: 8, color: "#94a3b8", padding: "7px 10px",
            cursor: "pointer", fontSize: 12,
          }}
        ><span aria-hidden="true">✕</span></button>
      </div>
      <div style={{
        display: "flex", gap: 8, paddingTop: 8, minHeight: 36,
        borderTop: "1px solid #f1f5f9", marginTop: 6,
        alignItems: "center",
      }}>
        {/* Microfone (STT) */}
        <button
          type="button"
          className="urbi-focavel"
          onClick={alternarEscuta}
          disabled={!speech.suportaSTT}
          title={
            !speech.suportaSTT
              ? "Este navegador não reconhece voz — digite o comando no campo abaixo"
              : speech.ouvindo
                ? "Parar de ouvir"
                : "Falar com o URBI (microfone)"
          }
          aria-label="Microfone"
          aria-pressed={speech.ouvindo}
          style={{
            background: speech.ouvindo ? "#dc2626" : "#e2e8f0",
            color: speech.ouvindo ? "#ffffff" : "#1e293b",
            border: "none",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: speech.suportaSTT ? "pointer" : "not-allowed",
            fontSize: 14,
            opacity: speech.suportaSTT ? 1 : 0.4,
          }}
        >
          {speech.ouvindo ? "● Ouvindo" : "🎙"}
        </button>

        {/* Switch mudo/som (TTS) — some da tela inteira quando o admin não deu
            áudio a este usuário: "quem não tem áudio não pode nem saber que
            existe" (roadmap do URBI, item 2, 2026-09-01). */}
        {permiteAudio && (
          <button
            type="button"
            className="urbi-focavel"
            onClick={() => {
              if (speech.falando) pararFala();
              alternarMudo();
            }}
            disabled={!speech.suportaTTS}
            title={
              !speech.suportaTTS
                ? "Síntese de voz não suportada neste navegador"
                : speech.mudo
                  ? "Ativar som das respostas"
                  : "Silenciar respostas"
            }
            aria-label={speech.mudo ? "Ativar som" : "Silenciar"}
            aria-pressed={speech.mudo}
            style={{
              background: speech.mudo ? "#e2e8f0" : "#1d4ed8",
              color: speech.mudo ? "#64748b" : "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: speech.suportaTTS ? "pointer" : "not-allowed",
              fontSize: 14,
              opacity: speech.suportaTTS ? 1 : 0.4,
            }}
          >
            {speech.mudo ? "🔇 Mudo" : speech.falando ? "🔊 Falando…" : "🔊 Som"}
          </button>
        )}

        {speech.ultimoErroStt && (
          <span style={{ fontSize: 11, color: "#dc2626" }}>
            Mic: {speech.ultimoErroStt}
          </span>
        )}
        {/* Navegador sem reconhecimento nativo: o URBI não grava áudio nem
            manda para transcrição paga — pede para digitar, que faz
            exatamente a mesma coisa e não custa nada. */}
        {!speech.suportaSTT && (
          <span style={{ fontSize: 11, color: "#64748b" }}>
            Este navegador não reconhece voz — digite o comando.
          </span>
        )}
        {/* Seletor real de modo — ligado: BIP / Especialista em Legislação
            (só o BIP, exige fonte); desligado: Assistente de análise. */}
        <button
          type="button"
          className="urbi-focavel"
          onClick={() => setModoBip(v => !v)}
          aria-pressed={modoBip}
          aria-label={modoBip ? "Modo BIP ativo, Especialista em Legislação" : "Modo Assistente de análise ativo, ativar modo BIP"}
          title={modoBip
            ? "Modo BIP ativo — clique para voltar ao Assistente de análise"
            : "Ativar o modo BIP — Especialista em Legislação (só responde com base no BIP, sempre com fonte)"}
          style={{ background: modoBip ? "#7c3aed" : "#e2e8f0", color: modoBip ? "#fff" : "#1e293b", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14 }}>
          {modoBip ? "⚖️ BIP ATIVO" : "⚖️ Ativar BIP"}
        </button>
      </div>
    </>
  );

  if (modo === "corner") {
    return (
      <>
        <style>{css}</style>
        <div role="status" aria-live="polite" style={srOnlyStyle}>{anuncio}</div>
        <div
          onKeyDown={aoTeclarEscape}
          style={{
            position: "fixed",
            bottom: cornerPos.bottom,
            right: cornerPos.right,
            // Abaixo dos modais do processo/MAC (todos em z-50) — o URBI nunca
            // cobre um modal aberto, só fica visível ao lado/atrás dele.
            zIndex: 45,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 0,
            userSelect: "none",
          }}>
          {!modalAberto && balaoVisivel && (
            <div role="complementary" aria-label="Assistente URBI" className="urbi-balao" style={{
              position: "relative",
              background: "#ffffff", borderRadius: 16,
              padding: "14px 16px", width: 280, maxHeight: 360,
              boxShadow: "0 8px 32px #00000033",
              display: "flex", flexDirection: "column",
              pointerEvents: "all",
              marginBottom: 6,
            }}>
              {chatContent(true)}
              <div aria-hidden="true" style={{
                position: "absolute",
                bottom: -10,
                right: 32,
                width: 0,
                height: 0,
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "10px solid #ffffff",
              }} />
              <div aria-hidden="true" style={{
                position: "absolute",
                bottom: -13,
                right: 30,
                width: 0,
                height: 0,
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderTop: "12px solid rgba(0,0,0,0.08)",
                zIndex: -1,
              }} />
            </div>
          )}
          {modalAberto ? (
            <button
              type="button"
              className="urbi-focavel"
              aria-label="URBI recolhido — há um modal aberto nesta tela"
              title="URBI recolhido enquanto este modal está aberto"
              onMouseDown={onMouseDown}
              onClick={() => setBalaoVisivel(v => !v)}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                border: "none", padding: 0, cursor: "grab",
                backgroundImage: "url(/urbi/urbi-botao.jpg)",
                backgroundSize: "cover", backgroundPosition: "center",
                boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
                opacity: 0.85,
                pointerEvents: "all",
              }}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label={balaoVisivel ? "Recolher o URBI" : "Abrir a conversa com o URBI"}
              aria-expanded={balaoVisivel}
              className={`urbi-focavel ${fase === "idle" ? "urbi-idle" : fase === "saindo" ? "urbi-saindo" : ""}`}
              onMouseDown={onMouseDown}
              onClick={() => setBalaoVisivel(v => !v)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBalaoVisivel(v => !v); }
              }}
              style={{ cursor: "grab", pointerEvents: "all" }}
            >
              <img
                src={POSE_MAP[poseId] ?? POSE_MAP["sucesso"]}
                alt="" draggable={false}
                style={{
                  width: 100, height: 128,
                  objectFit: "contain",
                  opacity: poseOpacity,
                  transition: "opacity 0.2s",
                  filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
                  background: "transparent",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {overlayVisivel && (
        <div aria-hidden="true" style={{
          position: "fixed", inset: 0,
          background: "#000000",
          opacity: overlayOpacity,
          transition: "opacity 0.8s ease",
          zIndex: 955,
          pointerEvents: overlayOpacity > 0.5 ? "all" : "none",
        }} />
      )}
      {videoAtivo && (
        <video
          aria-hidden="true"
          src="/urbi/abertura-urbi-v3.mp4"
          autoPlay muted playsInline
          onEnded={onVideoEnd}
          style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(640px, 70vw)", height: "auto",
            zIndex: 960, pointerEvents: "none", borderRadius: 12,
          }}
        />
      )}
      <style>{css}</style>
      <div role="status" aria-live="polite" style={srOnlyStyle}>{anuncio}</div>
      <div
        onKeyDown={aoTeclarEscape}
        style={{
          position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 950,
          display: "flex", alignItems: "flex-start", gap: 24,
          pointerEvents: "none",
        }}>
        {balaoVisivel && (
          <div role="complementary" aria-label="Assistente URBI" className="urbi-balao" style={{
            pointerEvents: "all", position: "relative",
            background: "#ffffff", borderRadius: 16,
            padding: "14px 16px", width: 420, maxHeight: 560,
            boxShadow: "0 8px 32px #00000033",
            display: "flex", flexDirection: "column",
          }}>
            <div aria-hidden="true" style={{
              position: "absolute", right: -10, top: 16,
              width: 0, height: 0,
              borderTop: "10px solid transparent",
              borderBottom: "10px solid transparent",
              borderLeft: "10px solid #ffffff",
            }} />
            <div aria-hidden="true" style={{
              position: "absolute", right: -13, top: 14,
              width: 0, height: 0,
              borderTop: "12px solid transparent",
              borderBottom: "12px solid transparent",
              borderLeft: "12px solid rgba(0,0,0,0.08)",
              zIndex: -1,
            }} />
            {chatContent()}
          </div>
        )}
        {fase !== "fora" && (
          <div
            role="button"
            tabIndex={0}
            aria-label={balaoVisivel ? "Recolher o URBI" : "Abrir a conversa com o URBI"}
            aria-expanded={balaoVisivel}
            className={`urbi-focavel ${
              fase === "entrando" ? "urbi-entrando" :
              fase === "idle"     ? "urbi-idle"     :
              fase === "saindo"   ? "urbi-saindo"   : ""
            }`}
            style={{ pointerEvents: "all", flexShrink: 0, cursor: "pointer", background: "transparent" }}
            onClick={() => setBalaoVisivel(v => !v)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBalaoVisivel(v => !v); }
            }}
          >
            <img
              src={POSE_MAP[poseId] ?? POSE_MAP["sucesso"]}
              alt="" draggable={false}
              style={{
                width: 220, height: 280,
                objectFit: "contain",
                userSelect: "none", pointerEvents: "none",
                background: "transparent",
                filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.25))",
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
