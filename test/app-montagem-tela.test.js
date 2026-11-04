import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { avaliadosDe } from '../app/js/adaptador.js';
import { pool } from '../app/js/modelo/montagem.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const CORP = 'LAGHETTO CORPORATIVO';
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const corporativo = () => lerFixture('atuacoes-corporativo-mini.json');
/** Estrutura corporativa sem a atuação do gerente geral: a raiz do Golden fica sem ligação ao corporativo. */
const corpSemGG = () => corporativo().filter(a => a.pessoaRef !== 'GG');
const por = (S, id) => S.atuacoes.find(a => a.id === id);
/** Ids de atuação tirados do estado, nunca adivinhados: pessoa → atuação corrente na organização. */
const idDe = (S, pessoa, org = 'GOLDEN') => S.atuacoes.find(a => a.pessoaRef === pessoa && a.organizacaoId === org && a.situacao === 'ativa' && a.fim == null).id;

/* ================= tela ================= */

const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4'})";
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
const REGIONAL = "entrar({nome:'Teste Regional', cargo:'RH', papel:'rh_regional', nivel:'N5'})";
const caixa = (document, id) => [...document.querySelectorAll('#ar-arvore .ar-caixa, #ar-sem-lider .ar-caixa')].find(c => c.dataset.atuacao === id);
const painel = document => document.querySelector('#ar-painel');
const linhasEquipe = document => [...painel(document).querySelectorAll('[data-equipe-linha]')];
const checks = document => [...document.querySelectorAll('#ar-pool input[type=checkbox][data-pool]')];
function escolher(window, document, sel, valor) {
  const el = document.querySelector(sel); el.value = valor; el.dispatchEvent(new window.Event('change'));
}
async function abrir(extras, login = RH) {
  const opcoes = extras ? { ...OPCOES, atuacoesExtras: extras } : OPCOES;
  const r = await carregarPagina(base(), piloto(), null, opcoes);
  r.window.eval(login); r.window.irPara('arvore');
  return r;
}

test('tela: painel fica dentro da Árvore; clicar num líder mostra a equipe dele', async () => {
  const { document, S, erros } = await abrir();
  const p = painel(document);
  assert.ok(p && p.closest('#t-arvore'), 'aside#ar-painel dentro de #t-arvore');
  assert.equal(p.tagName, 'ASIDE');
  const sup = idDe(S, 'SUP');
  caixa(document, sup).click();
  assert.equal(S.arSelecionada, sup);
  const equipe = avaliadosDe(S, 'SUP', 'GOLDEN');
  assert.equal(linhasEquipe(document).length, equipe.length);
  assert.deepEqual(linhasEquipe(document).map(l => l.dataset.equipeLinha), [...equipe.map(a => a.id)]);
  assert.match(p.textContent, /Equipe de Supervisor de Governança Teste/);
  assert.ok(linhasEquipe(document)[0].querySelector('[data-acao="remover"]'));
  assert.ok(linhasEquipe(document)[0].querySelector('[data-acao="confirmar"]'), 'a camareira tem vínculo inferido: botão Confirmar');
  assert.equal(document.querySelector('#ar-adicionar').disabled, true, 'nada selecionado: botão desabilitado');
  assert.match(document.querySelector('#ar-adicionar').textContent, /Adicionar 0 à equipe de Supervisor de Governança Teste/);
  assert.deepEqual(checks(document).map(c => c.dataset.pool).sort(), [...pool(S, 'GOLDEN').map(a => a.id).filter(id => id !== sup)].sort(),
    'o pool da tela é o do módulo, sem a própria pessoa selecionada');
  assert.deepEqual(erros.map(String), []);
});

test('tela: selecionar dois do pool e adicionar faz a equipe crescer 2; desfazer restaura', async () => {
  const { window, document, S } = await abrir();
  const sup = idDe(S, 'SUP');
  caixa(document, sup).click();
  const antes = avaliadosDe(S, 'SUP', 'GOLDEN').length;
  const disponiveis = checks(document).filter(c => c.dataset.pool !== sup);
  disponiveis[0].click(); disponiveis[1].click();
  const escolhidos = [disponiveis[0].dataset.pool, disponiveis[1].dataset.pool];
  const btn = document.querySelector('#ar-adicionar');
  assert.equal(btn.disabled, false); assert.match(btn.textContent, /Adicionar 2 à equipe de/);
  btn.click();
  assert.equal(avaliadosDe(S, 'SUP', 'GOLDEN').length, antes + 2);
  for (const id of escolhidos) assert.equal(por(S, id).superiorId, sup);
  assert.equal(linhasEquipe(document).length, antes + 2, 'o painel mostra a equipe nova');
  assert.equal(S.arSelecionada, sup, 'a seleção continua');
  assert.ok(caixa(document, sup).classList.contains('ar-ativa'));
  assert.equal(caixa(document, sup).dataset.subordinados, String(antes + 2), 'a árvore foi redesenhada');
  assert.match(window.eval("HIST[HIST.length-1].desc"), /equipe de/);
  window.desfazer();
  assert.equal(avaliadosDe(S, 'SUP', 'GOLDEN').length, antes);
  for (const id of escolhidos) assert.equal(por(S, id).superiorId, null);
  assert.equal(linhasEquipe(document).length, antes, 'o painel acompanha o desfazer');
});

test('tela: "Selecionar todos os filtrados" respeita o filtro de texto; recusa aparece em português', async () => {
  const { document, S, window } = await abrir();
  const sup = idDe(S, 'SUP');
  caixa(document, sup).click();
  const t = document.querySelector('#ar-pool-texto'); t.value = 'cozinh'; t.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(checks(document).length, 1);
  document.querySelector('#ar-pool-todos').click();
  assert.match(document.querySelector('#ar-adicionar').textContent, /Adicionar 1 à/);
  document.querySelector('#ar-adicionar').click();
  assert.equal(por(S, idDe(S, 'COZ1')).superiorId, sup);
  /* o garçom não é líder: o painel não oferece adicionar e explica */
  caixa(document, idDe(S, 'GAR1')).click();
  assert.match(painel(document).textContent, /não está marcado como líder/);
  assert.equal(document.querySelector('#ar-adicionar').disabled, true);
  /* desmarcar líder com equipe: recusado com mensagem */
  caixa(document, sup).click();
  const hist = window.eval('HIST.length');
  painel(document).querySelector('[data-acao="lider"]').click();
  assert.match(document.querySelector('#ar-painel-msg').textContent, /tem equipe/);
  assert.equal(window.eval('HIST.length'), hist, 'recusa não deixa passo no Desfazer');
  assert.ok(!/[\u2013\u2014]/.test(painel(document).textContent), 'sem travessão');
});

test('tela: Confirmar vínculo inferido, Remover e Marcar como raiz passam pelo Desfazer', async () => {
  const { window, document, S } = await abrir(null, ADMIN);
  const gg = idDe(S, 'GG'), sup = idDe(S, 'SUP'), cam = idDe(S, 'CAM');
  caixa(document, sup).click();
  linhasEquipe(document).find(l => l.dataset.equipeLinha === cam).querySelector('[data-acao="confirmar"]').click();
  assert.equal(por(S, cam).origem, 'definido');
  linhasEquipe(document).find(l => l.dataset.equipeLinha === cam).querySelector('[data-acao="remover"]').click();
  assert.equal(por(S, cam).superiorId, null);
  assert.ok(checks(document).some(c => c.dataset.pool === cam), 'a camareira volta ao pool');
  painel(document).querySelector('[data-acao="raiz"]').click();
  assert.equal(por(S, sup).ehRaiz, true); assert.equal(por(S, gg).ehRaiz, false);
  window.desfazer(); window.desfazer(); window.desfazer();
  assert.equal(por(S, gg).ehRaiz, true); assert.equal(por(S, cam).superiorId, sup); assert.match(por(S, cam).origem, /^inferido_/);
  /* o líder com vínculo inferido: confirmar no cabeçalho */
  caixa(document, cam).click();
  const conf = painel(document).querySelector('[data-acao="confirmar-proprio"]');
  assert.ok(conf, 'a camareira selecionada tem o próprio vínculo inferido');
  conf.click();
  assert.equal(por(S, cam).origem, 'definido');
});

test('tela: avaliador vê o painel só para leitura', async () => {
  const { document, S } = await abrir(null, "entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})");
  const sup = idDe(S, 'SUP');
  caixa(document, sup).click();
  assert.ok(linhasEquipe(document).length > 0, 'vê a equipe');
  assert.equal(painel(document).querySelectorAll('button[data-acao]').length, 0, 'nenhum botão de ação');
  assert.equal(document.querySelector('#ar-adicionar'), null);
  assert.equal(checks(document).length, 0);
  assert.match(painel(document).textContent, /Somente leitura/);
});

test('tela: RH da unidade não tem "Marcar como raiz" e não age no corporativo', async () => {
  const { document, S } = await abrir(corporativo());
  caixa(document, idDe(S, 'SUP')).click();
  assert.equal(painel(document).querySelector('[data-acao="raiz"]'), null, 'definirRaiz é só da holding');
  assert.ok(painel(document).querySelector('[data-acao="lider"]'), 'mas edita a unidade');
  /* forçando a seleção de uma caixa corporativa: o painel fica só para leitura */
  S.organizacaoSelecionada = CORP;
  document.dispatchEvent(new document.defaultView.CustomEvent('lgh-arvore-selecionada', { detail: { atuacaoId: idDe(S, 'DR', CORP) } }));
  assert.equal(painel(document).querySelectorAll('button[data-acao]').length, 0);
  assert.equal(checks(document).length, 0);
  assert.match(painel(document).textContent, /Somente leitura/);
});

test('tela: RH regional vê a Rede, mas a estrutura corporativa é só leitura', async () => {
  const { window, document, S } = await abrir(corpSemGG(), REGIONAL);
  escolher(window, document, '#ar-org', CORP);
  caixa(document, idDe(S, 'DR', CORP)).click();
  assert.equal(painel(document).querySelectorAll('button[data-acao]').length, 0);
  assert.equal(checks(document).length, 0);
});

test('tela: na Rede, adicionar do pool cria a atuação corporativa sob o diretor regional; desfazer devolve ao pool', async () => {
  const { window, document, S, erros } = await abrir(corpSemGG(), ADMIN);
  escolher(window, document, '#ar-org', CORP);
  const dr = idDe(S, 'DR', CORP), gg = idDe(S, 'GG');
  caixa(document, dr).click();
  const c = checks(document).find(x => x.dataset.pool === `r:${gg}`);
  assert.ok(c, 'o gerente geral do Golden está no pool da Rede');
  c.click();
  document.querySelector('#ar-adicionar').click();
  const nova = S.atuacoes.find(a => a.pessoaRef === 'GG' && a.organizacaoId === CORP && a.situacao === 'ativa');
  assert.ok(nova); assert.equal(nova.superiorId, dr);
  assert.ok(linhasEquipe(document).some(l => l.dataset.equipeLinha === nova.id));
  assert.ok(document.querySelector('[data-unidade="GOLDEN"]'), 'o Golden aparece fechado na caixa do gerente geral');
  window.desfazer();
  assert.ok(!S.atuacoes.some(a => a.pessoaRef === 'GG' && a.organizacaoId === CORP));
  assert.ok(checks(document).some(x => x.dataset.pool === `r:${gg}`));
  assert.deepEqual(erros.map(String), []);
});

test('R22: marcar líder pelo painel cria a conta de Avaliador, como na Matriz; desmarcar tira', async () => {
  const { window, document, S } = await abrir();
  const coz = idDe(S, 'COZ1');
  const conta = () => window.eval("JSON.stringify(USUARIOS.filter(u => u.nome === 'COZINHEIRO UM TESTE'))");
  assert.deepEqual(JSON.parse(conta()), [], 'premissa: sem conta');
  caixa(document, coz).click();
  painel(document).querySelector('[data-acao="lider"]').click();
  assert.equal(por(S, coz).podeLiderar, true);
  const c = JSON.parse(conta());
  assert.equal(c.length, 1); assert.equal(c[0].papel, 'avaliador'); assert.equal(c[0].ativo, true);
  assert.match(document.querySelector('#ar-painel-msg').textContent, /agora é líder/);
  assert.match(painel(document).querySelector('[data-acao="lider"]').textContent, /Desmarcar como líder/);
  painel(document).querySelector('[data-acao="lider"]').click();
  assert.equal(por(S, coz).podeLiderar, false);
  assert.deepEqual(JSON.parse(conta()), [], 'a conta criada pela marca some junto');
});

test('Marcar como raiz: a mensagem diz quantas pessoas ficaram fora da árvore', async () => {
  const { document, S } = await abrir(null, ADMIN);
  const gg = idDe(S, 'GG'), sup = idDe(S, 'SUP');
  /* pessoas abaixo do gerente geral, contadas direto de S.atuacoes */
  const abaixo = new Set(); const fila = [gg];
  while (fila.length) { const id = fila.shift(); for (const a of S.atuacoes.filter(x => x.superiorId === id && x.situacao === 'ativa' && x.fim == null)) { abaixo.add(a.pessoaRef); fila.push(a.id); } }
  assert.ok(abaixo.size > 0);
  caixa(document, sup).click();
  painel(document).querySelector('[data-acao="raiz"]').click();
  assert.equal(por(S, sup).ehRaiz, true);
  assert.match(document.querySelector('#ar-painel-msg').textContent,
    new RegExp(`A raiz anterior e ${abaixo.size} pessoas abaixo dela ficaram fora da árvore até serem religadas`));
});

test('Rede: pessoa sem cargo na carga pede a função antes de adicionar, e a função digitada é a gravada', async () => {
  const soCEO = corporativo().filter(a => a.pessoaRef === 'CEO-REDE');
  const { window, document, S } = await abrir(soCEO, ADMIN);
  S.semOrganizacao.find(p => p.id === 'DR').vinculosPJ = [{ empresa: 'X', cargo: null }];
  escolher(window, document, '#ar-org', CORP);
  caixa(document, idDe(S, 'CEO-REDE', CORP)).click();
  checks(document).find(c => c.dataset.pool === 'p:DR').click();
  assert.match(painel(document).textContent, /DIRETOR REGIONAL TESTE não tem cargo na carga; informe a função/);
  const btn = document.querySelector('#ar-adicionar');
  assert.equal(btn.disabled, true, 'sem a função o botão fica desabilitado');
  const f = document.querySelector('#ar-funcao'); f.value = 'Diretor regional'; f.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(btn.disabled, false);
  btn.click();
  const nova = S.atuacoes.find(a => a.pessoaRef === 'DR' && a.organizacaoId === CORP);
  assert.ok(nova); assert.equal(nova.funcao, 'Diretor regional');
  assert.ok(!S.atuacoes.some(a => a.funcao === 'Sem função'));
});
