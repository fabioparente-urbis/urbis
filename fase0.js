const pdfParse = require('pdf-parse');
const fs = require('fs');
const filePath = process.argv[2];
if (!filePath) { console.error('Uso: node fase0.js arquivo.pdf'); process.exit(1); }
const buf = fs.readFileSync(filePath);
const pages = [];
pdfParse(buf, {
  pagerender: async (pd) => {
    const c = await pd.getTextContent();
    const t = c.items.map(i => i.str).join(' ').trim();
    pages.push(t);
    return t;
  }
}).then(() => {
  pages.forEach((t, i) => {
    const len = t.length;
    const tag = len < 40 ? '⚠️  ESCANEADA' : '✅ TEXTO';
    console.log(`\n=== PÁGINA ${i+1} [${len} chars] ${tag} ===`);
    if (len >= 40) {
      console.log('INÍCIO:', t.slice(0, 200).replace(/\s+/g,' '));
      console.log('RODAPÉ:', t.slice(Math.max(0, len-400)).replace(/\s+/g,' '));
    }
  });
  const dig = pages.filter(t => t.length >= 40).length;
  const scan = pages.filter(t => t.length < 40).length;
  console.log(`\n📊 RESUMO: ${pages.length} páginas — ${dig} digitais, ${scan} escaneadas`);
}).catch(console.error);
