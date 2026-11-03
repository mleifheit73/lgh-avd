import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname;

test('CLI gera out/base.json com os totais do levantamento', () => {
  const saida = execFileSync('node', ['src/cli/carga.js', 'data/clt/R1.csv', 'data/clt/R2.csv', 'data/clt/R3.csv', 'data/pj/pj-2026.json'], { cwd: raiz, encoding: 'utf8' });
  const b = JSON.parse(fs.readFileSync(raiz + 'out/base.json', 'utf8'));
  assert.equal(b.pessoas.length, 1822);
  assert.equal(b.vinculos.filter(v => v.regime === 'CLT').length, 1608);
  assert.ok(b.vinculos.filter(v => v.regime === 'PJ').length >= 226);
  assert.equal(b.pendencias.length, 69);
  assert.equal(Object.keys(b.equivalenciaEmpresas).length, 40);
  assert.equal(b.log.filter(l => l.nivel === 'erro').length, 0);
  assert.match(b.geradoEm, /^\d{4}-\d{2}-\d{2}/);
  assert.match(saida, /1822 pessoas/);
  assert.match(saida, /69 pendências/);
});

test('CLI sem argumentos sai com código 1 e mensagem de uso', () => {
  assert.throws(() => execFileSync('node', ['src/cli/carga.js'], { cwd: raiz, encoding: 'utf8', stdio: 'pipe' }),
    e => e.status === 1 && /Uso:/.test(e.stderr));
});

// Revisão final I9
const limpar = () => { fs.mkdirSync(raiz + 'out', { recursive: true }); fs.rmSync(raiz + 'out/nao-deve-existir.json', { force: true }); };

test('I9: regional com zero registros derruba a carga com código 2 e mensagem nomeando a regional', () => {
  limpar();
  fs.writeFileSync(raiz + 'out/vazio.csv', '');
  assert.throws(() => execFileSync('node', ['src/cli/carga.js', 'data/clt/R1.csv', 'out/vazio.csv', 'data/clt/R3.csv', 'data/pj/pj-2026.json', 'out/nao-deve-existir.json'], { cwd: raiz, encoding: 'utf8', stdio: 'pipe' }),
    e => e.status === 2 && /R2/.test(e.stderr) && /zero registros/.test(e.stderr));
  assert.equal(fs.existsSync(raiz + 'out/nao-deve-existir.json'), false);
});

test('I9: o mesmo arquivo passado duas vezes derruba a carga com código 2', () => {
  limpar();
  assert.throws(() => execFileSync('node', ['src/cli/carga.js', 'data/clt/R1.csv', 'data/clt/R1.csv', 'data/clt/R3.csv', 'data/pj/pj-2026.json', 'out/nao-deve-existir.json'], { cwd: raiz, encoding: 'utf8', stdio: 'pipe' }),
    e => e.status === 2 && /mesmo conteúdo/.test(e.stderr));
});

test('I9: erro de total divergente no parser derruba a carga com código 3', () => {
  const csv = ';LAGHETTO X;;;;;;;;;;;;;;;;;;;;;;;;;Página:;;;;1/1;;;\n1;;;UM;;;;;;;;1;;;;;;;84 - GARCOM;;;;;11111111111;;;;01/01/1990;;;;01/01/2020;\n;Total de empregados: ;;;;;;;;;;;;;;;;;;;;;;;;;5;\n';
  limpar();
  fs.writeFileSync(raiz + 'out/divergente.csv', csv);
  assert.throws(() => execFileSync('node', ['src/cli/carga.js', 'out/divergente.csv', 'data/clt/R2.csv', 'data/clt/R3.csv', 'data/pj/pj-2026.json', 'out/nao-deve-existir.json'], { cwd: raiz, encoding: 'utf8', stdio: 'pipe' }),
    e => e.status === 3 && /total_divergente/.test(e.stderr));
  assert.equal(fs.existsSync(raiz + 'out/nao-deve-existir.json'), false);
});
