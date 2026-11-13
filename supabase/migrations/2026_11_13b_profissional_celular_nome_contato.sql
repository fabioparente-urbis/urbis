-- O celular nem sempre é do responsável técnico (pode ser do despachante):
-- guarda também o nome de quem atende nesse número.
ALTER TABLE profissional_celular ADD COLUMN IF NOT EXISTS contato_nome TEXT;
