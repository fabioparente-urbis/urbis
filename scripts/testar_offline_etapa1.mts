// URBIS OFFLINE Etapa 1 — prova da fila/cópia (ficha e MAC). Precisa: npm i --no-save fake-indexeddb ; npx tsx scripts/testar_offline_etapa1.mts
// @ts-nocheck
import "fake-indexeddb/auto";
const store: Record<string,string> = {};
(globalThis as any).localStorage = { getItem:(k:string)=>store[k]??null, setItem:(k:string,v:string)=>{store[k]=v} };
(globalThis as any).window = { dispatchEvent(){} , Event };
const A = await import("../lib/offline/armazem.ts");
const F = await import("../lib/offline/fila.ts");
let ok=0, bad=0; const t=(n:string,c:boolean)=>{c?ok++:bad++; console.log(c?"OK ":"XX ",n)};
let servidor:any = { nome:{valor:"A"}, area:{valor:"10"} };
let modo:"queda"|"ok"|"401" = "queda"; const posts:any[]=[];
(globalThis as any).fetch = async (url:string, init?:any)=>{
  if(modo==="queda") throw new Error("net");
  if(modo==="401") return new Response("{}",{status:401});
  if(init?.method==="POST"){ posts.push(JSON.parse(init.body)); return new Response(JSON.stringify({ok:true}),{status:200}); }
  return new Response(JSON.stringify({ok:true,data:{dados:servidor}}),{status:200});
};
const uid="u1";
const base={nome:"A",area:"10"};
const mk=(dados:any)=>({uid,rota:"/s",rotaConferir:"/c",id:"P1",tipo:"slot_05",corpo:{id:"P1",dados,tipo:"slot_05"},base});
await F.enfileirar(mk({nome:{valor:"B"},area:{valor:"10"}}));
await F.enfileirar(mk({nome:{valor:"C"},area:{valor:"10"}}));
t("coalesce: 1 item", (await F.listarFila(uid)).length===1);
t("base preservada", (await F.listarFila(uid))[0].base.nome==="A");
let r=await F.sincronizar(uid); t("queda mantém fila", r.semConexao && r.restantes===1);
modo="401"; r=await F.sincronizar(uid); t("401 espera login, não descarta", r.aguardaLogin && (await F.listarFila(uid))[0].estado==="aguarda_login");
modo="ok"; r=await F.sincronizar(uid); t("ok envia e esvazia", r.enviados===1 && r.restantes===0 && posts[0].dados.nome.valor==="C");
// conflito
servidor={nome:{valor:"Z"},area:{valor:"10"}};
await F.enfileirar(mk({nome:{valor:"B"},area:{valor:"10"}}));
r=await F.sincronizar(uid); t("conflito detectado, nada enviado", r.conflitos===1 && posts.length===1);
const it=(await F.listarFila(uid))[0]; t("conflito lista campo", it.conflitos?.[0].campo==="nome");
await F.resolver(it.chave,"meu"); r=await F.sincronizar(uid); t("manter o meu envia", r.enviados===1 && posts.length===2);
// servidor
await F.enfileirar(mk({nome:{valor:"B2"},area:{valor:"10"}})); await F.sincronizar(uid);
const it2=(await F.listarFila(uid))[0]; await F.resolver(it2.chave,"servidor");
t("usar servidor: sai da fila", (await F.listarFila(uid)).length===0);
// campo só mudou no servidor, outro campo editado -> sem conflito
servidor={nome:{valor:"A"},area:{valor:"99"}};
await F.enfileirar(mk({nome:{valor:"B"},area:{valor:"10"}}));
r=await F.sincronizar(uid); t("campo diferente não conflita", r.enviados===1);
// cópia e logout
await A.guardarCopia(uid,"slot_05","P1",{x:1}); t("copia lê", (await A.lerCopia(uid,"slot_05","P1"))?.dados.x===1);
await F.enfileirar(mk({nome:{valor:"Q"},area:{valor:"10"}}));
await A.apagarCopiasDoUsuario(uid);
t("logout apaga cópia", (await A.lerCopia(uid,"slot_05","P1"))===null);
t("logout NÃO apaga fila", (await F.listarFila(uid)).length===1);

// ---- MAC (PUT + itens string) ----
const metodos:string[]=[]; let srvMac:any=[{id:"A1",itens:{i1:"conforme",i2:""}}];
(globalThis as any).fetch = async (url:string, init?:any)=>{
  if(init?.method){ metodos.push(init.method); posts.push(JSON.parse(init.body)); return new Response(JSON.stringify({ok:true}),{status:200}); }
  return new Response(JSON.stringify({ok:true,data:srvMac}),{status:200});
};
const mac=(itens:any)=>({uid,rota:"/a",metodo:"PUT" as const,conferir:"mac" as const,rotaConferir:"/ca",id:"A1",tipo:"mac",corpo:{id:"A1",itens},base:{i1:"conforme",i2:""}});
await F.enfileirar(mac({i1:"conforme",i2:"nao_conforme"}));
r=await F.sincronizar(uid); t("MAC: envia por PUT sem falso conflito", r.enviados>=1 && metodos.includes("PUT") && r.conflitos===0);
srvMac=[{id:"A1",itens:{i1:"conforme",i2:"conforme"}}];
await F.enfileirar(mac({i1:"conforme",i2:"nao_conforme"}));
r=await F.sincronizar(uid); t("MAC: item mudado no servidor vira conflito", r.conflitos===1);
console.log(`\n${ok} ok, ${bad} falhas`); process.exit(bad?1:0);
