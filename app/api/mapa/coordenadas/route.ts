/**
 * Coordenadas (e cadastro oficial) do imóvel a partir do IPTU.
 *
 * Fonte: Mapa Fácil da Prefeitura de Goiânia — serviço ArcGIS REST público,
 * sem autenticação, a mesma camada que o site consulta quando o analista
 * pesquisa por "Cadastro Imobiliário (IPTU)" e abre "Informações
 * Complementares". É trabalho que hoje o analista faz à mão: abrir o portal,
 * buscar o IPTU, clicar no lote, rolar até `x_coord`/`y_coord` e copiar.
 *
 * O serviço devolve UTM 22S (EPSG:31982); o campo `coordenadas` do LIP guarda
 * lat/lng, que é o que os botões de Google Maps/Earth da tela abrem — daí a
 * conversão via `lib/utm`.
 *
 * Só lê. Nenhuma escrita: quem grava no LIP é a tela, depois que o analista vê
 * o que voltou.
 */
import { NextRequest, NextResponse } from "next/server";
import { utmToLatLng, formatarLatLng } from "@/lib/utm";

export const runtime = "nodejs";

const URL_CADASTRO =
  "https://portalmapa.goiania.go.gov.br/servicogyn/rest/services/MapaServer/Feature_Base/MapServer/3/query";

/** O portal fica fora do ar de vez em quando — não prender o analista esperando. */
const TIMEOUT_MS = 15000;

export async function GET(req: NextRequest) {
  const bruto = req.nextUrl.searchParams.get("iptu") ?? "";

  /* O IPTU entra numa cláusula `where` do ArcGIS. Reduzir a dígitos aqui não é
   * higiene de formato — é o que impede o parâmetro de virar consulta. */
  const iptu = bruto.replace(/\D/g, "");
  if (iptu.length < 8 || iptu.length > 14) {
    return NextResponse.json(
      { ok: false, erro: "IPTU inválido — informe de 8 a 14 dígitos." },
      { status: 400 },
    );
  }

  /* `outFields` tem de ser `*`: este servidor responde 400 ("Failed to execute
   * query") a qualquer lista explícita de campos — testado campo a campo em
   * 20/08/2026. Pedir tudo e escolher o que interessa na resposta é o caminho
   * que funciona; o payload é de um punhado de registros, não pesa. */
  const params = new URLSearchParams({
    f: "json",
    where: `UPPER(nrinscr) LIKE '%${iptu}%'`,
    outFields: "*",
    returnGeometry: "false",
    outSR: "31982",
    resultRecordCount: "5",
  });

  let dados: any;
  try {
    const res = await fetch(`${URL_CADASTRO}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, erro: `Mapa Fácil respondeu ${res.status}. Tente novamente em instantes.` },
        { status: 502 },
      );
    }
    dados = await res.json();
  } catch (e: any) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return NextResponse.json(
      { ok: false, erro: timeout ? "Mapa Fácil demorou demais para responder." : "Não foi possível consultar o Mapa Fácil." },
      { status: 504 },
    );
  }

  // O ArcGIS devolve 200 com um objeto `error` dentro quando a consulta falha.
  if (dados?.error) {
    return NextResponse.json(
      { ok: false, erro: `Mapa Fácil recusou a consulta: ${dados.error.message ?? "erro desconhecido"}` },
      { status: 502 },
    );
  }

  const feicoes: any[] = Array.isArray(dados?.features) ? dados.features : [];
  if (feicoes.length === 0) {
    return NextResponse.json(
      { ok: false, erro: `Nenhum imóvel encontrado para o IPTU ${iptu}. Confira o número no Uso do Solo.` },
      { status: 404 },
    );
  }

  /* A busca é por LIKE (é como o portal faz), então um IPTU curto pode casar
   * com vários lotes. Prefere-se a inscrição idêntica; sem ela, o analista
   * precisa saber que houve mais de um resultado. */
  const exato = feicoes.find((f) => String(f?.attributes?.nrinscr ?? "").trim() === iptu);
  const alvo = exato ?? feicoes[0];
  const at = alvo?.attributes ?? {};

  const x = Number(at.x_coord);
  const y = Number(at.y_coord);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) {
    return NextResponse.json(
      { ok: false, erro: "O imóvel foi encontrado, mas está sem coordenada cadastrada no Mapa Fácil." },
      { status: 422 },
    );
  }

  const { lat, lng } = utmToLatLng(x, y);

  /* Campos de texto do cadastro vêm com enchimento de espaços à direita. */
  const limpo = (v: unknown) => String(v ?? "").trim() || null;
  const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

  return NextResponse.json({
    ok: true,
    coordenadas: formatarLatLng(lat, lng),
    utm: { x, y },
    iptuConsultado: iptu,
    iptuEncontrado: limpo(at.nrinscr),
    /* Falso quando o LIKE casou um lote parecido em vez do exato — a tela usa
     * isto para avisar em vez de preencher calada. */
    exato: Boolean(exato),
    outrosResultados: feicoes.length - 1,
    cadastro: {
      logradouro: limpo(at.nmlogradou),
      numero: limpo(at.nrimovel),
      quadra: limpo(at.nrquadra),
      lote: limpo(at.nrlote),
      bairro: limpo(at.nmbairro),
      areaTerreno: numero(at.areaterr),
      areaEdificada: numero(at.areaedif),
      zona: numero(at.cdzona),
    },
    fonte: "Mapa Fácil — Prefeitura de Goiânia (Cadastro Imobiliário)",
  });
}
