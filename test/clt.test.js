import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCLT } from '../src/carga/clt.js';

const lerFixture = n => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const lerData = n => fs.readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8');

test('parseCLT reconhece filial e usa o cargo como âncora', () => {
  const { registros } = parseCLT(lerFixture('clt-mini.csv'), 'R1');
  assert.equal(registros.length, 6);
  assert.equal(registros[0].filial, 'LAGHETTO RESORT GOLDEN');
  assert.equal(registros[3].filial, 'LAGHETTO FL 18 A&B GOLDEN');
  assert.equal(registros[0].cargoCod, '86');
  assert.equal(registros[0].cargo, 'CAMAREIRO(A)');
  assert.equal(registros[0].nascimento, '1990-01-01');
  assert.equal(registros[0].chave, 'LAGHETTO RESORT GOLDEN|10');
});

test('parseCLT com RG vazio não põe o CPF no RG', () => {
  const r = parseCLT(lerFixture('clt-mini.csv'), 'R1').registros[1];
  assert.equal(r.nome, 'BRUNO TESTE SEM RG');
  assert.equal(r.rg, null);
  assert.equal(r.cpf, '22222222222');
});

test('parseCLT: mesmo código em filiais diferentes gera chaves diferentes', () => {
  const { registros } = parseCLT(lerFixture('clt-mini.csv'), 'R1');
  const dez = registros.filter(r => r.codigo === '10');
  assert.equal(dez.length, 2);
  assert.notEqual(dez[0].chave, dez[1].chave);
});

test('parseCLT: RG com hífen não é confundido com cargo', () => {
  const r = parseCLT(lerFixture('clt-mini.csv'), 'R1').registros.find(x => x.codigo === '14');
  assert.equal(r.rg, '4031324-7');
  assert.equal(r.cargoCod, '84');
  assert.equal(r.cargo, 'GARCOM');
  assert.equal(r.cpf, '66666666666');
});

test('parseCLT ignora BOM', () => {
  const comBom = lerFixture('clt-mini.csv');
  const semBom = comBom.replace(/^﻿/, '');
  assert.notEqual(comBom.charCodeAt(0), semBom.charCodeAt(0));
  assert.deepEqual(parseCLT(semBom, 'R1').registros, parseCLT(comBom, 'R1').registros);
});

test('parseCLT sobre os três CSVs reais fecha em 1608 e zero colisão de chave', () => {
  const todos = ['R1', 'R2', 'R3'].flatMap(r => parseCLT(lerData(`clt/${r}.csv`), r).registros);
  assert.equal(todos.length, 1608);
  assert.equal(new Set(todos.map(x => x.filial)).size, 37);
  assert.equal(new Set(todos.map(x => x.chave)).size, 1608);
  const porCodigo = {};
  todos.forEach(x => { porCodigo[x.codigo] = (porCodigo[x.codigo] || 0) + 1; });
  assert.equal(Object.values(porCodigo).filter(v => v > 1).length, 417);   // 417 códigos que se repetem (spec 4.2)
  assert.equal(todos.filter(x => !x.cpf).length, 0);
});
