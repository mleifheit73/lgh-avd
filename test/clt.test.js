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

// Correções da revisão final (C1, I1)
test('C1: filial com razão social fora da lista de prefixos é reconhecida pela estrutura (Página:)', () => {
  const csv = '﻿;VIVERONE CANELA HOTEL LTDA;;;;;;;;;;;;;;;;;;;;;;;;;Página:;;;;1/1;;;\n' +
              'Código;;;;Nome;;;;;;;RG;;;;;;;Cargo;;;;;CPF;;;Nascimento;;;;;Admissão;\n' +
              '7;;;PESSOA DA VIVERONE;;;;;;;;1234567890;;;;;;;84 - GARCOM;;;;;12345678901;;;;01/01/1990;;;;01/01/2020;\n' +
              ';Total de empregados: ;;;;;;;;;;;;;;;;;;;;;;;;;1;\n';
  const { registros, log } = parseCLT(csv, 'R1');
  assert.equal(registros.length, 1);
  assert.equal(registros[0].filial, 'VIVERONE CANELA HOTEL LTDA');
  assert.equal(log.filter(l => l.nivel === 'erro').length, 0);
});

test('I1: linha com conteúdo não reconhecida vai para o log, nunca some em silêncio', () => {
  const csv = ';LAGHETTO X;;;;;;;;;;;;;;;;;;;;;;;;;Página:;;;;1/1;;;\n' +
              '380A;;;CODIGO COM LETRA;;;;;;;;1;;;;;;;84 - GARCOM;;;;;12345678901;;;;01/01/1990;;;;01/01/2020;\n' +
              ';Total de empregados: ;;;;;;;;;;;;;;;;;;;;;;;;;0;\n';
  const { registros, log } = parseCLT(csv, 'R1');
  assert.equal(registros.length, 0);
  const naoClassificada = log.find(l => l.codigo === 'linha_nao_reconhecida');
  assert.ok(naoClassificada, 'linha 380A deve ir ao log como não reconhecida');
  assert.equal(naoClassificada.linha, 2);
});

test('I1: total de empregados divergente da contagem gera erro no log, com a filial', () => {
  const csv = ';LAGHETTO X;;;;;;;;;;;;;;;;;;;;;;;;;Página:;;;;1/1;;;\n' +
              '1;;;UM;;;;;;;;1;;;;;;;84 - GARCOM;;;;;11111111111;;;;01/01/1990;;;;01/01/2020;\n' +
              ';Total de empregados: ;;;;;;;;;;;;;;;;;;;;;;;;;2;\n';
  const { log } = parseCLT(csv, 'R1');
  const erro = log.find(l => l.codigo === 'total_divergente');
  assert.ok(erro);
  assert.equal(erro.nivel, 'erro');
  assert.match(erro.mensagem, /LAGHETTO X/);
  assert.match(erro.mensagem, /esperava 2/);
  assert.match(erro.mensagem, /encontrou 1/);
});

test('I1: linhas estruturais conhecidas não geram aviso; sobre os CSVs reais, zero não reconhecida e zero total divergente', () => {
  const log = ['R1', 'R2', 'R3'].flatMap(r => parseCLT(lerData(`clt/${r}.csv`), r).log);
  assert.equal(log.filter(l => l.codigo === 'linha_nao_reconhecida').length, 0);
  assert.equal(log.filter(l => l.codigo === 'total_divergente').length, 0);
  assert.equal(log.filter(l => l.codigo === 'total_conferido').length, 37);
});

test('C1: filial com mais de uma página não zera a contagem no cabeçalho repetido', () => {
  const csv = ';LAGHETTO X;;;;;;;;;;;;;;;;;;;;;;;;;Página:;;;;1/2;;;\n' +
              '1;;;UM;;;;;;;;1;;;;;;;84 - GARCOM;;;;;11111111111;;;;01/01/1990;;;;01/01/2020;\n' +
              ';LAGHETTO X;;;;;;;;;;;;;;;;;;;;;;;;;Página:;;;;2/2;;;\n' +
              '2;;;DOIS;;;;;;;;2;;;;;;;84 - GARCOM;;;;;22222222222;;;;01/01/1990;;;;01/01/2020;\n' +
              ';Total de empregados: ;;;;;;;;;;;;;;;;;;;;;;;;;2;\n';
  const { registros, log } = parseCLT(csv, 'R1');
  assert.equal(registros.length, 2);
  assert.equal(log.filter(l => l.codigo === 'total_divergente').length, 0);
  assert.equal(log.filter(l => l.codigo === 'total_conferido').length, 1);
});
