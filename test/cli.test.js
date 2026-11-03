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
