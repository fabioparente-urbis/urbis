-- Renomeia gerências PP→GERECCO, MP→GERAED, GP→GERAGP e adiciona GERAP
UPDATE usuarios SET gerencia = 'GERECCO' WHERE gerencia = 'PP';
UPDATE usuarios SET gerencia = 'GERAED'  WHERE gerencia = 'MP';
UPDATE usuarios SET gerencia = 'GERAGP'  WHERE gerencia = 'GP';

UPDATE usuarios SET perfil = 'Gerência GERECCO' WHERE perfil = 'Gerência PP';
UPDATE usuarios SET perfil = 'Gerência GERAED'  WHERE perfil = 'Gerência MP';
UPDATE usuarios SET perfil = 'Gerência GERAGP'  WHERE perfil = 'Gerência GP';

UPDATE usuarios SET perfis = array_replace(perfis::text[], 'Gerência PP',  'Gerência GERECCO')::text[] WHERE 'Gerência PP'  = ANY(perfis::text[]);
UPDATE usuarios SET perfis = array_replace(perfis::text[], 'Gerência MP',  'Gerência GERAED')::text[]  WHERE 'Gerência MP'  = ANY(perfis::text[]);
UPDATE usuarios SET perfis = array_replace(perfis::text[], 'Gerência GP',  'Gerência GERAGP')::text[]  WHERE 'Gerência GP'  = ANY(perfis::text[]);
