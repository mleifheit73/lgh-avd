// v37 (05/11/2026, pedidos de Marcelo na reunião de 04/11): erro de envio visível junto do botão, caixa de protótipo
// nunca vazia, data de preenchimento real com explicação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const AVAL = "entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})";
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";

async function abrirFormulario(login = AVAL) {
  const r = await carregarPagina(base(), piloto(), null, OPCOES);
  r.window.eval(login); r.window.irPara('avaliador');
  const av = [...r.document.querySelectorAll('#t-avaliador button')].find(b => /^Avaliar$/.test(b.textContent.trim()));
  av.click();
  return r;
}
const preencher = (window, document, { pularNota = [], pularObs = [] } = {}) => {
  [...document.querySelectorAll('#t-form input.nota')].forEach((i, idx) => { if (pularNota.includes(idx + 1)) return; i.value = '4'; i.dispatchEvent(new window.Event('input', { bubbles: true })); i.dispatchEvent(new window.Event('change', { bubbles: true })); });
  [...document.querySelectorAll('#t-form textarea')].forEach((t, idx) => { if (pularObs.includes(idx + 1)) return; t.value = 'Observação de teste.'; t.dispatchEvent(new window.Event('input', { bubbles: true })); });
};

test('v37: enviar faltando a nota 13 e a observação 2 mostra o erro junto do botão, com os números dos critérios', async () => {
  const { window, document, erros } = await abrirFormulario();
  preencher(window, document, { pularNota: [13], pularObs: [2] });
  document.querySelector('#fm-salvar').click();
  const rodape = document.querySelector('#fm-alerta-rodape');
  assert.ok(rodape && !rodape.hidden, 'mensagem junto do botão');
  assert.match(rodape.textContent, /não foi salva/i);
  assert.match(rodape.textContent, /nota do critério 13/);
  assert.match(rodape.textContent, /observação do critério 2/);
  assert.equal(rodape.textContent, document.querySelector('#fm-alerta').textContent, 'mesmo texto do alerta do topo');
  /* completar e enviar: a mensagem de rodapé some e o envio avisa */
  preencher(window, document);
  document.querySelector('#fm-salvar').click(); document.querySelector('#fm-salvar').click();
  assert.match(document.querySelector('#fm-alerta').textContent, /enviada e registrada/);
  assert.equal(document.querySelector('#fm-alerta-rodape').hidden, true);
  assert.deepEqual(erros.map(String), []);
});

test('v37: a caixa de ferramentas de protótipo nunca aparece vazia nem para avaliador', async () => {
  const { window, document, S } = await abrirFormulario();
  const proto = document.querySelector('#fm-proto');
  assert.equal(proto.hidden, true, 'avaliador: escondida');
  preencher(window, document);
  document.querySelector('#fm-salvar').click(); document.querySelector('#fm-salvar').click();
  assert.equal(proto.hidden, true, 'avaliador, depois de enviar: ainda escondida');
  window.eval(ADMIN); window.irPara('form');
  if (!proto.hidden) assert.ok(proto.textContent.trim().length > 0, 'admin: se aparece, tem conteúdo');
});

test('v37: a data do cabeçalho é a de hoje e tem explicação', async () => {
  const { document } = await abrirFormulario();
  const hoje = new Date();
  const esperado = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  const data = document.querySelector('#fm-data');
  assert.ok(data, 'campo de data identificado');
  assert.equal(data.textContent.trim(), esperado);
  assert.ok(!/22\/10\/2026/.test(document.querySelector('#t-form').textContent), 'a data cravada da v26 saiu');
  const ajuda = document.querySelector('#fm-data-ajuda');
  assert.ok(ajuda, 'botão de explicação');
  ajuda.click();
  const pop = document.querySelector('#fm-data-pop');
  assert.ok(pop && !pop.hidden);
  assert.match(pop.textContent, /Data de preenchimento/);
  assert.match(pop.textContent, /data e hora do envio/);
});
