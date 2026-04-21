const pdf = require('pdf-parse/lib/pdf-parse.js');
const fs = require('fs');
const buf = fs.readFileSync('/Users/fabiomartinssantos/Desktop/24.5.000035665-7.pdf');
pdf(buf, {max: 232}).then(d => {
  const vistos = new Set();
  d.text.split('\n').forEach((l,i) => {
    const m = l.match(/\((\d{6,8})\)/);
    if (m && !vistos.has(m[1])) {
      vistos.add(m[1]);
      console.log(i, '|', l.trim().slice(0,100));
    }
  });
}).catch(e => console.error(e.message));