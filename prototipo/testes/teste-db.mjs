import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const URL='file:///tmp/claude-0/-home-claude/3623909c-8331-5f31-a91b-2eae438e4346/scratchpad/rh/index.html';
const b = await chromium.launch(); const r={};
// banco falso em memoria compartilhado entre "recarregamentos"
const loja = {};
async function pagina(comDb){
  const pg = await b.newPage({viewport:{width:1440,height:900}});
  pg.on('pageerror', e=>(r.erros=r.erros||[]).push(String(e)));
  await pg.exposeFunction('__dbSet', (id,data)=>{ loja[id]=data; });
  await pg.exposeFunction('__dbDel', id=>{ delete loja[id]; });
  await pg.exposeFunction('__dbAll', ()=>Object.entries(loja));
  await pg.addInitScript(comDb => {
    window.claude = { use: async name => {
      if(name==='sample') return null;
      if(name!=='db' || !comDb) return null;
      return { collection: c => ({
        doc: id => ({ set: d => window.__dbSet(c+'/'+id, JSON.parse(JSON.stringify(d))), delete: ()=>window.__dbDel(c+'/'+id) }),
        get: async ()=>{ const e = await window.__dbAll(); return { docs: e.map(([id,d])=>({id, exists:true, data:()=>d})), size:e.length, empty:!e.length }; }
      }) };
    } };
  }, comDb);
  await pg.goto(URL); await pg.waitForTimeout(400);
  return pg;
}
// 1. sem banco
let pg = await pagina(false);
r.semBanco = await pg.$eval('#db-estado', e=>e.dataset.st+': '+e.textContent.trim());
await pg.close();
// 2. com banco vazio, envia avaliacao
pg = await pagina(true);
r.bancoVazio = await pg.$eval('#db-estado', e=>e.dataset.st+': '+e.textContent.trim());
await pg.click('.perfil[data-p="rafael"]'); await pg.waitForSelector('#t-avaliador:not([hidden])');
await pg.click('#av-equipes [data-abrir]'); await pg.waitForSelector('#t-form:not([hidden])');
await pg.$$eval('input.nota', ins=>ins.forEach(i=>{ i.value='4,5'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); }));
await pg.$$eval('textarea', ts=>ts.forEach(t=>{ t.value='Teste de persistência.'; t.dispatchEvent(new Event('input',{bubbles:true})); }));
await pg.click('#fm-salvar'); await pg.click('#fm-salvar'); await pg.waitForTimeout(500);
r.aposEnvio = await pg.$eval('#db-estado', e=>e.dataset.st+': '+e.textContent.trim());
r.lojaDepois = Object.keys(loja);
await pg.close();
// 3. "recarrega": nova pagina com o mesmo banco
pg = await pagina(true);
r.aposRecarga = await pg.$eval('#db-estado', e=>e.dataset.st+': '+e.textContent.trim());
await pg.click('.perfil[data-p="rafael"]'); await pg.waitForSelector('#t-avaliador:not([hidden])');
r.kpis = await pg.$$eval('#av-kpis .kpi', ks=>ks.map(k=>k.querySelector('.l').textContent+'='+k.querySelector('.v').textContent));
r.enviadas = await pg.evaluate(()=>Object.keys(ENVIADAS).map(k=>k+' v'+ENVIADAS[k].length+' '+ENVIADAS[k][0].em));
await pg.screenshot({path:'/tmp/claude-0/db-painel.png'});
// 4. exclusao pelo admin reflete no banco
await pg.click('#trocar'); await pg.click('.perfil[data-p="holding"]'); await pg.waitForTimeout(200);
await pg.evaluate(()=>{ S.colab = PESSOAS.find(p=>p.id==='RG-55'); S.tipo='colab'; irPara('form'); });
await pg.waitForTimeout(200);
r.temExcluir = !!(await pg.$('#proto-excluir'));
if(r.temExcluir){ await pg.click('#proto-excluir'); await pg.click('#proto-excluir'); await pg.waitForTimeout(400); r.lojaAposExcluir = Object.keys(loja); r.estadoAposExcluir = await pg.$eval('#db-estado', e=>e.textContent.trim()); }
await pg.close();
console.log(JSON.stringify(r,null,1)); await b.close();
