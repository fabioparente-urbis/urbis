-- 2026_09_02_urbi_comandos_voz.sql
--
-- Registro dos comandos de voz do URBI: o que o usuário falou, como o texto
-- chegou, que intenção casou, que ação foi executada e quando.
--
-- O QUE ESTA TABELA NÃO GUARDA: o áudio bruto. `audio_path` existe e fica
-- SEMPRE NULL nesta primeira implementação, de propósito — guardar a voz de
-- servidor público é dado pessoal (biometria de voz), multiplica custo e
-- superfície de vazamento, e não acrescenta nada ao que o sistema precisa
-- saber, que é o TEXTO entendido e a AÇÃO executada. A coluna fica aqui para
-- que ligar gravação no futuro seja decisão de produto, não nova migration.
--
-- Modelo de acesso: igual ao resto do URBIS. O app fala com o banco só pela
-- service_role (lib/supabaseAdmin) e a identidade vem do cookie urbis_id
-- validado em lib/auth.ts — nunca há conexão como o usuário final. Por isso
-- RLS aqui é a MESMA trava do resto do projeto (ligada, sem policy, sem grant
-- a anon/authenticated): ninguém alcança a tabela a não ser pela service_role.
-- Quem garante "cada um vê só o seu" é a rota /api/urbi/comandos, do mesmo
-- jeito que /api/urbi/historico já faz — policy de RLS aqui seria decorativa,
-- porque não existe sessão de usuário no banco para ela avaliar.

BEGIN;

CREATE TABLE IF NOT EXISTS public.urbi_comandos_voz (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid,
    usuario_nome text,

    -- O que o URBI entendeu. É o dado que importa guardar.
    texto text NOT NULL,

    -- Como o texto chegou:
    --   webspeech — reconhecimento do próprio navegador (Chrome/Edge), grátis
    --   whisper   — gravado no navegador e transcrito no servidor (Groq), o
    --               caminho que faz funcionar em qualquer computador
    --   texto     — digitado, sem voz
    origem text NOT NULL DEFAULT 'webspeech',

    -- Casamento com components/urbi/urbi-intencoes.json. Null = nenhuma
    -- intenção casou (virou pergunta para o modelo, não comando).
    intencao_id text,
    acao_tipo text,
    acao_alvo text,

    executado boolean NOT NULL DEFAULT false,
    -- null = não exigiu confirmação. Hoje toda intenção é navegação, então
    -- nenhuma exige; a coluna existe para quando houver comando destrutivo.
    confirmado boolean,

    duracao_ms integer,
    erro text,

    -- Sempre NULL nesta fase. Ver o bloco no topo do arquivo.
    audio_path text,

    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urbi_comandos_voz_pkey') THEN
    ALTER TABLE public.urbi_comandos_voz ADD CONSTRAINT urbi_comandos_voz_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urbi_comandos_voz_usuario_id_fkey') THEN
    ALTER TABLE public.urbi_comandos_voz
      ADD CONSTRAINT urbi_comandos_voz_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urbi_comandos_voz_origem_check') THEN
    ALTER TABLE public.urbi_comandos_voz
      ADD CONSTRAINT urbi_comandos_voz_origem_check
      CHECK (origem IN ('webspeech', 'whisper', 'texto'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_urbi_comandos_voz_usuario_data
  ON public.urbi_comandos_voz (usuario_id, criado_em DESC);

-- Mesma trava do resto do banco (ver 2026_09_01_trava_rls_geral.sql):
-- RLS ligada e nenhum privilégio para anon/authenticated. Só service_role lê.
ALTER TABLE public.urbi_comandos_voz ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urbi_comandos_voz FROM anon, authenticated, PUBLIC;

COMMIT;
