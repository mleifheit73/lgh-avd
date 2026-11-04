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
// Rafael envia avaliacao do Adilson na v1
await pg.click('.perfil[data-p="rafael"]'); await pg.waitForTimeout(100); await pg.click('#av-equipes [data-abrir]'); await pg.waitForSelector('#t-form:not([hidden])');
r.rotuloV1 = (await pg.textContent('.lid-rotulo')).replace(/\s+/g,' ');
r.criteriosV1 = await pg.$$eval('input.nota', i=>i.length);
await pg.$$eval('input.nota', ins=>ins.forEach(i=>{ i.value='4'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); }));
await pg.$$eval('textarea', ts=>ts.forEach(t=>{ t.value='ok'; t.dispatchEvent(new Event('input',{bubbles:true})); }));
await pg.click('#fm-salvar'); await pg.click('#fm-salvar'); await pg.waitForTimeout(300);
r.registro = await pg.evaluate(()=>{ const v=ENVIADAS['RG-55|lider'] || ENVIADAS['RG-55|colab']; return v && {tipo:v[0].tipo, formVersao:v[0].formVersao, n:Object.keys(v[0].notas).length}; });
// holding: aba Formularios visivel? (nav)
await pg.click('#trocar'); await pg.click('.perfil[data-p="holding"]'); await pg.waitForTimeout(200);
r.navTemFormularios = await pg.$$eval('#nav button', bs=>bs.map(b=>b.dataset.tela)).then(a=>a.includes('formularios'));
await pg.click('#nav [data-tela="formularios"]'); await pg.waitForTimeout(200);
r.estadoInicial = (await pg.textContent('#fv-estado')).replace(/\s+/g,' ');
await pg.selectOption('#fv-tipo','lider'); await pg.waitForTimeout(100);
await pg.click('#fv-novo'); await pg.waitForTimeout(150);
r.rascunho = (await pg.textContent('#fv-estado')).replace(/\s+/g,' ');
await pg.click('[data-addc="0"]'); await pg.waitForTimeout(150);
const novaSel = await pg.$$eval('[data-pi="0"] textarea[data-ct]', ts=>ts[ts.length-1].dataset.ct); r.novaSel=novaSel;
await pg.fill(`[data-ct="${novaSel}"]`, 'Pergunta nova de teste sobre hóspedes'); await pg.$eval(`[data-ct="${novaSel}"]`, t=>t.dispatchEvent(new Event('change',{bubbles:true})));
await pg.fill('#fv-mud', 'Incluída pergunta de teste.'); await pg.$eval('#fv-mud', t=>t.dispatchEvent(new Event('change',{bubbles:true})));
await pg.click('#fv-publicar'); await pg.waitForTimeout(200);
r.erroPublicar = await pg.$('#fv-erro') ? await pg.textContent('#fv-erro') : 'publicou';
r.aposPublicarProximo = (await pg.textContent('#fv-estado')).replace(/\s+/g,' ');
r.hist = await pg.$$eval('.fv-hist li', l=>l.map(x=>x.textContent.replace(/\s+/g,' ').slice(0,90)));
// formulario do lider no ciclo atual continua v1
await pg.evaluate(()=>{ S.colab = PESSOAS.find(p=>p.id==='RG-174'); S.notas={}; S.obs={}; S.salvo=false; irPara('form'); }); await pg.waitForTimeout(200);
r.bryanAindaColab = (await pg.textContent('.lid-rotulo')).replace(/\s+/g,' ');
await pg.evaluate(()=>{ S.colab = PESSOAS.find(p=>p.id==='RG-69'); S.notas={}; S.obs={}; S.salvo=false; renderForm(); }); await pg.waitForTimeout(100);
r.rafaelLiderV = (await pg.textContent('.lid-rotulo')).replace(/\s+/g,' ');
// publica v3 valendo no ciclo atual
await pg.click('#nav [data-tela="formularios"]'); await pg.waitForTimeout(150); await pg.selectOption('#fv-tipo','lider'); await pg.waitForTimeout(100);
await pg.click('#fv-novo'); await pg.waitForTimeout(150);
const ult = await pg.$$eval('[data-rm]', bs=>bs[bs.length-1].dataset.rm); await pg.click(`[data-rm="${ult}"]`); await pg.waitForTimeout(100);
await pg.fill('#fv-mud', 'Retirada a pergunta 5.1.'); await pg.$eval('#fv-mud', t=>t.dispatchEvent(new Event('change',{bubbles:true})));
await pg.check('input[name="fv-vale"][value="atual"]'); await pg.click('#fv-publicar'); await pg.waitForTimeout(200);
r.aposPublicarAtual = (await pg.textContent('#fv-estado')).replace(/\s+/g,' ');
await pg.evaluate(()=>{ S.colab = PESSOAS.find(p=>p.id==='RG-69'); S.notas={}; S.obs={}; S.salvo=false; renderForm(); }); await pg.waitForTimeout(100);
r.rafaelAgora = (await pg.textContent('.lid-rotulo')).replace(/\s+/g,' ') + ' criterios=' + await pg.$$eval('input.nota', i=>i.length);
// Adilson (enviado na v1) abre no formulario com a v1 fixada
await pg.evaluate(()=>{ S.colab = PESSOAS.find(p=>p.id==='RG-55'); S.notas={}; S.obs={}; S.salvo=false; renderForm(); }); await pg.waitForTimeout(100);
r.adilsonFixo = (await pg.textContent('.lid-rotulo')).replace(/\s+/g,' ') + ' criterios=' + await pg.$$eval('input.nota', i=>i.length);
// Evolucao com dois ciclos em versoes diferentes
await pg.evaluate(()=>{ const n={}; for(let i=0;i<5;i++) for(let j=0;j<4;j++) n[i+'.'+j]=3; ENVIADAS['RG-55|lider'].unshift({versao:1,por:'Rafael',em:'20/04/2026 às 10:00',ciclo:1,cicloNome:'1º ciclo de 2026',tipo:'lider',formVersao:1,notas:n,obs:{},media:3}); ENVIADAS['RG-55|lider'][1].formVersao=3; S.colab=PESSOAS.find(p=>p.id==='RG-55'); irPara('evolucao'); $('#ev-colab').value='RG-55'; pintarEvolucao(); });
await pg.waitForTimeout(200);
r.evolucaoCmp = (await pg.textContent('#ev-pilares')).replace(/\s+/g,' ').slice(-220);
r.loja = Object.keys(loja); r.versoesNaLoja = loja['config/formularios'] && loja['config/formularios'].versoes.lider.map(v=>v.versao+'@'+v.vigenteDesdeCiclo);
await pg.screenshot({path:'/tmp/claude-0/form-ev.png'});
await pg.click('#nav [data-tela="formularios"]'); await pg.waitForTimeout(200); await pg.screenshot({path:'/tmp/claude-0/form-aba.png', fullPage:true});
await pg.close();
pg = await pagina(); await pg.click('.perfil[data-p="holding"]'); await pg.waitForTimeout(300); await pg.click('#nav [data-tela="formularios"]'); await pg.waitForTimeout(200); await pg.selectOption('#fv-tipo','lider'); await pg.waitForTimeout(100);
r.aposRecarga = (await pg.textContent('#fv-estado')).replace(/\s+/g,' ');
await pg.close(); console.log(JSON.stringify(r,null,1)); await b.close();
