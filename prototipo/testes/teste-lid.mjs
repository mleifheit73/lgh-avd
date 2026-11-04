import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const URL='file:///tmp/claude-0/-home-claude/3623909c-8331-5f31-a91b-2eae438e4346/scratchpad/rh/index.html';
const b = await chromium.launch(); const r={erros:[]}; const loja={};
async function pagina(){
  const pg = await b.newPage({viewport:{width:1440,height:900}});
  pg.on('pageerror', e=>r.erros.push(String(e)));
  await pg.exposeFunction('__dbSet', (id,d)=>{ loja[id]=d; }); await pg.exposeFunction('__dbDel', id=>{ delete loja[id]; }); await pg.exposeFunction('__dbAll', ()=>Object.entries(loja));
  await pg.addInitScript(() => { window.claude = { use: async name => name!=='db' ? null : {
      doc: path => ({ set: d => window.__dbSet(path, JSON.parse(JSON.stringify(d))), get: async ()=>{ const e=await window.__dbAll(); const h=e.find(([id])=>id===path); return {exists:!!h, data:()=>h?h[1]:undefined}; } }),
      collection: c => ({ doc: id => ({ set: d => window.__dbSet(c+'/'+id, JSON.parse(JSON.stringify(d))), delete: ()=>window.__dbDel(c+'/'+id) }),
        get: async ()=>{ const e=(await window.__dbAll()).filter(([id])=>id.startsWith(c+'/')); return { docs: e.map(([id,d])=>({id, exists:true, data:()=>d})), size:e.length, empty:!e.length }; } }) } }; });
  await pg.goto(URL); await pg.waitForTimeout(400); return pg;
}
let pg = await pagina();
// 1. formulario automatico (Rafael avalia Adilson, que e lider nos dados)
await pg.click('.perfil[data-p="rafael"]'); await pg.waitForSelector('#t-avaliador:not([hidden])');
await pg.click('#av-equipes [data-abrir]'); await pg.waitForSelector('#t-form:not([hidden])');
r.adilsonTipo = await pg.evaluate(()=>S.colab.nome+' lider='+S.colab.lider+' tipo='+S.tipo);
r.rotulo = (await pg.textContent('.lid-rotulo')).replace(/\s+/g,' ');
r.seletorVisivel = await pg.$eval('#fm-tipo', e=>getComputedStyle(e).display);
await pg.click('#fix-voltar'); await pg.waitForTimeout(150); await pg.click('[data-fix-escolher="RG-174"]'); await pg.waitForTimeout(150);
r.bryanTipo = await pg.evaluate(()=>S.colab.nome+' lider='+!!S.colab.lider+' tipo='+S.tipo);
r.rotuloBryan = (await pg.textContent('.lid-rotulo')).replace(/\s+/g,' ');
// 2. matriz como Jaqueline: marcar Bryan como lider
await pg.click('#trocar'); await pg.click('.perfil[data-p="jaqueline"]'); await pg.waitForTimeout(100);
await pg.click('#nav [data-tela="matriz"]'); await pg.waitForTimeout(200);
r.cabecalhos = await pg.$$eval('#m-tabela thead th', t=>t.map(x=>x.textContent));
r.contasAntes = await pg.evaluate(()=>USUARIOS.length);
await pg.evaluate(()=>{ $('#f-busca').value='Bryan'; $('#f-busca').dispatchEvent(new Event('input',{bubbles:true})); }); await pg.waitForTimeout(200);
await pg.evaluate(()=>{ S.busca='Bryan'; pintarMatriz(); });
r.linhasBryan = await pg.$$eval('#m-tabela tbody tr', t=>t.length);
await pg.click('[data-lid="RG-174"]'); await pg.waitForTimeout(200);
r.msgMarcar = await pg.textContent('#lid-msg');
r.bryanLider = await pg.evaluate(()=>PESSOAS.find(p=>p.id==='RG-174').lider);
r.contaBryan = await pg.evaluate(()=>{ const u=USUARIOS.find(u=>u.nome==='Bryan Felipe Karnopp'); return u && {papel:u.papel, nivel:u.nivel, escopo:u.escopo, ativo:u.ativo, origem:u.origem, unidade:u.unidade}; });
r.bryanNaListaAvaliadores = await pg.evaluate(()=>[...document.querySelectorAll('.add-av option')].some(o=>/Bryan/.test(o.textContent)));
r.lojaConfig = Object.keys(loja);
// desmarcar Rafael (avalia 24) deve bloquear
await pg.evaluate(()=>{ S.busca='Rafael'; pintarMatriz(); }); await pg.waitForTimeout(100);
await pg.click('[data-lid="RG-427"]').catch(()=>{});
r.rafaelId = await pg.evaluate(()=>PESSOAS.find(p=>p.nome==='Rafael Schmeier Nunes').id);
await pg.click(`[data-lid="${r.rafaelId}"]`); await pg.waitForTimeout(200);
r.msgBloqueio = await pg.textContent('#lid-msg');
r.rafaelAindaLider = await pg.evaluate(()=>PESSOAS.find(p=>p.nome==='Rafael Schmeier Nunes').lider);
// desfazer a marca do Bryan
await pg.evaluate(()=>{ S.busca=''; pintarMatriz(); });
await pg.click('#btn-desfazer'); await pg.waitForTimeout(200);
r.aposDesfazer = await pg.evaluate(()=>({ lider: PESSOAS.find(p=>p.id==='RG-174').lider, conta: (u=>u&&u.ativo)(USUARIOS.find(u=>u.nome==='Bryan Felipe Karnopp')) }));
// 3. usuarios como holding: seletor de unidade e adicionar avaliador
await pg.click('#trocar'); await pg.click('.perfil[data-p="holding"]'); await pg.waitForTimeout(100);
await pg.click('#nav [data-tela="usuarios"]'); await pg.waitForTimeout(200);
r.unidades = await pg.$$eval('#lid-unidade option', o=>o.map(x=>x.textContent));
await pg.selectOption('#lid-unidade','Hotel Laghetto Golden'); await pg.waitForTimeout(150);
r.contagemGolden = await pg.textContent('#us-contagem');
await pg.click('#lid-add'); await pg.waitForTimeout(100);
await pg.fill('#lid-busca','Claudia'); await pg.waitForTimeout(100);
r.candidatos = await pg.$$eval('#lid-busca-itens button', b=>b.map(x=>x.textContent.replace(/\s+/g,' ')));
await pg.click('#lid-busca-itens button'); await pg.waitForTimeout(200);
r.avisoAposAdd = (await pg.textContent('#us-aviso')).replace(/\s+/g,' ').slice(0,160);
r.contagemDepois = await pg.textContent('#us-contagem');
r.notaConta = await pg.$$eval('.lid-conta-nota', n=>n.map(x=>x.textContent));
await pg.screenshot({path:'/tmp/claude-0/lid-usuarios.png', fullPage:true});
r.lojaFinal = Object.keys(loja); r.lideresNaLoja = loja['config/lideres-e-contas'] && loja['config/lideres-e-contas'].lideres.length;
await pg.close();
// 4. recarga: lider e conta voltam do banco
pg = await pagina(); await pg.click('.perfil[data-p="holding"]'); await pg.waitForTimeout(300);
r.aposRecarga = await pg.evaluate(()=>({ claudiaLider: PESSOAS.find(p=>p.id==='AB-113').lider, contas: USUARIOS.length, contaClaudia: !!USUARIOS.find(u=>u.nome==='Claudia Luiza de Oliveira') }));
await pg.click('#nav [data-tela="matriz"]'); await pg.waitForTimeout(200); await pg.screenshot({path:'/tmp/claude-0/lid-matriz.png'});
await pg.close(); console.log(JSON.stringify(r,null,1)); await b.close();
