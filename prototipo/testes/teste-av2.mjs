import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1440,height:900}});
const erros=[]; pg.on('pageerror', e=>erros.push(String(e)));
await pg.goto('file:///tmp/claude-0/-home-claude/3623909c-8331-5f31-a91b-2eae438e4346/scratchpad/rh/index.html');
const r = {};
// login demo como Rafael (avaliador)
const perfis = await pg.$$eval('.perfil', bs=>bs.map(b=>b.dataset.p+'|'+b.textContent.trim().slice(0,40)));
r.perfis = perfis;
const idRafael = perfis.find(x=>/Rafael/.test(x)).split('|')[0];
await pg.click(`.perfil[data-p="${idRafael}"]`);
await pg.waitForSelector('#t-avaliador:not([hidden])');
r.kpisAntes = await pg.$$eval('#av-kpis .kpi', ks=>ks.map(k=>k.querySelector('.l').textContent+'='+k.querySelector('.v').textContent));
r.statusAntes = await pg.$$eval('#av-equipes .tag', ts=>ts.map(t=>t.textContent).reduce((a,t)=>(a[t]=(a[t]||0)+1,a),{}));
// filtro pendentes
await pg.click('#av-kpis .kpi[data-filtro="pendente"]');
r.chipPend = await pg.textContent('#av2-chip');
r.linhasVisiveis = await pg.$$eval('#av-equipes tbody tr:not([data-av2-oculta])', t=>t.length);
await pg.click('#av-kpis .kpi[data-filtro="concluida"]');
r.chipConc = await pg.textContent('#av2-chip');
r.linhasVisiveisConc = await pg.$$eval('#av-equipes tbody tr:not([data-av2-oculta])', t=>t.length);
r.vazios = await pg.$$eval('.av2-vazio', v=>v.length);
await pg.click('#av2-limpar');
r.chipDepois = await pg.textContent('#av2-chip');
// gaveta vazia
await pg.click('#av-equipes .av2-nome');
await pg.waitForTimeout(300);
r.gavetaVazia = (await pg.textContent('#av2-dr-corpo')).trim().slice(0,80);
await pg.click('#av2-ir-form');
await pg.waitForSelector('#t-form:not([hidden])');
r.colab = await pg.evaluate(()=>S.colab.nome);
// preencher e enviar
await pg.$$eval('input.nota', ins=>ins.forEach(i=>{ i.value='4'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); }));
await pg.$$eval('textarea', ts=>ts.forEach(t=>{ t.value='Observação de teste automatizado.'; t.dispatchEvent(new Event('input',{bubbles:true})); }));
await pg.click('#fm-salvar'); await pg.click('#fm-salvar');
await pg.waitForTimeout(300);
r.enviado = await pg.evaluate(()=>{ const k=Object.keys(ENVIADAS)[0]; const v=ENVIADAS[k][0]; return {k, ciclo:v.ciclo, cicloNome:v.cicloNome, tipo:v.tipo, em:v.em, media:v.media}; });
// volta ao painel
await pg.click('#nav [data-tela="avaliador"]');
r.kpisDepois = await pg.$$eval('#av-kpis .kpi', ks=>ks.map(k=>k.querySelector('.l').textContent+'='+k.querySelector('.v').textContent));
await pg.click('#av2-toggle-ciclos');
r.ciclosCabecalho = await pg.$$eval('#av2-ciclos th', t=>t.map(x=>x.textContent.trim().slice(0,30)));
r.avaliadoNoCiclo = await pg.$$eval('#av2-ciclos .t-ok', t=>t.length);
// gaveta com envio
const nome = r.colab;
await pg.$$eval('#av-equipes .av2-nome', (bs,nome)=>bs.find(b=>b.textContent===nome).click(), nome);
await pg.waitForTimeout(300);
r.gavetaCheia = (await pg.textContent('#av2-dr-corpo')).replace(/\s+/g,' ').slice(0,200);
await pg.click('[data-av2-notas="0"]');
r.notas = await pg.$$eval('[data-av2-detalhe="0"] > div', d=>d.length);
await pg.click('[data-av2-devolutiva="0"]');
await pg.waitForSelector('#t-relatorio:not([hidden])');
r.relatorio = (await pg.textContent('#rel-resumo')).replace(/\s+/g,' ').slice(0,120);
await pg.screenshot({path:'/tmp/claude-0/av2-relatorio.png'});
await pg.click('#nav [data-tela="avaliador"]'); await pg.click('#av-kpis .kpi[data-filtro="concluida"]');
await pg.screenshot({path:'/tmp/claude-0/av2-painel.png', fullPage:true});
await pg.$$eval('#av-equipes .av2-nome', (bs,nome)=>bs.find(b=>b.textContent===nome).click(), nome);
await pg.waitForTimeout(400); await pg.screenshot({path:'/tmp/claude-0/av2-gaveta.png'}); await pg.keyboard.press('Escape'); r.gavetaFechouEsc = await pg.$eval('#av2-drawer', d=>d.dataset.aberto);
// telas antigas ainda carregam
for(const t of ['matriz','form','relatorio','evolucao']){ await pg.click(`#nav [data-tela="${t}"]`); await pg.waitForTimeout(150); }
r.erros = erros;
console.log(JSON.stringify(r,null,1)); await b.close();
