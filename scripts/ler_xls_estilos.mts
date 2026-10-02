/**
 * scripts/ler_xls_estilos.mts — leitor mínimo de estilos de célula de um .xls (BIFF8): fundo, fonte, bordas,
 * alinhamento e formato numérico, já com a paleta de cores PRÓPRIA do arquivo. Existe porque o exceljs não lê
 * .xls e, ao regravar um .xlsx de origem .xls, perde a paleta customizada (as cores saem erradas).
 */
import XLSX from "xlsx";
import { readFileSync } from "fs";
export const PAL:Record<number,string>={};
"000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333".split(" ").forEach((c,i)=>PAL[8+i]=c);
export function lerXls(path:string){
  const cfb=XLSX.CFB.read(readFileSync(path),{type:"buffer"});
  const e=XLSX.CFB.find(cfb,"/Workbook")||XLSX.CFB.find(cfb,"/Book"); const b=Buffer.from(e!.content as any);
  const fonts:any[]=[]; const xfs:any[]=[]; const fmts:Record<number,string>={}; const cell:Record<string,number>={}; const colw:Record<number,number>={};
  let p=0;
  while(p+4<=b.length){ const t=b.readUInt16LE(p), n=b.readUInt16LE(p+2), d=b.subarray(p+4,p+4+n); p+=4+n;
    if(t===0x92){ const k=d.readUInt16LE(0); for(let i=0;i<k;i++) PAL[8+i]=[d[2+i*4],d[3+i*4],d[4+i*4]].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase(); }
    else if(t===0x31){ const len=d[14]; const hi=d[15]&1; const name=d.subarray(16,16+(hi?len*2:len)).toString(hi?"utf16le":"latin1"); fonts.push({size:d.readUInt16LE(0)/20,italic:!!(d.readUInt16LE(2)&2),color:d.readUInt16LE(4),bold:d.readUInt16LE(6)>=700,under:d[10],name}); if(fonts.length===4) fonts.push(null); }
    else if(t===0x41E){ const i=d.readUInt16LE(0); const l=d.readUInt16LE(2); const hi=d[4]&1; fmts[i]=d.subarray(5,5+(hi?l*2:l)).toString(hi?"utf16le":"latin1"); }
    else if(t===0xE0){ const b1=d.readUInt32LE(10), b2=d.readUInt32LE(14), f=d.readUInt16LE(18);
      xfs.push({font:d.readUInt16LE(0),fmt:d.readUInt16LE(2),h:d[6]&7,wrap:!!(d[6]&8),v:(d[6]>>4)&7,rot:d[7],
        bl:b1&15,br:(b1>>4)&15,bt:(b1>>8)&15,bb:(b1>>12)&15,cl:(b1>>>16)&127,cr:(b1>>>23)&127,ct:b2&127,cb:(b2>>7)&127,patt:(b2>>>26)&63,fg:f&127,bg:(f>>7)&127}); }
    else if(t===0x7D){ const c0=d.readUInt16LE(0),c1=d.readUInt16LE(2); for(let c=c0;c<=c1;c++) colw[c]=d.readUInt16LE(4)/256; }
    else if([0xFD,0x203,0x27E,0x201,0x204,0x205,0x06].includes(t)){ cell[d.readUInt16LE(0)+","+d.readUInt16LE(2)]=d.readUInt16LE(4); }
    else if(t===0xBD||t===0xBE){ const r=d.readUInt16LE(0),c0=d.readUInt16LE(2); const step=t===0xBD?6:2; const cn=(d.length-6)/step; for(let i=0;i<cn;i++) cell[r+","+(c0+i)]=d.readUInt16LE(4+i*step); }
  }
  const col=(i:number)=>i===64||i===65||i===127?undefined:PAL[i];
  return (r:number,c:number)=>{ const x=xfs[cell[(r-1)+","+(c-1)]]; if(!x) return null; const fo=fonts[x.font]||{};
    return {fill:x.patt===1?col(x.fg):(x.patt===0?undefined:"~"+col(x.fg)),fontName:fo.name,size:fo.size,bold:fo.bold,italic:fo.italic,fontColor:fo.color===64?"000000":col(fo.color),h:x.h,wrap:x.wrap,v:x.v,
      borders:[x.bl,x.br,x.bt,x.bb].join(""),bordaEst:{left:x.bl,right:x.br,top:x.bt,bottom:x.bb},bordaCor:{left:col(x.cl),right:col(x.cr),top:col(x.ct),bottom:col(x.cb)},fmt:fmts[x.fmt]??x.fmt}; };
}
