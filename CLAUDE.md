# URBIS — vocabulário e convenções do projeto

Arquivo lido automaticamente por qualquer sessão de IA que abrir este repositório.
Serve para não precisar reexplicar as mesmas coisas a cada conversa.

## Vocabulário: módulos principais x satélites

Quando o Fábio disser **"módulos principais"**, está falando de:

| módulo | o que é | onde vive |
|---|---|---|
| **LIP** | Leitura Inteligente de Processo — a ficha do processo | `app/processo/ProcessoClient.tsx` |
| **MAC** | Módulo de Análises e Conformidades — o checklist | `app/analise-*/[codigo]/page.tsx` |

Quando disser **"módulos satélites"**, está falando de **todo o resto** — e a lista é aberta:
qualquer módulo novo que apareça entra automaticamente nela.

| módulo | o que é | fonte de dados |
|---|---|---|
| **URBI** | assistente de conversa do sistema | `app/api/urbi/*` |
| **MAP** | Auditoria e Produtividade | `auditoria_eventos` |
| **MRP** | Minha Produtividade (pontuação do analista) | `mrp_registros` |
| **MDP** | Despachos e Pareceres — registro do que SAIU | `mdp_registros` |
| **tag / pilha** | marcação do processo na pilha | `processos.tags` |
| **MHD** | Histórico e Documentos — memória do que ENTROU, por hash | `mhd_documentos` / `mhd_versoes` / `mhd_conteudos` |

**Regra que decorre disso:** todo módulo principal deve disparar para **todos** os satélites.
Quando implementar um documento, uma emissão ou uma ação relevante num slot, verifique se ela
alimenta cada um deles — não só o que a tarefa pediu. Uma emissão que não chega ao MDP, por
exemplo, deixa 16 campos do LIP "aguardando o fato" para sempre (ver
`lib/lipDocumentosEmitidos.ts`).

## Slots

Um "slot" é um tipo de processo. Cada um tem seu checklist e seus documentos.

- **Slot 1** — Regularização SEI (`regularizacao`)
- **Slot 2** — Aceite SEI (`aceite_sei`)
- **Slot 5** — Aprovação de Projeto (`slot_05`)

**Isolamento entre slots é regra, não estilo.** Slot 5 não importa código do Slot 1 e vice-versa;
quando o comportamento precisa ser igual, o código é reproduzido por leitura, nunca compartilhado.
Dois atos que hoje se parecem são de setores diferentes e podem divergir amanhã — um ajuste num
não pode mudar o outro em silêncio.

**Exceção deliberada:** a numeração de despachos e pareceres (`/api/numeracao/proximo`) é **fonte
única para todos os slots**, com as mesmas regras. Não criar série por slot.

**A tela do LIP não é isolada:** `ProcessoClient.tsx` é um arquivo só para todos os slots. Quando
precisar de comportamento específico, use um desvio por `tipo_processo` sem alterar o caminho dos
demais. Os prompts do LIP, esses sim, são isolados por slot.

## Regras de trabalho

- **Não mexer num slot sem pedido explícito para aquele slot.** Só o slot autorizado na sessão fica
  destravado.
- **Nunca emitir documento no lugar do analista.** Gerar arquivo de teste local é permitido;
  consumir número da faixa de numeração, não. O `commit` da numeração é sempre ação do usuário
  pela tela.
- **Consumir número só depois do documento pronto.** A faixa é finita e um buraco nela não se
  desfaz.
- **Nunca deixar item sumir em silêncio.** Marca presa a item desativado do checklist não pode
  simplesmente não aparecer no documento — conte e reporte (ver o cabeçalho
  `X-Exigencias-Perdidas` em `app/api/mac/slot-05/despacho/route.ts`).
