import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { SEQ_CPF } from '../scripts/build-app.mjs';
import { carregarPagina, lerFixture } from './helpers/pagina.js';

const raiz = new URL('..', import.meta.url).pathname;
const soComDados = { skip: fs.existsSync(raiz + 'out/base.json') ? false : 'out/base.json ausente: rode node src/cli/carga.js' };

// Roda o build e devolve { code, stdout, stderr } sem rejeitar.
const rodar = (cmd) => new Promise((resolve) => {
  execFile('bash', ['-c', cmd], { cwd: raiz }, (erro, stdout, stderr) => {
    resolve({ code: erro ? erro.code : 0, stdout, stderr });
  });
});

test('build gera base.json sem CPF, sem nascimento, com hash', soComDados, async () => {
  const r = await rodar('npm run build:app');
  assert.equal(r.code, 0, r.stderr);
  const b = JSON.parse(fs.readFileSync(raiz + 'app/data/base.json', 'utf8'));
  const txt = JSON.stringify(b);
  assert.equal(SEQ_CPF.test(txt), false);
  assert.equal(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(txt), false);
  assert.equal('cpf' in b.pessoas[0], false);
  assert.equal('nascimento' in b.pessoas[0], false);
  assert.equal('idade' in b.pessoas[0], false);
  assert.equal(txt.includes('"nascimento"'), false);
  assert.ok(b.pessoas.every(p => ['até 24', '25 a 34', '35 a 44', '45 a 54', '55 ou mais', null].includes(p.faixaEtaria)));
  assert.match(b.pessoas.find(p => p.cpfHash).cpfHash, /^[0-9a-f]{64}$/);
  assert.ok(b.pessoas.every(p => /^([0-9a-f]{12}|sem-cpf-\d+)$/.test(p.id)));
  assert.ok(b.pessoas.filter(p => !p.cpfHash).every(p => /^sem-cpf-\d+$/.test(p.id)));
  assert.ok(b.vinculos.every(v => !('pessoaRef' in v) && !('cpf' in v) && b.pessoas.some(p => p.id === v.pessoaId) || false));
  assert.ok(b.pendencias.every(x => !('pessoaRef' in x)));
  assert.equal(b.pessoas.length, 1822);
});

test('build copia os módulos do Plano A sem alteração', async () => {
  const r = await rodar('npm run build:app');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(fs.readFileSync(raiz + 'app/js/modelo/atuacao.js', 'utf8'), fs.readFileSync(raiz + 'src/modelo/atuacao.js', 'utf8'));
  for (const f of fs.readdirSync(raiz + 'src/carga')) {
    assert.equal(fs.readFileSync(raiz + 'app/js/carga/' + f, 'utf8'), fs.readFileSync(raiz + 'src/carga/' + f, 'utf8'));
  }
});

test('build extrai o piloto Golden com as chaves normalizadas', soComDados, async () => {
  const r = await rodar('npm run build:app');
  assert.equal(r.code, 0, r.stderr);
  const g = JSON.parse(fs.readFileSync(raiz + 'app/data/piloto-golden.json', 'utf8'));
  const chaves = Object.keys(g);
  assert.ok(chaves.length > 100);
  assert.ok(chaves.every(k => k === k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()));
  const um = g[chaves[0]];
  assert.deepEqual(Object.keys(um).sort(), ['avaliadores', 'equipe', 'funcao', 'lider', 'nome', 'setor', 'situacao']);
  assert.ok(Array.isArray(um.avaliadores));
});

test('dist/ é cópia de app/ e não contém o array PESSOAS', async () => {
  const r = await rodar('npm run build:app');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(fs.existsSync(raiz + 'dist/index.html'));
  assert.ok(fs.existsSync(raiz + 'dist/data/base.json') || !fs.existsSync(raiz + 'app/data/base.json'));
  assert.equal(/const PESSOAS = \[\{/.test(fs.readFileSync(raiz + 'dist/index.html', 'utf8')), false);
});

test('build aborta com código 4 se dist/ contiver CPF, CPF formatado ou nascimento', async () => {
  const casos = ['{"x":"12345678901"}', '{"x":"123.456.789-01"}', '{"nascimento":"x"}'];
  for (const conteudo of casos) {
    fs.mkdirSync(raiz + 'app/data', { recursive: true });
    fs.writeFileSync(raiz + 'app/data/vazamento.json', conteudo);
    try {
      const r = await rodar('npm run build:app');
      assert.equal(r.code, 4, `esperava código 4 para ${conteudo}: ${r.stderr}`);
    } finally {
      fs.rmSync(raiz + 'app/data/vazamento.json', { force: true });
    }
  }
  const ok = await rodar('npm run build:app');
  assert.equal(ok.code, 0, ok.stderr);
});

test('o marcador 000.000.000-00 não dispara o scan', async () => {
  fs.mkdirSync(raiz + 'app/data', { recursive: true });
  fs.writeFileSync(raiz + 'app/data/marcador.json', '{"x":"000.000.000-00"}');
  try {
    const r = await rodar('npm run build:app');
    assert.equal(r.code, 0, r.stderr);
  } finally {
    fs.rmSync(raiz + 'app/data/marcador.json', { force: true });
  }
});

test('helper carrega a página no jsdom com a base mini e o boot termina', async () => {
  const { document, S } = await carregarPagina(lerFixture('base-mini.json'));
  assert.ok(document.querySelector('#nav'));
  assert.equal(S.pessoas.length, 14);
});

test('fixture não tem CPF, nascimento nem idade', () => {
  const txt = JSON.stringify(lerFixture('base-mini.json'));
  assert.equal(SEQ_CPF.test(txt), false);
  assert.equal(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(txt), false);
  assert.equal(/nascimento|"cpf"|"idade"/.test(txt), false);
});

test('painel do RH renderiza por faixa etária, sem idade exata', async () => {
  const { window, document, S, erros } = await carregarPagina(lerFixture('base-mini.json'));
  assert.deepEqual(erros, []);
  assert.ok(S.pessoas.every(p => !('idade' in p)));
  S.perfil = { nivel: 'N6', papel: 'admin', nome: 'Teste', cargo: 'Teste', escopo: 'Rede' };
  window.renderRH();
  const html = document.querySelector('#rh-idade').innerHTML;
  assert.match(html, /35 a 44/);
  assert.match(document.querySelector('#rh-kpis').textContent, /Faixa etária mais comum/);
  assert.equal(/Idade média|NaN/.test(document.querySelector('#rh-kpis').textContent + html + document.querySelector('#rh-idade-cargo').innerHTML), false);
});

test('boot usa o piloto Golden por nome normalizado e tolera piloto ausente', async () => {
  const piloto = { 'CAMAREIRA TESTE': { nome: 'Camareira Teste', setor: 'Governança', equipe: 'Governança', lider: false, avaliadores: ['Fulano'], funcao: 'Camareira', situacao: 'Ativo' } };
  const com = await carregarPagina(lerFixture('base-mini.json'), piloto);
  const cam = com.S.pessoas.find(p => p.id === 'CAM');
  assert.ok(cam);
  const visao = com.window.eval('PESSOAS').find(p => p.id === 'CAM');
  assert.equal(visao.setor, 'Governança');
  assert.equal(JSON.stringify(visao.avaliadores), '["Fulano"]');
  const sem = await carregarPagina(lerFixture('base-mini.json'));
  const v2 = sem.window.eval('PESSOAS').find(p => p.id === 'CAM');
  assert.equal(v2.setor, 'Sem setor');
  assert.equal(v2.lider, false);
  assert.equal(sem.window.eval('PESSOAS').length, 14);
});
