import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const OPCOES_CORP = { ...OPCOES, atuacoesExtras: lerFixture('atuacoes-corporativo-mini.json') };
const base = () => lerFixture('base-mini.json');
/** Valores da janela do jsdom vêm de outro realm: compara pela forma JSON. */
const igual = (atual, esperado, msg) => assert.deepEqual(JSON.parse(JSON.stringify(atual)), esperado, msg);
const piloto = () => lerFixture('piloto-mini.json');
/** Piloto em que a camareira tem dois avaliadores no Golden: duas atuações (D14). */
const pilotoDuplo = () => { const p = piloto(); p['CAMAREIRA TESTE'].avaliadores = ['SUPERVISOR DE GOVERNANCA TESTE', 'GERENTE GERAL TESTE']; return p; };

/* ================= página no jsdom, com o bundle de verdade ================= */

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

test('banco: avaliação enviada vira documento avaliacoes/<atuacaoId:tipo> com id válido e a chave crua dentro', async () => {
  const docs = {}; const sets = [];
  const stub = { use: async (n) => n !== 'db' ? null : ({
    doc: (c) => ({ get: async () => ({ exists: c in docs, data: () => docs[c] }), set: async (d) => { sets.push([c, d]); docs[c] = d; } }),
    collection: (nome) => ({ get: async () => ({ docs: [] }), doc: (id) => ({ set: async (d) => { sets.push([nome + '/' + id, d]); docs[nome + '/' + id] = d; }, delete: async () => {} }) }),
  }) };
  const { window } = await carregarPagina(base(), pilotoDuplo(), stub, OPCOES);
  await tick(60);
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'});
    S.colab = colabPorAtuacao('GOLDEN|CAM|2'); S.tipo = 'colab'; S.notas = {}; S.obs = {}; S.confirmaEnvio = true;
    FORMS.colab.pilares.forEach((pi,i)=>pi.c.forEach((c,j)=>{ S.notas[i+'.'+j] = 3; S.obs[i+'.'+j] = 'fato'; }));
    salvarAvaliacao();`);
  await tick(60);
  const av = sets.filter(([c]) => c.startsWith('avaliacoes/'));
  assert.ok(av.length >= 1);   // a v34 pode gravar o mesmo documento duas vezes (sincronizar no render e no envio); set é idempotente
  igual([...new Set(av.map(([c]) => c))], ['avaliacoes/GOLDEN:CAM:2:colab']);
  assert.equal(av[0][1].chave, 'GOLDEN|CAM|2|colab');
});

test('gaveta do avaliador e visão por ciclo mostram só a atuação daquela linha', async () => {
  const { document, S, window } = await carregarPagina(base(), pilotoDuplo(), null, OPCOES);
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'});
    S.colab = colabPorAtuacao('GOLDEN|CAM|2'); S.tipo = 'colab'; S.notas = {}; S.obs = {}; S.confirmaEnvio = true;
    FORMS.colab.pilares.forEach((pi,i)=>pi.c.forEach((c,j)=>{ S.notas[i+'.'+j] = 2; S.obs[i+'.'+j] = 'fato'; }));
    salvarAvaliacao(); document.querySelector('#trocar').click();`);
  window.eval("entrar({nome:'Supervisor de Governança Teste', cargo:'Supervisor', papel:'avaliador', nivel:'N1'})");
  assert.equal(document.querySelectorAll('#av-equipes tbody tr').length, 1);
  assert.match(document.querySelector('#av-equipes tbody tr').textContent, /Pendente/, 'a avaliação da outra atuação não conta para a supervisora');
  document.querySelector('#av-equipes .av2-nome').click();
  assert.equal(document.querySelector('#av2-drawer').dataset.aberto, 'true');
  assert.match(document.querySelector('#av2-dr-corpo').textContent, /Nenhuma avaliação enviada/);
  document.querySelector('#av2-fechar').click();
  document.querySelector('#av2-toggle-ciclos').click();
  assert.match(document.querySelector('#av2-ciclos').textContent, /Sem avaliação enviada/);
  window.eval("document.querySelector('#trocar').click(); entrar({nome:'Gerente Geral Teste', cargo:'GG', papel:'avaliador', nivel:'N4'})");
  const linhaCam = [...document.querySelectorAll('#av-equipes tbody tr')].find(tr => /Camareira Teste/.test(tr.textContent));
  assert.match(linhaCam.textContent, /Concluída/);
  linhaCam.querySelector('.av2-nome').click();
  assert.match(document.querySelector('#av2-dr-corpo').textContent, /1 avaliação enviada/);
  await tick();   // o bloco IND reage ao data-aberto por MutationObserver
  assert.ok(document.querySelector('#ind-botao'), 'bloco IND injeta o botão de indicação');
  assert.ok(!document.querySelector('#ind-abrir').disabled, 'a atuação da linha tem avaliação enviada');
  void S;
});

test('bloco LID: marcar líder na Matriz grava podeLiderar na atuação e o formulário segue a atuação', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'})"); window.irPara('matriz');
  const linha = [...document.querySelectorAll('#m-tabela tbody tr')].find(tr => /COZINHEIRO UM TESTE/.test(tr.textContent));
  const chk = linha.querySelector('[data-lid]'); chk.checked = true; chk.dispatchEvent(new window.Event('change'));
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|COZ1|1').podeLiderar, true);
  assert.ok(window.eval("USUARIOS.some(u=>u.nome==='COZINHEIRO UM TESTE' && u.papel==='avaliador')"), 'conta criada ao marcar líder');
  assert.match(document.querySelector('#lid-msg').textContent, /agora é líder/);
  window.eval("S.colab = colabPorAtuacao('GOLDEN|COZ1|1'); irPara('form')");
  assert.equal(S.tipo, 'lider');
  const sup = [...document.querySelectorAll('#m-tabela tbody tr')];
  void sup;
});

test('bloco FIX: lista de escolha é por atuação e fixa S.colab com atuacaoId', async () => {
  const { document, S, window } = await carregarPagina(base(), pilotoDuplo(), null, OPCOES);
  window.eval("entrar({nome:'Gerente Geral Teste', cargo:'GG', papel:'avaliador', nivel:'N4'})");
  window.eval("S.fixViaNav = true; irPara('form'); S.fixViaNav = false;");
  const botoes = [...document.querySelectorAll('[data-fix-escolher]')];
  igual(botoes.map(b => b.dataset.fixEscolher).sort(), ['GOLDEN|BR1|1', 'GOLDEN|CAM|2', 'GOLDEN|PJ-SEM-ORG|1', 'GOLDEN|REC1|1']);
  botoes.find(b => b.dataset.fixEscolher === 'GOLDEN|CAM|2').click();
  assert.equal(S.colab.atuacaoId, 'GOLDEN|CAM|2');
  assert.match(document.querySelector('.fix-cab').textContent, /Camareira Teste/);
});

test('bloco IND: indicação guarda a atuação e exige avaliação daquela atuação', async () => {
  const { window } = await carregarPagina(base(), pilotoDuplo(), null, OPCOES);
  window.eval("entrar({nome:'Gerente Geral Teste', cargo:'GG', papel:'avaliador', nivel:'N4'})");
  const relato = 'x'.repeat(90);
  const sem = window.eval(`LGH_IND.criarIndicacao(colabPorAtuacao('GOLDEN|CAM|2'), 'Supervisora', '${relato}')`);
  assert.equal(sem.ok, false);
  window.eval(`S.colab = colabPorAtuacao('GOLDEN|CAM|2'); S.tipo = 'colab'; S.notas = {}; S.obs = {}; S.confirmaEnvio = true;
    FORMS.colab.pilares.forEach((pi,i)=>pi.c.forEach((c,j)=>{ S.notas[i+'.'+j] = 4; S.obs[i+'.'+j] = 'fato'; }));
    salvarAvaliacao();`);
  const r = window.eval(`LGH_IND.criarIndicacao(colabPorAtuacao('GOLDEN|CAM|2'), 'Supervisora', '${relato}')`);
  assert.equal(r.ok, true); assert.equal(r.ind.atuacaoId, 'GOLDEN|CAM|2'); assert.equal(r.ind.pessoaId, 'CAM');
  assert.equal(r.ind.unidade, 'Golden');
  assert.equal(r.ind.avaliacoesNaIndicacao.length, 1);
});

test('bloco FIX: guarda de saída com nota digitada; ficar mantém, sair descarta (teste-fix da v34)', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'Supervisor de Governança Teste', cargo:'Supervisor', papel:'avaliador', nivel:'N1'})");
  document.querySelector('#av-equipes [data-abrir]').click();
  assert.equal(S.tela, 'form'); assert.equal(S.colab.atuacaoId, 'GOLDEN|CAM|1');
  const nota = document.querySelector('input.nota'); nota.value = '4'; nota.dispatchEvent(new window.Event('input', { bubbles: true }));
  document.querySelector('#nav [data-tela="avaliador"]').click();
  assert.equal(document.querySelector('#fix-modal').hidden, false); assert.equal(S.tela, 'form');
  document.querySelector('#fix-ficar').click();
  assert.equal(Object.keys(S.notas).length, 1);
  document.querySelector('#nav [data-tela="avaliador"]').click(); document.querySelector('#fix-sair').click();
  assert.equal(S.tela, 'avaliador'); assert.equal(Object.keys(S.notas).length, 0);
});

test('bloco FORM: envio grava a versão do formulário na chave da atuação (teste-form da v34)', async () => {
  const { window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'});
    S.colab = colabPorAtuacao('GOLDEN|SUP|1'); irPara('form'); S.notas = {}; S.obs = {}; S.confirmaEnvio = true;
    FORMS[S.tipo].pilares.forEach((pi,i)=>pi.c.forEach((c,j)=>{ S.notas[i+'.'+j] = 4; S.obs[i+'.'+j] = 'fato'; }));
    salvarAvaliacao();`);
  const reg = window.eval("ENVIADAS['GOLDEN|SUP|1|lider']");
  assert.ok(reg, 'supervisora é líder: formulário de líder, chave pela atuação');
  assert.equal(reg[0].formVersao, 1); assert.equal(reg[0].tipo, 'lider');
});

test('todas as telas abrem sem erro e sem turno nas visões (teste-v29 da v34)', async () => {
  const { window, erros } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar(USUARIOS.find(u=>u.nome==='Christine Gehring'))");
  for (const t of ['avaliador', 'matriz', 'form', 'relatorio', 'evolucao', 'rh', 'ciclos', 'usuarios', 'permissoes', 'formularios', 'indicacoes']) window.irPara(t);
  assert.equal(window.eval("PESSOAS.filter(p=>'turno' in p).length"), 0);
  assert.deepEqual(erros, []);
});
