import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { atuacoesDe, validarArvore } from '../app/js/modelo/atuacao.js';

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

test('página: boot monta S.atuacoes e S.organizacoes pelo bundle e PESSOAS é a visão da organização selecionada', async () => {
  const { S, window, erros } = await carregarPagina(base(), piloto(), null, OPCOES);
  assert.equal(typeof window.LGH.atuacoesIniciais, 'function');
  assert.equal(S.organizacaoSelecionada, 'GOLDEN');
  igual(S.organizacoes.map(o => o.id), ['BRANO', 'GOLDEN', 'LAGHETTO CORPORATIVO']);
  assert.ok(Array.isArray(S.atuacoes) && S.atuacoes.length > 0);
  assert.ok(Array.isArray(S.logCarga)); assert.ok(Array.isArray(S.semOrganizacao));
  assert.equal(typeof S.pessoasPorId.get, 'function'); assert.equal(S.pessoasPorId.get('CAM').nome, 'CAMAREIRA TESTE');
  const P = window.eval('PESSOAS');
  igual(P.map(p => p.id).sort(), ['ANA', 'BR1', 'CAM', 'COZ1', 'DUPLO-VINCULO', 'GAR1', 'GG', 'PJ-SEM-ORG', 'REC1', 'SUP']);
  assert.equal(window.eval('AVALIAVEIS').length, 10);
  assert.equal(typeof window.herdarAvaliadores, 'undefined');
  igual(erros, []);
});

test('página: tabela de equivalência é carregada por fetch e passada à carga', async () => {
  const { S } = await carregarPagina(base(), piloto(), null, OPCOES);
  assert.ok(!S.logCarga.some(l => l.codigo === 'tabela_equivalencia_indisponivel'));
});

test('página: seletor de organização no topo, com marcador e contagem; trocar reconstrói a visão e redesenha a tela', async () => {
  const { S, window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4'})");
  const sel = document.querySelector('#org-seletor');
  assert.ok(sel && !sel.hidden);
  const ops = [...sel.options].map(o => o.textContent);
  assert.ok(ops.some(t => /Golden/.test(t) && /10 pessoas/.test(t) && /sugerida pela carga/.test(t)), ops.join(' | '));
  assert.ok(ops.some(t => /Laghetto Corporativo/.test(t) && !/sugerida/.test(t)));
  assert.ok(document.querySelector('#org-empresa'));
  window.irPara('matriz');
  assert.equal(document.querySelectorAll('#m-tabela tbody tr').length, 10);
  sel.value = 'BRANO'; sel.dispatchEvent(new window.Event('change'));
  assert.equal(S.organizacaoSelecionada, 'BRANO');
  igual(window.eval('PESSOAS').map(p => p.id).sort(), ['ANA', 'BR2', 'BR3']);
  assert.equal(document.querySelectorAll('#m-tabela tbody tr').length, 3);
});

test('página: filtro por empresa restringe as organizações do seletor', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'Teste RH', cargo:'RH', papel:'admin', nivel:'N6'})");
  const emp = document.querySelector('#org-empresa');
  const empresas = [...emp.options].map(o => o.value);
  assert.ok(empresas.includes('BRANO'));
  emp.value = 'BRANO'; emp.dispatchEvent(new window.Event('change'));
  const orgs = [...document.querySelector('#org-seletor').options].map(o => o.value);
  assert.ok(orgs.includes('BRANO')); assert.ok(!orgs.includes('LAGHETTO CORPORATIVO'));
});

test('página: avaliador só vê no seletor as organizações onde tem atuação', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'Ana Teste Dupla Filial', cargo:'x', papel:'avaliador', nivel:'N1'})");
  igual([...document.querySelector('#org-seletor').options].map(o => o.value).sort(), ['BRANO', 'GOLDEN']);
  window.eval("document.querySelector('#trocar').click(); entrar({nome:'Recepcionista Brano Teste', cargo:'x', papel:'avaliador', nivel:'N1'})");
  assert.equal(S.organizacaoSelecionada, 'GOLDEN', 'BR1 foi realocado pelo piloto: só tem atuação no Golden');
});

test('Matriz renderiza só a organização selecionada e mostra o rótulo de origem', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  S.perfil = { papel: 'rh_unidade', nome: 'RH Teste' }; window.irPara('matriz');
  const linhas = [...document.querySelectorAll('#m-tabela tbody tr')];
  assert.equal(linhas.length, 10);
  assert.ok([...document.querySelectorAll('#m-tabela thead th')].some(th => th.textContent === 'Origem do vínculo'));
  const cam = linhas.find(tr => /Camareira Teste/.test(tr.textContent));
  assert.match(cam.textContent, /Inferido pelo cargo/);
  assert.ok(linhas.some(tr => /Da carga, sem superior/.test(tr.textContent)));
  assert.ok(!linhas.some(tr => /BRANO TESTE|CAMAREIRA BRANO/i.test(tr.textContent) && !/Recepcionista Brano/i.test(tr.textContent)));
  const gg = linhas.find(tr => /GERENTE GERAL TESTE/.test(tr.textContent));
  assert.match(gg.textContent, /Raiz da unidade/);
});

test('Matriz: adicionar avaliador grava em S.atuacoes, o segundo cria outra atuação, Desfazer volta', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'})"); window.irPara('matriz');
  const linha = () => [...document.querySelectorAll('#m-tabela tbody tr')].find(tr => /COZINHEIRO UM TESTE/.test(tr.textContent));
  let sel = linha().querySelector('select.add-av');
  assert.ok([...sel.options].some(o => o.value === 'GOLDEN|SUP|1'), 'a lista de líderes é de atuações com podeLiderar');
  sel.value = 'GOLDEN|SUP|1'; sel.dispatchEvent(new window.Event('change'));
  const coz = S.atuacoes.find(a => a.id === 'GOLDEN|COZ1|1');
  assert.equal(coz.superiorId, 'GOLDEN|SUP|1'); assert.equal(coz.origem, 'definido'); assert.equal(coz.confirmadaPor, 'RH Teste');
  assert.match(linha().textContent, /Definido pelo RH/);
  igual(window.eval("PESSOAS.find(p=>p.id==='COZ1').avaliadores"), ['Supervisor de Governança Teste']);
  window.eval("LGH.marcarLider(S, 'GOLDEN|GG|1', true); reconstruirViews(); pintarMatriz()");
  sel = linha().querySelector('select.add-av');
  sel.value = 'GOLDEN|GG|1'; sel.dispatchEvent(new window.Event('change'));
  assert.equal(atuacoesDe(S.atuacoes, 'COZ1').length, 2);
  window.eval("document.querySelector('#btn-desfazer').click()");
  assert.equal(atuacoesDe(S.atuacoes, 'COZ1').length, 1);
  window.eval("document.querySelector('#btn-desfazer').click()");
  window.eval("document.querySelector('#btn-desfazer').click()");
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|COZ1|1').superiorId, null);
  igual(window.eval("PESSOAS.find(p=>p.id==='COZ1').avaliadores"), []);
});

test('Matriz: remover avaliador pelo chip e editar setor e situação gravam nas atuações', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'})"); window.irPara('matriz');
  const linha = () => [...document.querySelectorAll('#m-tabela tbody tr')].find(tr => /Camareira Teste/.test(tr.textContent));
  linha().querySelector('[data-rm]').click();
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|CAM|1').superiorId, null);
  const st = linha().querySelector('select[data-st]'); st.value = 'Recepção'; st.dispatchEvent(new window.Event('change'));
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|CAM|1').setor, 'Recepção');
  const si = linha().querySelector('select[data-si]'); si.value = 'Férias'; si.dispatchEvent(new window.Event('change'));
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|CAM|1').situacaoColab, 'Férias');
  assert.equal(window.eval("PESSOAS.find(p=>p.id==='CAM').situacao"), 'Férias');
});

test('Matriz: lote define o mesmo avaliador para os filtrados e respeita a raiz', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'})"); window.irPara('matriz');
  const fs = document.querySelector('#f-setor'); fs.value = 'Sem setor'; fs.dispatchEvent(new window.Event('change'));
  const n = window.eval('S.filtrados.length');
  assert.ok(n >= 3);
  const lote = document.querySelector('#lote-av');
  lote.value = 'GOLDEN|SUP|1'; lote.dispatchEvent(new window.Event('change'));
  document.querySelector('#lote-aplicar').click();
  const alvos = window.eval('S.filtrados.map(p=>p.id)');
  for (const id of alvos) if (id !== 'GG') assert.ok(S.atuacoes.some(a => a.pessoaRef === id && a.superiorId === 'GOLDEN|SUP|1'), id);
  validarArvore(S.atuacoes, 'GOLDEN');
});

test('Formulário lista no seletor só quem o avaliador avalia, por atuação', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  S.perfil = { papel: 'avaliador', pessoaId: 'SUP', nome: 'Supervisor de Governança Teste' }; window.irPara('form');
  const ops = document.querySelectorAll('#fm-colab option');
  assert.equal(ops.length, 1);
  assert.equal(ops[0].value, 'GOLDEN|CAM|1');
  assert.match(document.querySelector('#fm-unidade').textContent, /Golden/);
});

test('chave da avaliação separa as duas atuações da mesma pessoa e as duas avaliações ficam gravadas separadas', async () => {
  const { S, window } = await carregarPagina(base(), pilotoDuplo(), null, OPCOES);
  const [a1, a2] = atuacoesDe(S.atuacoes, 'CAM');
  S.colab = a1; S.tipo = 'colab'; const k1 = window.chaveAval();
  S.colab = a2; const k2 = window.chaveAval();
  assert.notEqual(k1, k2); assert.match(k1, /\|colab$/);
  assert.equal(k1, 'GOLDEN|CAM|1|colab');
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'})");
  const enviar = (atuacaoId, nota) => window.eval(`
    S.colab = colabPorAtuacao('${atuacaoId}'); S.tipo = 'colab'; S.notas = {}; S.obs = {}; S.confirmaEnvio = true;
    FORMS.colab.pilares.forEach((pi,i)=>pi.c.forEach((c,j)=>{ S.notas[i+'.'+j] = ${nota}; S.obs[i+'.'+j] = 'fato observado'; }));
    salvarAvaliacao();`);
  enviar('GOLDEN|CAM|1', 4); enviar('GOLDEN|CAM|2', 2);
  const E = window.eval('ENVIADAS');
  igual(Object.keys(E).sort(), ['GOLDEN|CAM|1|colab', 'GOLDEN|CAM|2|colab']);
  assert.equal(E['GOLDEN|CAM|1|colab'][0].media, 4); assert.equal(E['GOLDEN|CAM|2|colab'][0].media, 2);
});

test('Painel do avaliador: uma linha por atuação; a mesma pessoa duas vezes sob o mesmo avaliador traz "2ª atuação"', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  // SUP ganha uma segunda atuação (sob DUPLO) e CAM ganha uma segunda atuação sob ela: CAM aparece duas vezes para SUP
  window.LGH.definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|GG|1', 'RH');
  const sup2 = window.LGH.definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|DUPLO-VINCULO|1', 'RH').atuacao;
  assert.equal(sup2.id, 'GOLDEN|SUP|2');
  assert.equal(window.LGH.definirSuperior(S, 'GOLDEN|CAM|1', sup2.id, 'RH').atuacao.id, 'GOLDEN|CAM|2');
  window.reconstruirViews();
  window.eval("entrar({nome:'Supervisor de Governança Teste', cargo:'Supervisor', papel:'avaliador', nivel:'N1'})");
  const linhas = [...document.querySelectorAll('#av-equipes tbody tr')];
  assert.equal(linhas.length, 2);
  assert.equal(linhas.filter(tr => /2ª atuação/.test(tr.textContent)).length, 1);
  igual([...document.querySelectorAll('#av-equipes [data-abrir]')].map(b => b.dataset.abrir).sort(), ['GOLDEN|CAM|1', 'GOLDEN|CAM|2']);
  assert.match(document.querySelector('#av-kpis').textContent, /2\s*Avaliados/);
});

test('Painel do RH conta a organização selecionada e usa o nome dela', async () => {
  const { document, S, window } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'})");
  window.irPara('rh');
  const kpis = document.querySelector('#rh-kpis').textContent;
  assert.match(kpis, /10\s*Colaboradores/);
  assert.match(document.querySelector('#rh-sub').textContent, /Golden/);
  assert.doesNotMatch(document.querySelector('#t-rh').textContent, /Hotel Laghetto Golden|Ijuliane/);
  S.organizacaoSelecionada = 'BRANO'; window.reconstruirViews(); window.irPara('rh');
  assert.match(document.querySelector('#rh-kpis').textContent, /3\s*Colaboradores/);
  assert.match(document.querySelector('#rh-sub').textContent, /BRANO/);
});

test('Usuários: a coluna Nível é calculada (nivelDe), n/d quando não há posição', async () => {
  const { document, window } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
  window.eval("USUARIOS.push({nome:'Supervisor de Governança Teste', cargo:'x', cpf:'', email:'s@x', papel:'avaliador', nivel:'N6', escopo:'x', ativo:true})");
  window.eval("entrar(USUARIOS.find(u=>u.nome==='Marcelo Leifheit'))");
  window.irPara('usuarios');
  const sel = document.querySelector('#lid-unidade'); if (sel) { sel.value = ''; sel.dispatchEvent(new window.Event('change')); }
  const linha = nome => [...document.querySelectorAll('#us-tabela tbody tr')].find(tr => tr.querySelector('td b') && tr.querySelector('td b').textContent === nome);
  assert.equal(linha('Supervisor de Governança Teste').children[3].textContent.trim(), 'N1', 'o nível gravado (N6) é ignorado');
  assert.equal(linha('Marcelo Leifheit').children[3].textContent.trim(), 'N6');
  assert.equal(linha('Vivian').children[3].textContent.trim(), 'n/d');
});

test('Evolução lista por atuação e lê ENVIADAS pela atuação', async () => {
  const { document, window } = await carregarPagina(base(), pilotoDuplo(), null, OPCOES);
  window.eval(`entrar({nome:'RH Teste', cargo:'RH', papel:'rh_unidade', nivel:'N4'});
    S.colab = colabPorAtuacao('GOLDEN|CAM|1'); S.tipo = 'colab'; S.notas = {}; S.obs = {}; S.confirmaEnvio = true;
    FORMS.colab.pilares.forEach((pi,i)=>pi.c.forEach((c,j)=>{ S.notas[i+'.'+j] = 5; S.obs[i+'.'+j] = 'fato'; }));
    salvarAvaliacao();`);
  window.irPara('evolucao');
  const ops = [...document.querySelectorAll('#ev-colab option')].map(o => o.value);
  assert.ok(ops.includes('GOLDEN|CAM|1') && ops.includes('GOLDEN|CAM|2'));
  const sel = document.querySelector('#ev-colab');
  sel.value = 'GOLDEN|CAM|1'; sel.dispatchEvent(new window.Event('change'));
  assert.match(document.querySelector('#ev-origem').textContent, /Primeiro ciclo com dado real/);
  sel.value = 'GOLDEN|CAM|2'; sel.dispatchEvent(new window.Event('change'));
  assert.match(document.querySelector('#ev-origem').textContent, /Nenhuma avaliação enviada/);
});
