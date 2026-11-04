import pw from '/opt/npm-tools/node_modules/playwright/index.js'; const { chromium } = pw;
const URL='file:///tmp/claude-0/-home-claude/3623909c-8331-5f31-a91b-2eae438e4346/scratchpad/rh/index.html';
const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:1440,height:900}}); const r={erros:[]};
pg.on('pageerror', e=>r.erros.push(String(e)));
await pg.goto(URL); await pg.waitForTimeout(300);
await pg.click('.perfil[data-p="rafael"]'); await pg.waitForTimeout(100);
// 1. via aba: lista de escolha
await pg.click('#nav [data-tela="form"]'); await pg.waitForTimeout(200);
r.escolhaVisivel = await pg.$eval('#fix-escolha', e=>!e.hidden);
r.pilaresOcultos = await pg.$eval('#fm-pilares', e=>e.hidden);
r.seletorOculto = await pg.$eval('#fm-colab', e=>getComputedStyle(e.closest('label')).display);
r.qtdEscolha = await pg.$$eval('[data-fix-escolher]', b=>b.length);
await pg.click('[data-fix-escolher="RG-174"]'); await pg.waitForTimeout(200);
r.fixo = (await pg.textContent('.fix-cab')).replace(/\s+/g,' ');
r.pilaresVisiveis = await pg.$eval('#fm-pilares', e=>!e.hidden);
r.colab = await pg.evaluate(()=>S.colab.nome);
// 2. digita uma nota e tenta sair: modal
await pg.$eval('input.nota', i=>{ i.value='4'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); });
await pg.click('#nav [data-tela="avaliador"]'); await pg.waitForTimeout(200);
r.modalAberto = await pg.$eval('#fix-modal', e=>!e.hidden);
r.modalTexto = (await pg.textContent('#fix-modal .caixa')).replace(/\s+/g,' ').slice(0,260);
r.aindaNoForm = await pg.evaluate(()=>S.tela);
await pg.click('#fix-ficar'); await pg.waitForTimeout(100);
r.ficou = await pg.evaluate(()=>S.tela+' notas='+Object.keys(S.notas).length);
await pg.click('#nav [data-tela="avaliador"]'); await pg.waitForTimeout(100); await pg.click('#fix-sair'); await pg.waitForTimeout(200);
r.saiu = await pg.evaluate(()=>S.tela+' notas='+Object.keys(S.notas).length);
// 3. via painel: fixo direto, sem lista
await pg.click('#av-equipes [data-abrir="RG-55"]'); await pg.waitForTimeout(200);
r.viaPainel = (await pg.textContent('.fix-cab')).replace(/\s+/g,' ') + ' | escolha oculta=' + await pg.$eval('#fix-escolha', e=>e.hidden);
// 4. "Avaliar outra pessoa" sem nota: volta para a lista
await pg.click('#fix-voltar'); await pg.waitForTimeout(150);
r.outraPessoa = await pg.$eval('#fix-escolha', e=>!e.hidden);
// 5. trocar perfil com nota digitada
await pg.click('[data-fix-escolher="RG-55"]'); await pg.waitForTimeout(150);
await pg.$eval('input.nota', i=>{ i.value='3'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); });
await pg.click('#trocar'); await pg.waitForTimeout(150);
r.trocarPerfilGuardado = await pg.$eval('#fix-modal', e=>!e.hidden) && await pg.evaluate(()=>!!S.perfil);
await pg.click('#fix-ficar');
// 6. envio completo segue funcionando
await pg.$$eval('input.nota', ins=>ins.forEach(i=>{ i.value='4'; i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); }));
await pg.$$eval('textarea', ts=>ts.forEach(t=>{ t.value='ok'; t.dispatchEvent(new Event('input',{bubbles:true})); }));
await pg.click('#fm-salvar'); await pg.click('#fm-salvar'); await pg.waitForTimeout(200);
r.enviado = await pg.evaluate(()=>Object.keys(ENVIADAS));
await pg.click('#nav [data-tela="relatorio"]'); await pg.waitForTimeout(150);
r.relatorioSemModal = await pg.evaluate(()=>S.tela) + ' modal=' + await pg.$eval('#fix-modal', e=>e.hidden);
await pg.screenshot({path:'/tmp/claude-0/fix.png'});
console.log(JSON.stringify(r,null,1)); await b.close();
