type StatusChecklist = "ATENDE" | "NÃO IDENTIFICADO" | "REVISAR";

export interface ItemChecklist {
  chave: string;
  titulo: string;
  status: StatusChecklist;
  observacao: string;
}

function preenchido(valor?: string) {
  return !!valor && valor !== "NP" && valor !== "Não identificado";
}

export function gerarChecklistBasico(dados: {
  proprietario?: string;
  logradouro?: string;
  quadra?: string;
  lote?: string;
  bairro?: string;
  areaTerreno?: string;
  pavimentos?: string;
  unidades?: string;
}): ItemChecklist[] {
  const itens: ItemChecklist[] = [];

  itens.push({
    chave: "proprietario",
    titulo: "Proprietário identificado",
    status: preenchido(dados.proprietario) ? "ATENDE" : "NÃO IDENTIFICADO",
    observacao: preenchido(dados.proprietario)
      ? `Proprietário extraído: ${dados.proprietario}`
      : "O nome do proprietário não foi identificado com segurança no documento.",
  });

  itens.push({
    chave: "logradouro",
    titulo: "Logradouro identificado",
    status: preenchido(dados.logradouro) ? "ATENDE" : "NÃO IDENTIFICADO",
    observacao: preenchido(dados.logradouro)
      ? `Logradouro extraído: ${dados.logradouro}`
      : "O logradouro não foi identificado no documento.",
  });

  itens.push({
    chave: "quadra_lote",
    titulo: "Quadra e lote identificados",
    status:
      preenchido(dados.quadra) && preenchido(dados.lote)
        ? "ATENDE"
        : preenchido(dados.quadra) || preenchido(dados.lote)
        ? "REVISAR"
        : "NÃO IDENTIFICADO",
    observacao:
      preenchido(dados.quadra) && preenchido(dados.lote)
        ? `Quadra ${dados.quadra}, lote ${dados.lote}.`
        : preenchido(dados.quadra) || preenchido(dados.lote)
        ? `Foi identificado apenas parte da informação: quadra=${dados.quadra || "não"} / lote=${dados.lote || "não"}.`
        : "Quadra e lote não foram identificados.",
  });

  itens.push({
    chave: "bairro",
    titulo: "Bairro identificado",
    status: preenchido(dados.bairro) ? "ATENDE" : "NÃO IDENTIFICADO",
    observacao: preenchido(dados.bairro)
      ? `Bairro extraído: ${dados.bairro}`
      : "O bairro não foi identificado.",
  });

  itens.push({
    chave: "area_terreno",
    titulo: "Área do terreno identificada",
    status: preenchido(dados.areaTerreno) ? "ATENDE" : "NÃO IDENTIFICADO",
    observacao: preenchido(dados.areaTerreno)
      ? `Área do terreno extraída: ${dados.areaTerreno}`
      : "A área do terreno não foi identificada no texto do PDF.",
  });

  itens.push({
    chave: "pavimentos",
    titulo: "Número de pavimentos identificado",
    status: preenchido(dados.pavimentos) ? "ATENDE" : "NÃO IDENTIFICADO",
    observacao: preenchido(dados.pavimentos)
      ? `Pavimentos extraídos: ${dados.pavimentos}`
      : "O número de pavimentos não foi identificado.",
  });

  itens.push({
    chave: "unidades",
    titulo: "Número de unidades identificado",
    status: preenchido(dados.unidades) ? "ATENDE" : "NÃO IDENTIFICADO",
    observacao: preenchido(dados.unidades)
      ? `Unidades extraídas: ${dados.unidades}`
      : "O número de unidades não foi identificado.",
  });

  return itens;
}