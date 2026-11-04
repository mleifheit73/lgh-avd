import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const URL='file:///tmp/claude-0/-home-claude/3623909c-8331-5f31-a91b-2eae438e4346/scratchpad/rh/index.html';
const b = await chromium.launch(); const r={erros:[]}; const loja={};
async function pagina(){
  const pg = await b.newPage({viewport:{width:1440,height:900}});
  pg.on('pageerror', e=>r.erros.push(String(e)));
  await pg.exposeFunction('__dbSet', (id,d)=>{ loja[id]=d; }); await pg.exposeFunction('__dbDel', id=>{ delete loja[id]; }); await pg.exposeFunction('__dbAll', ()=>Object.entries(loja));
  await pg.addInitScript(() => { window.claude = { use: async name => {
      if(name==='sample'){ const f = async (prompt)=>({text:'Trajetória\nTexto de teste gerado.\n\nPontos consistentes nas avaliações\nx\n\nPontos de atenção para a promoção\ny'}); return f; }
      if(name!=='db') return null; return {
      doc: path => ({ set: d => window.__dbSet(path, JSON.parse(JSON.stringify(d))), get: async ()=>{ const e=await window.__dbAll(); const h=e.find(([id])=>id===path); return {exists:!!h, data:()=>h?h[1]:undefined}; } }),
      collection: c => ({ doc: id => ({ set: d => window.__dbSet(c+'/'+id, JSON.parse(JSON.stringify(d))), delete: ()=>window.__dbDel(c+'/'+id) }),
        get: async ()=>{ const e=(await window.__dbAll()).filter(([id])=>id.startsWith(c+'/')); return { docs: e.map(([id,d])=>({id, exists:true, data:()=>d})), size:e.length, empty:!e.length }; } }) }; } }; });
  await pg.goto(URL); await pg.waitForTimeout(400); return pg;
}
process.on('uncaughtException', e=>{ console.log(JSON.stringify(r,null,1)); console.log(String(e).slice(0,300)); process.exit(1); });
let pg = await pagina();
await pg.click('.perfil[data-p="rafael"]'); await pg.waitForTimeout(100);
// 1. sem avaliacao: botao desabilitado
await pg.click('#av-equipes .av2-nome'); await pg.waitForTimeout(300);
r.botaoSemAval = await pg.$eval('#ind-abrir', b=>b.disabled);
await pg.keyboard.press('Escape');
// envia avaliacao do Adilson
await pg.click('#av-equipes [data-abrir="RG-55"]'); await pg.waitForTimeout(200);
await pg.$$eval('input.nota', ins=>ins.forEach(i=>{ i.value='4'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); }));
await pg.$$eval('textarea', ts=>ts.forEach(t=>{ t.value='Entrega consistente, observado no turno.'; t.dispatchEvent(new Event('input',{bubbles:true})); }));
await pg.click('#fm-salvar'); await pg.click('#fm-salvar'); await pg.waitForTimeout(300);
await pg.click('#nav [data-tela="avaliador"]'); await pg.waitForTimeout(200);
await pg.click('#av-equipes .av2-nome'); await pg.waitForTimeout(300);
r.botaoComAval = await pg.$eval('#ind-abrir', b=>b.disabled);
await pg.click('#ind-abrir'); await pg.waitForTimeout(100);
await pg.fill('#ind-cargo','Supervisor de Recepção'); await pg.fill('#ind-relato','curto'); await pg.click('#ind-enviar'); await pg.waitForTimeout(100);
r.erroRelatoCurto = await pg.textContent('#ind-erro');
await pg.fill('#ind-relato','Adilson assumiu a coordenação do turno nas ausências do supervisor por três meses, reorganizou a escala de manobristas e reduziu as reclamações de espera no estacionamento registradas no sistema.');
await pg.click('#ind-enviar'); await pg.waitForTimeout(300);
r.enviada = (await pg.textContent('#ind-botao')).replace(/\s+/g,' ').slice(0,80);
r.loja = Object.keys(loja).filter(k=>k.startsWith('indicacoes'));
await pg.click('#ind-ver2'); await pg.waitForTimeout(300);
r.tela = await pg.evaluate(()=>S.tela);
r.dossie = (await pg.textContent('#ind-corpo')).replace(/\s+/g,' ').slice(0,200);
r.grafico = await pg.$$eval('.ind-grafico rect', x=>x.length);
r.podeRetirar = !!(await pg.$('#ind-retirar'));
await pg.click('#ind-gerar'); await pg.waitForTimeout(300);
r.parecer = (await pg.textContent('#ind-parecer')).slice(0,40);
r.parecerSalvo = !!Object.values(loja).find(v=>v.parecerIA);
// badge e visibilidade para RH
await pg.click('#trocar'); await pg.click('.perfil[data-p="jaqueline"]'); await pg.waitForTimeout(200);
r.badgeRH = await pg.$eval('#nav [data-tela="indicacoes"]', b=>b.textContent.trim());
await pg.click('#nav [data-tela="indicacoes"]'); await pg.waitForTimeout(200);
r.alertaRH = (await pg.textContent('#ind-alerta')).replace(/\s+/g,' ').slice(0,120);
r.linhasRH = await pg.$$eval('.ind-lista tbody tr', t=>t.length);
await pg.click('[data-ind]'); await pg.waitForTimeout(200);
r.badgeAposLer = await pg.$eval('#nav [data-tela="indicacoes"]', b=>b.textContent.trim());
await pg.selectOption('#ind-status','em_analise'); await pg.fill('#ind-motivo','RH iniciou a análise do dossiê.'); await pg.click('#ind-aplicar'); await pg.waitForTimeout(200);
r.statusRH = await pg.$eval('.ind-status', e=>e.textContent);
r.historico = await pg.$$eval('.ind-hist li', l=>l.length);
await pg.screenshot({path:'/tmp/claude-0/ind-dossie.png', fullPage:true});
// outro avaliador (Ijuliane) nao ve
await pg.click('#trocar'); await pg.click('.perfil[data-p="ijuliane"]'); await pg.waitForTimeout(200);
r.ijulianeVe = await pg.evaluate(()=>{ irPara('indicacoes'); return document.querySelectorAll('.ind-lista tbody tr').length; });
await pg.close();
// recarga
pg = await pagina(); await pg.click('.perfil[data-p="holding"]'); await pg.waitForTimeout(300);
r.aposRecarga = await pg.evaluate(()=>LGH_IND.lista.map(i=>i.pessoaNome+':'+i.status));
await pg.close(); console.log(JSON.stringify(r,null,1)); await b.close();
