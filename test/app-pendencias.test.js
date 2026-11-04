import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { reconstruirViews, definirSuperior, criarAtuacaoNaOrganizacao } from '../app/js/adaptador.js';
import {
  CODIGOS_CARGA, CODIGOS_HIERARQUIA, DESCRICOES, filaDePendencias, contagemPorCodigo, resumoFila,
} from '../app/js/modelo/pendencias.js';
import { resumoOrganizacao } from '../app/js/arvore-ui.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const CORP = 'LAGHETTO CORPORATIVO';
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const corporativo = () => lerFixture('atuacoes-corporativo-mini.json');
function estado(extras = corporativo()) {
  const e = montarEstado(base(), piloto(), extras, FUSAO_MINI);
  const S = { ...e, pessoas: e.base.pessoas, piloto: piloto(), perfil: null, organizacaoSelecionada: 'GOLDEN' };
  reconstruirViews(S);
  return S;
}
const idDe = (S, pessoa, org = 'GOLDEN') => S.atuacoes.find(a => a.pessoaRef === pessoa && a.organizacaoId === org && a.situacao === 'ativa' && a.fim == null).id;
const por = (S, id) => S.atuacoes.find(a => a.id === id);

/* ================= módulo puro ================= */

test('todo código tem descrição e ação sugerida, e os dois grupos cobrem todos', () => {
  assert.equal(CODIGOS_CARGA.length, 10);
  assert.equal(CODIGOS_HIERARQUIA.length, 7);
  for (const c of [...CODIGOS_CARGA, ...CODIGOS_HIERARQUIA]) {
    assert.ok(DESCRICOES[c]?.descricao && DESCRICOES[c]?.acaoSugerida, `falta texto para ${c}`);
    assert.doesNotMatch(DESCRICOES[c].descricao + DESCRICOES[c].acaoSugerida, /[—–]/, 'sem travessão');
  }
  assert.deepEqual(Object.keys(DESCRICOES).sort(), [...CODIGOS_CARGA, ...CODIGOS_HIERARQUIA].sort());
});

test('fila do Golden junta a carga das pessoas dele com a hierarquia dele', () => {
  const S = estado();
  const fila = filaDePendencias(S, 'GOLDEN');
  const c = contagemPorCodigo(fila);
  // carga: sem_cpf (PJ-SEM-ORG atua no Golden) e inicio_futuro (DR não atua no Golden, só no corporativo); possivel_duplicado é de BR2 (BRANO)
  assert.equal(c.sem_cpf, 1);
  assert.equal(c.inicio_futuro, undefined);
  assert.equal(c.possivel_duplicado, undefined);
  assert.equal(c.sem_superior, 5, 'SUP, ANA, DUPLO-VINCULO, COZ1 e GAR1');
  assert.equal(c.vinculo_inferido_nao_confirmado, 4, 'CAM, REC1, BR1 e PJ-SEM-ORG, vínculos inferidos');
  assert.equal(c.organizacao_sem_raiz, undefined);
  assert.equal(c.raiz_sem_ligacao_corporativa, undefined, 'a raiz do Golden tem atuação no corporativo');
  assert.equal(c.sem_organizacao, undefined, 'sem organização só na visão da rede');
  assert.ok(fila.every(i => i.descricao && i.acaoSugerida && i.nome && (i.origem === 'carga' || i.origem === 'hierarquia')));
  assert.ok(fila.every(i => i.organizacaoId === 'GOLDEN'));
  const iUltimaHier = fila.map(i => i.origem).lastIndexOf('hierarquia'), iPrimeiraCarga = fila.findIndex(i => i.origem === 'carga');
  assert.ok(iUltimaHier < iPrimeiraCarga, 'hierarquia antes da carga');
  assert.equal(fila[0].codigo, 'sem_superior', 'sem_superior abre a fila');
  const nomes = fila.filter(i => i.codigo === 'sem_superior').map(i => i.nome);
  assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')), 'estável por nome');
  assert.deepEqual(fila, filaDePendencias(S, 'GOLDEN'), 'chamar de novo dá a mesma fila');
});

test('sem_superior da fila bate com o medidor da Árvore (fonte única)', () => {
  const S = estado();
  assert.equal(contagemPorCodigo(filaDePendencias(S, 'GOLDEN')).sem_superior, resumoOrganizacao(S, 'GOLDEN').semSuperior);
  const sup = filaDePendencias(S, 'GOLDEN').find(i => i.codigo === 'sem_superior' && i.pessoaId === 'SUP');
  assert.equal(sup.atuacaoId, idDe(S, 'SUP'));
});

test('pessoa sem organização aparece com organizacaoId null e só na visão da rede', () => {
  const S = estado([]);   // sem estrutura corporativa: CEO-REDE e DR ficam sem organização
  const rede = filaDePendencias(S, null);
  const sem = rede.filter(i => i.codigo === 'sem_organizacao');
  assert.deepEqual(sem.map(i => i.pessoaId).sort(), ['CEO-REDE', 'DR']);
  assert.ok(sem.every(i => i.organizacaoId === null && i.origem === 'hierarquia'));
  for (const org of ['GOLDEN', 'BRANO', CORP]) {
    assert.equal(filaDePendencias(S, org).filter(i => i.codigo === 'sem_organizacao').length, 0, org);
  }
  const inicioFuturo = rede.find(i => i.codigo === 'inicio_futuro');
  assert.equal(inicioFuturo.pessoaId, 'DR');
  assert.equal(inicioFuturo.organizacaoId, null, 'DR sem atuação: sem organização');
});

test('visão da rede traz tudo: organização sem raiz, raiz sem ligação e a carga de todas as organizações', () => {
  const S = estado(corporativo().filter(a => a.pessoaRef !== 'GG'));
  const c = contagemPorCodigo(filaDePendencias(S, null));
  assert.equal(c.organizacao_sem_raiz, 1, 'BRANO não tem raiz');
  assert.equal(c.raiz_sem_ligacao_corporativa, 1, 'GG não tem atuação no corporativo');
  assert.equal(c.possivel_duplicado, 1);
  assert.equal(c.inicio_futuro, 1);
  assert.equal(c.sem_cpf, 1);
  const brano = filaDePendencias(S, 'BRANO');
  assert.equal(brano.find(i => i.codigo === 'organizacao_sem_raiz').organizacaoId, 'BRANO');
  assert.ok(brano.some(i => i.codigo === 'possivel_duplicado' && i.pessoaId === 'BR2'));
  const total = filaDePendencias(S, null).length;
  assert.equal(resumoFila(S, null).total, total);
});

test('raiz_sem_ligacao_corporativa só vale para unidade, não para a corporativa', () => {
  const S = estado();
  assert.equal(contagemPorCodigo(filaDePendencias(S, CORP)).raiz_sem_ligacao_corporativa, undefined);
  const S2 = estado(corporativo().filter(a => a.pessoaRef !== 'GG'));
  const it = filaDePendencias(S2, 'GOLDEN').find(i => i.codigo === 'raiz_sem_ligacao_corporativa');
  assert.equal(it.pessoaId, 'GG');
  assert.equal(it.atuacaoId, idDe(S2, 'GG'));
});

test('avaliacao_mutua detectada em estado que não passou pelo adaptador (importado ou editado à mão)', () => {
  const S = estado();
  const sup = por(S, idDe(S, 'SUP')), coz = por(S, idDe(S, 'COZ1'));
  sup.podeLiderar = coz.podeLiderar = true;
  coz.superiorId = sup.id;
  S.atuacoes.push({ ...sup, id: 'GOLDEN|SUP|2', superiorId: coz.id });   // segunda atuação de SUP debaixo de COZ1
  const itens = filaDePendencias(S, 'GOLDEN');
  const mut = itens.filter(i => i.codigo === 'avaliacao_mutua');
  assert.equal(mut.length, 1, 'um item por par');
  assert.ok(/ e /.test(mut[0].detalhe) && mut[0].pessoaId && mut[0].atuacaoId);
  assert.equal(contagemPorCodigo(itens).vinculo_invalido ?? 0, 0, 'não há ciclo entre atuações: só entre pessoas');
});

test('avaliacao_mutua indireta: A acima de B por um intermediário e B acima de A', () => {
  const S = estado();
  const a = por(S, idDe(S, 'SUP')), b = por(S, idDe(S, 'COZ1')), c = por(S, idDe(S, 'GAR1'));
  [a, b, c].forEach(x => { x.podeLiderar = true; });
  b.superiorId = a.id;                                   // A > B
  c.superiorId = b.id;                                   // B > C
  S.atuacoes.push({ ...a, id: 'GOLDEN|SUP|2', superiorId: c.id });   // C > A (outra atuação de A)
  const pares = filaDePendencias(S, 'GOLDEN').filter(i => i.codigo === 'avaliacao_mutua');
  assert.equal(pares.length, 3, 'três pessoas num ciclo: três pares');
});

test('vinculo_invalido: superior encerrado, inexistente ou de outra organização', () => {
  const S = estado();
  const cam = por(S, idDe(S, 'CAM'));
  cam.superiorId = 'NAO|EXISTE|1';
  const bran = idDe(S, 'BR2', 'BRANO');
  por(S, idDe(S, 'COZ1')).superiorId = bran;             // superior em outra organização
  const sup = por(S, idDe(S, 'SUP')); sup.podeLiderar = true;
  const gar = por(S, idDe(S, 'GAR1')); gar.superiorId = sup.id;
  sup.situacao = 'encerrada'; sup.fim = '2026-10-01';    // superior encerrado conta como inexistente
  const inv = filaDePendencias(S, 'GOLDEN').filter(i => i.codigo === 'vinculo_invalido');
  assert.deepEqual(inv.map(i => i.pessoaId).sort(), ['CAM', 'COZ1', 'GAR1']);
  assert.deepEqual(Object.fromEntries(inv.map(i => [i.pessoaId, i.detalhe])),
    { CAM: 'superior_inexistente', COZ1: 'superior_fora_da_organizacao', GAR1: 'superior_inexistente' });
  assert.equal(contagemPorCodigo(filaDePendencias(S, 'GOLDEN')).sem_superior, 2, 'SUP encerrado sai; COZ1 e GAR1 têm superior (inválido); ficam ANA e DUPLO-VINCULO');
});

test('vinculo_invalido: ciclo de atuações e raiz com superior', () => {
  const S = estado();
  const sup = por(S, idDe(S, 'SUP')), coz = por(S, idDe(S, 'COZ1'));
  sup.superiorId = coz.id; coz.superiorId = sup.id;
  const gg = por(S, idDe(S, 'GG')); gg.superiorId = sup.id;
  const inv = filaDePendencias(S, 'GOLDEN').filter(i => i.codigo === 'vinculo_invalido');
  const ps = inv.map(i => i.pessoaId);
  for (const p of ['COZ1', 'GG', 'SUP', 'CAM']) assert.ok(ps.includes(p), `${p} presa no ciclo ou apontando para ele`);
  assert.equal(inv.find(i => i.pessoaId === 'GG').detalhe, 'raiz_com_superior');
  assert.equal(inv.find(i => i.pessoaId === 'COZ1').detalhe, 'ciclo');
  assert.ok(inv.filter(i => i.detalhe === 'ciclo').length >= 2);
});

test('contagemPorCodigo e resumoFila', () => {
  const S = estado();
  const fila = filaDePendencias(S, 'GOLDEN');
  const r = resumoFila(S, 'GOLDEN');
  assert.equal(r.total, fila.length);
  assert.equal(r.hierarquia + r.carga, r.total);
  assert.equal(r.carga, fila.filter(i => i.origem === 'carga').length);
  assert.deepEqual(contagemPorCodigo([]), {});
  assert.equal(Object.values(contagemPorCodigo(fila)).reduce((x, y) => x + y, 0), fila.length);
});

test('a fila não altera o estado', () => {
  const S = estado();
  const antes = JSON.stringify([S.atuacoes, S.semOrganizacao, S.base.pendencias]);
  filaDePendencias(S, 'GOLDEN'); filaDePendencias(S, null); resumoFila(S, 'GOLDEN');
  assert.equal(JSON.stringify([S.atuacoes, S.semOrganizacao, S.base.pendencias]), antes);
});

const temDadosReais = fs.existsSync('out/base.json') && fs.existsSync('app/data/base.json') && fs.existsSync('app/data/piloto-golden.json');
test('dados reais: contagem por código na rede e no Golden', { skip: !temDadosReais }, async () => {
  const { organizacoesDe, FUSOES } = await import('../app/js/modelo/organizacao.js');
  const { atuacoesIniciais, ORGANIZACAO_PILOTO } = await import('../app/js/modelo/bootstrap.js');
  const real = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const pil = JSON.parse(fs.readFileSync('app/data/piloto-golden.json', 'utf8'));
  const organizacoes = organizacoesDe(real, FUSOES);
  const { atuacoes, semOrganizacao } = atuacoesIniciais(real, organizacoes, pil, { organizacaoPiloto: ORGANIZACAO_PILOTO });
  const S = { base: real, organizacoes, atuacoes, semOrganizacao, pessoasPorId: new Map(real.pessoas.map(p => [p.id, p])) };
  const rede = filaDePendencias(S, null);
  const golden = filaDePendencias(S, ORGANIZACAO_PILOTO);
  console.log('# REDE', JSON.stringify(contagemPorCodigo(rede)), 'total', rede.length);
  console.log('# GOLDEN', JSON.stringify(contagemPorCodigo(golden)), 'total', golden.length);
  assert.ok(rede.length >= golden.length);
  assert.ok(rede.every(i => DESCRICOES[i.codigo] && i.nome));
  assert.equal(contagemPorCodigo(golden).sem_superior ?? 0, resumoOrganizacao(S, ORGANIZACAO_PILOTO).semSuperior);
  assert.equal(rede.filter(i => i.origem === 'carga').length, real.pendencias.filter(p => DESCRICOES[p.codigo]).length,
    'toda pendência da carga aparece na rede, uma vez');
  assert.equal(contagemPorCodigo(rede).sem_organizacao ?? 0, resumoOrganizacao(S, ORGANIZACAO_PILOTO).semOrganizacao);
});
