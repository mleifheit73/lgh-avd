import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { reconstruirViews, definirSuperior, criarAtuacaoNaOrganizacao } from '../app/js/adaptador.js';
import {
  CODIGOS_CARGA, CODIGOS_HIERARQUIA, DESCRICOES, TRAVAM_CICLO, filaDePendencias, contagemPorCodigo, resumoFila,
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
  assert.equal(CODIGOS_HIERARQUIA.length, 9);
  for (const c of [...CODIGOS_CARGA, ...CODIGOS_HIERARQUIA]) {
    assert.ok(DESCRICOES[c]?.descricao && DESCRICOES[c]?.acaoSugerida, `falta texto para ${c}`);
    assert.doesNotMatch(DESCRICOES[c].descricao + DESCRICOES[c].acaoSugerida, /[—–]/, 'sem travessão');
  }
  assert.deepEqual(Object.keys(DESCRICOES).sort(), [...CODIGOS_CARGA, ...CODIGOS_HIERARQUIA].sort());
});

test('os códigos que travam o ciclo são todos de hierarquia', () => {
  assert.ok(TRAVAM_CICLO.length > 0 && TRAVAM_CICLO.every(c => CODIGOS_HIERARQUIA.includes(c)));
  assert.ok(!TRAVAM_CICLO.includes('vinculo_inferido_nao_confirmado'), 'inferido não confirmado pede conferência, não trava');
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

/* ================= tela ================= */

const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN', atuacoesExtras: corporativo() };
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})";
const AVALIADOR = "entrar({nome:'Supervisor de Governança Teste', cargo:'Supervisor', papel:'avaliador', nivel:'N1'})";
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
async function abrir(login = RH, tela = 'pendencias', opcoes = OPCOES) {
  const r = await carregarPagina(base(), piloto(), null, opcoes);
  r.window.eval(login); r.window.irPara(tela);
  return r;
}
const linhas = document => [...document.querySelectorAll('#pe-tabela tbody tr')];
const chip = (document, codigo) => document.querySelector(`#pe-chips .pe-chip[data-codigo="${codigo}"]`);

test('tela: aba Pendências logo depois da Árvore, só para o RH', async () => {
  const { window, document } = await abrir(RH, 'arvore');
  const abas = [...document.querySelectorAll('#nav button')].map(b => b.dataset.tela);
  assert.equal(abas[abas.indexOf('arvore') + 1], 'pendencias');
  const av = await abrir(AVALIADOR, 'avaliador');
  assert.ok(![...av.document.querySelectorAll('#nav button')].some(b => b.dataset.tela === 'pendencias'), 'avaliador não vê a aba');
  av.window.irPara('pendencias');
  assert.equal(av.S.tela, 'avaliador', 'sem permissão volta ao painel do avaliador');
});

test('tela: contadores do topo e linhas vêm da fila do módulo', async () => {
  const { document, S, erros } = await abrir();
  const fila = filaDePendencias(S, 'GOLDEN');
  const c = contagemPorCodigo(fila);
  assert.equal(document.querySelector('#t-pendencias').hidden, false);
  for (const [cod, n] of Object.entries(c)) assert.equal(chip(document, cod).querySelector('b').textContent, String(n), cod);
  assert.equal(chip(document, '').querySelector('b').textContent, String(fila.length));
  assert.equal(linhas(document).length, fila.length);
  assert.ok(chip(document, 'sem_superior').classList.contains('trava'), 'sem_superior trava o ciclo');
  assert.ok(!chip(document, 'sem_cpf').classList.contains('trava'));
  assert.deepEqual(erros.map(String), []);
});

test('tela: clicar no contador de um código filtra a tabela por ele', async () => {
  const { document, S } = await abrir();
  const n = contagemPorCodigo(filaDePendencias(S, 'GOLDEN')).sem_superior;
  chip(document, 'sem_superior').click();
  assert.equal(chip(document, 'sem_superior').getAttribute('aria-pressed'), 'true');
  assert.equal(linhas(document).length, n);
  assert.ok(linhas(document).every(l => l.dataset.codigo === 'sem_superior'));
  assert.match(document.querySelector('#pe-resumo').textContent, new RegExp(`^${n} pendências do tipo sem líder`));
  chip(document, 'sem_cpf').click();
  assert.deepEqual(linhas(document).map(l => l.dataset.codigo), ['sem_cpf']);
  chip(document, '').click();
  assert.equal(linhas(document).length, filaDePendencias(S, 'GOLDEN').length);
});

test('tela: descrição e ação sugerida aparecem em cada linha', async () => {
  const { document } = await abrir();
  chip(document, 'sem_superior').click();
  const l = linhas(document)[0];
  assert.ok(l.textContent.includes(DESCRICOES.sem_superior.descricao));
  assert.ok(l.textContent.includes(DESCRICOES.sem_superior.acaoSugerida));
  assert.ok(l.querySelector('.tag').title.includes(DESCRICOES.sem_superior.descricao), 'descrição também no hover');
});

test('tela: filtro por organização limitado às visíveis; Rede só para quem pode ver a rede', async () => {
  const rh = await abrir(RH);
  const valores = [...rh.document.querySelectorAll('#pe-org option')].map(o => o.value);
  assert.ok(!valores.includes('__rede__'), 'RH de unidade não vê a opção Rede');
  assert.ok(!valores.includes(CORP), 'nem a estrutura corporativa');
  const adm = await abrir(ADMIN);
  const v2 = [...adm.document.querySelectorAll('#pe-org option')].map(o => o.value);
  assert.equal(v2[0], '__rede__');
  assert.ok(v2.includes('GOLDEN') && v2.includes('BRANO') && v2.includes(CORP));
  const sel = adm.document.querySelector('#pe-org');
  sel.value = '__rede__'; sel.dispatchEvent(new adm.window.Event('change'));
  const rede = filaDePendencias(adm.S, null);
  assert.equal(linhas(adm.document).length, rede.length);
  sel.value = 'BRANO'; sel.dispatchEvent(new adm.window.Event('change'));
  assert.equal(linhas(adm.document).length, filaDePendencias(adm.S, 'BRANO').length);
  assert.ok(chip(adm.document, 'organizacao_sem_raiz'));
});

test('tela: sem organização aparece na Rede com a organização "Sem organização"', async () => {
  const { window, document, S } = await abrir(ADMIN, 'pendencias', { ...OPCOES, atuacoesExtras: [] });
  const sel = document.querySelector('#pe-org');
  sel.value = '__rede__'; sel.dispatchEvent(new window.Event('change'));
  chip(document, 'sem_organizacao').click();
  const ls = linhas(document);
  assert.deepEqual(ls.length, filaDePendencias(S, null).filter(i => i.codigo === 'sem_organizacao').length);
  assert.ok(ls.every(l => l.cells[1].textContent === 'Sem organização'));
  assert.ok(ls[0].querySelector('[data-abrir-arvore]').textContent.includes('Rede'));
});

test('tela: "Abrir na árvore" seleciona a organização, abre a Árvore e seleciona a atuação', async () => {
  const { window, document, S, erros } = await abrir(ADMIN);
  const sel = document.querySelector('#pe-org');
  sel.value = 'BRANO'; sel.dispatchEvent(new window.Event('change'));
  assert.equal(S.organizacaoSelecionada, 'GOLDEN', 'filtrar a fila não troca a organização do topo');
  sel.value = 'GOLDEN'; sel.dispatchEvent(new window.Event('change'));
  chip(document, 'sem_superior').click();
  const alvo = filaDePendencias(S, 'GOLDEN').filter(i => i.codigo === 'sem_superior').find(i => i.pessoaId === 'COZ1');
  const linha = linhas(document).find(l => l.textContent.includes(alvo.nome));
  let recebido = null;
  document.addEventListener('lgh-arvore-selecionada', e => { recebido = e.detail.atuacaoId; });
  S.organizacaoSelecionada = 'BRANO';   // ponto de partida diferente para provar que a organização é trocada
  linha.querySelector('[data-abrir-arvore]').click();
  assert.equal(S.tela, 'arvore');
  assert.equal(S.organizacaoSelecionada, 'GOLDEN');
  assert.equal(S.arSelecionada, alvo.atuacaoId);
  assert.equal(recebido, alvo.atuacaoId, 'o evento do painel de montagem foi disparado');
  const c = [...document.querySelectorAll('#t-arvore .ar-caixa')].find(x => x.dataset.atuacao === alvo.atuacaoId);
  assert.ok(c && c.classList.contains('ar-ativa'));
  assert.equal(document.querySelector('#t-pendencias').hidden, true);
  assert.deepEqual(erros.map(String), []);
});

test('tela: item de carga não tem "Abrir na árvore"; "Mostrar mais" respeita o limite de linhas', async () => {
  const { document } = await abrir();
  chip(document, 'sem_cpf').click();
  assert.equal(linhas(document)[0].querySelector('[data-abrir-arvore]'), null);
  assert.equal(document.querySelector('#pe-mais'), null, 'poucas linhas: sem botão');
});

test('Árvore: contador de pendências bate com resumoFila e leva à tela', async () => {
  const { window, document, S } = await abrir(RH, 'arvore');
  const r = resumoFila(S, 'GOLDEN');
  const el = document.querySelector('#ar-pendencias');
  assert.equal(el.dataset.total, String(r.total));
  assert.equal(el.dataset.hierarquia, String(r.hierarquia));
  assert.equal(el.dataset.carga, String(r.carga));
  assert.ok(el.textContent.includes(`${r.total} pendências nesta organização (${r.hierarquia} de hierarquia, ${r.carga} da carga)`), el.textContent);
  el.querySelector('#ar-ver-pendencias').click();
  assert.equal(S.tela, 'pendencias');
  assert.equal(S.pendFiltro.org, 'GOLDEN');
  assert.equal(linhas(document).length, r.total);
});

test('Árvore: o contador acompanha uma escrita do painel de montagem', async () => {
  const { window, document, S } = await abrir(RH, 'arvore');
  const antes = resumoFila(S, 'GOLDEN');
  const sup = S.atuacoes.find(a => a.pessoaRef === 'SUP' && a.organizacaoId === 'GOLDEN');
  const gg = S.atuacoes.find(a => a.pessoaRef === 'GG' && a.organizacaoId === 'GOLDEN');
  assert.ok(window.eval(`definirSuperior(S, ${JSON.stringify(sup.id)}, ${JSON.stringify(gg.id)}, 'RH TESTE')`).ok);
  window.LGH_ARVORE.render();
  const depois = resumoFila(S, 'GOLDEN');
  assert.equal(depois.hierarquia, antes.hierarquia - 1, 'sem_superior sai; o vínculo definido pelo RH não vira inferido');
  assert.equal(document.querySelector('#ar-pendencias').dataset.total, String(depois.total));
  assert.equal(depois.total, antes.total - 1);
});
