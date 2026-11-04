import { test } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { lerFixture } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { arvore, semSuperior, atuacoesDe } from '../app/js/modelo/atuacao.js';
import { definirSuperior, rotuloOrigem } from '../app/js/adaptador.js';
import {
  renderArvore, resumoOrganizacao, foraDaArvore, ligacoesCorporativas, unidadesSob, ligacaoDaUnidade, poolSemOrganizacao,
  rotuloOrigemCurto, LEGENDA_ORIGEM,
} from '../app/js/arvore-ui.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const corporativo = () => lerFixture('atuacoes-corporativo-mini.json');
const pilotoDuplo = () => { const p = piloto(); p['CAMAREIRA TESTE'].avaliadores = ['SUPERVISOR DE GOVERNANCA TESTE', 'GERENTE GERAL TESTE']; return p; };
const estado = ({ pil = piloto(), extras = corporativo() } = {}) => montarEstado(base(), pil, extras, FUSAO_MINI);
const parse = html => new JSDOM(`<body>${html}</body>`).window.document;
const correntes = (S, org) => S.atuacoes.filter(a => a.organizacaoId === org && a.situacao === 'ativa' && a.fim == null);
/** Ids alcançáveis descendo da raiz pelos superiorId: o que arvore() deve devolver, calculado à parte. */
function alcancaveis(S, org) {
  const l = correntes(S, org); const raiz = l.find(a => a.ehRaiz); const ids = new Set([raiz.id]);
  for (let mudou = true; mudou;) { mudou = false; for (const a of l) if (a.superiorId && ids.has(a.superiorId) && !ids.has(a.id)) { ids.add(a.id); mudou = true; } }
  return ids;
}

test('renderArvore: uma caixa por atuação alcançável da raiz, com data-atuacao, data-pessoa, nível e subordinados', () => {
  const S = estado();
  const doc = parse(renderArvore(arvore(S.atuacoes, 'GOLDEN'), { profundidadeAberta: 1, pessoas: S.pessoasPorId, destacarSemSuperior: true }));
  const caixas = [...doc.querySelectorAll('.ar-caixa[data-atuacao]')];
  assert.deepEqual(new Set(caixas.map(c => c.dataset.atuacao)), alcancaveis(S, 'GOLDEN'));
  const gg = doc.querySelector('[data-atuacao="GOLDEN|GG|1"]');
  assert.equal(gg.dataset.pessoa, 'GG'); assert.equal(gg.dataset.nivel, '0');
  const diretos = correntes(S, 'GOLDEN').filter(a => a.superiorId === 'GOLDEN|GG|1').length;
  assert.equal(gg.dataset.subordinados, String(diretos));
  assert.match(gg.textContent, new RegExp(`${diretos} subordinados diretos`));
  assert.match(gg.textContent, /GERENTE GERAL TESTE/); assert.match(gg.textContent, /Raiz/);
  assert.ok(gg.querySelector('.ar-colapso'), 'caixa com filhos tem botão de recolher');
  assert.equal(doc.querySelector('[data-atuacao="GOLDEN|REC1|1"]').querySelector('.ar-colapso'), null);
});

test('renderArvore: rótulo curto de origem com o texto completo no title; marcador de líder', () => {
  const S = estado();
  const doc = parse(renderArvore(arvore(S.atuacoes, 'GOLDEN'), { pessoas: S.pessoasPorId }));
  const rec = doc.querySelector('[data-atuacao="GOLDEN|REC1|1"] .ar-origem');
  assert.equal(rec.textContent, 'Cargo'); assert.equal(rec.title, 'Inferido pelo cargo');
  const gg = doc.querySelector('[data-atuacao="GOLDEN|GG|1"] .ar-origem');
  assert.equal(gg.textContent, 'Empresa'); assert.equal(gg.title, 'Inferido pela empresa');
  assert.deepEqual(LEGENDA_ORIGEM.map(l => l.curto), ['Carga', 'Cargo', 'Empresa', 'RH']);
  assert.equal(rotuloOrigemCurto({ origem: 'definido' }), 'RH');
  assert.equal(rotuloOrigemCurto({}), 'Sem registro');
  assert.equal(LEGENDA_ORIGEM.find(l => l.origem === 'carga').texto, rotuloOrigem({ origem: 'carga' }));
  const docC = parse(renderArvore(arvore(S.atuacoes, 'LAGHETTO CORPORATIVO'), { pessoas: S.pessoasPorId }));
  assert.ok(docC.querySelector('[data-atuacao="LAGHETTO CORPORATIVO|DR|1"] .ar-lider'), 'DR tem podeLiderar');
  assert.equal(docC.querySelector('[data-atuacao="LAGHETTO CORPORATIVO|GG|1"] .ar-lider'), null);
});

test('renderArvore: raiz e primeiro nível abertos, netos fechados por padrão; profundidadeAberta abre mais', () => {
  const S = estado();
  assert.equal(definirSuperior(S, 'GOLDEN|COZ1|1', 'GOLDEN|REC1|1', 'RH Teste').ok, true);   // neto: GG > REC1 > COZ1
  const no = arvore(S.atuacoes, 'GOLDEN');
  let doc = parse(renderArvore(no, { profundidadeAberta: 1, pessoas: S.pessoasPorId }));
  const neto = doc.querySelector('[data-atuacao="GOLDEN|COZ1|1"]');
  assert.equal(neto.dataset.nivel, '2');
  assert.equal(neto.closest('ul').hidden, true);
  assert.equal(doc.querySelector('[data-atuacao="GOLDEN|REC1|1"]').closest('ul').hidden, false);
  assert.equal(doc.querySelector('[data-atuacao="GOLDEN|REC1|1"] .ar-colapso').getAttribute('aria-expanded'), 'false');
  assert.match(neto.querySelector('.ar-origem').title, /Definido pelo RH/);
  doc = parse(renderArvore(no, { profundidadeAberta: 9, pessoas: S.pessoasPorId }));
  assert.equal(doc.querySelectorAll('ul[hidden]').length, 0);
  doc = parse(renderArvore(no, { profundidadeAberta: 0, pessoas: S.pessoasPorId }));
  assert.equal(doc.querySelector('[data-atuacao="GOLDEN|REC1|1"]').closest('ul').hidden, true);
});

test('foraDaArvore: cada atuação sem superior vira subárvore, destacada, com quem está abaixo dela', () => {
  const S = estado();
  const soltas = foraDaArvore(S.atuacoes, 'GOLDEN');
  assert.deepEqual(soltas.map(n => n.atuacao.id), semSuperior(S.atuacoes, 'GOLDEN').map(a => a.id).sort());
  const sup = soltas.find(n => n.atuacao.id === 'GOLDEN|SUP|1');
  assert.deepEqual(sup.filhos.map(f => f.atuacao.id), ['GOLDEN|CAM|1']);
  const doc = parse(soltas.map(n => renderArvore(n, { pessoas: S.pessoasPorId, destacarSemSuperior: true })).join(''));
  assert.ok(doc.querySelector('[data-atuacao="GOLDEN|SUP|1"]').classList.contains('ar-sem-superior'));
  assert.ok(!doc.querySelector('[data-atuacao="GOLDEN|CAM|1"]').classList.contains('ar-sem-superior'));
  const tudo = new Set([...alcancaveis(S, 'GOLDEN'), ...[...doc.querySelectorAll('[data-atuacao]')].map(c => c.dataset.atuacao)]);
  assert.equal(tudo.size, correntes(S, 'GOLDEN').length, 'árvore + sem líder cobrem todas as atuações correntes');
  assert.ok(!parse(renderArvore(arvore(S.atuacoes, 'GOLDEN'), { destacarSemSuperior: true })).querySelector('[data-atuacao="GOLDEN|GG|1"]').classList.contains('ar-sem-superior'), 'raiz não é sem líder');
});

test('foraDaArvore: organização sem raiz devolve todas as atuações, todas sem superior', () => {
  const S = estado();
  assert.throws(() => arvore(S.atuacoes, 'BRANO'), e => e.codigo === 'sem_raiz');
  assert.equal(foraDaArvore(S.atuacoes, 'BRANO').length, correntes(S, 'BRANO').length);
});

test('resumoOrganizacao conta sem superior, inferidos e definidos a partir das atuações', () => {
  const S = estado();
  for (const org of ['GOLDEN', 'BRANO', 'LAGHETTO CORPORATIVO']) {
    const l = correntes(S, org); const r = resumoOrganizacao(S, org);
    assert.equal(r.total, l.length, org);
    assert.equal(r.semSuperior, semSuperior(S.atuacoes, org).length, org);
    assert.equal(r.comSuperior, l.filter(a => a.superiorId).length, org);
    assert.equal(r.raiz + r.comSuperior + r.semSuperior, r.total, org);
    const comLider = l.filter(a => a.superiorId);
    const precisam = l.filter(a => !a.ehRaiz).length;
    assert.equal(r.precisamDeLider, precisam, org);
    assert.equal(r.inferidos, comLider.filter(a => /^inferido_/.test(a.origem)).length, org);
    assert.equal(r.definidos, comLider.filter(a => a.origem === 'definido').length, org);
    assert.equal(r.comLiderOutraOrigem, comLider.length - r.inferidos - r.definidos, org);
    const soltas = l.filter(a => !a.superiorId && !a.ehRaiz);
    assert.equal(r.semLiderCarga, soltas.filter(a => a.origem !== 'definido').length, org);
    assert.equal(r.semLiderRH, soltas.filter(a => a.origem === 'definido').length, org);
    assert.equal(r.definidos + r.inferidos + r.comLiderOutraOrigem + r.semLiderCarga + r.semLiderRH, r.precisamDeLider, `${org}: as partes somam o denominador`);
    assert.equal(r.pessoas, new Set(l.map(a => a.pessoaRef)).size, org);
  }
  assert.ok(resumoOrganizacao(S, 'GOLDEN').inferidos > 0);
  assert.equal(resumoOrganizacao(S, 'GOLDEN').inferidos, correntes(S, 'GOLDEN').filter(a => a.superiorId && /^inferido_/.test(a.origem)).length, 'a raiz inferida pela empresa não conta: não tem líder');
  assert.equal(resumoOrganizacao(S, 'BRANO').raiz, 0);
});

test('pool sem organização: só quem a carga deixou sem organização e ainda não ganhou atuação', () => {
  const sem = estado({ extras: [] });
  assert.equal(poolSemOrganizacao(sem).length, sem.semOrganizacao.length);
  assert.equal(resumoOrganizacao(sem, 'GOLDEN').semOrganizacao, sem.semOrganizacao.length);
  const com = estado();
  const comAtuacao = new Set(com.atuacoes.map(a => a.pessoaRef));
  assert.equal(poolSemOrganizacao(com).length, com.semOrganizacao.filter(p => !comAtuacao.has(p.id)).length);
  assert.ok(poolSemOrganizacao(com).length < com.semOrganizacao.length, 'CEO e DR da fixture ganharam atuação corporativa');
});

test('pessoa com duas atuações sob dois líderes aparece em duas caixas com o mesmo data-pessoa', () => {
  const S = estado({ pil: pilotoDuplo() });
  assert.equal(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|GG|1', 'RH Teste').ok, true);   // SUP entra na árvore
  const doc = parse(renderArvore(arvore(S.atuacoes, 'GOLDEN'), { profundidadeAberta: 9, pessoas: S.pessoasPorId }));
  const cam = [...doc.querySelectorAll('[data-atuacao]')].filter(el => el.dataset.pessoa === 'CAM');
  assert.equal(cam.length, atuacoesDe(S.atuacoes, 'CAM').length);
  assert.equal(cam.length, 2);
  assert.notEqual(cam[0].dataset.atuacao, cam[1].dataset.atuacao);
});

test('ligacoesCorporativas: Golden ligado pelo gerente geral, Brano sem raiz; sem estrutura corporativa nada liga', () => {
  const S = estado();
  assert.deepEqual(ligacoesCorporativas(S), { ligadas: ['GOLDEN'], semLigacao: ['BRANO'], motivos: { BRANO: 'sem_raiz' } });
  const l = ligacaoDaUnidade(S, 'GOLDEN');
  assert.equal(l.raiz.id, 'GOLDEN|GG|1');
  assert.deepEqual(l.superiores.map(a => a.id), ['LAGHETTO CORPORATIVO|DR|1']);
  assert.deepEqual(unidadesSob(S, 'LAGHETTO CORPORATIVO|GG|1'), ['GOLDEN']);
  assert.deepEqual(unidadesSob(S, 'LAGHETTO CORPORATIVO|DR|1'), []);
  assert.deepEqual(unidadesSob(S, 'GOLDEN|GG|1'), [], 'só atuação corporativa carrega cartão de unidade');
  const sem = estado({ extras: [] });
  assert.deepEqual(ligacoesCorporativas(sem).motivos, { BRANO: 'sem_raiz', GOLDEN: 'sem_atuacao_corporativa' });
});

test('renderArvore escapa nome e função e aceita nome e extra pela opção', () => {
  const no = { atuacao: { id: 'X|<a>|1', pessoaRef: '<a>', funcao: '<b>f</b>', ehRaiz: true, superiorId: null, origem: 'definido' }, filhos: [] };
  const html = renderArvore(no, { nome: () => '<script>x</script>', extra: () => '<div class="ar-unidade" data-unidade="U"></div>' });
  assert.ok(!/<script>/.test(html)); assert.ok(!/<b>f/.test(html));
  const doc = parse(html);
  assert.equal(doc.querySelector('.ar-caixa').dataset.atuacao, 'X|<a>|1');
  assert.ok(doc.querySelector('.ar-caixa [data-unidade="U"]'));
  assert.equal(renderArvore(null), '');
});

const temDadosReais = fs.existsSync('out/base.json') && fs.existsSync('app/data/base.json') && fs.existsSync('app/data/piloto-golden.json');
test('base real: renderArvore do Golden monta em menos de 500 ms', { skip: !temDadosReais }, async () => {
  const { organizacoesDe, FUSOES } = await import('../app/js/modelo/organizacao.js');
  const { atuacoesIniciais, ORGANIZACAO_PILOTO } = await import('../app/js/modelo/bootstrap.js');
  const baseReal = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const pil = JSON.parse(fs.readFileSync('app/data/piloto-golden.json', 'utf8'));
  const organizacoes = organizacoesDe(baseReal, FUSOES);
  const { atuacoes, semOrganizacao } = atuacoesIniciais(baseReal, organizacoes, pil, { organizacaoPiloto: ORGANIZACAO_PILOTO });
  const S = { base: baseReal, organizacoes, atuacoes, semOrganizacao, pessoasPorId: new Map(baseReal.pessoas.map(p => [p.id, p])) };
  const t0 = performance.now();
  const no = arvore(atuacoes, ORGANIZACAO_PILOTO);
  const html = renderArvore(no, { profundidadeAberta: 9, pessoas: S.pessoasPorId, destacarSemSuperior: true })
    + foraDaArvore(atuacoes, ORGANIZACAO_PILOTO).map(n => renderArvore(n, { profundidadeAberta: 9, pessoas: S.pessoasPorId, destacarSemSuperior: true })).join('');
  const r = resumoOrganizacao(S, ORGANIZACAO_PILOTO);
  const ms = performance.now() - t0;
  const caixas = (html.match(/class="ar-caixa/g) || []).length;
  console.log(`# Golden real: ${caixas} caixas, ${r.total} atuações, ${ms.toFixed(1)} ms`);
  assert.equal(caixas, r.total, 'árvore + sem líder cobrem todas as atuações correntes do Golden');
  assert.ok(ms < 500, `${ms} ms`);
});
