import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { podeAcessarProcesso, usuarioDaRequisicao } from "@/lib/autorizacao";
import { situacaoGeral, situacaoLip, situacaoMac } from "@/lib/bdi/situacao";
import { fatosDoLip, ordenarAnalises, resumoChecklist } from "@/lib/urbi/dossieProcesso";

/**
 * Dossiê factual do URBI — somente leitura.
 *
 * Esta rota será a base do Co-Analista. Ela não chama IA, não escreve no
 * processo, não altera LIP/MAC, não emite documento e não consome numeração.
 * Cada bloco informa a fonte real; falha de fonte vira cobertura indisponível,
 * nunca conclusão positiva por ausência de dado.
 */
export async function GET(req: NextRequest) {
  const codigo = (new URL(req.url).searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ ok: false, erro: "codigo é obrigatório." }, { status: 400 });

  const usuario = await usuarioDaRequisicao(req);
  if (!usuario) return NextResponse.json({ ok: false, erro: "SESSAO_EXPIRADA" }, { status: 401 });

  const { data: processo, error: erroProcesso } = await supabaseAdmin
    .from("processos")
    .select("id, codigo, tipo_processo, assunto_id, porte, area_construida, dados, tags, analista_id, gerencia, criado_em, atualizado_em, analise_iniciada_em, analise_concluida_em, lip_incompleto, mac_incompleto")
    .eq("codigo", codigo)
    .is("excluido_em", null)
    .maybeSingle();

  if (erroProcesso) {
    console.error("[urbi/dossie] processo:", erroProcesso.message);
    return NextResponse.json({ ok: false, erro: "Falha ao carregar o processo." }, { status: 500 });
  }
  if (!processo) return NextResponse.json({ ok: false, erro: "Processo não encontrado." }, { status: 404 });

  const acesso = await podeAcessarProcesso(usuario, codigo);
  if (!acesso.ok) return NextResponse.json({ ok: false, erro: acesso.erro }, { status: acesso.status });

  const consultas = await Promise.all([
    supabaseAdmin.from("assuntos").select("nome, slug").eq("id", processo.assunto_id).maybeSingle(),
    supabaseAdmin.from("vw_bdi_campos_criticos").select("campos_vazios, campos_em_x, campos_totais").eq("codigo", codigo).maybeSingle(),
    supabaseAdmin.from("analises_mac").select("id, numero_analise, status, itens, criado_em, atualizado_em, numero_despacho, numero_parecer, numero_despacho_interno, modelo_id").eq("processo_codigo", codigo).is("excluido_em", null),
    supabaseAdmin.from("vw_bdi_retrabalho_por_passada").select("exigencia, aba, referencia_legal, passada_anterior, passada_atual, status_anterior, status_novo, voltou_em").eq("processo_codigo", codigo).order("voltou_em", { ascending: false }).limit(100),
    supabaseAdmin.from("mdp_registros").select("tipo, numero, data_despacho, criado_em").eq("processo_codigo", codigo).order("criado_em", { ascending: true }),
    supabaseAdmin.from("mrp_registros").select("tipo_despacho, numero_despacho, numero_analise, data_despacho, pontos").eq("processo_codigo", codigo).order("data_despacho", { ascending: true }),
    supabaseAdmin.from("mhd_documentos").select("id, papel, rotulo, status, escopo, atualizado_em").eq("processo_codigo", codigo).order("atualizado_em", { ascending: false }),
  ]);

  const nomesFontes = ["assunto", "campos_criticos", "analises_mac", "retrabalho", "mdp", "mrp", "mhd"];
  const fontesIndisponiveis = consultas
    .map((resultado, i) => resultado.error ? `${nomesFontes[i]}: ${resultado.error.message}` : null)
    .filter(Boolean);

  const assunto = consultas[0].data as any;
  const camposCriticos = consultas[1].data as any;
  const analises = ordenarAnalises((consultas[2].data ?? []) as any[]);
  const retrabalho = consultas[3].data ?? [];
  const mdp = consultas[4].data ?? [];
  const mrp = consultas[5].data ?? [];
  const mhdDocumentos = (consultas[6].data ?? []) as any[];
  const ultima = analises.length ? analises[analises.length - 1] : null;

  // versão/hash vigente de cada documento — pedido explícito da Fase 3 original ("versão/hash dos
  // documentos no MHD, quando disponível"), faltava no primeiro corte desta rota. Só metadado
  // técnico (nunca nome_arquivo/texto/dados, que podem carregar conteúdo extraído do documento).
  const idsMhdDocs = mhdDocumentos.map((d) => d.id);
  const { data: mhdVersoesRaw, error: erroMhdVersoes } = idsMhdDocs.length
    ? await supabaseAdmin.from("mhd_versoes").select("documento_id, versao, hash, vigente, lido_em").in("documento_id", idsMhdDocs).eq("vigente", true)
    : { data: [] as any[], error: null };
  if (erroMhdVersoes) fontesIndisponiveis.push(`mhd_versoes: ${erroMhdVersoes.message}`);
  const versaoVigentePorDoc = new Map((mhdVersoesRaw ?? []).map((v: any) => [v.documento_id, v]));
  const mhd = mhdDocumentos.map((d) => {
    const v = versaoVigentePorDoc.get(d.id);
    return {
      papel: d.papel, rotulo: d.rotulo, status: d.status, escopo: d.escopo, atualizado_em: d.atualizado_em,
      versao: v?.versao ?? null, hash: v?.hash ?? null, lido_em: v?.lido_em ?? null,
    };
  });

  const tags = Array.isArray(processo.tags) ? processo.tags : [];
  const resumoCampos = camposCriticos ? {
    campos_vazios: Number(camposCriticos.campos_vazios) || 0,
    campos_em_x: Number(camposCriticos.campos_em_x) || 0,
    campos_totais: Number(camposCriticos.campos_totais) || 0,
  } : null;
  const ultimaPassada = ultima ? {
    numero_analise: Number(ultima.numero_analise) || 0,
    status: ultima.status,
    numero_despacho: ultima.numero_despacho,
    numero_parecer: ultima.numero_parecer,
  } : null;

  const itensUltima = (ultima?.itens && typeof ultima.itens === "object" && !Array.isArray(ultima.itens))
    ? ultima.itens as Record<string, unknown>
    : {};
  const idsItens = Object.keys(itensUltima);
  const { data: itensChecklist, error: erroItens } = idsItens.length
    ? await supabaseAdmin.from("mac_checklist_itens").select("id, grupo, texto, ref, fundamento_legal, chave_lip").in("id", idsItens)
    : { data: [], error: null };
  if (erroItens) fontesIndisponiveis.push(`checklist: ${erroItens.message}`);

  const idsNaoConformes = idsItens.filter((id) => itensUltima[id] === "nao_conforme");
  const { data: vinculos, error: erroVinculos } = idsNaoConformes.length
    ? await supabaseAdmin
        .from("mac_bip_vinculos")
        .select("mac_item_id, confianca, bdi_lei_fragmentos(referencia, texto)")
        .in("mac_item_id", idsNaoConformes)
    : { data: [], error: null };
  if (erroVinculos) fontesIndisponiveis.push(`bip: ${erroVinculos.message}`);

  const leisPorItem = new Map<string, any[]>();
  for (const vinculo of vinculos ?? []) {
    const v = vinculo as any;
    const fragmento = v.bdi_lei_fragmentos;
    if (!fragmento?.referencia) continue;
    const lista = leisPorItem.get(v.mac_item_id) ?? [];
    lista.push({
      referencia: String(fragmento.referencia),
      trecho: String(fragmento.texto ?? "").slice(0, 900),
      confianca_vinculo: String(v.confianca),
    });
    leisPorItem.set(v.mac_item_id, lista);
  }

  const itemPorId = new Map((itensChecklist ?? []).map((item: any) => [item.id, item]));
  const pendenciasMac = idsNaoConformes.map((id) => {
    const item: any = itemPorId.get(id);
    return {
      item_id: id,
      grupo: item?.grupo ?? null,
      texto: item?.texto ?? "Item sem cadastro localizado.",
      referencia_do_checklist: item?.ref ?? null,
      fundamento_legal_cadastrado: item?.fundamento_legal ?? null,
      campo_lip_relacionado: item?.chave_lip ?? null,
      vinculos_bip: leisPorItem.get(id) ?? [],
    };
  });

  const numerosMdp = new Set((mdp as any[]).map((linha) => String(linha.numero ?? "")).filter(Boolean));
  const numerosMrp = new Set((mrp as any[]).map((linha) => String(linha.numero_despacho ?? "")).filter(Boolean));
  const documentosEmitidos = analises.flatMap((a: any) => [
    a.numero_despacho ? { numero_analise: a.numero_analise, tipo: "despacho", numero: String(a.numero_despacho) } : null,
    a.numero_parecer ? { numero_analise: a.numero_analise, tipo: "parecer", numero: String(a.numero_parecer) } : null,
    a.numero_despacho_interno ? { numero_analise: a.numero_analise, tipo: "despacho_interno", numero: String(a.numero_despacho_interno) } : null,
  ]).filter(Boolean).map((doc: any) => ({
    ...doc,
    mdp_registrado: numerosMdp.has(doc.numero),
    mrp_registrado: numerosMrp.has(doc.numero),
  }));

  const lip = fatosDoLip(processo as any);
  const situacoes = {
    geral: situacaoGeral(resumoCampos, ultimaPassada, tags as any),
    lip: situacaoLip(resumoCampos),
    mac: situacaoMac(ultimaPassada, tags as any),
  };

  return NextResponse.json({
    ok: true,
    data: {
      processo: {
        codigo: processo.codigo,
        assunto: assunto?.nome ?? null,
        tipo_processo: processo.tipo_processo,
        porte: processo.porte,
        area_construida: processo.area_construida,
        criado_em: processo.criado_em,
        atualizado_em: processo.atualizado_em,
        analise_iniciada_em: processo.analise_iniciada_em,
        analise_concluida_em: processo.analise_concluida_em,
      },
      situacoes,
      lip: {
        ...lip,
        marcado_incompleto_pelo_analista: processo.lip_incompleto,
        fonte: "processos.dados + vw_bdi_campos_criticos",
      },
      mac: {
        numero_analises: analises.length,
        ultima_analise: ultima ? { numero_analise: ultima.numero_analise, status: ultima.status, criado_em: ultima.criado_em, atualizado_em: ultima.atualizado_em } : null,
        resumo_ultima_analise: resumoChecklist(itensUltima),
        pendencias_ultima_analise: pendenciasMac,
        marcado_incompleto_pelo_analista: processo.mac_incompleto,
        fonte: "analises_mac + mac_checklist_itens + mac_bip_vinculos + bdi_lei_fragmentos",
      },
      fluxo: {
        analises: analises.map((a: any) => ({
          numero_analise: a.numero_analise,
          status: a.status,
          criado_em: a.criado_em,
          atualizado_em: a.atualizado_em,
          numero_despacho: a.numero_despacho,
          numero_parecer: a.numero_parecer,
          numero_despacho_interno: a.numero_despacho_interno,
        })),
        retrabalho_entre_passadas: retrabalho,
        documentos_emitidos: documentosEmitidos,
        documentos_mhd: mhd,
      },
      cobertura: {
        fontes_indisponiveis: fontesIndisponiveis,
        completo: fontesIndisponiveis.length === 0,
        observacoes: [
          "O dossiê não contém nomes, contatos nem responsáveis técnicos.",
          "Lei só aparece quando existe vínculo real entre o item do MAC e um fragmento do BIP.",
          "Ausência de vínculo BIP não significa conformidade nem ausência de fundamento legal.",
          "Este dossiê não prevê prazo, não julga e não altera o processo.",
        ],
      },
    },
  });
}
