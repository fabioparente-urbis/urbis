import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // pdfjs-dist não pode ser empacotado no servidor: ele resolve o próprio worker em tempo de
  // execução (`pdf.worker.mjs`) e, dentro do bundle, esse caminho não existe — a leitura da pasta
  // do slot 5 falhava com "Setting up fake worker failed". Fora do bundle, o Node resolve pelo
  // node_modules normalmente.
  // `mupdf` está aqui pela mesma razão: é WASM e carrega `mupdf-wasm.wasm` em tempo de execução.
  // Empacotado, o arquivo não existe no caminho que ele procura. Fora do bundle, o Node resolve
  // pelo node_modules. (WASM, e não binário nativo, é o que torna a rasterização viável na Vercel.)
  serverExternalPackages: ["pdfjs-dist", "mupdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
    middlewareClientMaxBodySize: 200 * 1024 * 1024,
  },
};

export default nextConfig;
