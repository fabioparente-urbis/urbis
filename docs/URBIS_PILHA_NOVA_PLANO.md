# Pilha de Processos nova — plano para aprovação

**Versão:** 0.1 · **Data:** 18/11/2026 · **Estado:** só estudo, nada implementado.
Arquivos estudados: `app/processos/page.tsx`, `components/pilha/CaixaFiltros.tsx`,
`components/pilha/LembreteProcesso.tsx`, `app/api/processos/route.ts`, `/api/processo/tag`,
`/api/processo/lembrete`, `docs/URBIS_MOBILE_PLANO.md`.

> Medição de uso: **não feita.** O banco conectado nesta sessão não é o do URBIS. Para saber
> quais filtros são de fato usados, preciso do acesso ao banco certo (ou ligar um contador).

## 1. O que a Pilha faz hoje (inventário)

**Card de cada processo:** número + processo físico · selo "NÃO ENVIADO AO SEI" · tags de
documento (despacho, despacho interno, indeferimento, arquivamento, laudo — clicar faz o URBI
explicar; admin pode apagar com ×) · interessado · analista · lembrete · aviso das análises
ocultas (7 processos fixos) · tipo · LIP · MAC (com dias aguardando, âmbar 175, vermelho 180) ·
situação geral (só em tela pequena) · FINALIZADO · esforço do Radar · data · ✏️ · 🗑️.

**Filtros (caixa única, ~45 opções em 12 grupos):** Situação (6) · Andamento (5) · Documento (4)
· Área no LIP (3) · Porte (3) · Tipo (slots) · Uso do Solo (2) · Classificação/Vigia (3) ·
Análise (6) · Triagem (1) · Analista (gerência) · Ordenar (7) · + busca livre · + caixinha solta
"Só não enviados ao SEI".

## 2. O que é bom (manter)

- Caixa única de filtros com etiquetas removíveis — boa ideia, só está pesada.
- Tags e selos que o URBI explica ao clicar.
- Contagem de dias aguardando retorno com alerta de prazo.
- Lembretes por processo.
- Exclusão vai para a lixeira (não apaga de vez).
- A permissão (quem vê o quê) é decidida no servidor.

## 3. Defeitos achados (corrigir — não precisa decidir, só autorizar)

1. **Rota sem senha:** `PUT /api/processos` muda analista, "LIP finalizado" etc. **sem conferir
   quem está logado.** Risco de segurança — corrigir primeiro.
2. Botão ✏️ diz "Abrir LIP" mas abre "trocar analista". Rótulo errado.
3. Apagar diz "não pode ser desfeita", mas vai para a lixeira. Texto errado.
4. Aviso "LIP não preenchido" está duplicado no código (abre duas janelas iguais uma sobre a outra).
5. Lista corta em **200 processos sem avisar**.
6. Atalho "ir para o MAC" manda Slot 2 e Slot 5 para a tela do MAC da Regularização.
   *(Mexe em fluxo de slot — só com seu OK para cada slot.)*
7. Cores dos Slots 3, 4 e 5 não existem (ficam cinza); card de LIP incompleto usa vermelho fixo,
   que quebra no tema escuro.
8. Tag de documento apagada pelo admin com um clique, sem confirmação.

## 4. Proposta estética nova

- **Topo:** título + contador + 4 "abas rápidas" com número: *Para fazer agora* (LIP/MAC em
  andamento) · *Aguardando interessado* · *Não enviado ao SEI* · *Finalizados*. Resolve 80% das
  filtragens com um clique.
- **Caixa de filtros** continua, mas mais enxuta (ver item 6) e com "Ordenar" num botão separado.
- **Card em 3 linhas fixas**, sempre no mesmo lugar:
  1. número · tipo (cor por slot) · selo de situação único
  2. interessado · analista · data
  3. tags de documento (só a mais recente aberta; "+2" mostra as outras) · lembrete
- Uma **faixa colorida à esquerda** do card mostra a urgência (vermelho = prazo de 180 dias ou não
  enviado ao SEI; âmbar = perto do prazo / LIP incompleto). Bate o olho e sabe.
- ✏️ e 🗑️ saem do card e vão para um menu "⋯" (menos clique errado).
- Cores só pelas variáveis do tema (claro e escuro iguais).

## 5. Recursos melhorados

- Contador por aba e "mostrando X de Y" (fim do corte silencioso de 200).
- Filtros lembrados entre visitas (por pessoa, no navegador).
- Atalho de teclado: `/` foca a busca, setas + Enter abrem o processo.
- Lembrete com indicação visível de quem escreveu (gerente vê o do analista).

## 6. O que sugiro TIRAR — preciso do seu OK em cada um

| # | o quê | por quê |
|---|---|---|
| T1 | Selo e filtros de **esforço / "ação bloqueante" / "pronto pra despachar"** | vêm do Radar, que está **pausado desde 22/09** — mostram dado velho ou nada |
| T2 | Filtro **"Triagem: mais simples para começar"** | repete a Classificação do Vigia |
| T3 | Filtro **"Área no LIP"** (3 faixas) | repete o Porte (PP/MP/GP) |
| T4 | Filtros **"1ª..5ª análise"** separados | trocar por um só: "2 ou mais análises" |
| T5 | Caixinha solta **"Só não enviados ao SEI"** | vira aba rápida (não some, muda de lugar) |
| T6 | Aviso fixo das **análises ocultas** (7 processos, julho) | 4 meses depois, ocupa espaço; pode virar só um ícone ⓘ |
| T7 | Badges LIP + MAC + situação geral juntos | trocar por **um selo só**, com LIP/MAC ao passar o mouse |

## 7. Mobile

A Pilha é a tela que o celular mais vai consultar. O card de 3 linhas e as abas rápidas já servem
no celular (`/m`), **só leitura** — sem ✏️, 🗑️, × de tag nem lembrete (lá é só ver). Nada muda
no computador por causa disso. O conserto do item 3.1 (rota sem senha) também é pré-requisito da
Fase S do plano mobile.

## 8. Ordem de execução (depois do seu OK)

1. Defeitos 1–5, 7, 8 (o 6 só se autorizar por slot).
2. Visual novo (topo, abas, card).
3. Remoções que você autorizar.
4. Conferência no navegador, PR, e só mesclo com "mescla".

## 9. Novo (pedido 18/11): ícone do URBI para condição bloqueante

**Pedido:** no card, um botãozinho com o rosto do URBI quando o processo tiver uma das 8 condições
bloqueantes. Clicar abre: qual condição é, qual a evidência, e um botão **Dispensar**. Sem
dispensar, ela continua; dispensada, deixa de existir.

**Como é hoje:** as condições são calculadas pelo Vigia (`lib/bdi/vigia.ts`) só quando o processo
é aberto, e cada uma já traz título + evidência (`detalhe`). O "dispensar" que existe só esconde o
aviso grande naquela aba — no dia seguinte ele volta. **Não existe dispensa de verdade.**

**Desenho proposto:**
1. Tabela nova `urbi_condicoes_processo`: processo, condição, evidência, quando foi vista.
   **Quando recalcula** (decisão do Fábio, 18/11): ao **abrir o LIP** as condições são
   recalculadas; ao **abrir o MAC** são revisadas. O resultado vai na hora para a tabela e a Pilha
   passa a mostrar (ou tirar) o ícone. A Pilha só **lê**
   essa tabela — 1 consulta para a lista toda. *Não* recalcular o Vigia para 200 processos na
   Pilha: são ~9 consultas por processo, exatamente o erro que derrubou o banco com o Radar.
2. **Quem dispensa** (decisão do Fábio, 18/11): o analista do processo e as chefias (gerente da gerência, diretor/a, admin). Dispensa gravada com **quem, quando e o motivo** (obrigatório), e entra no MAP. Depois de
   dispensada, some da Pilha **e** do aviso grande no MAC daquele processo.
3. **Evidência mudou → nova análise** (decisão do Fábio, 18/11): a dispensa vale só para aquela
   evidência. Se ela mudar (ex.: 180 dias virou 200; apareceu outro imóvel duplicado), o Vigia
   analisa de novo e, se a condição continuar, o URBI chama de novo do mesmo jeito (ícone na Pilha
   + aviso grande no MAC).
3b. **Botão do administrador** (decisão do Fábio, 18/11): ao abrir o processo, o admin tem um
   botão "Refazer análise das condições bloqueantes" — roda o Vigia na hora, ignorando as
   dispensas anteriores daquele processo, e registra no MAP quem refez e quando.
4. Limitação honesta: processo que ninguém abriu depois da mudança não terá ícone até ser aberto.

**Visual da janela** (pedido do Fábio, 18/11, com print do aviso "Marco temporal não atendido"
do LIP do 26.5.000026935-8): mesmo molde daquele aviso (título vermelho, lei, texto, quadro de
evidência com fonte e trecho do documento, botão grande) **mais o desenho do URBI**
(`/urbi/poses/urbi-atencao.png`, o mesmo do aviso grande do MAC) no topo, para mostrar que é o URBI
trabalhando. Botões: **Dispensar** (pede motivo) e **Entendi** (fecha, condição continua). O ícone
pequeno do card na Pilha também é o rosto do URBI.

**Slots 1, 2, 3 e 4 — autorizados pelo Fábio em 18/11** (o Slot 5 não tem essas condições).

📱 Mobile: o ícone pode aparecer no celular (só ver a condição e a evidência); o botão Dispensar
fica **só no computador**.
