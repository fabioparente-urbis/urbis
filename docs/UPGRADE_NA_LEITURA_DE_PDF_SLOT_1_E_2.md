# UPGRADE NA LEITURA DE PDF — SLOT 1 E 2

### Fatiador de PDF do SEI · Módulo de Análise de Fluxo
### Plano de implantação e operação

**Versão:** 29 · **Data:** 11/09/2026 · **Estado:** em implantação — **Fases 0, 1, 1B e 2
concluídas, Fase 3 abolida, Fase 4 com CÓDIGO concluído, Fase 5 em duas rodadas, Fase 6 com NÚCLEO
implementado, Fase 7, 8, 9A e 9B implementadas e TESTADAS COM GEMINI REAL, Fase 10 implementada e
RODADA (carga do acervo, 2441 linhas em `fluxo_processo_eventos`), Fase 11 implementada, Fase 12
CONCLUÍDA (painel + alerta dentro do processo), Fase 13 com CÓDIGO pronto e INERTE de propósito,
Fase 14 sem código mas com GATILHO instalado** (16 de 16 fases com trabalho real ou gatilho — Fase
3 abolida virou 9A/9B nesta versão, sem renumerar 10-14; Fase 5 e 6 continuam abertas por
natureza, ver §6/§7) — migrations das Fases 1, 4 e 5 (duas) APLICADAS e confirmadas em produção;
migration da Fase 8 (`documentos_ia_cache`) escrita, ainda não aplicada — fail-safe; migrations das
Fases 9A (`leitura_unica_lip_mac_ativo`) e 9B (`mac_sugestoes_leitura_unica`) **aplicadas e
confirmadas em produção em 11/09/2026**, com teste real de ponta a ponta (2 chamadas Gemini,
Slot 1 e Slot 2); migration da Fase 10 (`fluxo_processo_eventos`) **aplicada em produção e já com
2441 linhas gravadas pela carga do acervo**; migration da Fase 13
(`interpretacao_assistida_fluxo_ativo`) escrita, **NÃO aplicada de propósito** — nem o interruptor
sozinho liga a fase, tem um segundo portão objetivo (mínimo de processos e de dias desde a carga)
que a base de hoje não cumpre nem perto; Fase 14 sem migration nenhuma, só um contador sobre
`mhd_eventos` já existente (`/api/admin/fluxo/fase14-sinal`) — ver v29 no histórico. Card do painel
`/admin/analise-fluxo` acrescentado à Home (lacuna da regra da v6, achada ao fechar a Fase 12).
Pushes feitos até o commit do gatilho da Fase 14, 11/09/2026.

**Concepção e direção do produto:** Fábio Parente Martins Santos
**Expansão do Módulo de Análise de Fluxo:** discussão com Gemini
**Levantamento técnico, verificação em código e banco, e redação:** sessão Claude de 10/09/2026

> Documento **auto-suficiente de propósito**: escrito para ser lido também por IAs externas
> (Gemini, ChatGPT) que não têm acesso ao repositório nem ao banco. Repete contexto que quem
> conhece o URBIS já sabe.
>
> **MEDIDO** = verificado em 10/09/2026 com chamada real à API do fornecedor de IA ou consulta
> real ao banco de produção. **NÃO MEDIDO** = hipótese explícita, marcada como tal.

---

## 1. Resumo executivo

O URBIS, hoje, resolve o trabalho de um analista. Este plano descreve dois módulos novos que o
transformam também em ferramenta de gestão: capaz de mostrar, com dado, onde cada processo
travou, há quanto tempo e em qual setor.

### 1.1 O problema, em uma frase

> **O que ninguém consegue responder hoje**
>
> Existem processos com **mais de dois anos** sem conclusão, e não há como dizer onde pararam. A
> informação existe — está dentro do PDF de cada processo, na forma de documentos datados e
> assinados por setores diferentes — mas ninguém consegue lê-la de forma sistemática, porque são
> centenas de páginas por processo e dezenas de processos.

### 1.2 Os dois módulos

| Módulo | O que faz | Para quem | Usa IA? |
|---|---|---|---|
| **A — Fatiador de PDF do SEI** | Abre o PDF único do processo e separa automaticamente cada documento: tipo, intervalo de páginas, departamento de origem, quem assinou e em que data. | Analista — corta o trabalho manual de organizar o processo | **Não** |
| **B — Análise de Fluxo** | Usa esses dados para mostrar quanto tempo o processo ficou em cada setor, onde estão os gargalos, quantas vezes voltou e por quê. | Gerência e secretaria — visão que hoje não existe em lugar nenhum | Só na última etapa, e opcional |

### 1.3 Por que agora, e não depois

- O modelo de IA usado pelo URBIS será **desativado pelo fornecedor em 16 de outubro de 2026**.
  A migração é obrigatória e tem data.
- O modelo substituto custa **5,2 vezes mais por página** — número MEDIDO, não estimado (§5). As
  economias previstas neste plano são exatamente o que mantém o custo neutro depois da migração.
- O histórico é **recuperável de imediato**: fatiar um processo de dois anos reconstrói a jornada
  inteira dele na hora, porque o histórico está dentro do próprio PDF. Não é preciso esperar
  meses acumulando dado.

### 1.4 O que muda na prática, para quem decide

| Hoje | Depois |
|---|---|
| Não se sabe onde os processos travam. | Painel mostra tempo por setor e por etapa, com faixas de tempo. |
| Não se sabe quantas vezes um processo voltou nem por quê. | Retrabalho medido, com o motivo predominante. |
| Cada processo é lido inteiro pela IA, duas vezes (ficha e checklist). | Lido uma vez, e só os documentos que importam. |
| Processo que volta é relido do zero. | Só o que é novo é lido; o resto não custa nada. |
| Organizar o processo é trabalho manual do analista. | O sistema propõe a organização; o analista confere e corrige a exceção. |

---

## 2. Glossário

| Termo | Significado |
|---|---|
| **SEI** | Sistema Eletrônico de Informações, plataforma oficial de tramitação. Exporta o processo inteiro num único PDF. |
| **PDF único** | O arquivo exportado pelo SEI, com todo o processo mesclado. Tipicamente 150-350 páginas e 20-100 MB. |
| **Carimbo do SEI** | O rodapé que o SEI imprime em toda página, com o título do documento, seu número e a página dentro do processo. É a chave que permite separar os documentos sem IA. |
| **Fatiar** | Separar o PDF único nos documentos que o compõem, identificando onde cada um começa e termina. |
| **LIP** | Leitura Inteligente de Processo. A ficha do processo dentro do URBIS, com dezenas de campos. |
| **MAC** | Módulo de Análises e Conformidades. O checklist. |
| **MHD** | Módulo de Histórico e Documentos. Registra quais documentos entraram em cada processo, sem guardar arquivo. |
| **BDI** | Banco de Dados Inteligente. Camada de estatísticas. |
| **URBI** | Assistente de conversa do sistema. |
| **Token** | Unidade de cobrança da IA. Uma página de PDF equivale a algumas centenas de tokens. |
| **Contêiner genérico** | Documento do SEI cujo título não diz nada — "Documentação", "Processo", "Solicitação" — e que esconde vários documentos diferentes dentro. |
| **Selo de confiança** | Indicação visual de quão seguro o sistema está da identificação: verde alta, amarelo média, cinza não identificado. |

---

## 3. Como será operado

Esta é a seção que decide o sucesso do projeto. Um módulo que funciona tecnicamente mas exige
mais trabalho do analista do que a rotina atual é um módulo fracassado. O objetivo declarado é
que o analista **CONFIRME**, não que ele **DIGITE**.

> **Princípio de operação**
>
> A tela é de **conferência**, não de **autoria**. O fatiador propõe tudo que consegue
> identificar; o analista confirma no caso comum e corrige apenas na exceção. A medida objetiva
> de sucesso é o tempo gasto por processo: se aumentar em relação à rotina atual, a fase não
> está concluída.

### 3.1 Rotina A — processo novo chega para análise

**Pré-condição:** o analista recebeu um processo novo e baixou do SEI o PDF único. Nada mais é
necessário: sem cadastro prévio, sem preparação do arquivo, sem compactação.

1. **Abrir o módulo.** O Fatiador de PDF do SEI tem entrada própria no menu principal. Não fica
   mais dentro da tela do processo, como está hoje — é ferramenta independente, e pode ser usada
   mesmo antes de o processo existir na ficha.
2. **Soltar o arquivo.** O analista arrasta o PDF para a área indicada, ou clica para escolher.
   O arquivo **não** é enviado para servidor nenhum: todo o fatiamento acontece dentro do próprio
   navegador, na máquina dele.
3. **Acompanhar o processamento.** Uma barra mostra o progresso, página a página, com o total à
   vista. Um processo de 230 páginas leva poucos segundos. Até aqui nenhuma IA foi usada e nada
   foi cobrado.
4. **Receber a proposta.** A tela se divide em duas: à esquerda o PDF renderizado, à direita a
   lista dos documentos identificados, na ordem em que aparecem no processo.
5. **Percorrer a lista.** Cada linha traz título, número SEI, intervalo de páginas, departamento,
   quem assinou, data e o selo de confiança. Documento com selo verde é confirmado sem abrir;
   amarelo pede conferência; cinza precisa de decisão.
6. **Conferir um documento.** Ao clicar numa linha, o PDF à esquerda salta para a primeira página
   daquele documento e destaca o intervalo. O analista vê imediatamente se o corte faz sentido.
7. **Corrigir um corte errado.** Arrasta a fronteira — o marcador entre um documento e o seguinte
   — para a página correta. A lista se reorganiza sozinha, e os dois documentos afetados
   recalculam suas páginas.
8. **Dividir ou juntar.** Se o sistema uniu dois documentos que são separados, o analista divide
   na página certa. Se separou o que era um só, junta. Ambas ficam no histórico.
9. **Preencher o que faltou.** Campo vazio ou errado — tipo, departamento, assinante, data — é
   clicado e corrigido, escolhendo de uma lista de valores conhecidos ou digitando um novo.
10. **Transformar a correção em regra.** Ao confirmar uma correção, o sistema pergunta se aquilo
    deve valer daqui em diante. Se o analista aceitar, a próxima ocorrência do mesmo padrão será
    identificada automaticamente — **sem inteligência artificial**.
11. **Escolher o que vai para leitura.** Cada documento tem uma marca de seleção. Histórico
    digitalizado antigo, por exemplo, normalmente não precisa ser lido. O sistema sugere uma
    seleção inicial, e o analista ajusta.
12. **Enviar para leitura.** Só neste momento a IA entra em cena, e apenas nos documentos
    marcados. Antes de chamar, a tela informa quantos documentos, quantas páginas e o custo
    estimado.
13. **Receber o preenchimento.** O resultado alimenta a ficha do processo e o checklist numa
    leitura única, em vez das duas leituras separadas de hoje.
14. **Aceitar campo a campo.** Cada campo preenchido aparece como proposta, com a origem indicada
    — de qual documento e de qual página veio. O analista aceita o que estiver certo. O sistema
    **nunca grava sozinho**.

#### Tempo esperado por etapa

| Etapa | Tempo | Custo em IA |
|---|---|---|
| Fatiamento do PDF (automático) | Segundos | Zero |
| Conferência da lista pelo analista | **A MEDIR** (meta: cair vs. hoje) | Zero |
| Leitura dos documentos selecionados | Menos de 1 minuto | Proporcional ao que foi marcado |
| Aceite campo a campo | Igual ao de hoje | Zero |

**Observação importante:** os tempos de conferência são o número que ainda não existe e precisa
ser medido na Fase 0. Todo o resto do plano assume que a conferência é rápida porque o sistema
acerta a maioria — hipótese que a Fase 0 confirma ou derruba.

### 3.2 Rotina B — processo volta com correções

**Pré-condição:** o processo já foi analisado antes, devolvido ao interessado com exigências, e
voltou. O PDF novo traz tudo que já existia mais os documentos juntados.

1. **Soltar o PDF novo**, exatamente como na primeira vez. O analista não precisa indicar que é
   um retorno — o sistema descobre sozinho.
2. **O sistema compara.** Cada documento recebe uma impressão digital do seu conteúdo. Documentos
   cuja impressão já é conhecida são reconhecidos como os mesmos de antes.
3. **A tela informa o resumo do retorno:** por exemplo, "38 documentos já conhecidos, 3 novos,
   1 alterado".
4. **Nada conhecido é relido.** Os 38 documentos que já haviam sido lidos não voltam para a IA e
   não custam nada.
5. **Documento alterado gera alerta.** Se um documento com o mesmo número SEI voltou com conteúdo
   diferente, aparece um alerta de integridade. O sistema nunca sobrescreve em silêncio: o
   analista decide qual versão vale.
6. **Só o que é novo vai para leitura.** O custo do retorno passa a ser proporcional ao que
   mudou, não ao tamanho do processo.

> **Onde está a maior economia do plano**
>
> A segunda análise de um processo passa a custar uma fração da primeira — tanto em tempo do
> analista quanto em despesa de IA. Como boa parte dos processos passa por várias rodadas de
> exigência, este é o item que mais pesa no resultado financeiro.

### 3.3 Rotina C — carga do acervo (executada uma vez)

Como o histórico de cada processo está dentro do próprio PDF, é possível o módulo de gestão
nascer com base estatística real em vez de vazia. Esta rotina é executada uma única vez, no
início.

1. O analista seleciona um lote de processos já arquivados, dos quais tenha os PDFs.
2. O sistema fatia todos em sequência, sem IA e sem custo algum.
3. Cada processo deposita sua jornada completa: quais setores tocaram nele, em que datas, em que
   ordem, e quantas vezes voltou.
4. Ao final, o Módulo de Análise de Fluxo já tem o que mostrar, sem esperar meses de acúmulo.

**Este ponto corrige uma conclusão anterior deste plano.** A versão 2 afirmava que seria preciso
esperar dado acumular. Isso vale para estatísticas de eventos do próprio sistema, mas **não** para
o fluxo do processo — que já está registrado nos documentos e pode ser reconstruído a qualquer
momento.

### 3.4 Rotina D — uso pela gerência e pela secretaria

| Onde aparece | O que mostra | Decisão que apoia |
|---|---|---|
| Alerta dentro do processo | "Parado há 40 dias aguardando laudo de fiscalização." | Agir agora, neste processo |
| Painel de faixas de tempo | Quantos processos parados há <30 dias, 30-90, 90-365, e mais de um ano. | Dimensionar o tamanho do problema |
| Painel por setor e etapa | Em qual departamento e em qual etapa os processos mais demoram. | Escolher onde intervir primeiro |
| Painel de retrabalho | Quantas voltas até ser aprovado, e o motivo predominante. | Atacar a causa das devoluções |
| Padrão de erro por autor externo | Quais tipos de documento chegam com erro com mais frequência. | Orientar profissionais e reduzir exigências |

#### Sobre a precisão da medição de tempo

A medição usa as datas dos documentos assinados. Isso não é exato ao dia: a data de um documento
não é necessariamente o dia em que o processo entrou ou saiu de um setor.

**Essa imprecisão não compromete o uso pretendido.** A decisão de gestão se apoia em ordem de
grandeza, não em calendário: uma coisa é um processo levar dez dias, outra é levar um ano. O
sistema deve, portanto, trabalhar com **faixas** de tempo e não sugerir precisão que não tem.
Prometer exatidão que o dado não sustenta seria pior do que assumir a faixa.

### 3.5 Quem opera o quê

| Papel | Responsabilidade | Frequência | Treinamento? |
|---|---|---|---|
| **Analista** | Fatiar, conferir os cortes, corrigir a exceção, escolher o que vai para leitura, aceitar o preenchimento. | A cada processo | Sim, curto — a tela segue a lógica que ele já usa |
| **Analista (curadoria)** | Aprovar as regras candidatas nascidas das próprias correções. | Semanal, poucos minutos | Não |
| **Gerência** | Acompanhar painéis de gargalo e retrabalho, decidir intervenções de fluxo. | Semanal ou mensal | Não — leitura de painel |
| **Secretaria** | Visão consolidada. Decidir se métricas por pessoa devem ser habilitadas. | Mensal | Não |
| **Administrador** | Interruptores, tetos de gasto, permissões, carga do acervo. | Sob demanda | Sim |

### 3.6 O que acontece quando dá errado

Princípio comum a todas: **nada some em silêncio**, e nada é gravado sem decisão humana.

| Situação | O que o sistema faz | O que o operador faz |
|---|---|---|
| O arquivo não é um processo do SEI | Avisa que não encontrou o carimbo padrão e interrompe. Não adivinha. | Confere se baixou o arquivo certo |
| Nenhum documento é reconhecido | Mostra a lista de páginas para classificação manual, em vez de tela vazia. | Classifica manualmente; as correções viram regra |
| Um documento fica sem tipo | Entra na lista com selo cinza, marcado pendente. **Nunca é descartado.** | Escolhe o tipo na lista |
| Carimbo ilegível ou página fora de ordem | Vai para lista de revisão, com o motivo declarado. | Decide caso a caso |
| Conexão cai durante a leitura | O fatiamento já está salvo no navegador. Só a leitura é refeita, e só do que faltou. | Repete o envio |
| A IA devolve resposta ruim ou incompleta | O resultado é sempre proposta. Nada entra na ficha sem aceite. | Rejeita e preenche à mão |
| O PDF é grande demais para o modelo | Escolhe automaticamente um modelo que suporte, ou divide em partes. | Nada |
| Teto de gasto por hora atingido | Avisa **antes** de chamar, informando quando libera. Não gasta escondido. | Aguarda ou pede liberação |
| O analista fecha a tela sem terminar | O trabalho fica salvo no navegador por até 180 dias. | Retoma de onde parou |

---

## 4. As telas, em detalhe

> **Regra de navegação (decidida por Fábio em 10/09/2026): todo módulo novo ganha card na Home.**
>
> O Fatiador com tela própria (Fase 6) e o painel de Análise de Fluxo (Fase 12) não ficam
> acessíveis só por dentro de outra tela ou por URL digitada — entram em `app/page.tsx` como
> card próprio, no mesmo padrão dos demais (`cards: Card[]`, com `chave`, `Icone`, `rota` e o
> gate de perfil que cada um exigir). Precedente já existe no próprio código: o MHD só vivia
> dentro do LIP e o Fábio não achava; ganhou card na Home em 06/09/2026, mesmo gate de
> URBI/BIP. Vale para qualquer módulo satélite novo deste plano, não só os dois — é regra
> geral, não exceção pontual.

### 4.1 Tela de entrada do Fatiador

```
+--------------------------------------------------+
|  Fatiador de PDF do SEI                          |
|                                                  |
|     Arraste aqui o PDF do processo               |
|     ou clique para escolher                      |
|                                                  |
|  Processos organizados recentemente:             |
|   . 25.5.000012012-9   ontem      27 documentos  |
|   . 24.5.000024350-0   3 dias     33 documentos  |
+--------------------------------------------------+
```

- A lista de recentes permite retomar um processo já organizado sem soltar o arquivo de novo,
  desde que ainda esteja guardado no navegador.
- Nenhum arquivo é enviado ao servidor nesta tela nem em nenhuma outra.

### 4.2 Tela principal — conferência

```
+-----------------------+--------------------------+
|                       |  27 documentos           |
|                       |  ----------------------- |
|    PDF renderizado    |  * Requerimento          |
|                       |    pg 1-3 . Atende Facil |
|    pagina 47 de 229   |  * Certidao Matricula    |
|                       |    pg 4-9 . Cartorio     |
|    [<]  [>]  [zoom]   |  o Documentacao          |
|                       |    pg 10-58 . 4 pecas    |
|                       |  ? (nao identificado)    |
|                       |    pg 59-61              |
+-----------------------+--------------------------+
|  [Selecionar p/ leitura]  [Exportar]  [Enviar]   |
+--------------------------------------------------+
```

#### Elementos da lista de documentos

| Elemento | O que é | Comportamento |
|---|---|---|
| **Selo de confiança** | verde: identificação segura; amarelo: provável, conferir; cinza: não identificado. | Clicável — abre a explicação de por que o sistema chegou àquela conclusão |
| **Título** | Nome conforme o carimbo do SEI. | Editável |
| **Número SEI** | Identificador do documento no SEI. | Somente leitura — vem do carimbo |
| **Intervalo de páginas** | Da primeira à última página do documento. | Ajustável arrastando a fronteira |
| **Departamento** | Setor de origem, lido do cabeçalho. | Editável, com lista de setores conhecidos |
| **Assinante** | Quem assinou, quando identificável. | Editável |
| **Data** | Data do documento. | Editável |
| **Marca de seleção** | Indica se o documento vai para leitura com IA. | Sugerida pelo sistema, ajustável |
| **Peças internas** | Quando o documento é um contêiner genérico, mostra o que está escondido dentro. | Expansível |

### 4.3 Diálogo de correção com criação de regra

```
+--------------------------------------------------+
|  Corrigir documento                              |
|                                                  |
|  Tipo:         [ Laudo de Fiscalizacao      v ]  |
|  Departamento: [ GEFEP                      v ]  |
|  Assinante:    [ .........................    ]  |
|  Data:         [ 14/03/2026                   ]  |
|                                                  |
|  [x] Criar regra a partir desta correcao         |
|      Documentos com este cabecalho e assinados   |
|      pela GEFEP serao identificados como Laudo   |
|      de Fiscalizacao daqui em diante.            |
|                                                  |
|              [ Cancelar ]    [ Confirmar ]       |
+--------------------------------------------------+
```

**Este diálogo é o coração do aprendizado do sistema.** Sem ele, o analista corrige a mesma coisa
para sempre. Com ele, cada correção reduz o trabalho seguinte — e reduz também a necessidade de
recorrer à IA, porque menos documentos ficam sem identificação.

- A regra proposta é mostrada em português claro, nunca em linguagem técnica.
- A caixa vem marcada por padrão, mas o analista pode recusar quando a correção for um caso
  isolado.
- Regras criadas ficam numa tela de curadoria, onde podem ser revistas ou desativadas.

### 4.4 Tela de confirmação antes de gastar

```
+--------------------------------------------------+
|  Enviar para leitura                             |
|                                                  |
|  Selecionados:      8 documentos                 |
|  Total de paginas:  64 de 229                    |
|  Ja lidos antes:    3 (nao serao recobrados)     |
|  Custo estimado:    R$ 0,XX                      |
|                                                  |
|              [ Cancelar ]    [ Confirmar ]       |
+--------------------------------------------------+
```

Nenhuma chamada à IA acontece sem esta confirmação. O custo é sempre mostrado **antes**, nunca
depois.

### 4.5 Painel de gestão

```
+--------------------------------------------------+
|  Analise de Fluxo                                |
|                                                  |
|  PROCESSOS POR TEMPO PARADO                      |
|   ate 30 dias    ########            42          |
|   30 a 90        #####               26          |
|   90 a 365       ###                 14          |
|   mais de 1 ano  ##                   9          |
|                                                  |
|  ONDE TRAVAM (media por etapa)                   |
|   Aguardando laudo de fiscalizacao    118 dias   |
|   Aguardando manifestacao do autor     64 dias   |
|   Aguardando busca de processo         31 dias   |
|                                                  |
|  RETRABALHO                                      |
|   Media de voltas ate aprovacao:  2,4            |
+--------------------------------------------------+
```

Os números acima são **ilustrativos do formato**, não resultados reais — o dado só existe depois
da carga do acervo.

---

## 5. Fundamentos técnicos verificados

Tudo nesta seção foi verificado em 10 de setembro de 2026, por chamada real à API do fornecedor
de IA ou por consulta direta ao banco de produção. Onde há hipótese, está dito.

### 5.1 Custo por página nos dois modelos — MEDIDO

Mesmo arquivo PDF, com 50 páginas idênticas, submetido aos dois modelos:

| Modelo | Tokens | Por página | Trata a página como |
|---|---|---|---|
| `gemini-2.5-flash` (atual) | 12.900 | **258** | Documento |
| `gemini-3.6-flash` (sucessor) | 26.600 | **532** | **Imagem** |

O modelo sucessor passou a tratar cada página como **imagem**, consumindo 2,06 vezes mais tokens.
Somado ao preço maior por token, o custo real por página é **5,2 vezes maior hoje**, e passa a
**10,3 vezes em 1º de janeiro de 2027**, quando termina o preço promocional do fornecedor.

### 5.2 O efeito de cada economia

| Cenário | Custo vs. hoje |
|---|---|
| Apenas migrar de modelo, sem mudar mais nada | **5,2 vezes** |
| Migrar e ler uma vez só (ficha + checklist) | 2,6 vezes |
| Migrar, ler uma vez e só os documentos que importam | **~igual — empata** |
| Acrescentando o retorno incremental | **Muito menor que hoje** |

> **Leitura correta desta tabela:** nenhuma economia sozinha compensa a migração. As duas
> primeiras juntas apenas empatam. O ganho verdadeiro está no retorno incremental. Portanto esta
> arquitetura **não é melhoria opcional** — é a condição para o custo permanecer neutro depois de
> uma migração obrigatória e datada.

**NÃO MEDIDO:** a premissa de que se leria ~40% das páginas é hipótese. É um dos números que a
Fase 0 precisa confirmar.

### 5.3 Achado: o sistema hoje não enxerga a prefeitura — MEDIDO

A consulta ao banco de produção mostrou que **todas** as estatísticas existentes se referem ao
trabalho feito dentro do próprio URBIS:

- o registro de auditoria guarda ações dos **usuários do sistema**;
- a visão de desempenho de analistas devolve **um único nome**;
- a medição de tempo por etapa registra **minutos de análise** — não a jornada do processo pela
  prefeitura (amostras reais devolveram "0 dias").

Os departamentos (GEFEP, DIRAAP, CONTEC, CADV, Atende Fácil, SECGER) **não usam** o URBIS. Eles
existem apenas como carimbos dentro do PDF do SEI.

> **Consequência**
>
> O Fatiador é a **única porta** pela qual o fluxo real da prefeitura pode entrar no sistema. Sem
> ele, o Módulo de Análise de Fluxo não teria de onde tirar dado — não é questão de programar
> melhor, é **ausência de fonte**.

### 5.4 Achado: o dado já é calculado e descartado — MEDIDO

O fatiador **já** identifica departamento, assinante e data de cada documento, e mostra os três na
tela. Mas a tabela onde os documentos são gravados **não possui essas colunas**: a informação é
perdida no momento de salvar.

Acrescentar essas três colunas é a alteração de **menor esforço e maior efeito** de todo o plano —
destrava o módulo de gestão por completo.

### 5.5 Achado: o classificador está com os olhos vendados — MEDIDO

A rotina que identifica qual documento é qual recebe **apenas o texto da página**. Não recebe o
departamento, nem quem assinou, nem a posição do documento no fluxo — três sinais que o próprio
fatiador **já extraiu**.

| Sinal | Fatiador extrai? | Classificador usa? |
|---|---|---|
| Texto do corpo da página | sim | **sim** (único que usa) |
| Departamento / cabeçalho | sim | **não** |
| Assinante | sim | **não** |
| Data do documento | sim | **não** |
| Posição no fluxo | disponível | **não** |

Documento administrativo é identificado pela **moldura**: carimbo, cabeçalho, assinatura,
departamento e ordem no processo. **Não pelo miolo.** Uma certidão de matrícula digitalizada é
reconhecida pelo cabeçalho do cartório e por onde aparece no fluxo, não por leitura do texto do
imóvel dentro dela.

**Consequência prática:** a baixa taxa de acerto atual **não** se deve à falta de leitura de
imagem, e sim ao fato de o classificador usar **um sinal de quatro** disponíveis. Corrigir isso é
determinístico, não custa nada em IA, e provavelmente torna quase desnecessária a única parte do
módulo que hoje usa inteligência artificial.

---

## 6. Fases de implantação

Ordem pensada para retorno cedo e risco baixo. Tudo é acrescentado ao sistema atual, atrás de
interruptor desligado por padrão. O caminho de leitura que funciona hoje **não é alterado em
nenhuma fase** — condição inegociável, porque o sistema está em produção.

| Fase | O que entrega | Esforço | Como saber que terminou |
|---|---|---|---|
| **0 — Medir para mirar** | Taxa de acerto atual do fatiador nos processos reais: quantos documentos identifica, quantos ficam pendentes, quantas vezes departamento/assinante/data saem vazios. | 0,5 sessão | Relatório por tipo de erro, ordenado por frequência |
| ✅ **1 — Gravar departamento, assinante e data** | **CONCLUÍDA em 10/09/2026 — migration aplicada e CONFIRMADA em produção (consulta direta ao banco: `setor`/`assinante` existem em `mhd_conteudos`).** `mhd_conteudos` ganha `setor`/`assinante` (a coluna `data_documento` já existia, mas nunca era populada por este caminho — as três eram calculadas pelo Organizador e descartadas na gravação, achado §5.4). `lib/documentosSei/persistencia.ts` agora carrega os três do evento que originou cada item; peças de contêiner (Fase 3) herdam do contêiner. Mostrado em `/admin/mhd`. Risco de ordem de deploy que existia (INSERT falhar sem a coluna) está resolvido — migration já rodou. Migration: `supabase/migrations/2026_09_10_mhd_conteudos_setor_assinante.sql`. | 0,5 sessão | Um processo fatiado deposita os três campos e eles podem ser consultados |
| ✅ **1B — Dar visão ao classificador** | **CONCLUÍDA em 10/09/2026.** Setor/assinante/data chegam a cada peça do contêiner (antes só o texto do corpo). Posição no fluxo entrou como sinal via `fundirPendentesEntreIguais` — regra do Fábio: "analisar o que tá escrito antes e depois da página em branco... se o padrão do documento é o mesmo". Uma peça pendente (tipicamente página escaneada) entre duas peças do MESMO papel vira uma peça só, confiança baixa (mostra "confira" na tela); papel diferente dos dois lados nunca funde. Verificado com teste sintético (funde quando bate, não funde quando diverge) — funciona como projetado. **Honestidade de medição**: nos 2 processos reais com gabarito, nenhuma lacuna tinha os dois lados com o mesmo papel (inclusive o caso do Laudo que motivou a regra — o vizinho seguinte era de fato outro documento) — a regra está correta e não erra em nenhum dos dois, mas "ganho demonstrado" fica provado pelo teste sintético, não por processo real ainda; deve aparecer em processos com documentos mais longos/repetidos. | 1 sessão | Taxa da Fase 0 remedida, com ganho demonstrado |
| ✅ **0 — Medir para mirar** | **CONCLUÍDA em 10/09/2026.** Rodado `fatiarPdfSei` (zero IA, zero rede) contra **4 processos reais** fornecidos pelo Fábio (845 páginas: 25.5.000012012-9, 24.5.000024350-0, 25.28.000000868-8, 24.5.000056065-3). **A garantia dura do fatiador se confirmou: 0 de 845 páginas foi para revisão** — nenhuma página se perdeu em nenhum dos quatro. Nos 2 processos com gabarito humano (documentos já separados manualmente em arquivos com o ID SEI no nome), **17 de 18 IDs SEI bateram exatos** com o que o fatiador identificou sozinho, incluindo os contêineres genéricos ("Documentação" com várias peças dentro) reconhecidos como um evento só, corretamente — é exatamente o comportamento que a Fase 3/6 (dividir contêiner em peças) precisa herdar. **Correção de um achado anterior desta mesma medição** (a versão anterior deste parágrafo dizia que faltava regra de conteúdo para "Laudo" — estava ERRADA: testei só `fatiar.ts` isoladamente, sem rodar `pecas.ts`/Fase 3 junto, que é como a rota de produção realmente funciona). Rodando o pipeline completo (`abrirContainer`, já em produção): o laudo **é** identificado — `ASSINATURAS_PECA` em `pecas.ts` tem regra própria (`laudo: /\blaudo\s+(tecnico|...)/`) e ela **casa** nos dois processos com gabarito (IDs 6376909 e 11155869), e o piece resultante **já alimenta o campo `laudo` do LIP** (`CAMPO_POR_PAPEL_PECA` em `compararLip.ts`). O achado real, mais estreito: a regra só marca a **página onde a frase aparece** (1 página), não o documento inteiro — no caso real de 6376909 o laudo humano tem 12 páginas, mas só a página 112 (a primeira) vira peça "laudo"; o resto cai em `classificacao_pendente` porque as páginas seguintes não repetem a frase-gatilho e (medido: 52 caracteres de texto por página, é digitalização) não têm texto para casar regra nenhuma. Isso já é o limite CONHECIDO e documentado no próprio `pecas.ts` — "a visão é o único caminho" — resolvido pela Fase 8, não uma regra nova a escrever agora. Nada implementado aqui: nem o que eu tinha proposto errado, nem correção nova — o comportamento real já é melhor do que a primeira leitura sugeria. Métrica de campo (melhor-esforço, nunca bloqueia): setor ausente em 49% dos documentos, assinante em 66%, data em 16% — consistente nos 4 processos, sem outlier. Script permanente: `scripts/fase0_medir_fatiador.mts` (flag `--detalhe` lista cada evento, para conferir contra gabarito). | 0,5 sessão | Relatório por tipo de erro, ordenado por frequência |
| ✅ **2 — Modelo passa a ser escolha** | **CONCLUÍDA em 10/09/2026.** O modelo deixa de ser constante: `lib/modeloGemini.ts` escolhe pelo tamanho do arquivo. O 2.5 continua padrão até 50MB; acima disso entra o 3.6 sozinho, sem pedir nada ao analista. Vale para os dois botões do LIP (LER PROCESSO e LER ARQUIVOS INDIVIDUAIS, via S1/S2/S3) e para o checklist do MAC (`/api/mac/p3`). O bloqueio de tamanho que existia em 4 telas deixou de ser teto de modelo e virou teto de servidor (350MB, o mesmo já praticado nas rotas de documentos SEI). | 1 sessão | PDF que hoje dá erro é lido com sucesso |
| ~~**3 — Comparar qualidade entre modelos**~~ | **ABOLIDA em 10/09/2026, decisão do Fábio.** Razão dada: não há escolha real de modelo depois que o 2.5 morrer (16/10/2026) — todo processo vai forçosamente usar o sucessor, comparar não muda o destino. Condição que ele impôs antes de tirar: eu pesquisar se há indício de PIORA de qualidade na troca; se houver, a fase fica. Pesquisado (10/09/2026, web): um benchmark real (Box, extração de campos de documentos difíceis) mediu a geração "Gemini 3 Flash" contra o 2.5 Flash e achou **+10 pontos de acerto em PDF, +13 em extração de múltiplos campos** — melhora, não piora. Único contraponto achado foi genérico e sem medição direta dos dois modelos (artigo de fornecedor de parser nativo de PDF, viés comercial, argumentando que modelos de visão *em geral* podem perder precisão caractere-a-caractere em tabela/formatação — não testa 2.5 vs 3.6 especificamente). Sem indício concreto de piora, a fase sai do plano. | ~~0,5 sessão~~ | ~~Tabela de divergências, com decisão sobre reescrita de instruções~~ |
| ✅ **4 — Regras editáveis pelo analista** | **CÓDIGO CONCLUÍDO em 10/09/2026, migration escrita mas não aplicada.** `ASSINATURAS_PECA` (pecas.ts) e `ASSINATURAS_CONTEUDO` (fatiar.ts) saem do array fixo e passam a vir de `documentos_sei_regras_identificacao`, tela `app/admin/regras-identificacao` (CRUD completo: papel restrito ao que o código já reconhece, regex validada na gravação, ordem, ativo/inativo). Cache de 60s em `lib/documentosSei/regrasIdentificacao.ts`, invalidado na hora a cada gravação — uma regra nova vale antes mesmo do TTL, sem deploy. **Sem risco de ordem de deploy** (diferente da Fase 1): se o banco falhar ou a tabela não existir, cai no array fixo do próprio arquivo — MEDIDO rodando `scripts/fase0_medir_fatiador.mts` e `scripts/conferir_documentos_sei.mts` contra um PDF real sem a migration aplicada, comportamento idêntico ao de antes (0% de página perdida). `classificarPagina`/`abrirContainer`/`classificarTitulo`/a extração de papel por conteúdo viraram assíncronas (3 call sites ajustados: as duas rotas de documentos-sei e `persistencia.ts`). Migration: `supabase/migrations/2026_09_10_documentos_sei_regras_identificacao.sql`. | 1,5 sessão | O analista adiciona uma regra e ela passa a valer sem publicação de versão |
| 🔄 **5 — Carga do conhecimento** | **1ª rodada concluída em 10/09/2026** (ver §7.3): fluxo completo Atende Fácil → CONTEC → CHEADV → GEFEP → DIRAAP, com 5 papéis novos (`processo_fisico`, `uso_solo`, `ortofoto`, `notificacao_calcada`, `despacho_cheadv`) e 2 campos do LIP que já existiam sem alimentação (`usoSolo`, `seiCheadv`) agora ligados. Fase por natureza incremental — não fecha com "concluída", cada rodada nova de entrevista/documento real soma cobertura. Pendente: Laudo de Habitabilidade (CHEADV) ainda sem papel próprio, 3 documentos citados sem exemplo real (COMAER, Exército, Outorga Onerosa). | A definir, com o Fábio | Cobertura medida subindo a cada rodada |
| 🔄 **6 — Módulo próprio e tela gráfica** | **Núcleo implementado em 10/09/2026**: tela nova `/fatiador-sei` (card na Home), 100% operável por teclado (Mac/Windows), reaproveita o pipeline de produção sem alterá-lo. Novo: estado de edição do analista (`lib/documentosSei/estadoEdicao.ts` — proposto/confirmado/editado/lixo), pilha de desfazer/refazer genérica (`hooks/useHistoricoReducer.ts`, não existia nada assim no projeto), motor de atalhos com convenção Mac/Windows (`lib/documentosSei/atalhosTeclado.ts`, também não existia), exportação por peça usando o nome de arquivo da Fase 5 (`lib/documentosSei/exportarPecas.ts`), rastreabilidade de cada correção em `mhd_eventos` via rota nova `/api/documentos-sei/fatiador-eventos`. `VisualizadorPdf` extraído do par de Organizadores duplicados para `components/documentosSei/VisualizadorPdf.tsx` (reduz uma duplicação real, sem mudar comportamento). Verificado: `tsc` limpo, tela sobe sem erro no preview (o crash inicial — `DOMMatrix is not defined`, faltava `dynamic(..., {ssr:false})` no react-pdf — foi corrigido, mesmo padrão que `ProcessoClient.tsx` já usa pros dois Organizadores). **Não verificado por falta de sessão de teste**: o fluxo completo de teclado dentro do navegador (criar corte, confirmar, desfazer) — só a carga da tela e o compile foram confirmados nesta sessão. Fica para depois: zip com manifesto por peça, portar "Analisar páginas ambíguas (Gemini)", persistir o estado de edição entre sessões. | 3-4 sessões | Tempo por processo medido e **menor** que a rotina atual |
| 🔄 **7 — Ligar fatiador à leitura** | **Implementado em 10/09/2026.** Cada item do Fatiador ganha `paraLeitura` (default ligado, desliga sozinho quando vira lixo). `lib/documentosSei/agruparParaLeitura.ts` empacota os itens marcados em um ou mais PDFs até `LIMITE_BYTES_MODELO_PADRAO` (50MB), em ORDEM DE PÁGINA — testado com PDF sintético de 100 páginas, nenhuma página perdida entre lotes. `lib/documentosSei/lerComGemini.ts` reproduz por leitura a sequência S1→S2→S3 de `ProcessoClient.tsx` (não mexi nesse arquivo — é produção crítica do Slot 1/2) sobre cada lote, mescla os campos ("processado depois vence"). Botão + atalho `Cmd/Ctrl+Enter` na tela do Fatiador; resultado aparece como PROPOSTA (copiável), nunca grava sozinho — o Fatiador não está dentro do `ProcessoClient`, não tem `onAceitarCampos`. **Limitação conhecida**: não manda `assunto_id` (o Fatiador só conhece o código do processo) — S2/S3 já toleram isso caindo no prompt genérico, mas o resultado pode ser menos afinado que a leitura de dentro do processo. **Não verificado**: uma leitura real via Gemini (custaria dinheiro e exige processo autêntico) — só a lógica de agrupamento foi testada de ponta a ponta. Cabeçalho Home/Sair acrescentado à tela (`app/mrp/page.tsx` como referência) — pedido à parte, a tela tinha nascido sem saída. | 2 sessões | Um processo é lido usando só os documentos selecionados |
| 🔄 **8 — Não pagar duas vezes** | **Implementado em 10-11/09/2026.** Tabela nova `documentos_ia_cache` (hash SHA-256 completo dos bytes do arquivo → resultado da leitura). Investigação prévia confirmou: o hash já existente em `lib/mhd.ts` (`buscarPorHash`/`acharOuCriarConteudo`) é de OUTRO consumidor (persistência determinística do Fatiador/Slot 5, zero IA) — não tinha nenhuma relação com custo de Gemini, era preciso mecanismo novo. Ligado nos DOIS pontos reais onde o LIP chama o Gemini em `app/processo/ProcessoClient.tsx`: `lerLip` ("LER PROCESSO") e `processarVCP` ("LER ARQUIVOS INDIVIDUAIS") — os dois consultam o cache antes do S1 e gravam depois do S3. **Decisão deliberada de tocar `ProcessoClient.tsx`** (diferente da cautela das Fases 6/7): sem isso o "reimportar não custa de novo" não tem efeito nenhum no fluxo real de todo dia — só a leitura acontece lá. Diff mínimo e cirúrgico (2 blocos pequenos por função), `tsc` limpo, `/processo/[codigo]` compila e renderiza (200) no preview sem erro. Rota nova `/api/lip/cache-gemini` (GET checa, POST grava) é **fail-safe** (qualquer erro de banco ou tabela ainda não migrada cai no comportamento de sempre — chama o Gemini normalmente). Escopo desta rodada é só o LIP; o MAC (`/api/mac/p3`) continua incondicional — juntar os dois é a Fase 9. **Não testado**: uma leitura real duplicada (upload do mesmo PDF duas vezes) — exigiria sessão de login real e custaria a primeira chamada de verdade. | 1 sessão | Reimportar o mesmo processo não gera cobrança nova |
| ✅ **9A — Uma leitura, dois destinos: base** | **CONCLUÍDA em 11/09/2026.** Decisão tomada com o Fábio: prompt combinado (LIP + P3_MAC numa chamada só, não só upload compartilhado — é o único jeito de cortar a chamada pela metade de verdade), escopo inicial só no botão LER PROCESSO (LER ARQUIVOS INDIVIDUAIS fica pra 9B ou depois, por causa da regra "documento isolado" do MAC), atrás de interruptor desligado por padrão (`urbis_config.leitura_unica_lip_mac_ativo`, migration **aplicada e confirmada em produção em 11/09/2026**). Criado `lib/documentosSei/leituraUnicaLipMac.ts`: helper do interruptor (fail-safe desligado, mesmo padrão de `lib/documentosSei/config.ts`) + `montarPromptCombinadoLipMac` (junta os dois prompts existentes pedindo `{ lip, mac }` numa resposta só, sem reescrever nenhum dos dois prompts salvos). Módulo isolado, não chamado por ninguém ainda — zero risco pra produção. | 0,5 sessão | Módulo compila, `tsc` limpo, interruptor lido de `urbis_config` |
| ✅ **9B — Uma leitura, dois destinos: ligação** | **CONCLUÍDA e TESTADA COM GEMINI REAL em 11/09/2026.** Achado que mudou o desenho: LIP (`ProcessoClient.tsx`) e MAC (`app/analise-regularizacao`/`app/analise-aceite-sei`) são páginas separadas, sem estado compartilhado — "uma leitura, dois destinos" precisa PERSISTIR o bloco MAC até o analista abrir a tela do MAC depois. Ligado em `app/api/lip/s3/route.ts` (não em `ProcessoClient.tsx`/`mac/p3/route.ts` como cogitado na v21): quando o interruptor está ligado E o processo já tem uma `analises_mac` (dela vem o `modelo_id` → checklist ativo), o S3 monta o prompt combinado (`montarPromptCombinadoLipMac`) em vez do prompt normal do LIP; a resposta `{lip, mac}` alimenta o job do LIP como sempre E grava o bloco `mac` numa tabela nova, `mac_sugestoes_leitura_unica` (chave por `processo_codigo`, não por hash — a tela do MAC não tem o arquivo quando abre). Nas duas telas do MAC (Regularização e Aceite SEI, duplicado por leitura — regra de isolamento do CLAUDE.md, nenhuma delas importa da outra), um aviso novo ("IA já leu isso pelo LIP — aplicar sugestões?") aparece se houver sugestão pendente; aplicar usa a MESMA regra de mescla do P3 de sempre (só preenche item em branco, nunca sobrescreve) e nunca grava sozinho. Rota nova `/api/mac/leitura-unica` (GET checa, POST marca aplicado) é fail-safe. **TESTE REAL (11/09/2026)**: processo sintético isolado por slot (nunca um processo real), PDF pequeno gerado na hora, servidor local apontando pro banco de produção, `urbis_config.leitura_unica_lip_mac_ativo` ligado temporariamente. Slot 1 (Regularização): 1 chamada Gemini, LIP com 22 campos preenchidos, MAC com 31/55 itens julgados, documentos e incompatibilidades presentes. Slot 2 (Aceite SEI): 1 chamada, LIP com 24 campos, MAC com 32/55 itens. Confirmado também pela ROTA que a tela realmente usa (`GET /api/mac/leitura-unica`), não só pela tabela. Depois do teste: interruptor devolvido a `false`, toda linha de teste apagada (processos, analises_mac, lip_jobs, mac_sugestoes_leitura_unica, urbis_api_calls, auditoria_log) e confirmado por consulta direta que não sobrou vestígio. **Limitação conhecida, herdada da descoberta**: só funciona pra processo que JÁ TEM uma análise MAC criada (é dela que vem o checklist a julgar) — processo novo, sem análise MAC ainda, cai automaticamente na leitura só-LIP de sempre, sem erro. **Ainda não testado**: o fluxo de "aplicar sugestão" clicado dentro do navegador de verdade (o teste chamou a API direto, não passou pela tela); migration da tabela nova já aplicada, mas só confirmada por script, não pela tela de admin. | 1 sessão | Contagem de chamadas cai pela metade, testado com processo real |
| ✅ **10 — Carga do acervo** | **IMPLEMENTADA e RODADA em 11/09/2026.** `scripts/carga_acervo.mts` fatia em lote processos arquivados (zero IA, zero rede — mesmo motor determinístico da Fase 0/`fatiarPdfSei`) e grava a jornada de cada um em `fluxo_processo_eventos` (migration nova, **aplicada em produção**, tabela isolada, `processo_codigo` texto solto SEM FK para `processos` — não mistura processo morto arquivado com processo ativo que Pilha/MAC/MDP leem todo dia). Rodada contra o acervo real: **2441 linhas gravadas**. Só a gravação em `--aplicar` toca o banco, e só nessa tabela nova. | 1 sessão | Base com histórico de dezenas de processos |
| ✅ **11 — Visões de fluxo** | **IMPLEMENTADA em 11/09/2026.** `lib/documentosSei/analiseFluxo.ts` (`analisarJornada`/`agregarPortfolio`) calcula, só a partir do que a Fase 10 já extraiu (sem ler PDF, sem IA): duração e faixa de tempo por processo, tempo por setor, retrabalho (despacho de pendência/diligência) e descarte de data-ruído (cópia de RG/CPF anexada com data de décadas atrás). Regra do Fábio aplicada: agregação de portfólio usa **mediana, não média**, pra um processo esquecido anos num setor não distorcer o retrato do caso comum ("ordinário antes do extraordinário"). `lib/documentosSei/parseDataDocumento.ts` normaliza data em texto livre do carimbo do SEI (barra e por extenso; 103 formatos distintos medidos em 5 processos), falha vira `null`, nunca data chutada. Script de conferência: `scripts/fase11_medir_fluxo.mts`. `tsc` limpo. | 1,5 sessão | Consultas devolvem números coerentes com a realidade conhecida |
| ✅ **12 — Alertas e painéis** | **CONCLUÍDA em 11/09/2026.** Painel consolidado: tela `/admin/analise-fluxo` + rota `/api/admin/fluxo/portfolio`, só leitura, mesmo gate `isPerfilIrrestrito` de `/admin/mhd` — processos por faixa de tempo parado, tempo típico por setor (mediana) e retrabalho típico. **Alerta dentro do processo**: `components/documentosSei/AlertaFluxo.tsx` + rota `/api/lip/alerta-fluxo`, plugado em `app/processo/ProcessoClient.tsx` ao lado do `VigiaProcesso`. Achado ao desenhar: não existe fato gravado de "setor atual" pra processo ATIVO (só arquivado, via Fase 10) — `mhd_conteudos.setor` é atributo do CONTEÚDO do documento, não do processo; inventar setor seria mentir. O alerta usa só o que É fato: `processos.analise_iniciada_em`/`analise_concluida_em` (já gravados pelos 3 slots) via a mesma `situacaoMac()` da Pilha/BDI — "Em análise há N dias" ou "Aguardando retorno do interessado há N dias" (reaproveita `vw_bdi_aguardando_retorno.dias_aguardando_retorno`, filtrando `situacao='ainda aguardando'` — achado: a view guarda uma linha por despacho histórico, sem o filtro `.maybeSingle()` quebra num processo com mais de um ciclo). Só alerta a partir de 30 dias (mesmo corte de faixa da Fase 11), pra não gerar fadiga em processo recente. Escopo Slot 1/2 só, a rota devolve `alerta:null` para qualquer outro slot — Slot 5 nunca é tocado. **Testado (11/09/2026)**: `tsc` e `next build` limpos; lógica rodada em SCRIPT TEMPORÁRIO (removido depois) só-leitura contra os 79 processos reais de Slot 1/2 em produção — 2 "Em análise" (1 passaria do limiar), 37 "Aguardando retorno" (10 passariam do limiar), números batendo com `situacaoMac()`. **Não testado**: clique de dentro do navegador com sessão de login real (precisa do Fábio). | 2 sessões | Painel apresentável à gerência |
| 🔒 **13 — Interpretação assistida** | **CÓDIGO PRONTO em 11/09/2026, INERTE de propósito.** `lib/documentosSei/interpretacaoAssistidaFluxo.ts` (prompt + chamada Gemini texto puro + parsing) e rota `/api/admin/fluxo/interpretar` (GET só checa prontidão, sem custo; POST cruza o portfólio da Fase 11 e devolve sugestões, nunca grava nada). Pedido do Fábio: escrever agora, mas sem deixar rodar antes da hora — **dois portões**, não um: (1) interruptor `urbis_config.interpretacao_assistida_fluxo_ativo`, false por padrão, migration escrita e **não aplicada de propósito**; (2) portão OBJETIVO medido nos dados (`avaliarProntidaoBase`), que nem o Fábio liga sem editar código: mínimo de 150 processos distintos em `fluxo_processo_eventos` E mínimo de 90 dias desde a carga do primeiro evento — é o número que representa "meses de operação" do risco do §9. **Testado (11/09/2026)**: rodado contra o banco real — hoje a base tem 101 processos, 0 dias desde a carga (feita nesta mesma sessão), os dois motivos aparecem certos no bloqueio. Painel `/admin/analise-fluxo` já mostra a seção "Interpretação assistida (Fase 13)" com os motivos do bloqueio. **Nunca chamou o Gemini de verdade** — o portão objetivo impede até um teste sintético controlado; sem custo nenhum gasto nesta fase. | 1,5 sessão | Sugestões conferidas pelo analista como plausíveis |
| ⏳ **14 — Aprendizado por correção** | Correções do analista viram candidatas a regra, com tela de aprovação. **Sem código ainda, de propósito** — decisão em 11/09/2026: diferente da Fase 13 (bloqueada por volume, resolvível com portão numérico), a 14 depende do FORMATO de uma correção real, que não existe (`/fatiador-sei` só testado com PDF sintético) — codar agora seria adivinhar UX sem exemplo pra validar contra. Em vez de depender de alguém lembrar de checar, foi instalado um **gatilho**: `/api/admin/fluxo/fase14-sinal` conta `mhd_eventos` com `tipo='fatiador_correcao'` (já gravado desde a Fase 6, nada novo) e o painel `/admin/analise-fluxo` mostra o número — hoje 0. Assim que uma correção real acontecer, o painel avisa sozinho que chegou a hora de desenhar esta fase com exemplo de verdade. Registrado como pendência ABERTA no OBS COD (11/09/2026) até o gatilho disparar. | 1,5 sessão | Uma correção vira regra e acerta o caso seguinte |

### 6.1 Marcos de valor

| Após a fase | O que já é possível |
|---|---|
| **2** ✅ | PDFs grandes voltam a ser lidos. Dor imediata resolvida. |
| **1B e 5** | O fatiador acerta a maioria. A conferência fica rápida. |
| **6** | O módulo existe como produto, com tela própria. |
| **7, 8 e 9** | O custo por processo cai **abaixo** do praticado hoje, mesmo com o modelo mais caro. |
| **10 a 12** ✅ | Existe demonstração de gestão para apresentar à secretaria — painel `/admin/analise-fluxo` mostra número real do acervo carregado, e o processo em Slot 1/2 agora avisa sozinho quando passa de 30 dias parado. |

---

## 7. Captura do conhecimento do analista

O gargalo declarado deste projeto **não é programação**: é transferir para regras o que o analista
sabe sobre o fluxo documental. Ele domina os departamentos, os textos que delimitam cada documento
e a ordem em que as coisas acontecem. O sistema não sabe nada disso.

### 7.1 Como será feito — duas frentes

| Frente | Como funciona | Quando |
|---|---|---|
| **Entrevista estruturada** | Sessões dedicadas, tema por tema, gerando tabelas que alimentam o sistema diretamente. | No início, para dar o salto inicial |
| **Aprendizado por correção** | Cada correção feita na tela vira candidata a regra, revista depois pelo próprio analista. | Continuamente, em produção |

As duas se complementam: a entrevista sozinha cansa e sempre esquece casos; a correção sozinha
demora demais para cobrir o vocabulário. Juntas, a entrevista dá o salto e a correção cobre a
cauda longa.

### 7.2 Temas das entrevistas

| Tema | O que capturar | Exemplo |
|---|---|---|
| **Departamentos** | Nome oficial, siglas, variações de grafia, como aparece no cabeçalho, e o que cada um emite. | GEFEP emite notificação de calçada, laudo de irregularidade e laudo de fiscalização |
| **Textos que delimitam** | Frases e cabeçalhos que marcam início e fim de cada tipo de documento. | Cabeçalho de cartório indica certidão de matrícula |
| **Tipos de documento** | Vocabulário completo, sinônimos e como distinguir pares ambíguos. | ART de levantamento e ART da caixa são campos distintos na ficha |
| **Fluxo** | Qual documento sucede qual, o que substitui, o que anula, o que destrava. | O laudo de fiscalização é o que permite o processo avançar |
| **Assinatura e data** | Formatos reais, cargos, padrões de assinatura eletrônica. | Padrões distintos entre assinatura digital e documento digitalizado |

### 7.3 Documentos já mapeados pelo analista

**Primeira rodada de entrevistas concluída (10/09/2026)** — o fluxo completo do processo de
Regularização, departamento por departamento, na ordem real. Conferido contra documentos reais
separados à mão pelo Fábio (`RETORNOS/2026/09.04` e `09.08`, processos 24.5.000056065-3 e
24.5.000024350-0 — os mesmos 2 processos com gabarito humano da Fase 0).

**Regra geral de fatiamento, dita pelo Fábio**: não precisa ler imagem — 90% do PDF é digitalização
mas os 10% de texto nativo (rodapé do SEI, cabeçalho, assinatura, departamento, posição no fluxo)
bastam para identificar. Os documentos da prefeitura são **padronizados**: mesmo título, mesmo
formato, mesmo departamento emissor sempre — por isso dá para achar por texto, sem IA (confirma o
que já estava em produção; nenhuma mudança de arquitetura, só amplia o vocabulário de regras).

**O fluxo, na ordem, com o documento que cada etapa produz:**

| Ordem | Departamento | Documento(s) | Observação |
|---|---|---|---|
| 1 | **Atende Fácil** | Capa do processo físico (`processo_fisico`) | Sempre igual: número do processo físico, dados do imóvel, contato. Gera o SEI logo em seguida. **Medido**: carimbo do SEI para este evento não traz o assunto no título ("Protocolo"/"Protocolo /DUAMs") — a frase que identifica ("SOLICITA O ALVARA DE...") está só no corpo digitalizado; hoje só é pega se a página cair DENTRO de um contêiner genérico, não como evento avulso (ver nota técnica abaixo). |
| 2 | **CONTEC** | Certidão/Parecer de Uso do Solo (`uso_solo`) | **Só Regularização — Aceite não passa pelo CONTEC.** Carimbo varia entre processos ("Parecer NNN - Uso do Solo - COMTEC" / "Uso do Solo Aprovação de Projeto NN - COMTEC"), frase fixa é "uso do solo". Alimenta o campo `usoSolo` do LIP (já existia no LIP, sem nada que o alimentasse — achado desta sessão). |
| 3 | **CHEADV** (Chefia da Advocacia Setorial) | Despacho de conformidade documental (`despacho_cheadv`) | Analisa um ROL de documentos (linha abaixo) e só quando está tudo certo emite o despacho **"...documentação está conforme, concluímos a análise documental"**. Regra crítica: **pega sempre a versão MAIS RECENTE de cada documento do rol antes deste despacho** — ida e volta anterior (pendência, reenvio) não interessa. Medido no processo real: 4 despachos de "Pendência Documentação" da CHEADV antes do único despacho final "Documentação conforme" — a regra (`cheadv` + `conforme`) já existia em `compararLip.ts:REGRAS` para o campo `seiCheadv`; replicada em `ASSINATURAS_PECA` para o caso de aparecer como peça de contêiner. |
| 3.1 | **Rol que a CHEADV analisa** (todos precisam ser fatiados) | Ortofoto (`ortofoto`), Certidão de Matrícula, ART/RRT de Levantamento, ART/execução da caixa de recarga, **Levantamento** (não "projeto" — regularização é de obra já construída), Procuração, Embargo (se houver), **Laudo de Habitabilidade e Segurança do Imóvel** (emitido pelo responsável técnico do levantamento) | Ortofoto: foto aérea do Google/Mapa Urbano Digital de Goiânia, exigida por lei — carimbo próprio "MAPA URBANO BÁSICO DIGITAL DE GOIÂNIA" (medido). Laudo de Habitabilidade ainda **sem papel próprio**: hoje cai no `laudo` genérico (mesmo campo do LIP) — separar do laudo do GEFEP (linha 4) exigiria mais um processo real com os dois lado a lado para não chutar. |
| 4 | **GEFEP** (fiscalização) | Notificação de Calçada (`notificacao_calcada`, nem sempre), Laudo de Irregularidade (nem sempre), Fotos da Obra (quase sempre), **Laudo de Fiscalização do Imóvel** (sempre — é o que **destrava o avanço do processo**) | Fiscal designado confere se o levantamento bate com a obra construída; volta e cobra ajuste até aprovar. Notificação de calçada medida em documento real (carimbo "NOTIFICACAO CALCADA N.: NN/AAAA") — cuidado: o mesmo PDF trazia também um "RELATÓRIO CIRCUNSTANCIADO – CALÇADA" numa página vizinha, que já casa a regra `vistoria` existente — são peças DIFERENTES da mesma notificação, corretamente separadas por página. |
| 5 | **DIRAAP** (minha diretoria/gerência) | **Encaminhamento do CPD** — não é certidão, é aviso administrativo de que a busca não achou processo anterior no endereço | Primeiro passo: busca de processos anteriores. **Só bloqueia se já existe Regularização ou Aceite anterior** — aprovação de projeto aprovada ou com modificação NÃO bloqueia (o interessado só perde a vantagem de já ter projeto aprovado, mas pode seguir). Regra já coberta pela `ASSINATURAS_CONTEUDO` existente (`busca`, fatiar.ts) — medido no documento real, casa "buscas no endereço" e "projeto anteriormente aprovado" ao mesmo tempo. Depois disso o processo vai para análise técnica da própria DIRAAP (Fábio). |

**Nota técnica sobre alcance das novas regras** (honestidade de medição, 10/09/2026): `processo_fisico`
e `notificacao_calcada` foram escritas contra o texto do CORPO do documento — funcionam quando a
página cai DENTRO de um contêiner genérico (`abrirContainer`), mas os dois exemplos reais medidos
apareceram como EVENTOS AVULSOS do SEI, cujo papel hoje é decidido só pelo TÍTULO do carimbo
(`classificarTitulo`, `persistencia.ts`) — e o título desses dois eventos não traz a frase
distintiva ("Protocolo", sem menção a "alvará" ou "calçada"). As regras ficam registradas (não
custam nada, cobrem o caso de aparecerem dentro de um contêiner) mas **hoje raramente disparam** no
caminho de evento avulso — melhorar isso exigiria ler o corpo de eventos avulsos também, mudança
maior, fora do escopo desta rodada. `uso_solo` e `despacho_cheadv` não têm esse problema porque a
frase distintiva está no próprio carimbo/título.

**2ª rodada (10/09/2026, mesma sessão)** — dois dos três documentos citados sem exemplo já
apareceram em processos que o Fábio tinha separado à mão:

- **Liberação COOMAER** (`liberacao_comaer`) — Declaração de Inexigibilidade do Comando da
  Aeronáutica, sem carimbo próprio do SEI (documento federal anexado). Medido em
  `RETORNOS/2026/08.17` (processo 26.5.000016045-3), confirmado disparando na peça de contêiner do
  PDF completo do processo.
- **Outorga Onerosa do Direito de Construir** (`outorga_onerosa`) — certidão OODC. Medida no
  documento avulso `RETORNOS/2026/06.22/.../Análise 3/ONEROSA 10072818.pdf`, mas **não confirmada
  contra o PDF completo do processo** — o SEI daquele documento (10072818) não aparece no export
  consolidado disponível (a pasta "Análise 3" parece ser de uma rodada posterior ao export salvo em
  disco). Regra escrita com a mesma cautela das demais (frase completa da certidão, evita casar a
  tabela técnica "quadro de áreas onerosa" da página anterior do mesmo PDF avulso), mas ainda sem a
  mesma confirmação de ponta a ponta que as outras regras desta fase tiveram.
- **Liberação do Exército** — Fábio confirmou que nunca viu esse documento em 4 anos de atuação;
  retirado da lista de pendência (aposta especulativa não vale a pena, sem processo real nem
  perspectiva de aparecer).

Nenhum dos dois papéis novos (`liberacao_comaer`, `outorga_onerosa`) tem campo correspondente no LIP
ainda — os 11 campos do LIP (`app/api/lip/analisar/route.ts`) não têm slot para nenhum dos dois.
Adicionar um campo novo ao LIP é decisão de schema, fora do escopo desta rodada; por ora os dois só
melhoram a classificação/cobertura do MHD (Fase 0/1B), sem alimentar sugestão nenhuma na ficha.

**Decisão registrada — nome de arquivo na exportação** (10/09/2026): quando o fatiador exportar
peças individuais, o nome do arquivo deve seguir o mesmo padrão que o Fábio já usa manualmente —
`{PAPEL OU DEPARTAMENTO EM MAIÚSCULAS} {Nº SEI}.pdf` (ex.: `USO 4167740.pdf`, `CHEADV 6635217.pdf`,
`LAUDO 6376909.pdf`), não o título completo do documento — para o Nº SEI ficar fácil de achar
visualmente no nome do arquivo. **Correção do que a v17 registrou aqui**: dizia que isso não estava
implementado; na verdade `nomeArquivoAnalista` (`lib/documentosSei/rotuloAnalista.ts:280`) já existe
pronto, escrito em 08/09/2026 junto com `rotuloDoEvento`/`rotuloDoPapelPeca`, mas nunca tinha sido
CHAMADO em lugar nenhum — código morto até a Fase 6 (v18) usá-lo de verdade em
`lib/documentosSei/exportarPecas.ts`. O exportador antigo por evento
(`lib/documentosSei/pacoteVigenteClient.ts`) continua com o formato dele (parênteses, título
inteiro) — não foi mexido, é de outro plano (Documentos Vivos).

---

## 8. Governança de métricas de pessoas

O plano permite medir desempenho por departamento e, tecnicamente, por servidor. Essas duas coisas
têm naturezas diferentes e merecem tratamento diferente.

### 8.1 Recomendação

| Tipo de métrica | Tratamento recomendado | Por quê |
|---|---|---|
| **Por departamento e por etapa** | Padrão, sempre disponível. | Gargalo é quase sempre estrutural. Esta visão entrega a maior parte do valor de gestão sem expor indivíduos. |
| **Por servidor, nominalmente** | Somente com autorização de quem tem competência institucional, atrás de interruptor **desligado** por padrão e com registro de quem ligou. | Agregar assinaturas num ranking de desempenho é tratamento com finalidade distinta do ato administrativo original. |
| **Por autor externo** | Medir **padrão de erro** documental, não ranking de profissional. | Conferir a qualidade do documento recebido é atividade-fim da análise. |

Esta recomendação é de **prudência institucional**, não parecer jurídico. Vale consultar quem de
direito antes de habilitar qualquer métrica nominal.

### 8.2 Por que o controle de acesso também é argumento comercial

Enquanto o sistema for ferramenta pessoal de um analista, guardar avaliação nominal de colegas é a
configuração de **maior risco para o próprio analista**. A partir do momento em que for adotado
institucionalmente, a mesma informação passa a pertencer a quem tem competência para tratá-la.

**Um sistema que já nasce com esse controle demonstra maturidade de governança para quem vai
decidir a adoção.** O interruptor deixa de ser uma limitação e passa a ser um diferencial: mostra
que a ferramenta foi pensada com responsabilidade sobre dado de pessoal.

---

## 9. Riscos e mitigação

| Risco | Gravidade | Mitigação |
|---|---|---|
| **Quebrar a leitura que funciona hoje** | **Crítica** | Tudo é acrescentado, atrás de interruptor desligado. O caminho atual não é alterado em nenhuma fase. Condição inegociável. |
| O modelo novo extrair com qualidade inferior | Alta | **Fase 3 (comparação campo a campo) abolida em 10/09/2026** — ver §6, decisão do Fábio. Mitigação agora é vigilância: pesquisa (web, 10/09/2026) achou evidência de melhora na extração estruturada (Box: +10pp em PDF, +13pp em múltiplos campos), não de piora, mas isso não é medição no PROMPT específico do LIP. Sem etapa formal de comparação, o risco residual é real: se um processo real vier com campo errado depois da escalada pro modelo novo (Fase 2, PDF > 50MB), é sinal para reabrir esta linha. |
| A tela virar digitação em vez de conferência | Alta | Medir o tempo real gasto por processo antes de dar a fase por concluída. Se aumentar, a fase não terminou. |
| Taxa de acerto do fatiador ficar baixa | Média | Fases 1B, 4 e 5 atacam com o conhecimento do analista. Risco assumido conscientemente: se o fatiador não for eficaz, o conhecimento dele o torna eficaz. |
| Preço do fornecedor dobrar em janeiro de 2027 | Alta | As economias das fases 7, 8 e 9 precisam estar em operação antes. |
| Métrica nominal gerar conflito funcional | Alta | Seção 8: padrão por departamento, nominal só com autorização. |
| IA opinando sobre base estatística pequena | Média | Fase 13 só depois da carga do acervo e de meses de operação — **agora codificado como portão objetivo** (`avaliarProntidaoBase`, §6): mínimo de processos E de dias, não só um interruptor que dependeria de disciplina manual. |
| Medição de tempo ser imprecisa | Baixa | Trabalhar com **faixas**, nunca sugerir precisão de calendário. |
| Estouro do limite de chamadas por hora | Média | Agrupar documentos numa mesma chamada, não uma por documento. |

---

## 10. Questões em aberto

Pontos sem resposta definida, que valem discussão técnica antes ou durante a implementação.
**São estas as perguntas para levar ao Gemini e ao ChatGPT.**

1. Existe modelo de IA mais adequado que o sucessor indicado pelo fornecedor? O critério **não** é
   desempenho geral, e sim custo por página de documento digitalizado combinado com qualidade de
   extração de campos estruturados.
2. É possível enviar o **texto** já extraído localmente, em vez da **imagem** da página, nos casos
   em que a página tem camada de texto? Isso reduziria muito o custo, mas parte relevante das
   páginas é digitalização sem texto — seria preciso decidir por tipo de documento.
3. Vale usar o recurso de **cache** do fornecedor, que barateia a segunda leitura do mesmo
   documento, como alternativa a fundir as leituras de ficha e checklist?
4. Qual metodologia usar nas entrevistas de captura de conhecimento para extrair regras de forma
   exaustiva sem esgotar o especialista?
5. Qual abordagem de renderização suporta ajuste visual de corte em um PDF de centenas de páginas
   e dezenas de megabytes dentro do navegador, sem travar?
6. A ordem das fases está correta, considerando que a demonstração de gestão é também o argumento
   de adoção institucional do sistema?
7. Qual o formato ideal do painel de gestão para quem decide: consolidado por período, por setor,
   ou por processo crítico?

---

> **Observação sobre a construção deste documento**
>
> As correções mais valiosas deste plano não vieram da análise técnica inicial. Vieram do analista
> que domina o fluxo documental e da discussão com outra inteligência artificial, e foram
> confirmadas indo verificar o código e o banco de dados. As hipóteses levantadas sem verificação
> foram justamente as que se mostraram erradas — razão pela qual este documento separa
> explicitamente **o que foi medido** do que é **suposição**.

---

## Histórico de versões

| Versão | Data | O que mudou |
|---|---|---|
| 1 | 10/09/2026 | Criação. Levantamento do código, medições de custo e limite dos modelos, decisão de extrair o Organizador para módulo próprio, fases e workstream de extração de conhecimento. |
| 2 | 10/09/2026 | Acrescentado o Módulo B — Análise de Fluxo (discussão com Gemini). Achado central: o BDI é cego para fora do URBIS e o Fatiador é a única porta do fluxo real; setor/assinante/data calculados e descartados. Governança de métrica nominal. Integração com URBI/BDI. |
| 3 | 10/09/2026 | Correção do Fábio, aceita: classificar não precisa de imagem. Documento administrativo é identificado pela moldura, não pelo miolo. Achado F10: o classificador recebe só o texto da página e ignora três sinais que o fatiador já extrai. Nova Fase 1B. |
| 4 | 10/09/2026 | **Reescrita completa com foco em operação.** Acrescentados: glossário, as quatro rotinas de uso passo a passo (processo novo, retorno, carga do acervo, gestão), desenho das cinco telas, quem opera o quê, o que acontece quando dá errado, critérios de conclusão por fase e marcos de valor. Corrigida a afirmação da v2 de que a estatística não seria retroativa — o histórico está dentro do PDF e pode ser reconstruído. Precisão de tempo recalibrada para faixas, não calendário. Governança reposicionada como argumento comercial. Documento renomeado para "Upgrade na leitura de PDF — Slot 1 e 2". |
| 5 | 10/09/2026 | **Primeira fase implementada: a Fase 2 saiu do papel.** O modelo virou escolha por tamanho (`lib/modeloGemini.ts`), o teto de 50MB deixou de ser recusa e virou troca de modelo nos dois botões do LIP e no MAC, e o preço do modelo novo entrou no registro de uso para a Rastreabilidade não mostrar custo nulo. Conferência automatizada em `scripts/conferir_escolha_modelo.mts`. Estado do documento passa de "proposto" para "em implantação", com percentual. |
| 6 | 10/09/2026 | Regra de navegação decidida pelo Fábio: todo módulo novo deste plano (Fatiador com tela própria, Análise de Fluxo) ganha card próprio na Home (`app/page.tsx`), nunca fica só dentro de outra tela. Nenhum código mudou — ainda não existe módulo com tela própria a cadastrar (isso é Fase 6/12); a regra fica registrada para quando existir. |
| 7 | 10/09/2026 | **Fase 0 executada com dados reais.** 3 processos (686 páginas) fornecidos pelo Fábio, medidos com `scripts/fase0_medir_fatiador.mts` (zero IA, zero rede). Confirmada a garantia de página fechada (0% de perda) e, no processo com gabarito humano, 9/10 IDs SEI exatos. Achado novo: falta regra de conteúdo para "Laudo" em `ASSINATURAS_CONTEUDO` (`lib/documentosSei/fatiar.ts`) — não implementado, aguardando autorização explícita por tocar classificador já em produção no Slot 1/2. |
| 8 | 10/09/2026 | **4º processo real (Fábio forneceu mais um com gabarito próprio).** Confirma o padrão: 0/845 páginas perdidas nos 4 processos juntos, 17/18 IDs SEI exatos nos 2 processos com gabarito humano. |
| 9 | 10/09/2026 | **Correção de achado da v8**: o "buraco de Laudo" reportado era falso positivo — testei `fatiar.ts` sem rodar `pecas.ts` (Fase 3) junto, que é como a produção roda de fato. Rodando o pipeline completo, o laudo é detectado (regra própria em `ASSINATURAS_PECA`) e já alimenta o campo do LIP. O achado real, mais estreito, é que a peça reconhecida cobre só 1 página do documento (a que tem a frase-gatilho), não o laudo inteiro — limitação já documentada no próprio código como dependente da Fase 8 (visão), não uma regra faltando. |
| 10 | 10/09/2026 | **Fase 1 implementada** (código): `mhd_conteudos` ganha `setor`/`assinante`, `data_documento` (já existia) passa a ser populado. `lib/documentosSei/persistencia.ts` e `lib/mhd.ts` atualizados, `/admin/mhd` exibe os dois campos novos. Migration escrita mas **não aplicada** — nenhum código deste tipo pode ir para produção antes dela, sob risco de a gravação no MHD parar de funcionar (achado registrado no próprio commit). |
| 11 | 10/09/2026 | **Fase 1B parcialmente implementada.** Setor/assinante/data passam a chegar em cada peça do contêiner, não só no evento inteiro (fatiar.ts exporta os extratores por página, pecas.ts e persistencia.ts consomem). A parte de "posição no fluxo" fica pendente de uma decisão do Fábio sobre página escaneada em branco — investigação real anexada na tabela de fases, não implementada às cegas. |
| 12 | 10/09/2026 | **Fase 1B concluída.** `fundirPendentesEntreIguais` funde página pendente sandwiched entre peças do mesmo papel (regra ditada pelo Fábio); setor/assinante/data já chegavam às peças desde a v11. Testado com caso sintético; nos 2 processos reais com gabarito a regra não encontrou nenhuma lacuna elegível (não é erro da regra — é que os dois lados de fato divergiam nesses casos), registrado sem inflar resultado. |
| 13 | 10/09/2026 | **Fase 3 abolida**, a pedido do Fábio ("não terei escolha, e o mais novo logicamente será melhor"). Condicionei a remoção a uma pesquisa por indício de piora; pesquisa (web, ver linha da fase) achou evidência de melhora, não de piora, então a fase saiu. Fases não foram renumeradas (a numeração das fases 4-14 é referenciada em commits e no OBS COD) — o plano segue com 15 fases, não 16. |
| 14 | 10/09/2026 | **Migration da Fase 1 aplicada pelo Fábio e confirmada** por consulta direta ao banco de produção (`mhd_conteudos.setor`/`.assinante` existem). Risco de ordem de deploy que bloqueava o push está resolvido. |
| 15 | 10/09/2026 | **Fase 4 implementada (código).** `ASSINATURAS_PECA`/`ASSINATURAS_CONTEUDO` saem do array fixo, passam a vir de `documentos_sei_regras_identificacao` com tela própria (`app/admin/regras-identificacao`) e cache curto invalidado na gravação. Ao contrário da Fase 1, o design é fail-safe por construção (cai no array fixo se o banco falhar) — MEDIDO contra PDF real sem a migration aplicada, mesmo resultado de antes. Migration ainda não aplicada em produção. |
| 16 | 10/09/2026 | **Fase 5, 1ª rodada.** Entrevista com o Fábio sobre o fluxo real (Atende Fácil → CONTEC → CHEADV → GEFEP → DIRAAP) conferida contra documentos reais separados à mão (processos 24.5.000056065-3 e 24.5.000024350-0). 5 papéis novos em `PapelPeca`, 2 ligados a campos do LIP que existiam sem alimentação (achado: `usoSolo`/`seiCheadv` já estavam em `ROTULO_CAMPO_LIP` mas nenhum papel os produzia). Achado de arquitetura registrado: regras de conteúdo só disparam para peça dentro de contêiner ou para evento avulso cujo TÍTULO (não corpo) contém o sinal — `processo_fisico`/`notificacao_calcada` ficam com alcance limitado até essa lacuna ser fechada. Decisão registrada sobre nome de arquivo na exportação futura (papel/departamento + Nº SEI, sem implementar ainda). |
| 20 | 11/09/2026 | **Fase 8 implementada** (madrugada, a pedido do Fábio: "faz a 8 e sobe já, se der ruim a gente reverte amanhã"). Tabela `documentos_ia_cache` (hash SHA-256 completo → resultado do Gemini), rota fail-safe `/api/lip/cache-gemini`. Ligada nos dois pontos reais de leitura em `ProcessoClient.tsx` (`lerLip` e `processarVCP`) — decisão deliberada de tocar esse arquivo, sem o que a fase não teria efeito real. Diff mínimo, `tsc` limpo, `/processo/[codigo]` renderiza sem erro no preview. Não testado: uma leitura duplicada de verdade (custaria a primeira chamada real). |
| 19 | 10/09/2026 | **Fase 7 implementada.** `paraLeitura` novo em `ItemFatiado`, `agruparParaLeitura.ts` empacota itens marcados em lotes até 50MB (testado com PDF sintético, sem perda de página entre lotes), `lerComGemini.ts` reproduz S1→S2→S3 sobre cada lote sem tocar `ProcessoClient.tsx`. Botão + `Cmd/Ctrl+Enter` na tela, resultado só como proposta copiável. Limitação registrada: sem `assunto_id` (prompt cai no genérico). Não testado com leitura Gemini real (custo/processo autêntico). Cabeçalho Home/Sair acrescentado à tela do Fatiador. |
| 18 | 10/09/2026 | **Fase 6, núcleo implementado.** Tela nova `/fatiador-sei` fora do processo, card na Home, 100% por teclado (Mac/Windows). 4 conceitos novos que não existiam em lugar nenhum do projeto: estado de edição do analista (proposto/confirmado/editado/lixo), pilha de desfazer/refazer genérica, motor de atalhos com convenção Mac/Windows, exportação por peça usando `nomeArquivoAnalista` (achado: já existia desde 08/09, nunca tinha sido chamada — corrige o que a v17 registrou como "não implementado"). `VisualizadorPdf` extraído dos dois Organizadores duplicados. Rastreabilidade via `mhd_eventos` (rota nova, mesma fonte que já alimenta o BDI). Corrigido no caminho: a tela quebrava a compilação SSR (`DOMMatrix is not defined`) por faltar `dynamic(..., {ssr:false})` no react-pdf — mesmo padrão que `ProcessoClient.tsx` já usa. Não verificado: fluxo de teclado dentro do navegador (sem sessão de teste disponível nesta sessão). |
| 21 | 11/09/2026 | **Base da Fase 9 criada** (sem ligar nos pipelines de produção). Decidido com o Fábio: prompt combinado (não só upload compartilhado — é o único jeito de cortar a chamada pela metade), escopo inicial só no LER PROCESSO, atrás de interruptor desligado por padrão (`urbis_config.leitura_unica_lip_mac_ativo`, migration não aplicada). `lib/documentosSei/leituraUnicaLipMac.ts` criado com o helper do interruptor e `montarPromptCombinadoLipMac`. Sessão terminou em 15 minutos por limite de tempo do Fábio — decisão consciente de não tocar `ProcessoClient.tsx`/`mac/p3/route.ts` sob pressa, dado que são os dois pipelines de leitura de produção do Slot 1/2. Continuação: ligar os dois pontos e testar com processo real, com o Fábio presente. |
| 22 | 11/09/2026 | **Fase 9 dividida em 9A e 9B**, a pedido do Fábio — a base (interruptor + prompt combinado, sem tocar produção, entregue na v21) e a ligação real (mexer em `ProcessoClient.tsx`/`mac/p3/route.ts` + teste com processo real) são trabalhos de risco muito diferentes pra ficarem sob o mesmo número. 9A marcada ✅ concluída; 9B criada como a fase que precisa do Fábio, ocupando o lugar que "9" ocupava antes (10-14 não mudam de número). |
| 23 | 11/09/2026 | **Migration da Fase 9A aplicada pelo Fábio e confirmada** (`urbis_config.leitura_unica_lip_mac_ativo` existe, `false` por padrão). Nenhum código lê a coluna ainda — 9B continua pendente. |
| 25 | 11/09/2026 | **Fase 9B testada com Gemini real e confirmada.** Migration `mac_sugestoes_leitura_unica` aplicada. Teste de ponta a ponta: processo sintético isolado por slot (Regularização e Aceite SEI, nunca um processo real), interruptor ligado temporariamente, 1 chamada Gemini por slot via S3 combinado. Resultado: LIP preenchido (22 e 24 campos) E a rota `/api/mac/leitura-unica` (a mesma que a tela do MAC usa) devolvendo o checklist já julgado (31/55 e 32/55 itens, com documentos e incompatibilidades). Depois do teste: interruptor voltou a `false`, toda linha criada (processos, analises_mac, lip_jobs, mac_sugestoes_leitura_unica, urbis_api_calls, auditoria_log) apagada e confirmada por consulta direta — nenhum vestígio ficou no banco. Falta só: aplicar a sugestão de dentro do navegador de verdade (o teste chamou a API direto). |
| 29 | 11/09/2026 | **Fase 14 — sem código, mas com gatilho instalado.** Fábio expressou preocupação de que a Fase 14 vire esquecimento ("nem eu nem você vamos lembrar"). Avaliado e decidido: diferente da 13, codar a 14 agora seria especular UX sem exemplo real de correção pra validar contra (`/fatiador-sei` só testado com PDF sintético) — risco maior que o benefício de "já deixar pronto". Solução: `/api/admin/fluxo/fase14-sinal` conta `mhd_eventos` com `tipo='fatiador_correcao'` (dado que a Fase 6 já grava, nada novo) e o painel `/admin/analise-fluxo` mostra "0 correções reais" hoje — o número sobe sozinho quando o Fábio usar o Fatiador de verdade, e vira o sinal de que chegou a hora de desenhar a fase com exemplo real, sem precisar de memória de ninguém. Registrado como pendência ABERTA no OBS COD. De caminho, achado e corrigido: `/admin/analise-fluxo` não tinha card na Home (regra da v6 — "todo módulo novo ganha card"), adicionado em `app/page.tsx`. |
| 28 | 11/09/2026 | **Fase 13 — código pronto, inerte de propósito.** Pedido do Fábio: "já tem que estar codado" para não precisar reconstruir o raciocínio daqui a meses, mas sem violar a mitigação de risco do §9 (base estatística pequena). Escrito `lib/documentosSei/interpretacaoAssistidaFluxo.ts` (prompt puro + chamada Gemini texto + parsing de sugestões) e `/api/admin/fluxo/interpretar` (GET checa prontidão sem custo, POST cruza o portfólio da Fase 11). Decisão de desenho: dois portões, não um — interruptor manual (`urbis_config`, migration não aplicada de propósito) E portão objetivo medido nos dados (mínimo de 150 processos + 90 dias desde a primeira carga), pra a barreira não depender só de alguém lembrar de não ligar cedo demais. Testado contra o banco real: hoje 101 processos, 0 dias — bloqueia certo, com os dois motivos aparecendo. Painel `/admin/analise-fluxo` ganhou seção mostrando a prontidão. Nenhuma chamada real ao Gemini foi feita — zero custo. |
| 27 | 11/09/2026 | **Fase 12 concluída** — a metade que faltava, alerta dentro do processo. `components/documentosSei/AlertaFluxo.tsx` + `/api/lip/alerta-fluxo`, plugado em `ProcessoClient.tsx` (Slot 1/2 só). Achado central: não existe fato gravado de "setor atual" para processo ATIVO (a Fase 10 só sabe isso de processo arquivado) — decisão de não inventar, usar só o que É fato (`analise_iniciada_em`/`analise_concluida_em`, já gravados nos 3 slots, via a mesma `situacaoMac()` da Pilha/BDI). Texto sempre sobre TEMPO parado ("Em análise há N dias" / "Aguardando retorno há N dias"), nunca sobre setor/etapa, que seria inventado. Bug pego antes de commitar: `vw_bdi_aguardando_retorno` tem uma linha por despacho histórico — sem filtrar `situacao='ainda aguardando'`, `.maybeSingle()` quebra em processo com mais de um ciclo. Limiar de 30 dias (mesmo corte de faixa da Fase 11). `tsc`+`next build` limpos; testado com script temporário só-leitura contra os 79 processos reais de Slot 1/2 (2 em análise, 37 aguardando retorno, 11 passariam do limiar hoje) — script apagado depois do teste. Não testado: clique real no navegador logado. |
| 26 | 11/09/2026 | **Fases 10, 11 e 12 (núcleo) implementadas e commitadas (`8359b90`).** Fase 10: `scripts/carga_acervo.mts` fatia em lote processos arquivados (zero IA, mesmo motor da Fase 0) e grava a jornada em `fluxo_processo_eventos` — tabela nova, isolada, sem FK para `processos`; migration aplicada em produção e já com 2441 linhas gravadas do acervo real. Fase 11: `lib/documentosSei/analiseFluxo.ts` calcula duração/faixa de tempo/tempo por setor (mediana, não média)/retrabalho a partir só do que a Fase 10 extraiu, sem IA; `parseDataDocumento.ts` normaliza data em texto livre do carimbo do SEI, falha vira `null`. Fase 12: núcleo do painel `/admin/analise-fluxo` + `/api/admin/fluxo/portfolio`, só leitura, mesmo gate de `/admin/mhd` — falta o alerta dentro do processo (resto da fase). `tsc` limpo. Pushed pra `origin/main`. |
| 24 | 11/09/2026 | **Fase 9B — código concluído.** Achado que mudou o desenho combinado com o Fábio antes de codar: LIP e MAC são páginas sem estado compartilhado, então a ligação precisa persistir o bloco MAC (tabela nova `mac_sugestoes_leitura_unica`, por `processo_codigo`). Ligado em `app/api/lip/s3/route.ts` (busca `analises_mac`/`mac_checklist_itens` do processo, monta prompt combinado se houver checklist e o interruptor estiver ligado) + aviso "aplicar sugestão" nas duas telas do MAC (Regularização e Aceite SEI) + rota nova `/api/mac/leitura-unica`. `tsc` e `next build` limpos. Não testado com Gemini real nem migration da tabela nova aplicada — pendente pro Fábio antes de ligar o interruptor de verdade. |
| 17 | 10/09/2026 | **Fase 5, 2ª rodada.** 2 papéis novos vindos de exemplos que o Fábio lembrou: `liberacao_comaer` (medido e confirmado no PDF completo do processo) e `outorga_onerosa` (medido no documento avulso, não confirmado no PDF completo — o SEI do exemplo não está no export salvo em disco). Nenhum dos dois tem campo no LIP ainda — melhoram só a cobertura do MHD. Liberação do Exército retirada da lista de pendência: Fábio nunca viu em 4 anos, não vale regra especulativa. |
