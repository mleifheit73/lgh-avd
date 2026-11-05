// Capturas do manual para a v40 (formulário, relatório com devolutiva, painel do avaliador visto pelo RH, busca na base).
// Uso: node scripts/capturar-telas-v40.mjs  (a partir de dist/; IA simulada com texto marcado como ilustrativo)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright/index.js')); }
const RAIZ = path.resolve('dist');
const T = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json' };
const srv = http.createServer((q,r)=>{ const a=path.join(RAIZ, decodeURIComponent(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0])); if(!a.startsWith(RAIZ)||!fs.existsSync(a)){r.writeHead(404);return r.end();} r.writeHead(200,{'content-type':T[path.extname(a)]||'application/octet-stream'}); fs.createReadStream(a).pipe(r); });
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:2 });
const pg = await ctx.newPage(); const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.addInitScript(()=>{
  const texto = 'Texto ilustrativo do manual (não é um parecer real).\n\nAqui aparece o parecer que a IA escreve a partir das notas e observações da avaliação, para o líder ler junto com o colaborador na devolutiva.';
  const sample = Object.assign(async()=>({text:texto}), {limits: async()=>({})});
  window.claude = { use: async n => n==='sample' ? sample : null };
});
await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
await pg.waitForFunction(()=>window.S&&window.S.pronto===true,null,{timeout:30000});
await pg.click('.perfil[data-p="rafael"]'); await pg.waitForTimeout(400);
await pg.evaluate(()=>{ [...document.querySelectorAll('#t-avaliador button')].find(x=>/^Avaliar$/.test(x.textContent.trim())).click(); });
await pg.waitForTimeout(300);
/* tudo preenchido menos a última nota, para mostrar a mensagem de erro */
await pg.evaluate(()=>{
  const notas=[...document.querySelectorAll('#t-form input.nota')];
  notas.slice(0,-1).forEach(i=>{ i.value='4'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); });
  document.querySelectorAll('#t-form textarea').forEach(t=>{ t.value='Observação de exemplo para o manual.'; t.dispatchEvent(new Event('input',{bubbles:true})); });
});
await pg.click('#fm-data-ajuda'); await pg.waitForTimeout(200);
await pg.evaluate(()=>window.scrollTo(0,0)); await pg.screenshot({path:'out/telas/v40-form-data-1440.png'});
await pg.click('#fm-data-ajuda').catch(()=>{});
await pg.click('#fm-salvar'); await pg.waitForTimeout(300);
await pg.evaluate(()=>document.querySelector('#fm-alerta-rodape').scrollIntoView({block:'center'}));
await pg.screenshot({path:'out/telas/v40-form-erro-1440.png'});
/* completa e envia */
await pg.evaluate(()=>{ const n=[...document.querySelectorAll('#t-form input.nota')].pop(); n.value='4'; n.dispatchEvent(new Event('input',{bubbles:true})); n.dispatchEvent(new Event('change',{bubbles:true})); });
await pg.click('#fm-salvar'); await pg.waitForTimeout(200); await pg.click('#fm-salvar').catch(()=>{}); await pg.waitForTimeout(400);
await pg.evaluate(()=>irPara('relatorio')); await pg.waitForTimeout(300);
await pg.click('#rel-gerar'); await pg.waitForTimeout(800);
await pg.fill('#rel-registro-texto','Registro de exemplo para o manual: combinamos revisar o ponto de pontualidade em 30 dias.');
await pg.evaluate(()=>document.querySelector('#rel-registro-texto').dispatchEvent(new Event('input',{bubbles:true})));
await pg.click('#rel-registro-salvar'); await pg.waitForTimeout(300);
await pg.evaluate(()=>window.scrollTo(0,0)); await pg.screenshot({path:'out/telas/v40-relatorio-1440.png', fullPage:true});
/* RH: painel do avaliador e busca na base */
await pg.evaluate(()=>{ entrar(PERFIS.find(p=>p.id==='holding')); });
await pg.waitForTimeout(300);
await pg.selectOption('#org-seletor','HOTEL LAGHETTO GOLDEN').catch(()=>{}); await pg.waitForTimeout(400);
await pg.evaluate(()=>irPara('avaliador')); await pg.waitForTimeout(400);
await pg.screenshot({path:'out/telas/v40-painel-avaliador-rh-1440.png'});
await pg.evaluate(()=>irPara('usuarios')); await pg.waitForTimeout(300);
await pg.fill('#busca-rede-texto','recep'); await pg.evaluate(()=>document.querySelector('#busca-rede-texto').dispatchEvent(new Event('input',{bubbles:true})));
await pg.waitForTimeout(400);
await pg.evaluate(()=>document.querySelector('#busca-rede').scrollIntoView({block:'start'}));
await pg.screenshot({path:'out/telas/v40-usuarios-busca-1440.png'});
await b.close(); srv.close();
console.log(JSON.stringify({erros}));
