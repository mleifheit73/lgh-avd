import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerFixture } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { reconstruirViews, definirSuperior, removerSuperior, confirmarInferido, marcarLider, criarAtuacaoNaOrganizacao, ehCorrente } from '../app/js/adaptador.js';
import { adicionarEmBloco } from '../app/js/modelo/montagem.js';
import {
  CAMPOS_MONTAGEM, calcularDelta, aplicarDelta, organizacoesNoDelta, deltaPorOrganizacao, organizacaoDoId, idDocMontagem,
} from '../app/js/modelo/persistencia.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const CORP = 'LAGHETTO CORPORATIVO';
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const corporativo = () => lerFixture('atuacoes-corporativo-mini.json');

function estado() {
  const e = montarEstado(base(), piloto(), corporativo(), FUSAO_MINI);
  const S = { ...e, pessoas: e.base.pessoas, piloto: piloto(), perfil: null, organizacaoSelecionada: 'GOLDEN' };
  reconstruirViews(S);
  S.atuacoesBase = JSON.parse(JSON.stringify(S.atuacoes));
  return S;
}
const idDe = (S, pessoa, org = 'GOLDEN') => S.atuacoes.find(a => a.pessoaRef === pessoa && a.organizacaoId === org && ehCorrente(a)).id;
const porId = l => [...l].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
const chavesProibidas = /"(nome|cargo|cpfHash)"\s*:/;

/* ================= módulo puro ================= */

test('CAMPOS_MONTAGEM nomeia os campos de montagem que tornam uma atuação alterada', () => {
  for (const c of ['superiorId', 'ehRaiz', 'podeLiderar', 'origem', 'metodoInferencia', 'confirmadaPor', 'definidaEm', 'fim', 'situacao', 'funcao', 'setor'])
    assert.ok(CAMPOS_MONTAGEM.includes(c), c);
});

test('calcularDelta vazio quando nada mudou', () => {
  const S = estado();
  const d = calcularDelta(S.atuacoesBase, S.atuacoes);
  assert.deepEqual(d, { versao: 1, alteradas: [], criadas: [], removidasIds: [] });
  assert.deepEqual(organizacoesNoDelta(d), []);
});

test('calcularDelta captura superior definido em bloco e aplicarDelta reconstrói o estado', () => {
  const S = estado();
  const sup = idDe(S, 'SUP'), coz = idDe(S, 'COZ1'), gar = idDe(S, 'GAR1');
  assert.equal(adicionarEmBloco(S, [coz, gar], sup, 'RH TESTE', '2026-11-04').ok, true);
  const d = calcularDelta(S.atuacoesBase, S.atuacoes);
  assert.deepEqual(d.alteradas.map(a => a.id), [coz, gar].sort());
  assert.ok(d.alteradas.every(a => a.superiorId === sup && a.confirmadaPor === 'RH TESTE'));
  assert.deepEqual(d.criadas, []); assert.deepEqual(d.removidasIds, []);
  assert.deepEqual(porId(aplicarDelta(S.atuacoesBase, d)), porId(S.atuacoes));
  assert.deepEqual(organizacoesNoDelta(d), ['GOLDEN']);
});

test('calcularDelta captura atuação criada (segunda atuação por definirSuperior) e é determinístico', () => {
  const S = estado();
  const cam = idDe(S, 'CAM'), gg = idDe(S, 'GG');
  assert.ok(S.atuacoes.find(a => a.id === cam).superiorId, 'premissa: a camareira já tem superior');
  const r = definirSuperior(S, cam, gg, 'RH TESTE', '2026-11-04');
  assert.equal(r.ok, true); assert.equal(r.acao, 'criada');
  const d1 = calcularDelta(S.atuacoesBase, S.atuacoes);
  const d2 = calcularDelta(S.atuacoesBase, [...S.atuacoes].reverse());
  assert.deepEqual(d1, d2, 'mesma entrada em outra ordem, mesmo delta');
  assert.deepEqual(d1.criadas.map(a => a.id), [r.atuacao.id]);
  assert.deepEqual(d1.alteradas, []);
  assert.deepEqual(porId(aplicarDelta(S.atuacoesBase, d1)), porId(S.atuacoes));
});

test('calcularDelta captura removida (caso sintético) e aplicarDelta tira do estado', () => {
  const S = estado();
  const sai = idDe(S, 'BR2', 'BRANO');
  const atual = S.atuacoes.filter(a => a.id !== sai);
  const d = calcularDelta(S.atuacoesBase, atual);
  assert.deepEqual(d.removidasIds, [sai]);
  assert.deepEqual(porId(aplicarDelta(S.atuacoesBase, d)), porId(atual));
  assert.deepEqual(organizacoesNoDelta(d), ['BRANO']);
  assert.deepEqual(Object.keys(deltaPorOrganizacao(d)), ['BRANO']);
  assert.deepEqual(deltaPorOrganizacao(d).BRANO.removidasIds, [sai]);
});

test('aplicarDelta nunca muta a base nem o delta', () => {
  const S = estado();
  adicionarEmBloco(S, [idDe(S, 'COZ1')], idDe(S, 'SUP'), 'RH', '2026-11-04');
  const d = calcularDelta(S.atuacoesBase, S.atuacoes);
  const b0 = JSON.stringify(S.atuacoesBase), d0 = JSON.stringify(d);
  const r = aplicarDelta(S.atuacoesBase, d);
  r[0].superiorId = 'X'; r.find(a => a.id === d.alteradas[0].id).funcao = 'Y';
  assert.equal(JSON.stringify(S.atuacoesBase), b0); assert.equal(JSON.stringify(d), d0);
});

/* gerador determinístico (sem Math.random: a falha precisa ser reproduzível pela semente) */
function sorteio(semente) {
  let s = semente >>> 0;
  return n => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; };
}
function mutarAoAcaso(S, rnd, passos) {
  for (let i = 0; i < passos; i++) {
    const org = rnd(3) === 0 ? CORP : 'GOLDEN';
    const correntes = S.atuacoes.filter(a => a.organizacaoId === org && ehCorrente(a));
    if (!correntes.length) continue;
    const a = correntes[rnd(correntes.length)], b = correntes[rnd(correntes.length)];
    const q = `2026-11-${String(1 + rnd(28)).padStart(2, '0')}`;
    switch (rnd(6)) {
      case 0: definirSuperior(S, a.id, b.id, 'RH', q); break;
      case 1: removerSuperior(S, a.id, 'RH', q); break;
      case 2: confirmarInferido(S, a.id, 'RH', q); break;
      case 3: try { marcarLider(S, a.id, rnd(2) === 0); } catch (e) { /* recusa sem efeito */ } break;
      case 4: adicionarEmBloco(S, [a.id], b.id, 'RH', q); break;
      case 5: {
        const p = S.pessoas[rnd(S.pessoas.length)];
        criarAtuacaoNaOrganizacao(S, { pessoaId: p.id, organizacaoId: org, superiorAtuacaoId: b.id, funcao: 'FUNÇÃO SINTÉTICA', autor: 'RH', quando: q });
        break;
      }
    }
  }
}

test('propriedade: aplicarDelta(base, calcularDelta(base, atual)) é igual a atual em 20 sequências aleatórias', () => {
  let comMudanca = 0;
  for (let k = 1; k <= 20; k++) {
    const S = estado();
    mutarAoAcaso(S, sorteio(k * 7919), 15 + k);
    const d = calcularDelta(S.atuacoesBase, S.atuacoes);
    if (d.alteradas.length + d.criadas.length) comMudanca++;
    assert.deepEqual(porId(aplicarDelta(S.atuacoesBase, d)), porId(S.atuacoes), `semente ${k}`);
    /* por organização: aplicar cada pedaço, um depois do outro, dá o mesmo resultado */
    let r = S.atuacoesBase;
    for (const parte of Object.values(deltaPorOrganizacao(d, S.atuacoesBase))) r = aplicarDelta(r, parte);
    assert.deepEqual(porId(r), porId(S.atuacoes), `semente ${k}, por organização`);
    assert.equal(chavesProibidas.test(JSON.stringify(d)), false, `semente ${k}: delta com nome, cargo ou hash`);
  }
  assert.ok(comMudanca >= 15, `as sequências mudam o estado de verdade (${comMudanca} de 20)`);
});

test('delta não contém nome, cargo nem hash', () => {
  const S = estado();
  adicionarEmBloco(S, [idDe(S, 'COZ1'), idDe(S, 'GAR1')], idDe(S, 'SUP'), 'RH', '2026-11-04');
  definirSuperior(S, idDe(S, 'CAM'), idDe(S, 'GG'), 'RH', '2026-11-04');
  const j = JSON.stringify(calcularDelta(S.atuacoesBase, S.atuacoes));
  assert.equal(chavesProibidas.test(j), false);
  assert.ok(!/cpf/i.test(j));
});

test('deltaPorOrganizacao separa GOLDEN e LAGHETTO CORPORATIVO; organizacaoDoId lê o prefixo', () => {
  const S = estado();
  adicionarEmBloco(S, [idDe(S, 'COZ1')], idDe(S, 'SUP'), 'RH', '2026-11-04');
  const dr = idDe(S, 'DR', CORP);
  const r = criarAtuacaoNaOrganizacao(S, { pessoaId: 'PJ-SEM-ORG', organizacaoId: CORP, superiorAtuacaoId: dr, funcao: 'ANALISTA', autor: 'RH', quando: '2026-11-04' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const d = calcularDelta(S.atuacoesBase, S.atuacoes);
  assert.deepEqual(organizacoesNoDelta(d), ['GOLDEN', CORP].sort());
  const partes = deltaPorOrganizacao(d);
  assert.deepEqual(Object.keys(partes).sort(), ['GOLDEN', CORP].sort());
  assert.deepEqual(partes.GOLDEN.alteradas.map(a => a.id), [idDe(S, 'COZ1')]);
  assert.deepEqual(partes.GOLDEN.criadas, []);
  assert.deepEqual(partes[CORP].criadas.map(a => a.id), [r.atuacao.id]);
  assert.equal(partes[CORP].versao, 1);
  assert.equal(organizacaoDoId('HOTEL LAGHETTO GOLDEN|abc123|2'), 'HOTEL LAGHETTO GOLDEN');
});

test('idDocMontagem: só caracteres permitidos no id de documento', () => {
  assert.equal(idDocMontagem('GOLDEN'), 'GOLDEN');
  assert.equal(idDocMontagem('HOTEL LAGHETTO GOLDEN'), 'HOTEL_LAGHETTO_GOLDEN');
  assert.equal(idDocMontagem('LAGHETTO CORPORATIVO'), 'LAGHETTO_CORPORATIVO');
  assert.match(idDocMontagem('A|B/Ç ÃO&x'), /^[A-Za-z0-9_\-.~:@+]+$/);
});

/* ================= dados reais (pula sem out/base.json) ================= */

const temDadosReais = fs.existsSync('out/base.json') && fs.existsSync('app/data/base.json') && fs.existsSync('app/data/piloto-golden.json');
test('dados reais: 50 operações no Golden, round-trip e documento do Golden abaixo de 100 KB', { skip: !temDadosReais }, async () => {
  const { organizacoesDe, FUSOES } = await import('../app/js/modelo/organizacao.js');
  const { atuacoesIniciais, ORGANIZACAO_PILOTO } = await import('../app/js/modelo/bootstrap.js');
  const real = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const pil = JSON.parse(fs.readFileSync('app/data/piloto-golden.json', 'utf8'));
  const organizacoes = organizacoesDe(real, FUSOES);
  const { atuacoes } = atuacoesIniciais(real, organizacoes, pil, { organizacaoPiloto: ORGANIZACAO_PILOTO });
  const S = { base: real, organizacoes, atuacoes, pessoas: real.pessoas, pessoasPorId: new Map(real.pessoas.map(p => [p.id, p])), organizacaoSelecionada: ORGANIZACAO_PILOTO };
  S.atuacoesBase = JSON.parse(JSON.stringify(atuacoes));
  const ids = new Set(organizacoes.map(o => idDocMontagem(o.id)));
  assert.equal(ids.size, organizacoes.length, 'idDocMontagem não junta duas organizações reais no mesmo documento');
  const rnd = sorteio(2026);
  let feitas = 0, aplicadas = 0;
  while (feitas < 50) {
    const correntes = S.atuacoes.filter(a => a.organizacaoId === ORGANIZACAO_PILOTO && ehCorrente(a));
    const a = correntes[rnd(correntes.length)], b = correntes[rnd(correntes.length)];
    const op = rnd(4);
    const r = op === 0 ? removerSuperior(S, a.id, 'RH', '2026-11-04')
      : op === 1 ? confirmarInferido(S, a.id, 'RH', '2026-11-04')
      : op === 2 ? adicionarEmBloco(S, [a.id], b.id, 'RH', '2026-11-04')
      : definirSuperior(S, a.id, b.id, 'RH', '2026-11-04');
    feitas++; if (r && r.ok && (r.acao !== 'nenhuma')) aplicadas++;
  }
  const d = calcularDelta(S.atuacoesBase, S.atuacoes);
  assert.deepEqual(porId(aplicarDelta(S.atuacoesBase, d)), porId(S.atuacoes));
  const golden = deltaPorOrganizacao(d)[ORGANIZACAO_PILOTO] || { versao: 1, alteradas: [], criadas: [], removidasIds: [] };
  const doc = { organizacaoId: ORGANIZACAO_PILOTO, ...golden, idsUsados: golden.criadas.map(a => a.id), autor: 'RH', quando: new Date().toISOString() };
  const bytes = Buffer.byteLength(JSON.stringify(doc), 'utf8');
  console.log(`# GOLDEN: ${aplicadas} de 50 operações com efeito; ${golden.alteradas.length} alteradas, ${golden.criadas.length} criadas; documento ${bytes} bytes`);
  assert.ok(aplicadas > 0);
  assert.ok(bytes < 100 * 1024, `documento do Golden com ${bytes} bytes`);
  assert.equal(chavesProibidas.test(JSON.stringify(doc)), false);
});
