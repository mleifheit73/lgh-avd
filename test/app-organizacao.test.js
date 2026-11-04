import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerFixture } from './helpers/pagina.js';
import { organizacoesDe, inferirOrganizacao, criarOrganizacao, FUSOES, EQUIVALENCIAS, ID_CORPORATIVO } from '../app/js/modelo/organizacao.js';
import { normalizarNome } from '../app/js/modelo/nome.js';
import { normalizarNome as normalizarNomeBuild } from '../scripts/build-app.mjs';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const temDadosReais = fs.existsSync('out/base.json') && fs.existsSync('app/data/base.json');

test('organizacoesDe sem fusoes passadas usa FUSOES reais: filiais do fixture ficam uma a uma, mais a corporativa', () => {
  const o = organizacoesDe(lerFixture('base-mini.json'));
  assert.deepEqual(o.map(x => x.id), ['BRANO', 'GOLDEN A&B', 'GOLDEN RESORT', 'LAGHETTO CORPORATIVO']);
  const unidade = o.find(x => x.id === 'BRANO');
  assert.equal(unidade.tipo, 'unidade'); assert.equal(unidade.origem, 'sugerida_pela_carga');
  assert.equal(unidade.situacao, 'ativa'); assert.deepEqual(unidade.filiais, ['BRANO']);
});
test('organizacoesDe funde as filiais listadas em fusoes numa organização só', () => {
  const o = organizacoesDe(lerFixture('base-mini.json'), FUSAO_MINI);
  assert.deepEqual(o.map(x => x.id), ['BRANO', 'GOLDEN', 'LAGHETTO CORPORATIVO']);
  assert.equal(o.filter(x => ['GOLDEN A&B', 'GOLDEN RESORT'].includes(x.id)).length, 0);
  const g = o.find(x => x.id === 'GOLDEN');
  assert.equal(g.tipo, 'unidade'); assert.deepEqual(g.filiais, ['GOLDEN A&B', 'GOLDEN RESORT']);
});
test('organizacoesDe inclui a estrutura corporativa vazia, tipo corporativa, mesmo sem fusões', () => {
  for (const fusoes of [undefined, [], FUSAO_MINI]) {
    const c = organizacoesDe(lerFixture('base-mini.json'), fusoes).find(x => x.id === ID_CORPORATIVO);
    assert.equal(c.tipo, 'corporativa'); assert.equal(c.origem, 'definida'); assert.deepEqual(c.filiais, []);
  }
});
test('organizacoesDe: fusão cujas filiais não estão na base não cria organização', () => {
  const o = organizacoesDe(lerFixture('base-mini.json'), [{ id: 'X', nome: 'X', filiais: ['NAO EXISTE'] }]);
  assert.ok(!o.some(x => x.id === 'X'));
});
test('criarOrganizacao valida campos obrigatórios e tipo', () => {
  assert.throws(() => criarOrganizacao({ id: 'A', nome: 'A' }), /tipo/);
  assert.throws(() => criarOrganizacao({ id: 'A', nome: 'A', tipo: 'inventado' }), /tipo inválido/);
  assert.deepEqual(criarOrganizacao({ id: 'A', nome: 'A', tipo: 'unidade' }).filiais, ['A']);
});
test('inferirOrganizacao: nome, prefixo com 20+ caracteres, número de filial, tabela, e null', () => {
  const orgs = [{ id: 'LAGHETTO FL 12 LAGHETTO GRAMADO' }, { id: 'CONDOMINIO DO EDIFICIO COMERCIAL ATHIVAB' }, { id: 'GOLDEN', filiais: ['LAGHETTO RESORT GOLDEN'] }];
  const tab = [{ empresa: 'GOLDEN GRAMADO RESORT LAGHETTO', organizacaoId: 'GOLDEN', motivo: 'teste' }];
  assert.deepEqual(inferirOrganizacao('LAGHETTO RESORT GOLDEN', orgs, tab), { organizacaoId: 'GOLDEN', metodo: 'nome' });
  assert.deepEqual(inferirOrganizacao('CONDOMINIO DO EDIFICIO COMERCIAL ATHIVABRASIL', orgs, tab), { organizacaoId: 'CONDOMINIO DO EDIFICIO COMERCIAL ATHIVAB', metodo: 'prefixo' });
  assert.deepEqual(inferirOrganizacao('LAGHETTO HOTEIS FILIAL 12 GRAMADO', orgs, tab), { organizacaoId: 'LAGHETTO FL 12 LAGHETTO GRAMADO', metodo: 'numero' });
  assert.deepEqual(inferirOrganizacao('GOLDEN GRAMADO RESORT LAGHETTO', orgs, tab), { organizacaoId: 'GOLDEN', metodo: 'tabela' });
  assert.equal(inferirOrganizacao('LAGHETTO HOTEIS', orgs, tab), null);
  assert.equal(inferirOrganizacao('LAGHETTO FL 1', orgs, tab), null, 'prefixo curto demais não casa');
});
test('inferirOrganizacao: tabela só vale se a organização da tabela existe', () => {
  const tab = [{ empresa: 'GOLDEN GRAMADO RESORT LAGHETTO', organizacaoId: 'NAO EXISTE', motivo: 'teste' }];
  assert.equal(inferirOrganizacao('GOLDEN GRAMADO RESORT LAGHETTO', [{ id: 'GOLDEN' }], tab), null);
});
test('inferirOrganizacao: casamento ambíguo por número não decide', () => {
  const orgs = [{ id: 'LAGHETTO FL 7 VIALE' }, { id: 'OUTRA FL 7 COISA' }];
  assert.equal(inferirOrganizacao('LAGHETTO HOTEIS FILIAL 7', orgs, []), null);
});
test('equivalencia-organizacoes.json versionado carrega com a entrada do Golden', () => {
  assert.equal(EQUIVALENCIAS.length, 1);
  assert.equal(EQUIVALENCIAS[0].empresa, 'GOLDEN GRAMADO RESORT LAGHETTO');
  assert.equal(EQUIVALENCIAS[0].organizacaoId, 'HOTEL LAGHETTO GOLDEN');
  assert.ok(EQUIVALENCIAS[0].motivo.length > 0);
  assert.equal(FUSOES[0].id, 'HOTEL LAGHETTO GOLDEN');
  assert.deepEqual(inferirOrganizacao('GOLDEN GRAMADO RESORT LAGHETTO', [{ id: 'HOTEL LAGHETTO GOLDEN', filiais: [] }]), { organizacaoId: 'HOTEL LAGHETTO GOLDEN', metodo: 'tabela' });
});
test('normalizarNome do app é idêntico ao do build (as chaves do piloto vêm do build)', () => {
  for (const n of ['Claudia Luiza de Oliveira', '  José  Água ', null, 'ÇÃO']) assert.equal(normalizarNome(n), normalizarNomeBuild(n));
});
test('base real: 37 organizações (36 unidades mais a corporativa) com as fusões reais', { skip: !temDadosReais }, () => {
  const base = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const o = organizacoesDe(base);
  console.log(`# organizações na base real: ${o.length}`);
  assert.equal(o.length, 37);
  assert.ok(o.some(x => x.id === 'HOTEL LAGHETTO GOLDEN'));
});
