// Captura as telas do Plano B a partir de dist/ com Playwright, servindo dist/ por HTTP local.
// Uso: node scripts/capturar-telas.mjs  (gera out/telas/*.png em 1440 px e 390 px, escala 2)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright/index.js')); }

const RAIZ = path.resolve('dist');
const TIPOS = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.css':'text/css' };
const servidor = http.createServer((req, res) => {
  const alvo = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!alvo.startsWith(RAIZ) || !fs.existsSync(alvo)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
  fs.createReadStream(alvo).pipe(res);
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const porta = servidor.address().port;
const base = `http://127.0.0.1:${porta}/`;

const navegador = await chromium.launch();
const erros = [];
async function abrir(largura) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => erros.push(`${largura}px: ${e.message}`));
  await pg.addInitScript(() => { window.claude = { use: async () => null }; });
  await pg.goto(base);
  await pg.waitForFunction(() => window.S && window.S.pronto === true, null, { timeout: 30000 });
  await pg.click('.perfil[data-p="holding"]');
  await pg.waitForTimeout(400);
  return { ctx, pg };
}
const capturas = [];
async function foto(pg, nome, largura, fullPage = true) {
  const arq = `out/telas/${nome}-${largura}.png`;
  await pg.screenshot({ path: arq, fullPage });
  capturas.push(arq);
}
for (const largura of [1440, 390]) {
  const { ctx, pg } = await abrir(largura);
  await pg.click('#nav [data-tela="arvore"]'); await pg.waitForTimeout(500);
  await foto(pg, 'arvore-golden', largura);
  /* a raiz da unidade (ou, se não houver, a primeira cabeça de Sem líder) abre o painel de montagem */
  const caixa = await pg.$('#ar-arvore .ar-caixa') || await pg.$('#ar-sem-lider .ar-caixa');
  if (caixa) { await caixa.click(); await pg.waitForTimeout(400); await foto(pg, 'montagem-painel', largura, false); }
  await pg.selectOption('#ar-org', 'LAGHETTO CORPORATIVO').catch(() => {}); await pg.waitForTimeout(500);
  await foto(pg, 'arvore-rede', largura);
  await pg.click('#nav [data-tela="pendencias"]'); await pg.waitForTimeout(500);
  await foto(pg, 'pendencias', largura);
  await pg.click('#nav [data-tela="ciclos"]'); await pg.waitForTimeout(300);
  await foto(pg, 'ciclos-trava', largura);
  /* de volta ao Golden: a matriz é da unidade, não da Rede */
  await pg.selectOption('#org-seletor', 'HOTEL LAGHETTO GOLDEN').catch(() => {}); await pg.waitForTimeout(500);
  await pg.click('#nav [data-tela="matriz"]'); await pg.waitForTimeout(500);
  await foto(pg, 'matriz-golden', largura, false);
  await ctx.close();
}
await navegador.close(); servidor.close();
console.log(JSON.stringify({ capturas, erros }, null, 1));
