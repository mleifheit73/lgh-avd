import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePJ } from '../src/carga/pj.js';

const lerFixture = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const lerData = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));

test('parsePJ descarta cabeçalho repetido e linha vazia, registra no log', () => {
  const { registros, log } = parsePJ(lerFixture('pj-mini.json').linhas);
  assert.equal(registros.length, 5);
  assert.equal(log.filter(l => l.codigo === 'cabecalho_repetido').length, 1);
  assert.equal(log.filter(l => l.codigo === 'linha_vazia').length, 1);
});

test('parsePJ limpa CPF mascarado e converte datas', () => {
  const r = parsePJ(lerFixture('pj-mini.json').linhas).registros.find(x => x.nome === 'BRUNO MASCARADO');
  assert.equal(r.cpf, '00000000002');
  assert.equal(r.nascimento, '1976-04-06');
  assert.equal(r.inicio, '2026-09-17');
  assert.deepEqual(r.empresas, ['LSH BARRA EMPREENDIMENTOS IMOBILIARIOS']);
});

test('parsePJ quebra múltiplas empresas e guarda as grafias originais', () => {
  const r = parsePJ(lerFixture('pj-mini.json').linhas).registros.find(x => x.nome === 'CARLA TRES EMPRESAS');
  assert.equal(r.empresas.length, 3);
  assert.equal(r.grafiasOriginais.length, 3);
  assert.equal(r.grafiasOriginais[1], 'SIENA ADMINISTRAÇÃO E PARTICIPAÇÕES LTDA');
});

test('parsePJ mantém registro sem CPF e sem cargo, com campos nulos', () => {
  const r = parsePJ(lerFixture('pj-mini.json').linhas).registros.find(x => x.nome === 'DIEGO SEM CPF');
  assert.equal(r.cpf, null);
  assert.equal(r.cargo, null);
  assert.deepEqual(r.empresas, []);
  assert.equal(r.inicio, '2026-11-13');
});

test('parsePJ: equivalência agrupa grafias por empresa normalizada', () => {
  const { equivalencia } = parsePJ(lerFixture('pj-mini.json').linhas);
  assert.deepEqual(equivalencia['LAGHETTO HOTEIS'].sort(), ['LAGHETTO HOTEIS LTDA', 'LAGHETTO HOTÉIS LTDA']);
});

test('parsePJ sobre a planilha real: 226 válidos, 40 empresas, 6 com grafia múltipla', () => {
  const { registros, equivalencia, log } = parsePJ(lerData('pj/pj-2026.json').linhas);
  assert.equal(registros.length, 226);
  assert.equal(log.filter(l => l.codigo === 'cabecalho_repetido').length, 2);   // o conversor já removeu o cabeçalho verdadeiro
  assert.equal(Object.keys(equivalencia).length, 40);
  assert.equal(Object.values(equivalencia).filter(g => g.length > 1).length, 6);
  assert.equal(registros.filter(r => r.empresas.length > 1).length, 12);
  assert.equal(registros.filter(r => !r.cpf).length, 6);
});
