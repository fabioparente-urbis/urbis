-- 2026_09_01_urbi_modo_audio.sql
--
-- Troca o controle de voz do URBI de liga/desliga (urbi_voz, boolean) para um
-- modo de 3 estados, decidido pelo ADMINISTRADOR — não mais autosserviço do
-- usuário via /api/urbi/preferencias.
--
--   nenhum      — sem áudio algum. O usuário não vê nem o botão de som: quem
--                 não tem áudio não pode nem saber que existe (pedido do Fábio
--                 no roadmap do URBI, item 2, 2026-09-01). É o PADRÃO para
--                 TODO mundo, inclusive o Administrador — voz é opt-in,
--                 decidida pelo admin explicitamente por pessoa (ele inclusive
--                 pra ele mesmo); nunca liga sozinha por omissão.
--   navegador   — mp3 pré-gravado quando o texto bate com uma fala fixa
--                 (public/urbi/voz/), senão window.speechSynthesis. Precisa o
--                 admin escolher esse valor na ficha do usuário.
--   elevenlabs  — reservado. Enquanto /api/urbi/tts não tiver guarda de sessão
--                 e a chave ElevenLabs não estiver no Railway, este modo se
--                 comporta IGUAL a 'navegador' no código (ver useWebSpeech.ts) —
--                 existe aqui só para não exigir nova migration quando o item 3
--                 do roadmap (teto de crédito + rota protegida) estiver pronto.
--
-- Não mexe em urbi_ativo (widget aparece ou não) nem em urbi_mudo (estado de
-- mudo da sessão atual, ainda usado como valor inicial) — são conceitos
-- diferentes. urbi_voz (auto-liga mic+som na saudação) também fica como está.
--
-- O Administrador é quem CONCEDE ou REMOVE a permissão de voz de qualquer
-- usuário, ele mesmo incluído — não é obrigado a ter voz e não tem
-- tratamento especial nesta coluna. Ver app/api/admin/usuarios/route.ts.
--
-- Idempotente: seguro rodar de novo.

BEGIN;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS urbi_modo_audio text NOT NULL DEFAULT 'nenhum';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_urbi_modo_audio_check'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_urbi_modo_audio_check
      CHECK (urbi_modo_audio IN ('nenhum', 'navegador', 'elevenlabs'));
  END IF;
END $$;

COMMIT;
