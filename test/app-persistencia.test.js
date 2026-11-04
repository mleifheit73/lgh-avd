import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { reconstruirViews, definirSuperior, removerSuperior, confirmarInferido, marcarLider, criarAtuacaoNaOrganizacao, ehCorrente, definirCampoPessoa } from '../app/js/adaptador.js';
import { adicionarEmBloco } from '../app/js/modelo/montagem.js';
import {
  CAMPOS_MONTAGEM, GRUPOS_MONTAGEM, VERSAO_DELTA, calcularDelta, aplicarDelta, aplicarDeltaConferido, organizacoesNoDelta, deltaPorOrganizacao,
  organizacaoDoId, idDocMontagem,
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
  assert.deepEqual(d, { versao: VERSAO_DELTA, alteradas: [], criadas: [], removidasIds: [] });
  assert.equal(VERSAO_DELTA, 2, 'I3: alteradas só com os campos de montagem');
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
  assert.equal(partes[CORP].versao, VERSAO_DELTA);
  assert.equal(organizacaoDoId('HOTEL LAGHETTO GOLDEN|abc123|2'), 'HOTEL LAGHETTO GOLDEN');
});

test('idDocMontagem: só caracteres permitidos no id de documento', () => {
  assert.equal(idDocMontagem('GOLDEN'), 'GOLDEN');
  assert.equal(idDocMontagem('HOTEL LAGHETTO GOLDEN'), 'HOTEL_LAGHETTO_GOLDEN');
  assert.equal(idDocMontagem('LAGHETTO CORPORATIVO'), 'LAGHETTO_CORPORATIVO');
  assert.match(idDocMontagem('A|B/Ç ÃO&x'), /^[A-Za-z0-9_\-.~:@+]+$/);
});

/* ================= I3: alteradas só com campos de montagem; delta conferido ao carregar ================= */

test('I3: alterada leva só id, organizacaoId e os grupos de CAMPOS_MONTAGEM que mudaram', () => {
  const S = estado();
  const sup = idDe(S, 'SUP'), coz = idDe(S, 'COZ1');
  assert.equal(adicionarEmBloco(S, [coz], sup, 'RH', '2026-11-04').ok, true);
  marcarLider(S, idDe(S, 'GAR1'), true);
  const d = calcularDelta(S.atuacoesBase, S.atuacoes);
  const permitidas = new Set(['id', 'organizacaoId', ...CAMPOS_MONTAGEM]);
  for (const a of d.alteradas) assert.ok(Object.keys(a).every(k => permitidas.has(k)), JSON.stringify(a));
  const aCoz = d.alteradas.find(a => a.id === coz), aGar = d.alteradas.find(a => a.id === idDe(S, 'GAR1'));
  assert.deepEqual(Object.keys(aCoz).sort(), ['confirmadaPor', 'definidaEm', 'ehRaiz', 'id', 'metodoInferencia', 'organizacaoId', 'origem', 'superiorId'].sort());
  assert.deepEqual(Object.keys(aGar).sort(), ['id', 'organizacaoId', 'podeLiderar']);
  assert.ok(!('pessoaRef' in aCoz) && !('inicio' in aCoz) && !('turno' in aCoz) && !('funcao' in aCoz));
  assert.deepEqual(GRUPOS_MONTAGEM.flat(), [...CAMPOS_MONTAGEM]);
});

test('I3: depois de uma carga nova, o delta antigo não sobrescreve função, setor e início que vieram da base', () => {
  const S = estado();
  const sup = idDe(S, 'SUP'), coz = idDe(S, 'COZ1'), gar = idDe(S, 'GAR1');
  adicionarEmBloco(S, [coz], sup, 'RH', '2026-11-04');
  definirCampoPessoa(S, 'GAR1', 'GOLDEN', 'funcao', 'FUNÇÃO EDITADA NA MATRIZ');
  const d = JSON.parse(JSON.stringify(calcularDelta(S.atuacoesBase, S.atuacoes)));
  /* carga nova: a base muda função, setor e início das duas atuações */
  const nova = S.atuacoesBase.map(a => (a.id === coz || a.id === gar) ? { ...a, funcao: 'CARGO NOVO DA FOLHA', setor: 'SETOR NOVO', equipe: 'SETOR NOVO', inicio: '2026-10-01' } : a);
  const r = aplicarDelta(nova, d);
  const c = r.find(a => a.id === coz), g = r.find(a => a.id === gar);
  assert.equal(c.superiorId, sup, 'a montagem vale');
  assert.equal(c.confirmadaPor, 'RH');
  assert.deepEqual([c.funcao, c.setor, c.inicio], ['CARGO NOVO DA FOLHA', 'SETOR NOVO', '2026-10-01'], 'o resto vem da base nova');
  assert.equal(g.funcao, 'FUNÇÃO EDITADA NA MATRIZ', 'a função editada pelo RH continua valendo');
  assert.deepEqual([g.setor, g.inicio], ['SETOR NOVO', '2026-10-01']);
});

test('I3: o vínculo vai inteiro: confirmar o inferido grava também o superior confirmado', () => {
  const S = estado();
  const cam = idDe(S, 'CAM');
  assert.equal(confirmarInferido(S, cam, 'RH', '2026-11-04').ok, true);
  const d = calcularDelta(S.atuacoesBase, S.atuacoes);
  const a = d.alteradas.find(x => x.id === cam);
  assert.equal(a.superiorId, idDe(S, 'SUP'), 'o superior que o RH viu e confirmou');
  /* carga nova infere outro superior: a confirmação do RH não pode ser colada nele */
  const nova = S.atuacoesBase.map(x => x.id === cam ? { ...x, superiorId: idDe(S, 'GG') } : x);
  const r = aplicarDelta(nova, d).find(x => x.id === cam);
  assert.equal(r.superiorId, idDe(S, 'SUP'));
  assert.equal(r.origem, 'definido');
});

test('I3: aplicarDeltaConferido recusa delta com superior que não existe mais e não mexe nas atuações', () => {
  const S = estado();
  const sup = idDe(S, 'SUP'), coz = idDe(S, 'COZ1');
  adicionarEmBloco(S, [coz], sup, 'RH', '2026-11-04');
  const parte = deltaPorOrganizacao(calcularDelta(S.atuacoesBase, S.atuacoes)).GOLDEN;
  /* carga nova sem a atuação do supervisor (saiu da empresa) */
  const nova = S.atuacoesBase.filter(a => a.id !== sup && a.superiorId !== sup);
  const r = aplicarDeltaConferido(nova, parte, 'GOLDEN');
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'superior_inexistente');
  assert.equal(r.atuacoes, nova, 'devolve as atuações de entrada');
  /* com a base de antes, o mesmo delta passa */
  const ok = aplicarDeltaConferido(S.atuacoesBase, parte, 'GOLDEN');
  assert.equal(ok.ok, true); assert.equal(ok.atuacoes.find(a => a.id === coz).superiorId, sup);
  /* organização da carga sem raiz (BRANO) continua aceitando delta: o sem_raiz já existia antes */
  const br = idDe(S, 'BR2', 'BRANO');
  const sBr = { id: br, organizacaoId: 'BRANO', podeLiderar: true };
  assert.equal(aplicarDeltaConferido(S.atuacoesBase, { versao: 2, alteradas: [sBr], criadas: [], removidasIds: [] }, 'BRANO').ok, true);
  /* atuação de outra organização no documento: recusa */
  assert.equal(aplicarDeltaConferido(S.atuacoesBase, { versao: 2, alteradas: [sBr], criadas: [], removidasIds: [] }, 'GOLDEN').codigo, 'atuacao_de_outra_organizacao');
  /* alterada de atuação que a base nova não tem: ignorada e contada, não recusa */
  const sem = aplicarDeltaConferido(S.atuacoesBase, { versao: 2, alteradas: [{ id: 'GOLDEN|NINGUEM|1', organizacaoId: 'GOLDEN', podeLiderar: true }], criadas: [], removidasIds: [] }, 'GOLDEN');
  assert.equal(sem.ok, true); assert.deepEqual(sem.ignoradas, ['GOLDEN|NINGUEM|1']);
});

test('I3: documento versão 1 (registro inteiro em alteradas) ainda é lido como antes', () => {
  const S = estado();
  const coz = idDe(S, 'COZ1');
  const inteiro = { ...S.atuacoesBase.find(a => a.id === coz), superiorId: idDe(S, 'SUP'), origem: 'definido', funcao: 'FUNÇÃO DO V1' };
  const r = aplicarDelta(S.atuacoesBase, { versao: 1, alteradas: [inteiro], criadas: [], removidasIds: [] });
  assert.deepEqual(r.find(a => a.id === coz), inteiro);
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
  const golden = deltaPorOrganizacao(d)[ORGANIZACAO_PILOTO] || { versao: VERSAO_DELTA, alteradas: [], criadas: [], removidasIds: [] };
  const doc = { organizacaoId: ORGANIZACAO_PILOTO, ...golden, idsUsados: golden.criadas.map(a => a.id), autor: 'RH', quando: new Date().toISOString() };
  const bytes = Buffer.byteLength(JSON.stringify(doc), 'utf8');
  console.log(`# GOLDEN: ${aplicadas} de 50 operações com efeito; ${golden.alteradas.length} alteradas, ${golden.criadas.length} criadas; documento ${bytes} bytes`);
  assert.ok(aplicadas > 0);
  assert.ok(bytes < 100 * 1024, `documento do Golden com ${bytes} bytes`);
  assert.equal(chavesProibidas.test(JSON.stringify(doc)), false);
});

/* ================= página no jsdom, com banco falso ================= */

const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})";
const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));
const caixa = (document, id) => [...document.querySelectorAll('#ar-arvore .ar-caixa, #ar-sem-lider .ar-caixa')].find(c => c.dataset.atuacao === id);
const checks = document => [...document.querySelectorAll('#ar-pool input[type=checkbox][data-pool]')];

/** Banco do artefato em memória: docs por caminho 'colecao/id'; registra cada set com o estado do boot naquele momento. */
function bancoFalso(docs = {}, { atrasarBoot = 0, atrasoLeitura = {} } = {}) {
  const sets = [], leituras = [];
  const stub = {
    sets, leituras, docs,
    use: async (n) => {
      if (n !== 'db') return null;
      if (atrasarBoot && stub.janela) {   /* o banco responde antes do boot: os fetches seguintes do boot demoram */
        const f = stub.janela.fetch;
        stub.janela.fetch = (...a) => new Promise(r => setTimeout(r, atrasarBoot)).then(() => f(...a));
      }
      const pronto = () => !!(stub.janela && stub.janela.S && stub.janela.S.pronto);
      const ref = (caminho) => ({
        get: async () => {
          if (atrasoLeitura[caminho]) await new Promise(r => setTimeout(r, atrasoLeitura[caminho]));
          return { exists: caminho in docs, data: () => JSON.parse(JSON.stringify(docs[caminho])) };
        },
        set: async (d) => { const c = JSON.parse(JSON.stringify(d)); sets.push({ caminho, d: c, bootPronto: pronto() }); docs[caminho] = c; },
        update: async (d) => { docs[caminho] = { ...(docs[caminho] || {}), ...d }; },
        delete: async () => { delete docs[caminho]; },
      });
      return {
        doc: ref,
        collection: (nome) => ({
          doc: (id) => ref(nome + '/' + id),
          get: async () => {
            leituras.push({ nome, bootPronto: pronto() });
            return { docs: Object.keys(docs).filter(k => k.startsWith(nome + '/')).sort().map(k => ({ id: k.slice(nome.length + 1), exists: true, data: () => JSON.parse(JSON.stringify(docs[k])) })) };
          },
        }),
      };
    },
  };
  return stub;
}
const setsMontagem = stub => stub.sets.filter(s => s.caminho.startsWith('montagem/'));

async function adicionarDoisAoSupervisor(window, document, S) {
  window.eval(RH); window.irPara('arvore');
  const sup = S.atuacoes.find(a => a.pessoaRef === 'SUP' && a.organizacaoId === 'GOLDEN').id;
  caixa(document, sup).click();
  const disp = checks(document).filter(c => c.dataset.pool !== sup);
  disp[0].click(); disp[1].click();
  const escolhidos = [disp[0].dataset.pool, disp[1].dataset.pool];
  document.querySelector('#ar-adicionar').click();
  return { sup, escolhidos };
}

test('página sem banco: a faixa avisa e a montagem continua funcionando em memória', async () => {
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), null, OPCOES);
  await tick();
  const faixa = document.querySelector('#db-estado');
  assert.equal(faixa.hidden, false);
  assert.match(faixa.textContent, /Sem persistência nesta visualização/);
  assert.ok(!/montagem/.test(faixa.textContent), 'sem banco, nada sobre montagem na faixa');
  const { sup, escolhidos } = await adicionarDoisAoSupervisor(window, document, S);
  for (const id of escolhidos) assert.equal(S.atuacoes.find(a => a.id === id).superiorId, sup);
  assert.ok(Array.isArray(S.atuacoesBase) && S.atuacoesBase.length === S.atuacoes.length);
  assert.ok(S.atuacoesBase.every(a => !escolhidos.includes(a.id) || a.superiorId !== sup), 'a base não acompanha a mudança');
  assert.deepEqual(erros.map(String), []);
});

test('página com banco vazio: montar grava um documento por organização; desfazer grava o delta vazio', async () => {
  const stub = bancoFalso();
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), stub, OPCOES);
  await tick();
  assert.match(document.querySelector('#db-estado').textContent, /montagem: nenhuma alteração salva/);
  assert.deepEqual(setsMontagem(stub), [], 'carregar não grava');
  const { escolhidos } = await adicionarDoisAoSupervisor(window, document, S);
  await tick();
  const g = setsMontagem(stub);
  assert.equal(g.length, 1, JSON.stringify(g.map(x => x.caminho)));
  assert.equal(g[0].caminho, 'montagem/GOLDEN');
  assert.equal(g[0].d.organizacaoId, 'GOLDEN'); assert.equal(g[0].d.versao, 2);
  assert.deepEqual(g[0].d.alteradas.map(a => a.id), [...escolhidos].sort());
  assert.deepEqual(g[0].d.criadas, []); assert.deepEqual(g[0].d.removidasIds, []);
  assert.equal(g[0].d.autor, 'Teste RH'); assert.match(g[0].d.quando, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(chavesProibidas.test(JSON.stringify(g[0].d)), false, 'sem nome, cargo nem hash');
  assert.equal(g[0].bootPronto, true);
  window.desfazer();
  await tick();
  const g2 = setsMontagem(stub);
  assert.equal(g2.length, 2);
  assert.equal(g2[1].caminho, 'montagem/GOLDEN');
  assert.deepEqual([g2[1].d.alteradas, g2[1].d.criadas, g2[1].d.removidasIds], [[], [], []]);
  window.desfazer();   /* nada mais a desfazer: nada muda, nada grava */
  await tick();
  assert.equal(setsMontagem(stub).length, 2);
  assert.deepEqual(erros.map(String), []);
});

/** Delta do Golden montado na própria página (sem banco): COZ1 sob o supervisor e uma segunda atuação da camareira sob o GG. */
async function deltaSemeado() {
  const { window, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  const sup = S.atuacoes.find(a => a.pessoaRef === 'SUP' && a.organizacaoId === 'GOLDEN').id;
  const gg = S.atuacoes.find(a => a.pessoaRef === 'GG' && a.organizacaoId === 'GOLDEN').id;
  const coz = S.atuacoes.find(a => a.pessoaRef === 'COZ1' && a.organizacaoId === 'GOLDEN').id;
  const cam = S.atuacoes.find(a => a.pessoaRef === 'CAM' && a.organizacaoId === 'GOLDEN').id;
  assert.equal(window.LGH.definirSuperior(S, coz, sup, 'RH SEMENTE', '2026-11-01').ok, true);
  const r = window.LGH.definirSuperior(S, cam, gg, 'RH SEMENTE', '2026-11-01');
  assert.equal(r.acao, 'criada');
  const d = window.LGH.persistencia.calcularDelta(S.atuacoesBase, S.atuacoes);
  const criadaId = r.atuacao.id;
  const desfeitoId = criadaId.replace(/\|(\d+)$/, (m, n) => '|' + (Number(n) + 1));   /* id usado e desfeito noutra sessão */
  const doc = JSON.parse(JSON.stringify({ organizacaoId: 'GOLDEN', ...d, idsUsados: [criadaId, desfeitoId], autor: 'RH SEMENTE', quando: '2026-11-01T12:00:00.000Z' }));
  return { doc, coz, sup, cam, gg, criadaId, desfeitoId };
}

test('página com banco semeado: o delta do Golden vale depois do boot e os ids usados não se repetem', async () => {
  const s = await deltaSemeado();
  const stub = bancoFalso({ 'montagem/GOLDEN': s.doc });
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), stub, OPCOES);
  await tick();
  assert.equal(S.atuacoes.find(a => a.id === s.coz).superiorId, s.sup);
  const criada = S.atuacoes.find(a => a.id === s.criadaId);
  assert.ok(criada && criada.superiorId === s.gg);
  assert.ok(!S.atuacoesBase.some(a => a.id === s.criadaId), 'a base continua sem o delta');
  assert.ok(S.idsUsados.has(s.criadaId) && S.idsUsados.has(s.desfeitoId));
  assert.match(document.querySelector('#db-estado').textContent, /montagem: 2 alterações carregadas/);
  window.eval(RH); window.irPara('arvore');
  assert.ok(caixa(document, s.criadaId), 'a árvore mostra a segunda atuação da camareira');
  const equipeSup = window.LGH.avaliadosDe(S, 'SUP', 'GOLDEN').map(x => x.id);
  assert.ok(equipeSup.includes(s.coz), 'o cozinheiro está na equipe do supervisor');
  assert.equal(caixa(document, s.sup).dataset.subordinados, String(equipeSup.length), 'a caixa do supervisor conta a equipe com o cozinheiro');
  assert.deepEqual(setsMontagem(stub), [], 'carregar não regrava');
  /* uma nova segunda atuação da camareira não reaproveita id usado */
  const rec = S.atuacoes.find(a => a.pessoaRef === 'REC1' && a.organizacaoId === 'GOLDEN').id;
  window.eval(`tentarMudar('rec líder', ()=>LGH.marcarLider(S, ${JSON.stringify(rec)}, true))`);
  const r = window.eval(`tentarMudar('cam sob rec', ()=>LGH.definirSuperior(S, ${JSON.stringify(s.cam)}, ${JSON.stringify(rec)}, 'Teste RH'))`);
  assert.equal(r.ok, true, JSON.stringify(r));
  const nova = r.valor.atuacao.id;
  assert.ok(![s.cam, s.criadaId, s.desfeitoId].includes(nova), nova);
  await tick();
  const g = setsMontagem(stub);
  assert.ok(g.length >= 1);
  const ultimo = g[g.length - 1].d;
  assert.ok(ultimo.criadas.some(a => a.id === nova) && ultimo.criadas.some(a => a.id === s.criadaId));
  assert.ok([s.criadaId, s.desfeitoId, nova].every(id => ultimo.idsUsados.includes(id)), 'idsUsados acumula');
  assert.deepEqual(erros.map(String), []);
});

test('corrida banco x boot: o banco responde antes do boot e o delta ainda vale depois de lgh-boot-pronto', async () => {
  const s = await deltaSemeado();
  const stub = bancoFalso({ 'montagem/GOLDEN': s.doc }, { atrasarBoot: 150 });
  const { S, erros } = await carregarPagina(base(), piloto(), stub, OPCOES);
  await tick(100);
  const lAval = stub.leituras.find(l => l.nome === 'avaliacoes');
  assert.ok(lAval && lAval.bootPronto === false, 'premissa: o banco respondeu antes do boot terminar');
  const lMont = stub.leituras.find(l => l.nome === 'montagem');
  assert.ok(lMont && lMont.bootPronto === true, 'a montagem só é lida depois do boot');
  assert.equal(S.atuacoes.find(a => a.id === s.coz).superiorId, s.sup);
  assert.ok(S.atuacoes.some(a => a.id === s.criadaId));
  assert.deepEqual(setsMontagem(stub), [], 'nada gravado por cima');
  assert.deepEqual(erros.map(String), []);
});

/* ================= correções da revisão (R25, R26) ================= */

test('R25: com delta de montagem, podeLiderar segue o delta e não config/lideres-e-contas (contas continuam vindo de lá)', async () => {
  const s = await deltaSemeado();
  const cam = s.doc.criadas.find(a => a.id === s.criadaId);
  assert.equal(cam.podeLiderar, false, 'premissa: no delta a camareira não é líder');
  const camBase = { ...(await carregarPagina(base(), piloto(), null, OPCOES)).S.atuacoes.find(a => a.id === s.cam), podeLiderar: false };
  const doc = { ...s.doc, alteradas: [...s.doc.alteradas, camBase].sort((x, y) => (x.id < y.id ? -1 : 1)) };
  const stub = bancoFalso({
    'montagem/GOLDEN': doc,
    'config/lideres-e-contas': { lideres: ['CAM'], lideresAtuacoes: [s.cam, s.criadaId], usuarios: [{ nome: 'USUARIO SINTETICO', cargo: 'x', cpf: '', email: '', papel: 'avaliador', nivel: 'N1', escopo: 'x', ativo: true }], atualizadoEm: '2026-11-03T00:00:00.000Z' },
  }, { atrasoLeitura: { 'config/lideres-e-contas': 60 } });   /* o config chega depois do delta: sem R25 ele venceria */
  const { window, S, erros } = await carregarPagina(base(), piloto(), stub, OPCOES);
  await tick(150);
  const camAtuais = S.atuacoes.filter(a => a.pessoaRef === 'CAM' && a.organizacaoId === 'GOLDEN');
  assert.ok(camAtuais.length >= 2);
  assert.ok(camAtuais.every(a => a.podeLiderar === false), JSON.stringify(camAtuais.map(a => [a.id, a.podeLiderar])));
  assert.equal(window.eval('USUARIOS').some(u => u.nome === 'USUARIO SINTETICO'), true, 'as contas ainda vêm do config');
  assert.deepEqual(erros.map(String), []);
});

test('R26: Restaurar configuração inicial avisa que apaga a montagem salva e grava os deltas vazios', async () => {
  const stub = bancoFalso();
  const { window, document, S } = await carregarPagina(base(), piloto(), stub, OPCOES);
  await tick();
  await adicionarDoisAoSupervisor(window, document, S);
  await tick();
  assert.equal(setsMontagem(stub).length, 1);
  window.irPara('matriz');
  const b = document.querySelector('#btn-restaurar');
  b.click();
  assert.equal(b.textContent, 'Confirmar: descartar as alterações e apagar a montagem salva no banco');
  b.click();
  assert.equal(document.querySelector('#lote-msg').textContent, 'Configuração voltou ao estado da importação; a montagem salva no banco foi apagada.');
  await tick();
  const g = setsMontagem(stub);
  assert.equal(g.length, 2);
  assert.deepEqual([g[1].d.alteradas, g[1].d.criadas, g[1].d.removidasIds], [[], [], []]);
});

test('R26: sem banco os textos do Restaurar ficam como antes', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  await tick();
  window.eval(RH); window.irPara('matriz');
  const b = document.querySelector('#btn-restaurar');
  b.click();
  assert.equal(b.textContent, 'Confirmar: descartar todas as alterações');
  b.click();
  assert.equal(document.querySelector('#lote-msg').textContent, 'Configuração voltou ao estado da importação.');
});

test('I3: página com delta que aponta para superior inexistente: recusa a organização, avisa na faixa e não regrava o documento', async () => {
  const s0 = await deltaSemeado();
  const doc = JSON.parse(JSON.stringify(s0.doc));
  doc.versao = 2;
  doc.alteradas = [{ id: s0.coz, organizacaoId: 'GOLDEN', superiorId: 'GOLDEN|QUEM-SAIU|1', ehRaiz: false, origem: 'definido', metodoInferencia: null, confirmadaPor: 'RH', definidaEm: '2026-11-01' }];
  const stub = bancoFalso({ 'montagem/GOLDEN': doc });
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), stub, OPCOES);
  await tick();
  assert.equal(S.atuacoes.find(a => a.id === s0.coz).superiorId, null, 'o Golden ficou no estado da base');
  assert.ok(!S.atuacoes.some(a => a.id === s0.criadaId), 'nem a criada do documento recusado entra');
  assert.match(document.querySelector('#db-estado').textContent, /montagem salva de Golden não pôde ser aplicada \(superior_inexistente\)/);
  /* mudar o Golden agora não sobrescreve o documento recusado */
  await adicionarDoisAoSupervisor(window, document, S);
  await tick();
  assert.deepEqual(setsMontagem(stub), [], 'documento recusado fica intacto no banco');
  assert.deepEqual(stub.docs['montagem/GOLDEN'], doc);
  assert.equal(window.LGH_PERSISTENCIA.recusadas().GOLDEN, 'superior_inexistente');
  assert.deepEqual(erros.map(String), []);
});
