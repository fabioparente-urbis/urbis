// lib/r2.ts
//
// Helpers compartilhados para operacoes no Cloudflare R2 (S3-compatible)
// usando aws4fetch. Centralizado aqui para evitar duplicacao entre o
// endpoint de indexacao de leis e o gerenciador do BDI.
//
// Variaveis de ambiente esperadas:
//   - CLOUDFLARE_ACCOUNT_ID
//   - CLOUDFLARE_R2_BUCKET_NAME
//   - CLOUDFLARE_R2_ACCESS_KEY_ID
//   - CLOUDFLARE_R2_SECRET_ACCESS_KEY

import { AwsClient } from "aws4fetch";

function getEnv(): {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
} {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) {
    throw new Error("Variaveis CLOUDFLARE_* nao configuradas no ambiente.");
  }
  return { accountId, bucketName, accessKeyId, secretAccessKey };
}

function getClient() {
  const { accessKeyId, secretAccessKey } = getEnv();
  return new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: "auto",
    service: "s3",
  });
}

function endpointFor(key: string): string {
  const { accountId, bucketName } = getEnv();
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURI(key)}`;
}

/** Sanitiza um nome de arquivo para ser usado em key do R2. */
function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
}

/**
 * Faz upload de um buffer para o R2 sob a key informada. Retorna o endpoint
 * "base" (URL nao assinada) que e salvo em bdi_documentos_lei.url_pdf.
 *
 * O endpoint base nao e publicamente acessivel; para servir o arquivo,
 * use `signGetUrl(key)` para gerar uma URL temporariamente assinada.
 */
export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const aws = getClient();
  const url = endpointFor(key);
  // aws4fetch tipa o body como BodyInit, que em alguns tsconfigs nao inclui
  // Uint8Array/Buffer no Node. O fetch runtime aceita ambos sem problema
  // (mesma rota usada por app/api/upload/stream/route.ts), entao cast.
  const body = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const res = await aws.fetch(url, {
    method: "PUT",
    body: body as unknown as BodyInit,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`R2 PUT retornou ${res.status}: ${txt}`);
  }
  return url;
}

/**
 * Gera uma URL GET assinada (default: 1h) para o arquivo identificado pela
 * key. Util para clientes baixarem o PDF ou para o servidor re-baixar o
 * arquivo durante uma reindexacao.
 */
export async function signGetUrl(key: string, expiresSec = 3600): Promise<string> {
  const aws = getClient();
  const url = endpointFor(key);
  const signed = await aws.sign(url, {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url + `&X-Amz-Expires=${expiresSec}`;
}

/** Remove o objeto identificado pela key. Tolera 404 (idempotente). */
export async function deleteFromR2(key: string): Promise<void> {
  const aws = getClient();
  const url = endpointFor(key);
  const res = await aws.fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`R2 DELETE retornou ${res.status}: ${txt}`);
  }
}

/**
 * Extrai a key de uma URL R2 no formato
 * `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>` (com ou sem
 * query string). Retorna null se a URL nao pertencer ao bucket configurado.
 */
export function keyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { accountId, bucketName } = getEnv();
    const u = new URL(url);
    if (!u.hostname.startsWith(`${accountId}.r2.`)) return null;
    // pathname comeca com /<bucket>/<key...>
    const prefix = `/${bucketName}/`;
    if (!u.pathname.startsWith(prefix)) return null;
    return decodeURI(u.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

/** Gera uma key estavel para a lei (prefixo `bdi-leis/`). */
export function keyParaLei(leiId: string, filename: string): string {
  const safe = sanitize(filename);
  // O `${Date.now()}` garante que reuploads nao sobrescrevam o anterior
  // (uteis para auditoria) mas tambem evita conflitos de cache de R2.
  return `bdi-leis/${leiId}/${Date.now()}-${safe}`;
}
