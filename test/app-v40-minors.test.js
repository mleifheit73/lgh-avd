// v40 (05/11/2026): os cinco Minor diferidos da revisão final, autorizados por Marcelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { reconstruirViews, definirSuperior, marcarRaiz, criarAtuacaoNaOrganizacao, definirCampoPessoa, ehCorrente } from '../app/js/adaptador.js';
import { resumoOrganizacao } from '../app/js/arvore-ui.js';
import { aplicarDeltaConferido } from '../app/js/modelo/persistencia.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const corporativo = () => lerFixture('atuacoes-corporativo-mini.json');
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
const AVAL = "entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})";
function estado() {
  const e = montarEstado(base(), piloto(), corporativo(), FUSAO_MINI);
  const S = { ...e, pessoas: e.base.pessoas, piloto: piloto(), perfil: null, organizacaoSelecionada: 'GOLDEN' };
  reconstruirViews(S); S.atuacoesBase = JSON.parse(JSON.stringify(S.atuacoes)); return S;
}
const idDe = (S, pessoa, org = 'GOLDEN') => S.atuacoes.find(a => a.pessoaRef === pessoa && a.organizacaoId === org && ehCorrente(a)).id;

test('M1: a pessoa que é raiz não ganha superior por outra atuação, e quem tem superior não vira raiz', () => {
  const S = estado();
  const gg = idDe(S, 'GG'), sup = idDe(S, 'SUP');
  /* criar uma segunda atuação do GG sob o supervisor: recusada, o GG é a raiz */
  const r = criarAtuacaoNaOrganizacao(S, { pessoaId: 'GG', organizacaoId: 'GOLDEN', superiorAtuacaoId: sup, funcao: 'X', autor: 'RH' });
  assert.equal(r.ok, false); assert.equal(r.codigo, 'raiz_com_superior');
  /* o supervisor tem superior? se tiver, não pode virar raiz; se não tiver, dá-lhe um e tenta */
  const s = S.atuacoes.find(a => a.id === sup);
  if (s.superiorId == null) assert.equal(definirSuperior(S, sup, gg, 'RH').ok, true);
  const r2 = marcarRaiz(S, sup, 'RH');
  assert.equal(r2.ok, false); assert.equal(r2.codigo, 'raiz_com_superior');
});

test('Medidor: quem tem líder desligado não conta como "com líder"; aparece à parte', () => {
  const S = estado();
  const antes = resumoOrganizacao(S, 'GOLDEN');
  const sup = S.atuacoes.find(a => a.id === idDe(S, 'SUP'));
  const equipe = S.atuacoes.filter(a => a.superiorId === sup.id && ehCorrente(a)).length;
  assert.ok(equipe > 0, 'premissa: o supervisor tem equipe');
  definirCampoPessoa(S, 'SUP', 'GOLDEN', 'situacao', 'Desligado');
  const depois = resumoOrganizacao(S, 'GOLDEN');
  assert.equal(depois.liderDesligado, equipe);
  /* na fixture mini o supervisor está sem líder (semSuperior), então só a equipe dele sai de comSuperior */
  const supTinhaLider = sup.superiorId != null ? 1 : 0;
  assert.equal(depois.comSuperior, antes.comSuperior - supTinhaLider - equipe, 'o supervisor saiu do ciclo e a equipe dele não conta como com líder');
  assert.equal(depois.semSuperior, antes.semSuperior - (1 - supTinhaLider), 'o supervisor desligado também sai de sem líder');
  assert.equal(depois.definidos + depois.inferidos + depois.comLiderOutraOrigem + depois.liderDesligado + depois.semLiderCarga + depois.semLiderRH, depois.precisamDeLider, 'as partes ainda somam o total');
});

test('Delta: criada cuja pessoa não existe na base é ignorada e relatada, não vira atuação fantasma', () => {
  const S = estado();
  const gg = idDe(S, 'GG');
  const delta = { versao: 2, alteradas: [], criadas: [{ id: 'GOLDEN|FANTASMA|1', pessoaRef: 'FANTASMA', organizacaoId: 'GOLDEN', funcao: 'X', superiorId: gg, ehRaiz: false, situacao: 'ativa', fim: null, inicio: '2026-11-01', origem: 'definido', podeLiderar: false }], removidasIds: [] };
  const pessoas = new Set(S.base.pessoas.map(p => p.id));
  const r = aplicarDeltaConferido(S.atuacoesBase, delta, 'GOLDEN', { pessoas });
  assert.equal(r.ok, true);
  assert.ok(!r.atuacoes.some(a => a.id === 'GOLDEN|FANTASMA|1'), 'não entra');
  assert.deepEqual(r.ignoradas, ['GOLDEN|FANTASMA|1']);
});

test('M9: handlers da Matriz recusam para quem não tem permissão, mesmo se o controle existir', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(AVAL); window.irPara('matriz');
  const sup = idDe(S, 'SUP');
  const a = S.atuacoes.find(x => x.id === sup);
  const setorAntes = a.setor, funcaoAntes = a.funcao;
  /* o avaliador não tem editarFuncao nem editarSetor: chamar a função de edição da Matriz por fora não altera nada */
  const r1 = window.LGH_MATRIZ && window.LGH_MATRIZ.editarCampo ? window.LGH_MATRIZ.editarCampo(a.pessoaRef, 'funcao', 'HACK') : null;
  assert.ok(r1 && r1.ok === false && r1.codigo === 'sem_permissao', JSON.stringify(r1));
  assert.equal(S.atuacoes.find(x => x.id === sup).funcao, funcaoAntes);
  const r2 = window.LGH_MATRIZ.editarCampo(a.pessoaRef, 'setor', 'HACK');
  assert.equal(r2.ok, false); assert.equal(S.atuacoes.find(x => x.id === sup).setor, setorAntes);
  const r3 = window.LGH_MATRIZ.aplicarLote('definir', 'alguem');
  assert.equal(r3.ok, false); assert.equal(r3.codigo, 'sem_permissao');
});

test('Rede sem raiz: a faixa das unidades sem ligação nasce recolhida, com a contagem visível', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(ADMIN); window.irPara('arvore');
  const sel = document.querySelector('#ar-org'); sel.value = 'LAGHETTO CORPORATIVO'; sel.dispatchEvent(new window.Event('change'));
  assert.ok(!S.atuacoes.some(a => a.organizacaoId === 'LAGHETTO CORPORATIVO' && a.ehRaiz), 'premissa: Rede sem raiz');
  const det = document.querySelector('#ar-sem-ligacao details');
  assert.ok(det, 'faixa recolhível');
  assert.equal(det.open, false);
  assert.match(det.querySelector('summary').textContent, /Unidades sem ligação ao corporativo: \d+/);
});
