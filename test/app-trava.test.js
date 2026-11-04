import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { reconstruirViews, definirSuperior } from '../app/js/adaptador.js';
import { podeAbrirCiclo } from '../app/js/modelo/montagem.js';
import { filaDePendencias, TRAVAM_CICLO, contagemPorCodigo } from '../app/js/modelo/pendencias.js';
import { validarArvore } from '../app/js/modelo/atuacao.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const CORP = 'LAGHETTO CORPORATIVO';
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const corporativo = () => lerFixture('atuacoes-corporativo-mini.json');
const corpSemGG = () => corporativo().filter(a => a.pessoaRef !== 'GG');
function estado(extras = corporativo()) {
  const e = montarEstado(base(), piloto(), extras, FUSAO_MINI);
  const S = { ...e, pessoas: e.base.pessoas, piloto: piloto(), perfil: null, organizacaoSelecionada: 'GOLDEN' };
  reconstruirViews(S);
  return S;
}
const por = (S, id) => S.atuacoes.find(a => a.id === id);
const idDe = (S, pessoa, org = 'GOLDEN') => S.atuacoes.find(a => a.pessoaRef === pessoa && a.organizacaoId === org && a.situacao === 'ativa' && a.fim == null).id;
/** Completa o Golden pelo adaptador: todo mundo sem líder passa para a equipe do gerente geral. */
function completarGolden(S) {
  const gg = idDe(S, 'GG');
  for (const i of filaDePendencias(S, 'GOLDEN').filter(x => x.codigo === 'sem_superior')) {
    const r = definirSuperior(S, i.atuacaoId, gg, 'RH TESTE');
    assert.ok(r.ok, `definirSuperior ${i.atuacaoId}: ${r.codigo}`);
  }
  return S;
}

/* ================= módulo ================= */

test('podeAbrirCiclo nega com pessoas sem líder e nomeia a quantidade', () => {
  const S = estado();
  const n = contagemPorCodigo(filaDePendencias(S, 'GOLDEN')).sem_superior;
  assert.equal(n, 5);
  assert.deepEqual(podeAbrirCiclo(S, 'GOLDEN'), { pode: false, motivo: '5 pessoas sem líder definido', codigo: 'sem_superior' });
  definirSuperior(S, idDe(S, 'SUP'), idDe(S, 'GG'), 'RH TESTE');
  definirSuperior(S, idDe(S, 'ANA'), idDe(S, 'GG'), 'RH TESTE');
  definirSuperior(S, idDe(S, 'DUPLO-VINCULO'), idDe(S, 'GG'), 'RH TESTE');
  definirSuperior(S, idDe(S, 'COZ1'), idDe(S, 'GG'), 'RH TESTE');
  assert.deepEqual(podeAbrirCiclo(S, 'GOLDEN'), { pode: false, motivo: '1 pessoa sem líder definido', codigo: 'sem_superior' }, 'singular');
});

test('podeAbrirCiclo nega organização sem raiz', () => {
  const S = estado();
  assert.deepEqual(podeAbrirCiclo(S, 'BRANO'), { pode: false, motivo: 'organização sem raiz definida', codigo: 'organizacao_sem_raiz' });
});

test('podeAbrirCiclo nega unidade cuja raiz não tem atuação corporativa, antes de olhar quem está sem líder', () => {
  const S = estado(corpSemGG());
  const r = podeAbrirCiclo(S, 'GOLDEN');
  assert.deepEqual(r, { pode: false, motivo: 'raiz sem ligação à estrutura corporativa', codigo: 'raiz_sem_ligacao_corporativa' });
  assert.ok(contagemPorCodigo(filaDePendencias(S, 'GOLDEN')).sem_superior > 0, 'ainda há gente sem líder: a ordem é a do contrato');
  completarGolden(S);
  assert.equal(podeAbrirCiclo(S, 'GOLDEN').codigo, 'raiz_sem_ligacao_corporativa', 'completar a equipe não resolve a ligação');
});

test('podeAbrirCiclo permite quando todos têm líder, a raiz está ligada e a árvore valida', () => {
  const S = completarGolden(estado());
  assert.deepEqual(podeAbrirCiclo(S, 'GOLDEN'), { pode: true, motivo: null, codigo: null });
  validarArvore(S.atuacoes, 'GOLDEN');
  const c = contagemPorCodigo(filaDePendencias(S, 'GOLDEN'));
  assert.ok(c.vinculo_inferido_nao_confirmado > 0, 'vínculo inferido pendente de confirmação não trava');
  assert.ok(c.sem_cpf > 0, 'pendência de carga não trava');
});

test('podeAbrirCiclo: a estrutura corporativa não exige ligação (só tipo unidade)', () => {
  const S = estado();
  assert.deepEqual(podeAbrirCiclo(S, CORP), { pode: true, motivo: null, codigo: null });
});

test('podeAbrirCiclo nega avaliação mútua e diz entre quem', () => {
  const S = completarGolden(estado());
  const sup = por(S, idDe(S, 'SUP')), coz = por(S, idDe(S, 'COZ1'));
  sup.podeLiderar = coz.podeLiderar = true;
  coz.superiorId = sup.id;
  S.atuacoes.push({ ...sup, id: 'GOLDEN|SUP|2', superiorId: coz.id });
  const r = podeAbrirCiclo(S, 'GOLDEN');
  assert.equal(r.pode, false);
  assert.equal(r.codigo, 'avaliacao_mutua');
  assert.match(r.motivo, /^avaliação mútua entre .+ e .+$/);
  assert.match(r.motivo, /Supervisor de Governan[cç]a Teste/i);
  assert.match(r.motivo, /Cozinheiro Um Teste/i);
});

test('podeAbrirCiclo repassa erro de validarArvore como árvore inválida', () => {
  const S = completarGolden(estado());
  por(S, idDe(S, 'CAM')).superiorId = 'NAO|EXISTE|1';
  assert.deepEqual(podeAbrirCiclo(S, 'GOLDEN'), { pode: false, motivo: 'árvore inválida: superior_inexistente', codigo: 'vinculo_invalido' });
  const S2 = completarGolden(estado());
  por(S2, idDe(S2, 'GG')).superiorId = idDe(S2, 'BR2', 'BRANO');
  assert.equal(podeAbrirCiclo(S2, 'GOLDEN').motivo, 'árvore inválida: raiz_com_superior');
});

test('podeAbrirCiclo nega organização que não existe', () => {
  const r = podeAbrirCiclo(estado(), 'NAO EXISTE');
  assert.equal(r.pode, false); assert.ok(r.motivo); assert.ok(r.codigo);
});

test('fonte única: podeAbrirCiclo nega exatamente quando a fila tem pendência que trava', () => {
  const cenarios = [estado(), estado(corpSemGG()), completarGolden(estado()), estado([])];
  for (const S of cenarios) {
    for (const o of S.organizacoes) {
      const trava = filaDePendencias(S, o.id).filter(i => TRAVAM_CICLO.includes(i.codigo));
      const r = podeAbrirCiclo(S, o.id);
      assert.equal(r.pode, trava.length === 0, o.id);
      if (!r.pode) assert.ok(trava.some(i => i.codigo === r.codigo), `${o.id}: ${r.codigo}`);
    }
  }
});

test('podeAbrirCiclo não altera o estado', () => {
  const S = estado();
  const antes = JSON.stringify(S.atuacoes);
  podeAbrirCiclo(S, 'GOLDEN'); podeAbrirCiclo(S, 'BRANO');
  assert.equal(JSON.stringify(S.atuacoes), antes);
});

const temDadosReais = fs.existsSync('out/base.json') && fs.existsSync('app/data/base.json') && fs.existsSync('app/data/piloto-golden.json');
test('dados reais: o Golden de hoje não abre ciclo', { skip: !temDadosReais }, async () => {
  const { organizacoesDe, FUSOES } = await import('../app/js/modelo/organizacao.js');
  const { atuacoesIniciais, ORGANIZACAO_PILOTO } = await import('../app/js/modelo/bootstrap.js');
  const real = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const pil = JSON.parse(fs.readFileSync('app/data/piloto-golden.json', 'utf8'));
  const organizacoes = organizacoesDe(real, FUSOES);
  const { atuacoes, semOrganizacao } = atuacoesIniciais(real, organizacoes, pil, { organizacaoPiloto: ORGANIZACAO_PILOTO });
  const S = { base: real, organizacoes, atuacoes, semOrganizacao, pessoasPorId: new Map(real.pessoas.map(p => [p.id, p])) };
  const c = contagemPorCodigo(filaDePendencias(S, ORGANIZACAO_PILOTO));
  const r = podeAbrirCiclo(S, ORGANIZACAO_PILOTO);
  console.log('# Golden real:', JSON.stringify(r), 'sem_superior', c.sem_superior, 'raiz_sem_ligacao', c.raiz_sem_ligacao_corporativa);
  assert.equal(r.pode, false);
  assert.ok(c.sem_superior >= 1, 'o Golden real tem gente sem líder');
  // ordem do contrato: sem raiz, raiz sem ligação, sem líder. Sem estrutura corporativa carregada, a ligação vem primeiro.
  assert.equal(r.codigo, c.organizacao_sem_raiz ? 'organizacao_sem_raiz' : c.raiz_sem_ligacao_corporativa ? 'raiz_sem_ligacao_corporativa' : 'sem_superior');
  assert.equal(r.codigo, 'raiz_sem_ligacao_corporativa');
  assert.equal(r.motivo, 'raiz sem ligação à estrutura corporativa');
});

/* ================= tela ================= */

const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN', atuacoesExtras: corporativo() };
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})";
async function abrir(login = ADMIN, opcoes = OPCOES) {
  const r = await carregarPagina(base(), piloto(), null, opcoes);
  r.window.eval(login); r.window.irPara('ciclos');
  return r;
}
const botaoAbrir = document => document.querySelector('#ci-lista [data-abrir]');

test('tela: botão Abrir ciclo fica desabilitado e mostra o motivo, nomeando a organização', async () => {
  const { window, document, S, erros } = await abrir();
  const b = botaoAbrir(document);
  assert.ok(b, 'o ciclo planejado tem o botão');
  assert.equal(b.disabled, true);
  const msg = b.nextElementSibling;
  assert.ok(msg.classList.contains('tr-motivo'));
  assert.equal(b.getAttribute('aria-describedby'), msg.id);
  const org = S.organizacoes.find(o => o.id === 'GOLDEN');
  assert.equal(msg.textContent.replace('Ver pendências', '').trim(), `Não dá para abrir um novo ciclo para ${org.nome}: 5 pessoas sem líder definido.`);
  assert.equal(msg.dataset.codigo, 'sem_superior');
  b.click();
  assert.equal(window.eval('CICLOS[2].status'), 'Planejado', 'clicar não abre');
  assert.deepEqual(erros.map(String), []);
});

test('tela: o motivo da tela é o do módulo', async () => {
  const { document, S } = await abrir();
  const r = podeAbrirCiclo(S, S.organizacaoSelecionada);
  assert.ok(botaoAbrir(document).nextElementSibling.textContent.includes(r.motivo));
});

test('tela: "Ver pendências" leva à fila da mesma organização', async () => {
  const { document, S } = await abrir();
  botaoAbrir(document).nextElementSibling.querySelector('[data-ver-pendencias]').click();
  assert.equal(S.tela, 'pendencias');
  assert.equal(S.pendFiltro.org, 'GOLDEN');
  assert.equal(document.querySelector('#t-pendencias').hidden, false);
});

test('tela: completada a equipe pelo adaptador, o botão volta a abrir o ciclo como antes', async () => {
  const { window, document, S, erros } = await abrir();
  const gg = idDe(S, 'GG');
  for (const i of filaDePendencias(S, 'GOLDEN').filter(x => x.codigo === 'sem_superior')) {
    assert.ok(window.eval(`definirSuperior(S, ${JSON.stringify(i.atuacaoId)}, ${JSON.stringify(gg)}, 'RH TESTE')`).ok);
  }
  window.renderCiclos();
  const b = botaoAbrir(document);
  assert.equal(b.disabled, false);
  assert.equal(document.querySelector('#ci-lista .tr-motivo'), null, 'sem texto de motivo');
  b.click();
  assert.equal(window.eval('CICLOS[2].status'), 'Aberto');
  assert.equal(window.eval('CICLOS[1].status'), 'Encerrado', 'o comportamento da v34 segue: o ciclo aberto anterior encerra');
  assert.deepEqual(erros.map(String), []);
});

test('tela: trocar a organização do topo recalcula a trava (BRANO sem raiz)', async () => {
  const { window, document } = await abrir();
  window.trocarOrganizacao('BRANO');
  window.irPara('ciclos');
  assert.match(botaoAbrir(document).nextElementSibling.textContent, /^Não dá para abrir um novo ciclo para BRANO: organização sem raiz definida\./);
});

test('tela: quem não edita o calendário não vê botão de abrir (nada para travar)', async () => {
  const { document } = await abrir(RH);
  assert.equal(document.querySelector('#t-ciclos').hidden, false);
  assert.equal(botaoAbrir(document), null);
  assert.equal(document.querySelector('#ci-lista .tr-motivo'), null);
});
