# Auditoria do dia + estudo de leitura por IA — Aprovação de Projeto

Escrito em 25/07/2026, depois da montagem do slot 5. Duas partes: o que
auditei do que fizemos hoje, e o estudo de como a leitura por IA deveria
funcionar para este assunto.

---

## Parte 1 — Auditoria

### 1.1 Integridade dos dados (conferido no banco, tudo limpo)

| Verificação | Resultado |
|---|---|
| LIP slot 5 | 14 abas, 124 campos |
| Chaves duplicadas | nenhuma |
| Chaves com formato inválido | nenhuma |
| Label repetido na mesma aba | nenhum |
| `ordem` repetida dentro da aba | nenhuma |
| Campos com valor padrão | 59 |
| MAC slot 5 | 1 modelo, 48 grupos, 561 itens |
| Itens idênticos (grupo+texto) | nenhum |
| `ordem` duplicada no MAC | nenhuma |
| Maior texto de item | 1.247 caracteres (2 itens acima de 800) |

### 1.2 Defeitos encontrados e corrigidos hoje

1. **`assunto_id` nascia nulo em todo processo criado.** `/api/processo/salvar`
   consultava `assuntos` com a chave anônima; a tabela tem RLS e a consulta
   voltava `null` **sem erro**. Como a tela cai no fallback da Regularização
   quando não há assunto, um processo de Aprovação de Projeto exibia o LIP da
   Regularização inteiro. Era também a origem dos 36 processos órfãos que o
   backfill de 24/07 corrigiu sem tocar na causa.
2. **Auto-clone falhava em silêncio.** Erro ia para o console e a ativação
   seguia: slot ativo e vazio. Agora a rota confere o que caiu no banco e a
   tela informa.
3. **Histórico mostrava a chave crua** (`seiCheadv`, `unidComerciais`) porque
   o rótulo vinha de um mapa fixo com as chaves da Regularização.
4. **Pipeline de leitura só aceitava PDF** — `application/pdf` fixo no upload
   e nas duas chamadas ao Gemini. Print de tela subia rotulado como PDF.
5. **Índice do MAC recalculava ~80 mil operações por tecla digitada.**
6. **Rótulo "Processo:" e a caixa "Ir para processo"** eram fixos no código
   (a caixa oferecia só Regularização, mesmo dentro de outro assunto).

### 1.3 Defeitos abertos — por severidade

**🔴 A trava de orçamento do Gemini nunca funcionou.**
`/api/lip/s3` bloqueia acima de 50 chamadas/hora contando linhas em
`urbis_api_calls`. **Nada no sistema escreve nessa tabela** — ela tem zero
linhas. A trava sempre leu zero e nunca disparou. Consequência: não existe
freio para estouro de cota. *Não ativei de propósito*: passar a registrar as
chamadas ligaria a trava de verdade e poderia começar a bloquear leituras em
produção sem ninguém acompanhando. É decisão sua, e o número (50) precisa ser
revisto antes.

**🔴 A geração de laudo do slot 5 provavelmente quebra.**
`gerarLaudo.ts` abre `public/templates/laudo_regularizacao.xlsm` e exige uma
aba chamada literalmente `"Regularização"`; `api/mac/gerar-laudo` lê
`v("unid")`, chave que **não existe** na Aprovação de Projeto (viraram
`unidComerciais` e `unidHabitacionais`). Não testei — exige login. Documentos
ficaram para depois por decisão sua, mas registre que hoje isso está torto.

**🟡 A rota da tela do MAC continua fixa no código.**
`tipoUrl === "aceite_sei" ? "/analise-aceite-sei" : "/analise-regularizacao"`.
Funciona (os dados vêm por `assunto_id`), mas é a mesma classe de amarração
que fez o slot 5 aparecer como "Regularização SEI".

**🟡 O contador de preenchimento do LIP ficou enganoso.**
`camposPreenchidos` conta qualquer campo com valor. Com 59 valores padrão, o
LIP da Aprovação de Projeto **abre com 59 campos "preenchidos"** que ninguém
preencheu. Sugestão: contar só origem `urbis` ou `manual`, e mostrar o padrão
em separado.

**🟡 Faltam campos que o próprio sistema da Prefeitura tem.**
No print de consulta aparecem **Licença Prévia (45790)**, CPF do autor e o
analista responsável. Nenhum tem campo no LIP. A Licença Prévia é
identificador de processo — provavelmente deveria estar lá.

**🟢 `processo_profissionais` não é alimentado por código.** Os 31 vínculos
vieram de `origem: "backfill_jsonb"`, carga única de 17/07. Vale para todos os
assuntos.

**🟢 `estadoInicial["pag"]`** cria chave fantasma no slot 5 (a chave `pag` não
existe mais). Inócuo, mas é lixo.

---

## Parte 2 — Estudo: como a leitura por IA deve funcionar

### 2.1 O contexto muda tudo

Aprovação de Projeto **não tem obra construída**. O alvará autoriza o início
da construção. Isso invalida o vocabulário inteiro da Regularização, onde tudo
gira em torno do que já existe: vistoria fiscal, levantamento arquitetônico,
área existente aprovada, marco temporal, edificação irregular.

É por isso que o prompt da Regularização **não pode ser adaptado — tem que ser
reescrito**. Não é questão de trocar palavras: as perguntas são outras.

Leis mestras deste assunto: Plano Diretor, Código de Obras, NBR 9050 e
correlatas — contra as quais se avalia **o que está desenhado**, não o que
está erguido.

### 2.2 Os prints do sistema são a melhor fonte que existe

Cruzei os dois prints da consulta do "Alvará Mais Fácil" com as chaves do LIP
novo. Eles entregam sozinhos quase toda a espinha dorsal:

| No print | Chave do LIP |
|---|---|
| Número (44556) | `processo` |
| Tipo (Aprovação de Projeto) | `tipoProcessoLip` |
| Autor + CAU | `nome_responsavel_arq`, `cau` |
| Data Pagamento Taxa Inicial | `dataPagtoTaxaInicial` |
| IPTU da Obra | `iptu` |
| Área terreno | `areaTerreno` |
| Endereço (R 2, Quadra A18, Lote 06, Setor JD Goiás) | `logradouro`, `quadra`, `lote`, `bairro` |
| Proprietário | `proprietario` |
| HIS / Tipo / Comércio com uso definido | `habitacional`, `comercio`, `misto`, `tipoUso` |
| Nr de Pavimentos | `pav` |
| Área a ser construída | `areaTotal` |
| ART de Execução / Caixa / Projeto | `numeroDeArtExecucao`, `numeroDeArtCaixa`, `numeroDeArtProjeto` |
| Vagas comercial e PCD | `totalDeVagasAtendidasParaAtividade`, `vagasPcdAtendidas` |
| CNAE | `cnae` |
| **Licença Prévia** | *(sem campo — criar)* |
| Lista de Anexos com "É Obrigatório" | **responde direto os itens de DOCUMENTAÇÃO do MAC** |

São ~20 campos vindos de texto de formulário, estruturado e sem ambiguidade —
fonte muito mais confiável que o carimbo de uma prancha. **Devem ser lidos
primeiro e ter prioridade sobre o que o PDF do projeto disser.**

### 2.3 Ordem de leitura proposta

1. **Prints (imagens).** Prompt curto, só os campos cadastrais. Barato,
   rápido, alta confiança. Já é possível: o pipeline passou a aceitar imagem.
2. **Anexos (PDFs), um a um.** Classificação **pelo conteúdo**, não pelo nome
   do arquivo — o `detectarTipoArquivo` de hoje olha o nome, e nome real vem
   como "documento (1).pdf". Cada tipo tem o que extrair: ART → número,
   responsável, área; matrícula → proprietário e dimensões; uso do solo →
   número, unidade territorial, corredor viário, porte; prancha → carimbo,
   quadro de áreas, recuos, pavimentos.
3. **Só o que ficou vazio.** A partir daqui, a IA recebe **a lista de chaves
   ainda em branco** e procura só isso. Prompt menor, mais barato e mais
   preciso — e o custo cai a cada fonte já lida.
4. **Cruzamento (o S4 já existe).** Divergência entre o print e o carimbo da
   prancha não é erro de leitura: é **pendência de análise**, e deve virar
   alerta para o analista.

### 2.4 O prompt precisa ser gerado a partir do banco

Este é o ponto mais importante do estudo.

Ninguém deve escrever 124 campos à mão dentro de um prompt. A lista de campos
esperados deve ser **gerada a partir de `lip_campos`** do assunto — chave,
rótulo, tipo, dica e valor padrão. O prompt fica com a parte que é instrução
(como ler, o que priorizar, como tratar ausência) e recebe a estrutura por
composição.

Ganho direto: mudou a estrutura do LIP, o prompt acompanha no mesmo instante.
Sem isso, repete-se exatamente o que aconteceu hoje — LIP novo, prompt velho,
nenhum campo preenchido.

### 2.5 Desafogar o MAC

561 itens é caro e impreciso para a IA avaliar de uma vez. A ordem que reduz o
problema antes de gastar token:

1. **Filtros** derrubam grupos inteiros para N/A (já está no ar). Num projeto
   comercial simples, isso elimina boa parte dos 48 grupos.
2. **`chave_lip`** responde sozinho os itens que dependem só de dado do LIP —
   documentação anexada, existência de corredor viário, subsolo. A lista de
   anexos do print resolve o grupo DOCUMENTAÇÃO inteiro.
3. **Só o que sobrou** vai à IA, **em lotes por grupo** — nunca os 561 de uma
   vez.
4. **Prioridade para item que gera indeferimento.** Esses precisam de nota no
   próprio item (coluna nova) para o sistema saber quais são.

### 2.6 Sobre as leis mestras

O `ref` do item aponta para a lei. Com o BIP (biblioteca de leis) já existente,
o caminho é mandar ao prompt **só os trechos referenciados pelos itens que
sobraram** — nunca a lei inteira. É o que torna a avaliação viável em contexto.

Sobre NotebookLM: não existe API pública dele. O equivalente aqui é busca
semântica própria sobre o BIP (embeddings + recuperação por trecho), que é
exatamente o que o `ref` habilita.

### 2.7 Ordem de execução sugerida

1. Criar os campos que faltam no LIP (Licença Prévia, e decidir de onde vem a
   Ordem de Serviço — ela não aparece nos prints).
2. Marcar no MAC quais itens geram indeferimento.
3. Gerador de prompt a partir de `lip_campos`.
4. Reescrever `P1_TRIAGEM` (classificar por conteúdo) e `P2_EXTRACAO`
   (extração incremental, só o que está vazio) para o slot 5.
5. Amarrar `chave_lip` nos itens do MAC que o LIP já responde.
6. `P3_MAC` por lotes, com os trechos de lei do `ref`.
