// Transformações de privacidade do build, testadas com dados sintéticos (não dependem de out/base.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { baseParaPublico, mascarar, faixaEtaria, idPublico, lerOuCriarSegredo, extrairPilotoGolden, normalizarNome, temSequenciaCpf } from '../scripts/build-app.mjs';

const REF = new Date('2026-11-03T12:00:00Z');
const SEGREDO = '0f'.repeat(32);
const publico = (b, ref = REF, commit) => baseParaPublico(b, ref, commit, SEGREDO);

const baseSintetica = () => ({
  geradoEm: '2026-11-03T00:00:00.000Z',
  pessoas: [
    { cpf: '00000000001', nome: 'PESSOA UM TESTE', nascimento: '1990-06-15', status: 'ativo', motivoStatus: null, nomesAlternativos: [] },
    { cpf: null, nome: 'PESSOA SEM CPF TESTE', nascimento: null, status: 'pendente', motivoStatus: 'sem_cpf', nomesAlternativos: [], idProvisorio: 'sem-cpf-1' },
    { cpf: '00000000002', nome: 'PESSOA DOIS TESTE', nascimento: '2001-11-03', status: 'ativo', motivoStatus: null, nomesAlternativos: [] },
    { cpf: null, nome: 'OUTRA SEM CPF TESTE', nascimento: null, status: 'pendente', motivoStatus: 'sem_cpf', nomesAlternativos: [], idProvisorio: 'sem-cpf-2' },
  ],
  vinculos: [
    { pessoaRef: '00000000001', regime: 'CLT', empresa: 'E1', empresaOriginal: 'E1 LTDA', cargo: 'C', inicio: '2020-01-01', filial: 'F', codigo: '1', chave: 'F|1', cpf: '00000000001', campoNovo: 'segredo' },
    { pessoaRef: 'sem-cpf-1', regime: 'PJ', empresa: null, empresaOriginal: null, cargo: null, inicio: '2026-11-13' },
  ],
  pendencias: [
    { pessoaRef: 'sem-cpf-1', codigo: 'sem_cpf', detalhe: 'Registro PJ sem CPF.' },
    { pessoaRef: '00000000002', codigo: 'possivel_duplicado', detalhe: 'Nome igual ao de PESSOA UM TESTE (CPF 000.000.000-01), e ao CPF 00000000002, e ao 99999999999.', extra: '00000000001' },
  ],
  equivalenciaEmpresas: { E1: ['E1 LTDA'] },
});

test('baseParaPublico: sem 11 dígitos soltos, sem hash, ids HMAC corretos, sem-cpf-N em ordem', () => {
  const pub = publico(baseSintetica(), REF, 'abc123');
  const txt = JSON.stringify(pub);
  assert.equal(temSequenciaCpf(txt), false);
  assert.equal(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(txt), false);
  assert.equal(txt.includes('"cpf"'), false);
  assert.equal(txt.includes('nascimento'), false);
  assert.equal(txt.includes('idade'), false);
  assert.equal(txt.includes('cpfHash'), false);
  assert.equal(/[0-9a-fA-F]{64}/.test(txt), false);
  const [p1, p2, p3, p4] = pub.pessoas;
  assert.ok(pub.pessoas.every(p => !('cpfHash' in p)));
  assert.equal(p1.id, idPublico(SEGREDO, '00000000001'));
  assert.equal(p1.id, crypto.createHmac('sha256', Buffer.from(SEGREDO, 'hex')).update('00000000001').digest('hex').slice(0, 12));
  assert.notEqual(p1.id, crypto.createHash('sha256').update('lgh-avd-2026::00000000001').digest('hex').slice(0, 12), 'não é mais o SHA-256 com sal público');
  assert.equal(p2.id, 'sem-cpf-1');
  assert.equal(p4.id, 'sem-cpf-2');
  assert.equal(p3.id, idPublico(SEGREDO, '00000000002'));
  assert.equal(pub.commit, 'abc123');
});

test('baseParaPublico: faixa etária calculada na data de referência, null sem nascimento', () => {
  const pub = publico(baseSintetica(), REF);
  assert.equal(pub.pessoas[0].faixaEtaria, '35 a 44');
  assert.equal(pub.pessoas[1].faixaEtaria, null);
  assert.equal(pub.pessoas[2].faixaEtaria, '25 a 34');
});

test('baseParaPublico: pessoaRef vira pessoaId e o resto vem de lista explícita de campos', () => {
  const pub = publico(baseSintetica(), REF);
  const [v1, v2] = pub.vinculos;
  assert.equal(v1.pessoaId, pub.pessoas[0].id);
  assert.equal(v2.pessoaId, 'sem-cpf-1');
  assert.ok(pub.vinculos.every(v => !('pessoaRef' in v) && !('cpf' in v) && !('campoNovo' in v)));
  assert.deepEqual(Object.keys(v1).sort(), ['cargo', 'chave', 'codigo', 'empresa', 'empresaOriginal', 'filial', 'inicio', 'pessoaId', 'regime']);
  assert.ok(pub.pendencias.every(x => !('pessoaRef' in x) && !('extra' in x)));
  assert.equal(pub.pendencias[1].pessoaId, pub.pessoas[2].id);
  assert.deepEqual(Object.keys(pub.pendencias[1]).sort(), ['codigo', 'detalhe', 'pessoaId']);
});

test('baseParaPublico: CPF no detalhe vira [pessoa <id>] quando conhecido e [CPF omitido] quando não', () => {
  const pub = publico(baseSintetica(), REF);
  const d = pub.pendencias[1].detalhe;
  assert.ok(d.includes(`[pessoa ${pub.pessoas[0].id}]`), d);
  assert.ok(d.includes(`[pessoa ${pub.pessoas[2].id}]`), d);
  assert.ok(d.includes('[CPF omitido]'), d);
});

test('baseParaPublico: vínculo ou pendência de pessoa inexistente lança erro', () => {
  const b1 = baseSintetica(); b1.vinculos.push({ pessoaRef: '11111111111', regime: 'CLT' });
  assert.throws(() => publico(b1, REF), /pessoaRef sem pessoa/);
  const b2 = baseSintetica(); b2.pendencias.push({ pessoaRef: 'sem-cpf-99', codigo: 'x', detalhe: '' });
  assert.throws(() => publico(b2, REF), /pessoaRef sem pessoa/);
});

test('mascarar: formatado, só dígitos, desconhecido, e não mexe em não-texto', () => {
  const m = new Map([['00000000001', 'aaaaaaaaaaaa']]);
  assert.equal(mascarar('CPF 000.000.000-01', m), 'CPF [pessoa aaaaaaaaaaaa]');
  assert.equal(mascarar('CPF 00000000001', m), 'CPF [pessoa aaaaaaaaaaaa]');
  assert.equal(mascarar('CPF 123.456.789-09', m), 'CPF [CPF omitido]');
  assert.equal(mascarar(null, m), null);
  assert.equal(mascarar(42, m), 42);
  assert.equal(mascarar('sem número nenhum', m), 'sem número nenhum');
});

test('faixaEtaria: limites 24/25, 34/35, 44/45, 54/55 e nulo', () => {
  // Referência 2026-11-03: quem nasceu em 2001-11-03 fez 25 anos hoje; 2001-11-04 faz amanhã (ainda 24).
  const casos = [
    ['2001-11-04', 'até 24'], ['2001-11-03', '25 a 34'],
    ['1991-11-04', '25 a 34'], ['1991-11-03', '35 a 44'],
    ['1981-11-04', '35 a 44'], ['1981-11-03', '45 a 54'],
    ['1971-11-04', '45 a 54'], ['1971-11-03', '55 ou mais'],
    ['2026-01-01', 'até 24'], ['1940-01-01', '55 ou mais'],
  ];
  for (const [nasc, esperado] of casos) assert.equal(faixaEtaria(nasc, REF), esperado, nasc);
  for (const ruim of [null, undefined, '', 'lixo', '2030-01-01', '1800-01-01']) assert.equal(faixaEtaria(ruim, REF), null, String(ruim));
});

test('idPublico: HMAC-SHA256 com o segredo, 12 hex; outro segredo dá outro id; segredo inválido lança', () => {
  const id = idPublico(SEGREDO, '00000000001');
  assert.match(id, /^[0-9a-f]{12}$/);
  assert.notEqual(id, idPublico(SEGREDO, '00000000002'));
  assert.notEqual(id, idPublico('1e'.repeat(32), '00000000001'));
  for (const ruim of [undefined, '', 'xyz', 'ab'.repeat(16)]) assert.throws(() => idPublico(ruim, '00000000001'), /segredo dos ids inválido/);
  assert.throws(() => baseParaPublico(baseSintetica(), REF, 'x'), /segredo dos ids inválido/, 'sem segredo o build não gera id');
});

test('lerOuCriarSegredo: cria com 64 hex e avisa; depois lê o mesmo; recusa conteúdo ruim', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lgh-segredo-'));
  const avisos = []; const original = console.error; console.error = (m) => avisos.push(String(m));
  try {
    const f = path.join(tmp, 'data', 'segredo-ids.txt');
    const a = lerOuCriarSegredo(f);
    assert.equal(a.criado, true); assert.match(a.segredo, /^[0-9a-f]{64}$/);
    assert.match(avisos.join('\n'), /Guarde este arquivo junto com data\//);
    const b = lerOuCriarSegredo(f);
    assert.deepEqual(b, { segredo: a.segredo, criado: false });
    fs.writeFileSync(f, 'nao-e-hex');
    assert.throws(() => lerOuCriarSegredo(f), /64 hexadecimais/);
  } finally { console.error = original; fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('extrairPilotoGolden: chaves normalizadas, campos esperados, erro sem o array', () => {
  const html = '<script>\nconst PESSOAS = [{"id":"x1","nome":"  José  da  Conceição ","cargo":"Garcom","setor":"A&B","equipe":"A&B","avaliadores":["Fulana"],"lider":true,"idade":31},{"id":"x2","nome":"Maria","cargo":"Cozinheira","setor":"Cozinha","equipe":"Cozinha","avaliadores":[],"lider":false,"funcao":"Chef","situacao":"Férias"}];\nconst OUTRA = 1;\n</script>';
  const g = extrairPilotoGolden(html);
  assert.deepEqual(Object.keys(g).sort(), ['JOSE DA CONCEICAO', 'MARIA']);
  assert.deepEqual(g['JOSE DA CONCEICAO'], { nome: '  José  da  Conceição ', setor: 'A&B', equipe: 'A&B', lider: true, avaliadores: ['Fulana'], funcao: 'Garcom', situacao: 'Ativo' });
  assert.equal(g.MARIA.funcao, 'Chef');
  assert.equal(g.MARIA.situacao, 'Férias');
  assert.equal('idade' in g['JOSE DA CONCEICAO'], false);
  assert.throws(() => extrairPilotoGolden('<html></html>'), /PESSOAS não encontrado/);
  assert.equal(normalizarNome(' çÃo  A '), 'CAO A');
});

test('temSequenciaCpf: pega 11 dígitos (inclusive colados a letras) e ignora hashes e ids públicos', () => {
  assert.equal(temSequenciaCpf('{"x":"12345678901"}'), true);
  assert.equal(temSequenciaCpf('cpf12345678901x'), true);
  assert.equal(temSequenciaCpf('12345678901234'), true);
  const h = 'a' + '1'.repeat(11) + 'b'.repeat(52);
  assert.equal(temSequenciaCpf(`{"cpfHash":"${h}"}`), false);
  assert.equal(temSequenciaCpf('{"id":"111111111111","pessoaId":"222222222222"}'), false);
  assert.equal(temSequenciaCpf('[pessoa 333333333333]'), false);
  assert.equal(temSequenciaCpf('{"cpf":"11111111111"}'), true);
});
