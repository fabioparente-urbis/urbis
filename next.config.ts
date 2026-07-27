import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // pdfjs-dist não pode ser empacotado no servidor: ele resolve o próprio worker em tempo de
  // execução (`pdf.worker.mjs`) e, dentro do bundle, esse caminho não existe — a leitura da pasta
  // do slot 5 falhava com "Setting up fake worker failed". Fora do bundle, o Node resolve pelo
  // node_modules normalmente.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
    middlewareClientMaxBodySize: 200 * 1024 * 1024,
  },
};

export default nextConfig;
