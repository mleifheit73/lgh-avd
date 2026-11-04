import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { validarArvore } from '../app/js/modelo/atuacao.js';

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
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'});
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
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'});
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
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})"); window.irPara('matriz');
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
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'});
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

test('trocar a organização com nota digitada não leva a nota para outra pessoa', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  /* I1 (R12): troca de organização com o RH regional (o da unidade só tem a sua) */
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_regional', nivel:'N5'}); S.colab = colabPorAtuacao('GOLDEN|CAM|1'); irPara('form')");
  const nota = document.querySelector('input.nota'); nota.value = '4'; nota.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(Object.keys(S.notas).length, 1);
  window.eval("trocarOrganizacao('BRANO')");
  assert.equal(S.colab.organizacaoId, 'BRANO');
  assert.equal(Object.keys(S.notas).length, 0);
});

/* ================= correções da revisão (R15 a R18) ================= */

test('R16 na página: atuação desfeita não devolve o id; a nova não herda a avaliação', async () => {
  const { S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})");
  const criar = () => window.eval("tentarMudar('x', ()=>LGH.definirSuperior(S,'GOLDEN|CAM|1','GOLDEN|GG|1','RH')).valor.atuacao.id");
  assert.equal(criar(), 'GOLDEN|CAM|2');
  window.eval(`S.colab = colabPorAtuacao('GOLDEN|CAM|2'); S.tipo = 'colab'; S.notas = {}; S.obs = {}; S.confirmaEnvio = true;
    FORMS.colab.pilares.forEach((pi,i)=>pi.c.forEach((c,j)=>{ S.notas[i+'.'+j] = 4; S.obs[i+'.'+j] = 'fato'; }));
    salvarAvaliacao();`);
  assert.ok(window.eval("ENVIADAS['GOLDEN|CAM|2|colab']"));
  window.eval('desfazer()');
  assert.equal(S.atuacoes.some(a => a.id === 'GOLDEN|CAM|2'), false);
  const novo = criar();
  assert.equal(novo, 'GOLDEN|CAM|3');
  assert.equal(window.eval(`concluida(colabPorAtuacao('${novo}'))`), false);
});

test('R16 na página: id de atuação que só existe numa chave do banco fica reservado', async () => {
  const docs = { };
  const stub = { use: async (n) => n !== 'db' ? null : ({
    doc: (c) => ({ get: async () => ({ exists: c in docs, data: () => docs[c] }), set: async () => {} }),
    collection: (nome) => ({ get: async () => ({ docs: nome === 'avaliacoes' ? [{ data: () => ({ chave: 'GOLDEN|CAM|2|colab', versoes: [{ versao: 1, media: 3, notas: {}, obs: {} }] }) }] : [] }),
      doc: () => ({ set: async () => {}, delete: async () => {} }) }),
  }) };
  const { window } = await carregarPagina(base(), piloto(), stub, OPCOES);
  await tick(60);
  const id = window.eval("LGH.definirSuperior(S,'GOLDEN|CAM|1','GOLDEN|GG|1','RH').atuacao.id");
  assert.equal(id, 'GOLDEN|CAM|3');
});

test('lote com uma pessoa recusada: as atuações dela ficam exatamente como estavam, as outras recebem', async () => {
  const { S, window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'});
    LGH.marcarLider(S,'GOLDEN|DUPLO-VINCULO|1',true);   /* R20: DUPLO não lidera na fixture; o gerente geral é raiz e já nasce líder (R23) */
    window.__prep = [LGH.definirSuperior(S,'GOLDEN|SUP|1','GOLDEN|GG|1','RH').ok, LGH.definirSuperior(S,'GOLDEN|SUP|1','GOLDEN|DUPLO-VINCULO|1','RH').ok];
    LGH.marcarLider(S,'GOLDEN|CAM|1',true); reconstruirViews(); irPara('matriz');`);
  assert.deepEqual([...window.__prep], [true, true], 'preparação aceita');
  assert.equal(S.atuacoes.filter(a => a.pessoaRef === 'SUP' && a.situacao === 'ativa').length, 2, 'premissa: SUP com duas atuações');
  const antes = JSON.stringify(S.atuacoes.filter(a => a.pessoaRef === 'SUP'));
  window.eval("S.filtrados = PESSOAS.filter(p=>p.id==='SUP'||p.id==='COZ1'); aplicarLote('GOLDEN|CAM|1'); aplicarLote('GOLDEN|CAM|1')");   // sem filtro ativo o lote pede confirmação: segundo clique
  assert.equal(JSON.stringify(S.atuacoes.filter(a => a.pessoaRef === 'SUP')), antes);
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|COZ1|1').superiorId, 'GOLDEN|CAM|1');
  assert.match(document.querySelector('#lote-msg').textContent, /Supervisor de Governança Teste/);
  validarArvore(S.atuacoes, 'GOLDEN');
});

test('Matriz: avaliação mútua pela tela é recusada com mensagem e sem passo no Desfazer', async () => {
  const { S, window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'}); LGH.marcarLider(S,'GOLDEN|CAM|1',true); reconstruirViews(); irPara('matriz')");
  const n = window.eval('HIST.length');
  const linha = [...document.querySelectorAll('#m-tabela tbody tr')].find(tr => tr.querySelector('td b').textContent === 'Supervisor de Governança Teste');
  const sel = linha.querySelector('select.add-av'); sel.value = 'GOLDEN|CAM|1'; sel.dispatchEvent(new window.Event('change'));
  assert.match(document.querySelector('#lote-msg').textContent, /Não foi possível: Avaliação mútua/);
  assert.equal(window.eval('HIST.length'), n);
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|SUP|1').superiorId, null);
});

test('R18: indicação tem organização; RH vê na lista só a do topo, o alerta conta todas; "acima" vem das atuações', async () => {
  const { S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  const L = window.eval('LGH_IND.lista');
  const ind = (id, org, por, porPessoaId) => ({ id, pessoaId: 'CAM', pessoaNome: 'x', cargoAtual: 'x', setor: 'x', unidade: 'x', por, porPessoaId, em: 'x', emISO: '2026-11-04T00:00:00Z',
    cargoPretendido: 'x', relato: 'x', status: 'recebida', avaliacoesNaIndicacao: [], historico: [], lidasPor: {}, parecerIA: null, ...(org ? { organizacaoId: org } : {}) });
  L.push(ind('i1', 'GOLDEN', 'Supervisor de Governança Teste', 'SUP'), ind('i2', 'BRANO', 'SUPERVISOR BRANO TESTE', 'BR3'), ind('i3', null, 'Supervisor de Governança Teste', 'SUP'));
  /* I1 (R12): o RH regional alcança todas; o da unidade, só a sua (testes I1 em app-montagem-tela.test.js) */
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_regional', nivel:'N5'}); irPara('indicacoes')");
  const ids = () => [...window.document.querySelectorAll('[data-ind]')].map(b => b.dataset.ind).sort();
  igual(ids(), ['i1'], 'i3 sem organização conta como HOTEL LAGHETTO GOLDEN, que não existe na fixture');
  assert.match(window.document.querySelector('#ind-alerta').textContent, /^2 colaboradores/, 'i1 e i2: todas as organizações que o RH alcança');
  window.eval("trocarOrganizacao('BRANO')");
  igual(ids(), ['i2']);
  // avaliador acima do líder, pelas atuações: GG acima de SUP
  assert.equal(window.eval("LGH.definirSuperior(S,'GOLDEN|SUP|1','GOLDEN|GG|1','RH').ok"), true);
  window.eval("reconstruirViews(); document.querySelector('#trocar').click(); entrar({nome:'Gerente Geral Teste', cargo:'GG', papel:'avaliador', nivel:'N4'}); irPara('indicacoes')");
  igual(ids(), ['i1'], 'GG vê a indicação da supervisora que ele avalia no Golden');
  void S;
});

test('M5: sem window.claude, gerar relatório e parecer por IA não lança e avisa que a IA está indisponível', async () => {
  const { window, document, erros } = await carregarPagina(lerFixture('base-mini.json'), {}, false);
  assert.equal(typeof window.claude, 'undefined', 'premissa: página fora do claude.ai');
  await document.querySelector('#rel-gerar').onclick();
  assert.match(document.querySelector('#rel-texto').textContent, /Geração por IA indisponível nesta visualização/);
  assert.equal(await window.eval('obterSample()'), null);
  /* use() que rejeita também vira indisponível */
  window.claude = { use: async () => { throw new Error('sem capacidade'); } };
  assert.equal(await window.eval('obterSample()'), null);
  assert.deepEqual(erros.map(String), []);
});
