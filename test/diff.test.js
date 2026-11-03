import test from 'node:test';
import assert from 'node:assert/strict';
import { diffCarga } from '../src/carga/diff.js';

// Helpers: montam um Consolidado mínimo a partir de [{cpf, filial}]
const consolidado = itens => ({
  pessoas: itens.map(i => ({ cpf: i.cpf, nome: 'N' + i.cpf, status: 'ativo', nomesAlternativos: [] })),
  vinculos: itens.map(i => ({ pessoaRef: i.cpf, regime: 'CLT', empresa: i.filial, filial: i.filial, cargo: 'c', inicio: '2020-01-01' })),
  pendencias: [], log: [],
});
const cem = filial => Array.from({ length: 100 }, (_, i) => ({ cpf: `${filial}-${i}`, filial }));
const OPC = { limitePercentual: 0.05, limiteAbsoluto: 10, organizacaoDe: v => v.filial };

test('transferência entre filiais não gera inativação', () => {
  const ant = consolidado([{ cpf: '1', filial: 'GOLDEN' }, { cpf: '2', filial: 'GOLDEN' }]);
  const nov = consolidado([{ cpf: '1', filial: 'CHATEAU' }, { cpf: '2', filial: 'GOLDEN' }]);
  const d = diffCarga(ant, nov, OPC);
  assert.equal(d.inativacoesPropostas.length, 0);
  assert.equal(d.novos.length, 0);
});

test('sumiu da carga vira inativação inferida e aplicável', () => {
  const ant = consolidado([{ cpf: '1', filial: 'GOLDEN' }, { cpf: '2', filial: 'GOLDEN' }]);
  const nov = consolidado([{ cpf: '1', filial: 'GOLDEN' }]);
  const d = diffCarga(ant, nov, { ...OPC, limitePercentual: 0.5 });
  assert.deepEqual(d.aplicaveis.map(x => x.pessoaRef), ['2']);
  assert.equal(d.aplicaveis[0].origem, 'inferido_pela_carga');
  assert.equal(d.aplicaveis[0].organizacaoId, 'GOLDEN');
  assert.equal(d.travadas.length, 0);
});

test('admitido novo aparece em novos', () => {
  const ant = consolidado([{ cpf: '1', filial: 'GOLDEN' }]);
  const nov = consolidado([{ cpf: '1', filial: 'GOLDEN' }, { cpf: '9', filial: 'GOLDEN' }]);
  assert.deepEqual(diffCarga(ant, nov, OPC).novos.map(p => p.cpf), ['9']);
});

test('arquivo de uma regional ausente trava a regional inteira e não aplica nada dela', () => {
  const ant = consolidado(cem('GOLDEN').concat(cem('VIVACE')));
  const nov = consolidado(cem('GOLDEN'));
  const d = diffCarga(ant, nov, OPC);
  assert.equal(d.inativacoesPropostas.length, 100);
  assert.equal(d.travadas.length, 1);
  assert.equal(d.travadas[0].organizacaoId, 'VIVACE');
  assert.equal(d.travadas[0].quantidade, 100);
  assert.match(d.travadas[0].motivo, /100 de 100/);
  assert.equal(d.aplicaveis.length, 0);
});

test('limite é o menor entre percentual e absoluto', () => {
  const ant = consolidado(cem('GOLDEN'));
  const nov6 = consolidado(cem('GOLDEN').slice(0, 94));    // 6 sumiram: 6% > 5% → trava, mesmo que 6 < 10
  assert.equal(diffCarga(ant, nov6, OPC).travadas.length, 1);
  const nov5 = consolidado(cem('GOLDEN').slice(0, 95));    // 5 sumiram: 5% não excede 5% → aplica
  assert.equal(diffCarga(ant, nov5, OPC).travadas.length, 0);
  assert.equal(diffCarga(ant, nov5, OPC).aplicaveis.length, 5);
  const grande = Array.from({ length: 400 }, (_, i) => ({ cpf: `G-${i}`, filial: 'GRANDE' }));
  const nov11 = consolidado(grande.slice(0, 389));          // 11 de 400 = 2,75% < 5%, mas 11 > 10 → trava
  assert.equal(diffCarga(consolidado(grande), nov11, OPC).travadas.length, 1);
});

test('trava é por organização: uma travada não bloqueia outra aplicável', () => {
  const ant = consolidado(cem('A').concat(cem('B')));
  const nov = consolidado(cem('A').slice(0, 98).concat(cem('B').slice(0, 50)));
  const d = diffCarga(ant, nov, OPC);
  assert.deepEqual(d.travadas.map(t => t.organizacaoId), ['B']);
  assert.equal(d.aplicaveis.length, 2);
  assert.ok(d.aplicaveis.every(x => x.organizacaoId === 'A'));
});
