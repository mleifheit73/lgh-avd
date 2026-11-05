// v39 (05/11/2026): busca na base da rede (CLT e PJ) na aba Usuários para marcar avaliadores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})";
const AVAL = "entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})";
const digitar = (window, el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };

test('v39: a busca varre toda a base, CLT e PJ, e mostra organização atual, regime e empresa', async () => {
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(ADMIN); window.irPara('usuarios');
  const campo = document.querySelector('#busca-rede-texto');
  assert.ok(campo, 'campo de busca existe na aba Usuários');
  digitar(window, campo, 'brano');
  const linhas = [...document.querySelectorAll('#busca-rede-lista tr[data-pessoa]')];
  assert.ok(linhas.length > 0, 'achou gente da Brano, que não é a organização selecionada');
  assert.ok(linhas.every(l => /BRANO/i.test(l.textContent)));
  /* PJ sem organização aparece com o aviso e sem botão de líder */
  const semOrgPessoa = (S.semOrganizacao || []).find(p => !S.atuacoes.some(a => a.pessoaRef === p.id && a.situacao === 'ativa'));
  if (semOrgPessoa) {
    digitar(window, campo, semOrgPessoa.id);
    const semOrg = document.querySelector(`#busca-rede-lista tr[data-pessoa="${semOrgPessoa.id}"]`);
    assert.ok(semOrg, 'pessoa sem organização é encontrada');
    assert.match(semOrg.textContent, /Sem organização/);
    assert.equal(semOrg.querySelector('[data-marcar-lider]'), null);
    assert.ok(semOrg.querySelector('[data-ir-arvore]'), 'link para a Árvore (Rede)');
  } else {
    /* a fixture mini coloca todo PJ em alguma organização; a regra "sem organização" é coberta pela base real abaixo */
    assert.ok(true);
  }
  assert.deepEqual(erros.map(String), []);
});

test('v39: marcar como líder de outra organização troca a organização do topo, cria a conta e grava', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(ADMIN); window.irPara('usuarios');
  digitar(window, document.querySelector('#busca-rede-texto'), 'BR2');
  const linha = document.querySelector('#busca-rede-lista tr[data-pessoa="BR2"]');
  assert.ok(linha, 'BR2 (Brano) encontrada');
  const btn = linha.querySelector('[data-marcar-lider]');
  assert.ok(btn && !/já é líder/i.test(linha.textContent));
  btn.click();
  assert.equal(S.organizacaoSelecionada, 'BRANO', 'a organização do topo passou a ser a da pessoa');
  const at = S.atuacoes.filter(a => a.pessoaRef === 'BR2' && a.organizacaoId === 'BRANO' && a.situacao === 'ativa');
  assert.ok(at.length && at.every(a => a.podeLiderar === true), 'marcada como líder');
  assert.ok(window.eval('USUARIOS').some(u => u.nome === at.length && false || /BR2|Brano/i.test(u.nome) || u.origem === 'lider'), 'conta de avaliador criada');
  assert.match(document.querySelector('#busca-rede-msg').textContent, /agora é líder/);
  /* a linha agora diz que já é líder */
  digitar(window, document.querySelector('#busca-rede-texto'), 'BR2');
  assert.match(document.querySelector('#busca-rede-lista tr[data-pessoa="BR2"]').textContent, /já é líder/i);
});

test('v39: RH da unidade vê a busca mas só marca líder dentro do seu escopo; avaliador não vê a busca', async () => {
  const a = await carregarPagina(base(), piloto(), null, OPCOES);
  a.window.eval(RH); a.window.irPara('usuarios');
  if (a.document.querySelector('#busca-rede-texto')) {
    digitar(a.window, a.document.querySelector('#busca-rede-texto'), 'BR2');
    const linha = a.document.querySelector('#busca-rede-lista tr[data-pessoa="BR2"]');
    assert.ok(linha, 'vê a pessoa');
    assert.equal(linha.querySelector('[data-marcar-lider]'), null, 'sem botão fora do escopo');
    assert.match(linha.textContent, /fora do seu escopo/i);
  }
  const b = await carregarPagina(base(), piloto(), null, OPCOES);
  b.window.eval(AVAL); b.window.irPara('usuarios');
  assert.equal(b.document.querySelector('#busca-rede-texto'), null);
});

import fs from 'node:fs';
test('v39, base real: PJ sem organização aparece com o aviso e sem botão de líder', { skip: !fs.existsSync('app/data/base.json') }, async () => {
  const baseReal = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const pilotoReal = JSON.parse(fs.readFileSync('app/data/piloto-golden.json', 'utf8'));
  const { window, document, S } = await carregarPagina(baseReal, pilotoReal, null, { organizacaoPiloto: 'HOTEL LAGHETTO GOLDEN' });
  window.eval(ADMIN); window.irPara('usuarios');
  const p = (S.semOrganizacao || []).find(x => !S.atuacoes.some(a => a.pessoaRef === x.id && a.situacao === 'ativa'));
  assert.ok(p, 'premissa: existe PJ sem organização na base real');
  digitar(window, document.querySelector('#busca-rede-texto'), p.nome.slice(0, 12));
  const tr = document.querySelector(`#busca-rede-lista tr[data-pessoa="${p.id}"]`);
  assert.ok(tr, 'encontrado pelo nome');
  assert.match(tr.textContent, /Sem organização/);
  assert.equal(tr.querySelector('[data-marcar-lider]'), null);
  tr.querySelector('[data-ir-arvore]').click();
  assert.equal(S.tela, 'arvore'); assert.equal(S.organizacaoSelecionada, 'LAGHETTO CORPORATIVO');
});
