import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { semSuperior, atuacoesDe } from '../app/js/modelo/atuacao.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const OPCOES_CORP = { ...OPCOES, atuacoesExtras: lerFixture('atuacoes-corporativo-mini.json') };
const CORP = 'LAGHETTO CORPORATIVO';
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const pilotoDuplo = () => { const p = piloto(); p['CAMAREIRA TESTE'].avaliadores = ['SUPERVISOR DE GOVERNANCA TESTE', 'GERENTE GERAL TESTE']; return p; };
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4'})";
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
const correntes = (S, org) => JSON.parse(JSON.stringify(S.atuacoes)).filter(a => a.organizacaoId === org && a.situacao === 'ativa' && a.fim == null);
const medidorEsperado = r => `${r.comSuperior} de ${r.total - r.raiz} com líder definido, ${r.semSuperior} sem líder`;
const caixa = (document, id) => [...document.querySelectorAll('.ar-caixa')].find(c => c.dataset.atuacao === id);
function escolher(window, document, sel, valor) {
  const el = document.querySelector(sel); el.value = valor; el.dispatchEvent(new window.Event('change'));
}

test('Árvore: aba logo depois da Matriz, exige verMatriz', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH);
  const abas = [...document.querySelectorAll('#nav button')].map(b => b.dataset.tela);
  assert.equal(abas[abas.indexOf('matriz') + 1], 'arvore');
  assert.equal(document.querySelector('#nav [data-tela="arvore"]').textContent.replace(/^\d+/, ''), 'Árvore');
  assert.ok(document.querySelector('#t-arvore'));
});

test('Árvore da unidade: medidor bate com resumoOrganizacao, toda atuação tem caixa, Sem líder lista os nomes', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH); window.irPara('arvore');
  assert.equal(document.querySelector('#t-arvore').hidden, false);
  const r = window.LGH.resumoOrganizacao(S, 'GOLDEN');
  assert.match(document.querySelector('#ar-medidor').textContent, new RegExp(medidorEsperado(r).replace(/[()]/g, '\\$&')));
  assert.match(document.querySelector('#ar-medidor').textContent, new RegExp(`${r.inferidos} inferid`));
  const ids = [...document.querySelectorAll('#t-arvore .ar-caixa')].map(c => c.dataset.atuacao).sort();
  assert.deepEqual(ids, [...correntes(S, 'GOLDEN').map(a => a.id)].sort());
  const sem = document.querySelector('#ar-sem-lider');
  assert.equal(sem.querySelectorAll('[data-alvo]').length, semSuperior(S.atuacoes, 'GOLDEN').length);
  assert.match(sem.textContent, /Supervisor de Governança Teste/, 'nome de exibição do piloto');
  for (const a of semSuperior(S.atuacoes, 'GOLDEN')) assert.ok(caixa(document, a.id).classList.contains('ar-sem-superior'), a.id);
  assert.ok(!caixa(document, 'GOLDEN|GG|1').classList.contains('ar-sem-superior'));
  const leg = document.querySelector('#ar-legenda').textContent;
  for (const t of ['Da carga, sem superior', 'Inferido pelo cargo', 'Inferido pela empresa', 'Definido pelo RH']) assert.match(leg, new RegExp(t));
});

test('Árvore: trocar de organização re-renderiza, e os dois seletores andam juntos', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH); window.irPara('arvore');
  escolher(window, document, '#ar-org', 'BRANO');
  assert.equal(S.organizacaoSelecionada, 'BRANO');
  assert.equal(document.querySelector('#org-seletor').value, 'BRANO');
  const r = window.LGH.resumoOrganizacao(S, 'BRANO');
  assert.match(document.querySelector('#ar-medidor').textContent, new RegExp(medidorEsperado(r)));
  assert.match(document.querySelector('#ar-arvore').textContent, /não tem raiz/);
  assert.equal(document.querySelectorAll('#t-arvore .ar-caixa').length, correntes(S, 'BRANO').length);
  assert.match(document.querySelector('#ar-cabecalho').textContent, /sem gerente geral/i);
  escolher(window, document, '#org-seletor', 'GOLDEN');
  assert.equal(document.querySelector('#ar-org').value, 'GOLDEN');
  assert.ok(caixa(document, 'GOLDEN|GG|1'));
  const emp = [...document.querySelector('#ar-empresa').options].map(o => o.value);
  assert.deepEqual(emp, [...document.querySelector('#org-empresa').options].map(o => o.value));
});

test('visão Rede: Golden como cartão fechado na caixa do gerente geral sob o DR; Brano sem ligação; clique abre a unidade', async () => {
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
  window.eval(ADMIN); window.irPara('arvore');
  const op = [...document.querySelector('#ar-org').options].find(o => o.value === CORP);
  assert.match(op.textContent, /Rede \(estrutura corporativa\)/);
  escolher(window, document, '#ar-org', CORP);
  assert.equal(S.organizacaoSelecionada, CORP);
  const cartao = document.querySelector('[data-unidade="GOLDEN"]');
  assert.ok(cartao);
  assert.equal(cartao.closest('.ar-caixa').dataset.atuacao, 'LAGHETTO CORPORATIVO|GG|1');
  const pai = cartao.closest('.ar-caixa').closest('ul').closest('li').querySelector(':scope > .ar-caixa');
  assert.equal(pai.dataset.atuacao, 'LAGHETTO CORPORATIVO|DR|1');
  assert.match(cartao.textContent, /Gerente geral: GERENTE GERAL TESTE/);
  const rg = window.LGH.resumoOrganizacao(S, 'GOLDEN');
  assert.match(cartao.textContent, new RegExp(medidorEsperado(rg)));
  assert.ok(!cartao.classList.contains('ar-unidade-vermelha'));
  const faixa = document.querySelector('#ar-sem-ligacao').textContent;
  assert.match(faixa, /Unidades sem ligação ao corporativo: 1/); assert.match(faixa, /BRANO/); assert.match(faixa, /raiz/);
  const pool = window.LGH.poolSemOrganizacao(S).length;
  assert.match(document.querySelector('#ar-pool').textContent, new RegExp(`${pool === 0 ? 'Nenhuma pessoa' : pool} sem organização`));
  cartao.click();
  assert.equal(S.organizacaoSelecionada, 'GOLDEN');
  assert.equal(document.querySelector('#ar-org').value, 'GOLDEN');
  const cab = document.querySelector('#ar-cabecalho');
  assert.match(cab.textContent, /Gerente geral: GERENTE GERAL TESTE · avaliado por: DIRETOR REGIONAL TESTE \(estrutura corporativa\)/);
  cab.querySelector('[data-ir-org]').click();
  assert.equal(S.organizacaoSelecionada, CORP);
  assert.deepEqual(erros.map(String), [], 'nenhum erro no console da página');
});

test('cabeçalho da unidade: sem estrutura corporativa, o gerente geral aparece sem ligação, em vermelho', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(ADMIN); window.irPara('arvore');
  const alerta = document.querySelector('#ar-cabecalho .ar-alerta');
  assert.ok(alerta); assert.match(alerta.textContent, /sem ligação ao corporativo/);
  escolher(window, document, '#ar-org', CORP);
  assert.match(document.querySelector('#ar-arvore').textContent, /não tem raiz/);
  assert.match(document.querySelector('#ar-sem-ligacao').textContent, /Unidades sem ligação ao corporativo: 2/);
});

test('avaliador não vê a opção Rede: só as organizações onde atua', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
  window.eval("entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})");
  window.irPara('arvore');
  const ops = [...document.querySelector('#ar-org').options];
  assert.ok(!ops.some(o => o.value === CORP || /Rede/.test(o.textContent)));
  assert.deepEqual(ops.map(o => o.value), JSON.parse(JSON.stringify(window.LGH.organizacoesVisiveis(S).map(o => o.id))));
});

test('pessoa com duas atuações aparece em duas caixas na tela', async () => {
  const { window, document, S } = await carregarPagina(base(), pilotoDuplo(), null, OPCOES);
  window.eval(RH); window.irPara('arvore');
  const cam = [...document.querySelectorAll('#t-arvore .ar-caixa')].filter(c => c.dataset.pessoa === 'CAM');
  assert.equal(cam.length, atuacoesDe(S.atuacoes, 'CAM').length);
  assert.equal(cam.length, 2);
  assert.ok(cam.every(c => /Camareira Teste/.test(c.textContent)));
});

test('clique na caixa seleciona a atuação e avisa; recolher não redesenha; Sem líder marca a caixa', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH); window.irPara('arvore');
  let evento = null;
  document.addEventListener('lgh-arvore-selecionada', e => { evento = e.detail.atuacaoId; });
  const rec = caixa(document, 'GOLDEN|REC1|1');
  rec.querySelector('.ar-nome').click();
  assert.equal(S.arSelecionada, 'GOLDEN|REC1|1'); assert.equal(evento, 'GOLDEN|REC1|1');
  assert.ok(rec.classList.contains('ar-ativa'));
  caixa(document, 'GOLDEN|GG|1').click();
  assert.ok(!rec.classList.contains('ar-ativa'));
  const gg = caixa(document, 'GOLDEN|GG|1'); const btn = gg.querySelector('.ar-colapso');
  const filhos = gg.parentElement.querySelector(':scope > ul');
  assert.equal(filhos.hidden, false);
  S.arSelecionada = null; btn.click();
  assert.equal(filhos.hidden, true); assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(S.arSelecionada, null, 'o botão de recolher não seleciona a caixa');
  assert.ok(document.contains(gg), 'mesmo nó: não houve re-render');
  btn.click(); assert.equal(filhos.hidden, false);
  btn.click();
  const nome = document.querySelector('#ar-sem-lider [data-alvo="GOLDEN|SUP|1"]');
  nome.click();
  assert.ok(caixa(document, 'GOLDEN|SUP|1').classList.contains('ar-marcada'));
});
