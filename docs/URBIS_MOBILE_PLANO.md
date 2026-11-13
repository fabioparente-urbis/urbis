# URBIS MOBILE — plano (foco em segurança)

**Versão:** 0.6 (planejamento, nada implementado)
**Data:** 25/10/2026
**Pedidos do Fábio (25/10):**
1. versão do URBIS para instalar na tela de início do celular (iPhone de preferência), botão
   **MOBILE** no fim da Home com instruções para iPhone e Android, estética própria, avaliar o
   que é possível e o que o celular pode contribuir para o prefeito, secretário, diretor,
   gerente e contribuintes;
2. "pense em tudo novamente com foco em evitar acidentes, foco em segurança para evitar agentes
   intrusos e perigosos, ou alguém não autorizado ter acesso… com senhas já abertas… de repente
   uma identificação por face, por digital".

**Só planejamento.** Nada aqui foi implementado ou testado em aparelho. Onde está escrito
"medido", foi lido no código ou no banco; o resto é estimativa ou pesquisa.

---

## 0. Regra acima de todas (v0.6)

> **O Mobile não pode atrapalhar a utilização do URBIS em NADA. A prioridade não é o Mobile, é
> o Mac/PC.** — Fábio, 25/10/2026

- Nenhuma fase deste plano passa na frente de trabalho, defeito ou pedido do URBIS no computador.
- Nada feito para o Mobile pode mudar o que o analista vê ou faz no computador (telas, botões,
  velocidade, login, tempo de sessão, fluxo, documentos). O Mobile vive em área própria (`/m`,
  `/api/mobile/*`) e se acomoda ao computador, nunca o contrário.
- O Mobile não pode deixar o servidor ou o banco mais lento para o computador (lição do Radar).
- Toda trava que exija mexer em algo comum (login, sessão, `autenticar()`) declara antes o efeito
  no computador e só segue com autorização. Na dúvida, o computador ganha.
- **Cada fase tem um portão a mais:** "o URBIS no computador continua igual" — conferido antes de
  publicar (entrar, abrir ficha, salvar, emitir como sempre).

**Itens da Fase S que mexem no computador** (são segurança do URBIS inteiro, não "do Mobile", e
cada um passa por autorização própria com o efeito explicado):
- `autenticar()` recusar inativado (PR #43): para quem está "Ativo" **nada muda** — medido, os 6
  usuários estão "Ativo";
- limite de tentativas de login: só afeta quem erra a senha muitas vezes seguidas;
- cabeçalhos de proteção (CSP): **risco de quebrar tela** se mal calibrado (PDF, mapa, Excel) —
  entra primeiro em modo "só avisar", sem bloquear, e só bloqueia depois de conferido;
- fechar rotas sem login: cada rota conferida para não derrubar uma tela que dependa dela.

**Fica de fora de propósito:** a sessão de 30 dias do computador e a saída por inatividade
desligada (pedido seu de 08/09) **não mudam** por causa do Mobile. A sessão curta de 12h vale só
para o celular.

## 1. Resposta curta

- **Instalar no iPhone é possível** (PWA, sem App Store, custo zero). Isso não muda.
- **Face ID e digital são possíveis**, mas não do jeito que muita gente imagina: o site nunca vê
  o rosto nem a digital. Ele pede ao celular "confirme que é o dono", e o celular devolve uma
  prova assinada que o servidor confere. É o padrão chamado *passkey* (WebAuthn). Funciona no
  iPhone (iOS 16+) e no Android. **Ainda não testei num app instalado pelo Safari — fica como
  primeiro teste, num iPhone real.**
  **Limite (v0.4):** a passkey prova "alguém destravou esta credencial", **não** prova que foi o
  rosto (pode ser o PIN do celular) nem que foi aquele aparelho (pode estar sincronizada no
  iCloud/Google). É uma tranca a mais, não uma garantia de identidade.
- **O maior risco hoje NÃO é o celular, é o que já está aberto.** Medido em 25/10: a `main`
  ainda tem as falhas da auditoria de 21/10 (51 métodos de API sem login, cadastro público do
  Supabase ligado na última releitura, correção C1 parada num branch). Levar o URBIS para o
  celular e divulgar um botão e um QR Code **aumenta a vitrine** dessas portas. Por isso o
  plano novo começa por uma **Fase S (segurança antes de tudo)**, e **nenhum usuário recebe o
  Mobile antes dela**. Só a prova técnica isolada (Fase 0, sem dado real) pode correr junto.
- **Regra de ouro do mobile (precisada na v0.5):** **a primeira versão do URBIS Mobile é só
  leitura.** Toda função que altere dado (tag na Pilha, foto de vistoria, qualquer outra) só
  entra depois de uma **avaliação de segurança própria**, aprovada pelo Fábio — não vem
  "prevista" de antemão. Emitir, consumir número, apagar e configurar ficam fora do Mobile.
  O pior que um intruso com o celular na mão consegue fazer **pela sessão do Mobile** deve ser
  **ler um resumo** — e mesmo isso fica registrado, tem prazo curto e pode ser derrubado de longe.
- **O que essa regra NÃO cobre:** ela vale para a sessão do Mobile. Nada impede alguém de abrir o
  URBIS **completo** no navegador do telefone com o login comum, como já é possível hoje. Isso
  não é "o Mobile"; é o risco da seção 10, com decisão própria (decisão 10).
- **Essa regra só vale se for imposta no servidor (v0.4).** Criar rotas `/api/mobile/*` de
  leitura não basta: hoje o cookie de login vale para o site inteiro e o `autenticar()` não sabe
  se a chamada veio do celular ou do computador. Uma sessão de celular válida conseguiria chamar
  qualquer rota do computador. A separação tem que estar no `autenticar()`, para todas as rotas.

---

## 2. O que existe hoje (medido no código, 25/10)

| Ponto | Situação hoje | Por que pesa no celular |
|---|---|---|
| Duração do login | cookie de **30 dias**, renovado sozinho (`app/api/auth/login/route.ts`, `middleware.ts`) | celular perdido = 30 dias de acesso aberto. É exatamente o "senha já aberta" |
| Saída por inatividade | **desligada** desde 08/09 (`hooks/useAutoLogout.ts`) | no celular, esquecido na mesa, ninguém sai |
| Segundo fator (código, Face ID) | **não existe** (nenhum MFA no código) | senha vazada = acesso completo |
| Derrubar sessão de longe | **não existe**. A auditoria de 21/10 provou que bloquear ou trocar a senha no Supabase **não encerra** sessões já abertas | se o celular sumir, não há botão "desconectar aquele aparelho" |
| Métodos de API sem login | **51** (auditoria 21/10); correção C1 no branch `sec/c1-gestao-usuarios`, **não publicada** | porta aberta para robô, com ou sem celular |
| Cadastro público do Supabase | **ligado** na última releitura (22/10 13h16) | qualquer pessoa cria conta no Auth |
| Cabeçalhos de proteção (CSP, anti-iframe) | **não existem** em `next.config.ts` nem no `middleware.ts` | abre caminho para página falsa embutir o URBIS ou roubar a sessão por script |
| Quem é o usuário | conferido no servidor do Supabase a cada chamada (`lib/auth.ts`, `autenticar()`) — **bom**; os cookies `urbis_id/perfil/nome` são só enfeite de tela | base sólida para construir em cima |
| **Usuário inativado continua passando** (achado v0.4, conferido no código) | o login recusa quem não está "Ativo", mas o `autenticar()` (`lib/auth.ts`) busca só `id, perfil, perfis, gerencia` e **não olha o `status`**. Quem já estava logado, ou tem o cookie de renovação, continua passando depois de inativado, enquanto a sessão do Supabase viver | defeito de hoje, não só do mobile; entra na Fase S |
| Login vale para tudo | um único par de cookies (`urbis_token`, `urbis_refresh`) serve qualquer rota; não há "canal" | sem separar no servidor, "celular só consulta" é promessa de tela |
| Possível segredo exibido | `.env.local` linha 9 exibiu um código de 64 caracteres no terminal em 22/10 | se for chave, precisa ser trocada antes de abrir mais portas |

---

## 3. Quem pode atacar e como (mapa de ameaças)

| # | Ameaça | Exemplo real | Dano possível |
|---|---|---|---|
| A1 | **Celular perdido ou roubado, desbloqueado** | esquecido no táxi, na reunião | leitura de processos com nome, endereço, CPF |
| A2 | **Alguém de confiança pega o celular** | filho, colega, assessor | o mesmo do A1, sem ninguém saber |
| A3 | **Senha vazada ou adivinhada** | senha repetida de outro site, phishing | entrar como o analista, de qualquer lugar |
| A4 | **Página falsa do URBIS** | "instale o URBIS" por link no WhatsApp, com tela de login idêntica | rouba senha |
| A5 | **Robô atacando a API** | testa as 51 rotas sem login, tenta senhas em massa | ler ou alterar dado sem ser ninguém |
| A6 | **Vazamento pelo próprio uso** | print do WhatsApp com CPF, notificação na tela bloqueada, miniatura do app aberto | dado pessoal circulando (LGPD) |
| A7 | **Dado guardado no celular** | cópia de processo no armazenamento do navegador | sobrevive ao logout, vai junto com o aparelho |
| A8 | **Acidente do próprio usuário** | dedo escorrega e muda uma tag, marca algo, emite | dano real sem intenção nenhuma |
| A9 | **Excesso de quem tem acesso** | perfil de gabinete consultando processo que não deveria, ou baixando a base aos poucos | raspagem de dados |
| A10 | **Contribuinte (futuro)** | consulta pública usada para descobrir de quem é cada imóvel | dado pessoal exposto para o mundo |

---

## 4. As travas, camada por camada

A ideia é ter **várias portas fechadas em sequência**, para que falhar uma não abra tudo.

### Camada 1 — Fechar o que já está aberto (Fase S, antes do mobile)
- Publicar a C1 (já homologada, falta autorização) e fechar os demais métodos sem login (C2 em
  diante).
- **Critério (precisado na v0.5):** "zero método sem login" estava errado, porque o próprio
  login, o "esqueci a senha" e eventuais consultas públicas precisam funcionar sem sessão. O
  critério certo é: **nenhuma rota sensível sem autenticação E autorização** (quem é + se pode),
  e uma **lista explícita e fechada das exceções públicas**, cada uma com o motivo. Rota nova que
  não esteja na lista e não peça login é falha. O teste de autorização da Fase S confere as duas
  coisas.
- Desligar o cadastro público do Supabase e **reler** para confirmar (`disable_signup = true`).
- Conferir a linha 9 do `.env.local`; se for chave, trocar.
- Cabeçalhos de proteção: proibir o URBIS dentro de iframe de outro site, restringir de onde vêm
  scripts (CSP), forçar HTTPS.
- Limite de tentativas de login (por e-mail e por endereço de rede), com aviso ao admin.
- **`autenticar()` passa a conferir `usuarios.status = 'Ativo'`** em toda chamada. Inativou,
  parou na hora, em todas as rotas. (v0.4)
- **Testar a autorização das APIs atuais** antes de qualquer tela nova: cada rota, com sessão de
  cada perfil e sem sessão. É o portão de saída da Fase S. (v0.4)
- **Decidir o domínio definitivo** antes de qualquer passkey: a passkey fica presa ao domínio, e
  a documentação do Supabase avisa que trocar o domínio depois inutiliza todas as passkeys já
  cadastradas. Hoje o domínio próprio (P10) está adiado, então isso vira decisão. (v0.4)

### Camada 2 — Aparelho cadastrado (quem pode usar o mobile)
- O mobile **nasce desligado**: interruptor geral `mobile_ativo` (padrão desligado, como o
  `chat_gemini_ativo`) **e** autorização individual por usuário (padrão: ninguém).
- **Cadastro do aparelho é feito no computador, já logado**: o usuário clica "cadastrar meu
  celular", aparece um QR Code que vale 5 minutos e serve uma vez só; o celular lê, a pessoa
  confirma com Face ID/digital e o aparelho fica registrado com nome ("iPhone do Fábio").
  → Só quem já está dentro do URBIS no computador consegue ligar um celular. Senha vazada sozinha
  não basta (A3), e link de WhatsApp não instala nada (A4).
- **Corrigido na v0.4:** o QR sozinho **não** barra quem roubou a senha — essa pessoa entra no
  URBIS por um computador qualquer e gera o próprio QR. Por isso:
  - **no piloto, o admin aprova cada aparelho novo (obrigatório, não opcional)**, e a aprovação é
    confirmada com o dono **por fora do sistema** (de viva voz ou telefone), não por um aviso
    dentro do URBIS que o intruso também veria;
  - o pedido mostra ao admin de onde veio (horário, rede, navegador do computador que gerou o QR).
- Aviso por e-mail ao dono a cada aparelho novo ("um novo celular foi ligado à sua conta").
- **Corrigido na v0.4:** "2 aparelhos por usuário" é **limite de cadastro no URBIS**, não garantia
  técnica. Uma passkey sincronizada pelo iCloud/Google pode abrir em outro aparelho do dono. O
  URBIS controla quantas **sessões de celular** existem, não quantos aparelhos têm a credencial.

### Camada 3 — Face ID / digital a cada abertura (o "cadeado")
- Ao abrir o app, e de novo depois de **5 minutos em segundo plano**, a tela fica embaçada até a
  confirmação por Face ID/digital (passkey). Sem confirmação, nada carrega.
- A confirmação é **conferida no servidor**: a prova assinada pelo celular vai junto com o
  pedido, e o servidor recusa dado se a última confirmação tiver mais de 5 minutos. Não é só uma
  tela bonita que se contorna desligando o script.
- **Limite honesto:** se o Face ID falhar, o celular oferece a **senha do aparelho** como
  alternativa. Quem souber a senha do celular passa (A2). O padrão WebAuthn admite várias formas
  de verificação (rosto, digital, PIN) e o servidor não tem como exigir "só rosto". Por isso as
  camadas 4 e 5 existem: a passkey é uma tranca a mais, não a única.
- **Como implementar (revisto na v0.4, decisão adiada para a Fase 0):** o Supabase tem passkeys
  em **beta/experimental** (anúncio de 28/05/2026; exige `supabase-js` 2.105+, o projeto usa
  ^2.97). O alerta de segurança citado na v0.2 **tem correção publicada** (05/06/2026, commit
  `7e6f2e4` do supabase/auth), mas a correção parece valer só para quem já tem um segundo fator
  ativo — o próprio alerta não diz como fica quem não tem. Duas opções, a comparar na Fase 0:
  1. **passkey do Supabase**, exigindo nova senha antes de cadastrar e conferindo, num teste, que
     a trava da correção vale para o nosso caso;
  2. **tranca própria do URBIS** por cima do login atual, com biblioteca de padrão aberto.
  Nas duas, o cadastro exige aprovação do admin (camada 2). Não decidir no escuro: medir.

### Camada 4 — Sessão curta e separada do computador
- A sessão do celular é **outra**, com prazo próprio: sugestão **12 horas** (fim do expediente),
  e não os 30 dias do computador. O analista refaz o Face ID, e não a senha, no dia seguinte.
- Cada sessão do celular fica numa tabela própria do URBIS (aparelho, dono, criada, último uso,
  revogada). **Toda rota do mobile confere essa tabela**, além do `autenticar()` de sempre. É
  isso que permite **derrubar de longe**, já que o Supabase não derruba.
- Botões **"Desconectar este celular"** (para o dono, no computador) e **"Derrubar todos os
  aparelhos de fulano"** (admin). Encaixa no MURBIS (`docs/MURBIS_PLANO_MESTRE.md`), que vira o
  painel de aparelhos.
- Inativar o usuário no admin derruba automaticamente todos os aparelhos dele.
- **Separação imposta no servidor (v0.4):** a sessão do celular é marcada como "canal celular" na
  tabela de sessões. O `autenticar()` — o mesmo que as rotas já chamam — passa a recusar
  qualquer rota fora da lista `/api/mobile/*` quando a chamada vem de uma sessão de celular. Não
  é a tela que impede: é o servidor, em todas as rotas, num lugar só. O cookie do celular é
  outro, e não serve como cookie do computador.
- Teste obrigatório: com uma sessão de celular válida, chamar uma rota do computador (ex.: salvar
  MAC, numeração) e conferir que dá recusa.

### Camada 5 — O celular só enxerga pouco (mínimo necessário)
- Rotas próprias `/api/mobile/*`, **só leitura**, numa lista fechada. O mobile não chama as rotas
  do computador.
- **Campos mínimos**: número, slot, situação, com quem está, há quantos dias, último despacho
  (número e data). **No piloto, o CPF não vai na resposta, nem mascarado** (v0.5): o servidor
  simplesmente não o envia. Voltar com ele, mascarado, é decisão depois do piloto. Nome do
  requerente só para quem já o vê no computador, e escondido por padrão ("toque para ver", o
  toque é registrado).
- Cada perfil vê no celular **no máximo o que já vê no computador**, nunca mais.
- Nada de admin, numeração, lixeira, backup, usuários ou configurações no celular.

### Camada 6 — Minimizar o que fica no aparelho
- **Corrigido na v0.4:** "nada fica no aparelho" era promessa forte demais. "Não guardar"
  (`no-store`) evita cópias novas, mas não apaga respostas antigas já guardadas nem impede print
  de tela. O objetivo é **minimizar**, e o comportamento real é **medido** no iPhone e no Android
  (Fase 0), não presumido.
- Respostas do mobile com "não guardar" (`no-store`) desde a primeira versão.
- O service worker guarda **só a casca** (ícone, cores, tela "sem conexão"), nunca dado.
- Ao ir para segundo plano, a tela fica embaçada, para que a miniatura do alternador de apps não
  mostre processo (A6).
- Ao sair, o app **pede** ao navegador que apague o que guardou dele (cookies, cache,
  armazenamento). **Não é garantia** (v0.5): o que o aparelho de fato apaga depende do iPhone ou
  do Android, e isso é medido na Fase 0. A proteção que vale de verdade é a do servidor: a sessão
  revogada não abre mais nada, mesmo que algo tenha ficado no aparelho.

### Camada 7 — Vazamento pelo uso (A6)
- **Compartilhar no WhatsApp**: texto pronto **sem nome, CPF ou endereço**, só número, situação
  e datas, e **sem link que funcione sem login**.
- **Notificações**: nunca levam dado. "URBIS: há uma atualização para você." O detalhe só aparece
  depois do Face ID.
- Marca d'água discreta com o nome do usuário no fundo das telas de processo: se vazar print,
  sabe-se de quem saiu. Isso também desestimula o print.

### Camada 8 — Contra acidentes (A8)
- **Primeira versão só leitura.** Nenhum botão que altere dado.
- Se um dia uma ação de alterar for aprovada (ex.: tag de prioridade na Pilha), ela passa antes
  pela avaliação de segurança da regra de ouro, e o **mínimo** será: confirmação + **"desfazer"
  por 10 segundos** + registro na auditoria (MAP). (v0.5: deixou de ser "ação prevista".)
- **Nunca no celular:** emitir documento, consumir número, marcar checklist, apagar, configurar.
  Regra do projeto: número consumido não volta, e o dedo no celular erra mais.
- Telas do computador abertas no celular (link de LIP/MAC) mostram "esta tela é para computador"
  em vez de carregar o formulário. **É conforto contra engano, não trava de segurança** (v0.5):
  a detecção de celular pelo navegador é falsificável. A trava de verdade é a do servidor
  (camada 4).

### Camada 9 — Vigilância e alarme (A5, A9)
- Todo acesso pelo mobile vai para o MAP (`auditoria_eventos`): quem, qual aparelho, qual
  processo, quando.
- **Alarmes ao admin**: muitas consultas em pouco tempo (raspagem), aparelho novo, login de
  madrugada, tentativas erradas seguidas, Face ID recusado várias vezes.
- Limite de consultas por minuto por aparelho. Passou, trava e avisa.
- Relatório semanal: "quem consultou o quê pelo celular".

### Camada 10 — Contra a página falsa (A4)
- **Corrigido na v0.5:** o QR Code **cadastra o acesso**, não é a única forma de instalar. Um
  PWA pode ser instalado de qualquer página aberta no navegador, inclusive de uma página falsa.
  O que protege é que **só um aparelho cadastrado pelo QR e aprovado pelo admin recebe dado**.
  Instrução oficial, repetida na página MOBILE: **"o acesso do celular só é liberado pelo QR Code
  mostrado dentro do URBIS, no computador. Nunca digite a senha do URBIS em página aberta por
  link recebido."**
- Página MOBILE mostra o endereço oficial por extenso, para conferir.
- Domínio próprio (P10, adiado na auditoria) ajuda muito aqui: endereço da prefeitura é mais
  difícil de imitar que endereço de hospedagem.

---

## 5. O que fica possível, o que fica proibido

| Função | Situação | Trava principal |
|---|---|---|
| Consulta por **número exato** do processo | ✅ piloto (fase 2) | camadas 3, 4, 5, 9 |
| Busca por IPTU ou endereço | ⏸️ decisão própria após o piloto | facilita raspagem (A9) |
| Compartilhar andamento no WhatsApp | ⏸️ decisão própria após o piloto | camada 7 |
| Painel executivo (números, gargalos) | ✅ fase 3 | só agregados, sem dado pessoal |
| Minha produtividade (MRP) | ✅ fase 3 | só o próprio usuário |
| Pilha da equipe (ver) | ✅ fase 3 | perfil |
| Tag de prioridade | ⏸️ só após avaliação de segurança própria (altera dado) | camada 8 (confirma + desfaz + auditoria, no mínimo) |
| Avisos (push) | ✅ fase 4 | camada 7 (sem dado no aviso) |
| Foto de vistoria com GPS → MHD | ⏸️ fase 5, só após avaliação de segurança própria (altera dado) | toca slot → autorização por slot; o app **tenta** não gravar no rolo do celular, mas isso depende do aparelho e é medido, não prometido (v0.5) |
| URBI por voz | ⚠️ | interruptor de custo zero; só respostas determinísticas |
| Consulta pública do contribuinte | ⏸️ fase 6 | ver seção 7 |
| LIP, MAC, Fatiador, admin | ❌ nunca | — |
| Emitir documento / consumir número | ❌ nunca | — |

---

## 6. Ordem das fases (nova)

| Fase | O que entrega | Toca slot? | Portão para avançar |
|---|---|---|---|
| **S — Segurança antes** | C1 publicada; nenhuma rota sensível sem autenticação e autorização + lista fechada de exceções públicas; signup desligado e relido; segredo do `.env.local` conferido; cabeçalhos de proteção; limite de tentativas de login; **`autenticar()` confere status Ativo**; **teste de autorização de todas as APIs atuais** por perfil e sem sessão; **domínio definitivo decidido** | não (C1 já mexe em rotas comuns) | auditoria refeita: nenhuma rota sensível aberta, exceções públicas todas listadas, e o teste de autorização passa inteiro |
| **0 — Prova em aparelhos reais** (v0.5: **pode correr antes ou junto da Fase S**) | página de teste **isolada, sem nenhum dado real** e sem acesso ao banco do URBIS (prévia separada, usuário de teste): instala no iPhone e no Android, cadastra passkey, abre com Face ID/digital, recusa sem confirmação, **revoga de longe**, **mede o que fica guardado** no aparelho; compara passkey do Supabase × tranca própria | não | instalação, desbloqueio e revogação **medidos** nos dois sistemas |
| **1 — Instalável e trancado** | manifesto, ícones, botão MOBILE + página de instruções, cadastro de aparelho por QR **com aprovação do admin**, Face ID na abertura, sessão de 12h, tabela de sessões, **separação do canal celular no `autenticar()`**, "derrubar aparelho", interruptor geral desligado | não | teste de ataque: celular "roubado" derrubado de longe; sessão vencida; QR reutilizado recusado; **sessão de celular chamando rota do computador recusada** |
| **2 — Piloto de consulta** | 2 pessoas; consulta por **número exato**; resumo mínimo; **só leitura** | não (só lê comuns) | conferência de que nenhum campo proibido sai na resposta |
| **2b — Depois do piloto** | busca por IPTU/endereço, compartilhar, cada um com **decisão própria** | não | resultado do piloto |
| **3 — Gestor** | painel, Pilha, MRP, tag com desfazer | não | — |
| **4 — Avisos** | push sem dado | não | — |
| **5 — Campo** | foto de vistoria | **sim, por slot** | autorização do slot |
| **6 — Contribuinte** | consulta pública | sim (geradores, se tiver QR) | ver seção 7 |

### 6.1 Quem escolhe o modelo (Opus ou Sonnet) — decisão do Fábio, 25/10

O Fábio pediu que a própria IA escolha e troque o modelo, sem ele precisar mexer. O plano fica
assim:

- **Uma sessão "maestro" em Opus** coordena o projeto. Ela não programa as telas: lê este plano,
  abre **uma sessão nova para cada fase**, já no modelo certo, confere o resultado e passa à fase
  seguinte.
- **Regra de escolha** (a maestro segue esta tabela, não decide no gosto):

| Trabalho | Modelo | Motivo |
|---|---|---|
| Fase S, Fase 0, Fase 1 (tudo que tranca: login, sessão, Face ID, derrubar aparelho) | **Opus** | erro aqui abre o sistema |
| Fases 2, 3, 4, página de instruções, ícones, protótipo visual | **Sonnet** | trabalho de tela, mais repetitivo; gasta bem menos |
| Revisão de segurança ao fim de **cada** fase (inclusive as do Sonnet) | **Opus** | conferir que nenhuma tela vazou campo proibido ou abriu rota |
| Fases 5 e 6 (tocam slot / abrem ao público) | **Opus** | risco alto |

- **Se a sessão de Sonnet travar** no mesmo problema duas vezes ou esbarrar em algo de segurança,
  a maestro troca aquela sessão para Opus e registra por quê.
- **Limite da ferramenta (medido na descrição do app, 25/10):** uma sessão **não pode trocar o
  próprio modelo**. Só pode abrir sessões novas no mesmo modelo ou num mais barato, e trocar o
  modelo de outra sessão. Subir uma sessão para um modelo mais caro **pede a confirmação do
  Fábio** na tela, um clique. Por isso a maestro precisa estar em Opus: daí ela consegue abrir as
  de Opus e as de Sonnet.
- **O que continua com o Fábio:** cada autorização da Fase S (publicar C1, desligar cadastro,
  migration), o teste com o iPhone na mão (Fase 0) e a aprovação do protótipo. Trocar de modelo
  não é autorização para publicar nada.
- Cada sessão de fase começa limpa ("leia `docs/URBIS_MOBILE_PLANO.md` e faça a Fase X"), o que
  também economiza uso.

Começar o piloto por **2 ou 3 pessoas** (Fábio + um gestor) antes de liberar para mais gente.
Cada fase registra OBS COD. Fase que tocar o Slot 5 atualiza os dois manuais.

---

## 7. Contribuinte — por que fica por último e como seria

Abrir o URBIS para o público é **outro nível de risco**: qualquer pessoa do mundo, inclusive
robô. Se um dia for feito:
- endereço e programa **separados** do URBIS interno, sem login e sem acesso a nenhuma rota
  interna;
- consulta só por **número do processo + código de verificação** impresso no documento (não dá
  para "chutar" números em sequência);
- devolve **só** situação e datas. Nada de nome, CPF, endereço, documentos ou analista;
- limite forte de consultas por endereço de rede, e verificação "não sou robô";
- só depois da Fase S concluída e auditada.

---

## 8. Estética do MOBILE (mantida da v0.1)

- Cores e temas do URBIS (claro/escuro). Antes de usar, corrigir as variáveis que faltam em
  `globals.css` (`--surface`, `--success-bg`, `--error-bg`, `--primary`).
- Barra de abas embaixo: Início · Buscar · Pilha · Painel · Mais.
- **Tela do cadeado**: logo do URBIS embaçada ao fundo + botão grande "Entrar com Face ID".
- Ficha-resumo com selo colorido da situação, linha do tempo e botão "Compartilhar".
- Botões ≥ 44 pt, fonte ≥ 16 px, respeito ao entalhe do iPhone; ícones gerados de
  `public/logo_urbis.png` (1024×1024).
- Protótipo visual para o Fábio aprovar antes de programar.

## 9. Página MOBILE (botão no fim da Home)

- **No computador (logado):** explicação curta + botão "Cadastrar meu celular", que mostra o QR
  de uso único + endereço oficial por extenso + aviso "o acesso do celular só é liberado por este QR; nunca digite a senha do URBIS em
  página aberta por link recebido".
- **No iPhone:** abrir no Safari → Compartilhar → "Adicionar à Tela de Início" → abrir pelo
  ícone → Face ID.
- **No Android:** abrir no Chrome → "Instalar URBIS" → abrir pelo ícone → digital.
- **Se o mobile estiver desligado** para aquele usuário: "o acesso pelo celular ainda não foi
  liberado para você — fale com o administrador".

---

## 10. Riscos que sobram (sem mágica)

- **Quem souber a senha do celular** passa no lugar do Face ID. Mitigação: sessão de 12h, alarme,
  derrubar de longe.
- **Android com o URBIS completo aberto no Chrome**: hoje já é possível logar o URBIS inteiro pelo
  navegador do celular, com 30 dias de login. O mobile não cria esse risco, mas não o resolve
  sozinho. Decisão sua: aceitar, ou encurtar o login do computador quando o aparelho for celular
  (detecção imperfeita).
- **Passkey sincroniza pelo iCloud/Google** entre os aparelhos do próprio dono. É conforto, mas
  significa que o iPad do dono também abre. Pode-se exigir aparelho cadastrado mesmo assim.
- **Face ID não testado em app instalado**: por isso a Fase 0 existe. **Não há plano B
  definido** (v0.5): a ideia anterior de um PIN de 6 dígitos próprio do URBIS foi retirada,
  porque um PIN próprio traz riscos novos (adivinhação, guarda do PIN, bloqueio por tentativas)
  e precisaria de uma análise de segurança específica. Se a passkey falhar no iPhone, o
  plano volta para decisão antes de seguir.

---

## 11. Decisões que são suas

1. **Fase S antes de qualquer coisa do mobile?** (recomendado: sim, sem exceção)
2. **Duração da sessão do celular**: 12h (recomendado), 8h ou 24h?
3. **Face ID de novo após quanto tempo parado**: 5 min (recomendado)?
4. **Aparelho novo precisa de aprovação do admin?** (recomendado no piloto)
5. **Quem entra no piloto**: só você + 1 gestor (recomendado)?
6. **Nome do requerente no celular**: escondido com "toque para ver" (recomendado) ou nunca?
7. **Tag de prioridade pelo celular**: (v0.5) a primeira versão já é só leitura; a pergunta
   passa a ser se a tag merece, depois do piloto, a avaliação de segurança própria.
8. **Marca d'água com nome do usuário** nas telas de processo?
9. **Contribuinte** no plano (Fase 6) ou fora por enquanto?
10. **Login do Chrome no Android**: aceitar como está ou encurtar (seção 10)? (v0.6: pela regra
    da seção 0, a recomendação passa a ser **aceitar como está** — encurtar exigiria detectar
    celular no login comum, com risco de errar e deslogar quem está no computador.)
11. **Domínio definitivo** antes das passkeys: domínio próprio da prefeitura agora, ou fixar o
    atual sabendo que trocar depois obriga todo mundo a recadastrar? (v0.4)
12. **Fotos, voz e contribuinte**: cada um vira decisão própria **depois** do piloto, não agora?
    (v0.4, recomendado)

---

## Fontes da pesquisa (25/10/2026)

- Supabase — passkeys em beta: https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta
- Supabase — documentação de passkeys (experimental): https://supabase.com/docs/guides/auth/auth-passkeys
- Alerta de segurança (correção publicada em 05/06/2026, commit `7e6f2e4`; conferido em 25/10): https://red.anthropic.com/2026/cvd/findings/ANT-2026-0JJXMV3G
- Supabase — trocar o domínio (RP ID) inutiliza as passkeys: https://supabase.com/docs/guides/auth/passkeys
- Especificação WebAuthn (credenciais sincronizáveis, formas de verificação): https://www.w3.org/TR/webauthn-3/
- MDN — limites do cache HTTP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
- passkeys.dev — iOS: https://passkeys.dev/docs/reference/ios
- Fórum Apple — Face ID em web app (sem resposta): https://developer.apple.com/forums/thread/848271

---

## Histórico de versões

| Versão | Data | O que mudou |
|---|---|---|
| 0.1 | 25/10/2026 | Primeiro plano, só planejamento. |
| 0.2 | 25/10/2026 | Replanejado com foco em segurança a pedido do Fábio: estado medido hoje (seção 2), mapa de ameaças, 10 camadas de trava, Face ID/digital por passkey própria (não o beta do Supabase), nova Fase S e Fase 0 de prova em iPhone real, riscos que sobram, 10 decisões. Nada implementado. |
| 0.3 | 25/10/2026 | Seção 6.1: a IA escolhe o modelo por fase (sessão maestro em Opus abre cada fase no modelo da tabela; Opus no que tranca e nas revisões, Sonnet nas telas); limite registrado: sessão não troca o próprio modelo, e subir para Opus pede um clique do Fábio. |
| 0.4 | 25/10/2026 | Revisão crítica trazida pelo Fábio (ChatGPT), conferida ponto a ponto no código e nas fontes. Os 5 pontos procedem: (1) "só consulta" precisa ser imposto no `autenticar()`, para todas as rotas; (2) QR não barra senha roubada → aprovação do admin obrigatória no piloto, confirmada por fora; e **achado real: `autenticar()` não confere `status` Ativo** (entra na Fase S); (3) passkey não prova rosto nem aparelho; (4) "nada fica no aparelho" vira "minimizar", medido; (5) domínio definitivo antes das passkeys, e o alerta do Supabase tem correção (05/06), então a escolha passkey do Supabase × própria vai para a Fase 0. Piloto reduzido: 2 pessoas, número exato, resumo mínimo, só leitura. |
| 0.5 | 25/10/2026 | Segunda revisão trazida pelo Fábio (ChatGPT), os 4 pontos conferidos e procedentes: (1) regra de ouro precisada — **a primeira versão é só leitura**, e toda função que altera dado (tag, foto) exige avaliação de segurança própria; a regra cobre a sessão do Mobile, não o URBIS completo aberto no navegador do telefone; (2) frases que prometiam demais corrigidas: o QR cadastra o acesso mas não é a única forma de instalar; "sair apaga tudo" e "a foto não fica no rolo" viram tentativas medidas, não garantias; o aviso "tela para computador" é conforto, não trava; (3) "zero método sem login" virou **nenhuma rota sensível sem autenticação e autorização + lista fechada de exceções públicas**, e no piloto o CPF sai da resposta por completo; (4) a Fase 0, isolada e sem dado real, pode correr antes ou junto da Fase S (que segue obrigatória antes de liberar a usuários), e o PIN de 6 dígitos como plano B foi retirado. |
| 0.6 | 25/10/2026 | Nova seção 0, regra acima de todas, pedido do Fábio: **o Mobile não pode atrapalhar o URBIS em NADA; a prioridade é o Mac/PC**. Portão novo em toda fase ("o computador continua igual"); itens da Fase S que tocam o computador listados com o efeito de cada um; CSP entra primeiro só avisando; sessão de 30 dias e saída por inatividade do computador ficam como estão; decisão 10 recomendada como "aceitar". Mesma regra no CLAUDE.md. |
