// v37: o Painel do avaliador, aberto por um perfil de RH, mostra a organização inteira com o avaliador de cada linha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { atuacoesVisiveis } from '../app/js/adaptador.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const AVAL = "entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})";
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})";

test('v37: RH vê no Painel do avaliador todas as atuações da organização, com o avaliador na linha e sem botão Avaliar', async () => {
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH); window.irPara('avaliador');
  const total = atuacoesVisiveis(S).length;   /* uma linha por atuação, como o Painel do RH conta */
  assert.ok(total > 0, 'premissa');
  assert.match(document.querySelector('#av-titulo').textContent, /Avaliações de Golden/);
  assert.doesNotMatch(document.querySelector('#av-titulo').textContent, /não tem equipes/);
  const linhas = [...document.querySelectorAll('#av-equipes tr[data-atuacao], #av-equipes [data-abrir], #av-equipes tbody tr')];
  const kpiAvaliados = Number([...document.querySelectorAll('#av-kpis .kpi')].find(k => /Avaliados/.test(k.textContent)).querySelector('.v').textContent);
  assert.equal(kpiAvaliados, total, 'cartão Avaliados = atuações da organização');
  assert.equal(document.querySelectorAll('#av-equipes button[data-abrir]').length, 0, 'RH não avalia: sem botão Avaliar');
  const colunas = [...document.querySelectorAll('#av-equipes td.av-avaliador')];
  assert.equal(colunas.length, total, 'uma célula de avaliador por linha');
  assert.ok(colunas.some(td => /Supervisor de Governança Teste/.test(td.textContent)), 'o nome do avaliador aparece');
  assert.ok(colunas.some(td => /sem avaliador/i.test(td.textContent)), 'quem não tem avaliador diz isso');
  /* visão por ciclo também cobre a organização */
  const btn = [...document.querySelectorAll('#t-avaliador button')].find(b => /quem já foi avaliado por ciclo/i.test(b.textContent));
  if (btn) { btn.click(); assert.ok(document.querySelectorAll('#av2-ciclos tbody tr').length >= total, 'por ciclo lista a organização'); }
  assert.deepEqual(erros.map(String), []);
});

test('v37: para o avaliador nada muda', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(AVAL); window.irPara('avaliador');
  assert.match(document.querySelector('#av-titulo').textContent, /Minhas avaliações/);
  assert.ok(document.querySelectorAll('#av-equipes button[data-abrir]').length > 0);
  assert.equal(document.querySelectorAll('#av-equipes td.av-avaliador').length, 0);
});
