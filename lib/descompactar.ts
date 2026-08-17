/**
 * lib/descompactar.ts — abre .rar e .zip da pasta do processo.
 *
 * REGRA DO FÁBIO (17/08/2026): documento importante que chegar compactado É ABERTO. O que fica
 * fechado é só o que a regra master já declara irrelevante para a Aprovação de Projeto
 * (Requerimento, Declaração de Responsabilidade, Documentos pessoais, DWG/DXF) — ali o compactado
 * vale como presença e ninguém gasta tempo abrindo.
 *
 * Quem decide é o NOME do arquivo compactado, porque é o slot do SEI. Nome que não casa com
 * nenhum irrelevante é aberto: pode ser a ART, a certidão ou a prancha que vieram zipadas.
 *
 * Puro JS/WASM de propósito — `fflate` (zip) e `node-unrar-js` (rar, WASM). Nada de binário do
 * sistema: em container Linux do Railway não há `unrar` nem `bsdtar` com suporte a RAR, e uma
 * leitura que só funciona na máquina do analista não serve.
 *
 * NUNCA derruba a leitura: qualquer falha vira aviso e o arquivo continua valendo como presença.
 */
import { unzipSync } from "fflate";
import { createExtractorFromData } from "node-unrar-js";

/** Só estes dois. .7z exigiria mais uma dependência e não apareceu em processo nenhum. */
export const RE_COMPACTADO = /\.(rar|zip)$/i;

export const ehCompactado = (nome: string) => RE_COMPACTADO.test(nome);

/** Tetos contra pasta que explode em memória — o container tem limite e a rota tem timeout. */
const MAX_ARQUIVOS_DENTRO = 40;
const MAX_BYTES_EXTRAIDOS = 120 * 1024 * 1024;

export type ArquivoExtraido = { nome: string; buffer: Uint8Array };

/**
 * Conteúdo de um compactado. Devolve `erro` em vez de lançar: a leitura da pasta continua e o
 * arquivo vira presença, que é o comportamento que já existia antes de haver descompactação.
 */
export async function abrirCompactado(
  nome: string,
  buffer: Uint8Array,
): Promise<{ arquivos: ArquivoExtraido[]; erro?: string }> {
  try {
    const arquivos = /\.zip$/i.test(nome) ? abrirZip(buffer) : await abrirRar(buffer);

    // pasta dentro do compactado vem com caminho; só o nome final importa para identificar o papel
    const limpos = arquivos
      .filter((a) => !a.nome.endsWith("/") && a.buffer.length > 0)
      .map((a) => ({ ...a, nome: a.nome.split("/").pop() || a.nome }))
      .filter((a) => !a.nome.startsWith(".") && !a.nome.startsWith("__MACOSX"));

    if (limpos.length > MAX_ARQUIVOS_DENTRO) {
      return { arquivos: [], erro: `${limpos.length} arquivos dentro — o limite é ${MAX_ARQUIVOS_DENTRO}` };
    }
    const total = limpos.reduce((s, a) => s + a.buffer.length, 0);
    if (total > MAX_BYTES_EXTRAIDOS) {
      return { arquivos: [], erro: `${(total / 1024 / 1024).toFixed(0)}MB descompactados — o limite é 120MB` };
    }
    if (!limpos.length) return { arquivos: [], erro: "compactado vazio ou sem arquivo legível" };

    return { arquivos: limpos };
  } catch (e: any) {
    // .rar protegido por senha, RAR5 com recurso não suportado, arquivo truncado…
    return { arquivos: [], erro: e?.message ?? String(e) };
  }
}

function abrirZip(buffer: Uint8Array): ArquivoExtraido[] {
  const saida = unzipSync(buffer);
  return Object.entries(saida).map(([nome, conteudo]) => ({ nome, buffer: conteudo }));
}

async function abrirRar(buffer: Uint8Array): Promise<ArquivoExtraido[]> {
  /* node-unrar-js exige um ArrayBuffer que comece no byte 0. O Uint8Array que chega aqui pode ser
   * uma VIEW com offset (é o caso do Buffer do Node, que compartilha um pool), e passar
   * `buffer.buffer` direto entregaria o pool inteiro — o extrator lê lixo e falha. */
  const dados = buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength
    ? (buffer.buffer as ArrayBuffer)
    : (buffer.slice().buffer as ArrayBuffer);

  const extrator = await createExtractorFromData({ data: dados });
  const extraidos = extrator.extract();

  const out: ArquivoExtraido[] = [];
  for (const arquivo of extraidos.files) {
    if (arquivo.fileHeader.flags.directory) continue;
    if (!arquivo.extraction) continue; // entrada sem conteúdo (link, vazio)
    out.push({ nome: arquivo.fileHeader.name, buffer: arquivo.extraction });
  }
  return out;
}
