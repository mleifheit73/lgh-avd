import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { atuacoesDe, validarArvore, semSuperior } from '../app/js/modelo/atuacao.js';
import {
  pessoasDa, avaliadosDe, visiveis, rotuloOrigem, nivelDe, definirSuperior, removerSuperior, marcarLider,
  selecionarOrganizacao, organizacoesVisiveis, reconstruirViews, colabDe, definirCampoPessoa, definirUnicoSuperior,
  limparSuperiores, idDocumentoAvaliacao, atuacoesVisiveis,
} from '../app/js/adaptador.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
/** Piloto em que a camareira tem dois avaliadores no Golden: duas atuações (D14). */
const pilotoDuplo = () => { const p = piloto(); p['CAMAREIRA TESTE'].avaliadores = ['SUPERVISOR DE GOVERNANCA TESTE', 'GERENTE GERAL TESTE']; return p; };

/** S falso, como o boot monta: estado da carga + perfil + organização selecionada. */
function estadoFalso({ pil = piloto(), extras = lerFixture('atuacoes-corporativo-mini.json'), perfil = null, org = 'GOLDEN' } = {}) {
  const e = montarEstado(base(), pil, extras, FUSAO_MINI);
  const S = { ...e, pessoas: e.base.pessoas, piloto: pil, perfil, organizacaoSelecionada: org };
  reconstruirViews(S);
  return S;
}
const ids = l => l.map(x => x.id).sort();

/* ================= adaptador puro, no Node ================= */

test('pessoasDa lista cada pessoa uma vez mesmo com duas atuações na mesma organização', () => {
  const S = estadoFalso({ pil: pilotoDuplo() });
  assert.equal(atuacoesDe(S.atuacoes, 'CAM').length, 2);
  const lista = pessoasDa(S, 'GOLDEN');
  assert.equal(lista.filter(p => p.id === 'CAM').length, 1);
  const cam = lista.find(p => p.id === 'CAM');
  assert.deepEqual(cam.atuacoes, ['GOLDEN|CAM|1', 'GOLDEN|CAM|2']);
  assert.deepEqual(cam.avaliadores, ['Supervisor de Governança Teste', 'GERENTE GERAL TESTE']);
  assert.equal(cam.nome, 'Camareira Teste', 'nome do piloto validado pelo RH');
  for (const k of ['id', 'nome', 'cargo', 'cargoCod', 'filial', 'cnpj', 'setor', 'equipe', 'avaliadores', 'lider', 'externo', 'situacao', 'funcao', 'faixaEtaria', 'atuacoes']) assert.ok(k in cam, k);
  assert.equal(cam.setor, 'Governança'); assert.equal(cam.equipe, 'Governança'); assert.equal(cam.cargo, 'CAMAREIRA'); assert.equal(cam.situacao, 'Ativo');
});

test('pessoasDa nunca traz pessoa de outra organização; Ana aparece nas duas, uma vez em cada', () => {
  const S = estadoFalso();
  const golden = ids(pessoasDa(S, 'GOLDEN'));
  assert.deepEqual(golden, ['ANA', 'BR1', 'CAM', 'COZ1', 'DUPLO-VINCULO', 'GAR1', 'GG', 'PJ-SEM-ORG', 'REC1', 'SUP']);
  assert.deepEqual(ids(pessoasDa(S, 'BRANO')), ['ANA', 'BR2', 'BR3']);
  assert.deepEqual(ids(pessoasDa(S, 'LAGHETTO CORPORATIVO')), ['CEO-REDE', 'DR', 'GG']);
});

test('avaliadosDe devolve atuações cujo superior é atuação da pessoa naquela organização', () => {
  const S = estadoFalso();
  assert.deepEqual(avaliadosDe(S, 'SUP', 'GOLDEN').map(a => a.id), ['GOLDEN|CAM|1']);
  assert.deepEqual(avaliadosDe(S, 'GG', 'GOLDEN').map(a => a.pessoaRef).sort(), ['BR1', 'PJ-SEM-ORG', 'REC1']);
  assert.deepEqual(avaliadosDe(S, 'DR', 'LAGHETTO CORPORATIVO').map(a => a.id), ['LAGHETTO CORPORATIVO|GG|1']);
  assert.deepEqual(avaliadosDe(S, 'DR', 'GOLDEN'), [], 'escopo por atuação: o diretor não tem atuação no Golden');
});

test('visiveis para avaliador é só a equipe dele na organização selecionada', () => {
  const S = estadoFalso({ perfil: { papel: 'avaliador', pessoaId: 'SUP' } });
  assert.deepEqual(visiveis(S).map(p => p.id), ['CAM']);
  S.perfil = { papel: 'avaliador', nome: 'Supervisor de Governança Teste' };   // perfil sem pessoaId: casa pelo nome normalizado
  assert.deepEqual(visiveis(S).map(p => p.id), ['CAM']);
  S.organizacaoSelecionada = 'BRANO';
  assert.deepEqual(visiveis(S), []);
});

test('visiveis para RH e admin é a organização selecionada, nunca a rede inteira', () => {
  const S = estadoFalso({ perfil: { papel: 'rh_unidade' } });
  assert.equal(visiveis(S).some(p => p.id === 'CEO-REDE' || p.id === 'BR2'), false);
  assert.equal(visiveis(S).length, 10);
  S.perfil = { papel: 'admin' };
  assert.equal(visiveis(S).length, 10);
  const todos = new Set(S.atuacoes.map(a => a.pessoaRef));
  assert.ok(visiveis(S).length < todos.size);
  S.perfil = null;
  assert.deepEqual(visiveis(S), []);
});

test('rotuloOrigem: os quatro rótulos', () => {
  assert.equal(rotuloOrigem({ origem: 'definido' }), 'Definido pelo RH');
  assert.equal(rotuloOrigem({ origem: 'inferido_por_cargo' }), 'Inferido pelo cargo');
  assert.equal(rotuloOrigem({ origem: 'inferido_por_empresa' }), 'Inferido pela empresa');
  assert.equal(rotuloOrigem({ origem: 'carga' }), 'Da carga, sem superior');
});

test('nivelDe deriva da posição: supervisora N1, gerente geral N4, diretor regional N5, CEO N6', () => {
  const S = estadoFalso();
  assert.equal(nivelDe(S, 'SUP'), 'N1'); assert.equal(nivelDe(S, 'GG'), 'N4');
  assert.equal(nivelDe(S, 'DR'), 'N5'); assert.equal(nivelDe(S, 'CEO-REDE'), 'N6'); assert.equal(nivelDe(S, 'CAM'), null);
  assert.equal(nivelDe(S, 'CAM', 'admin'), 'N6', 'RH da holding é N6 pelo papel');
  definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|DUPLO-VINCULO|1', 'RH TESTE');   // DUPLO passa a ter um líder abaixo
  assert.equal(nivelDe(S, 'DUPLO-VINCULO'), 'N2');
});

test('definirSuperior: sem superior passa a ter, com origem definido e autor', () => {
  const S = estadoFalso();
  const r = definirSuperior(S, 'GOLDEN|COZ1|1', 'GOLDEN|SUP|1', 'RH TESTE', '2026-11-04');
  assert.equal(r.acao, 'definido');
  const a = S.atuacoes.find(x => x.id === 'GOLDEN|COZ1|1');
  assert.equal(a.superiorId, 'GOLDEN|SUP|1'); assert.equal(a.origem, 'definido'); assert.equal(a.confirmadaPor, 'RH TESTE'); assert.equal(a.definidaEm, '2026-11-04');
  validarArvore(S.atuacoes, 'GOLDEN');
});

test('definirSuperior: segundo superior cria a segunda atuação (D14); o mesmo superior de novo não muda nada', () => {
  const S = estadoFalso();
  const r = definirSuperior(S, 'GOLDEN|CAM|1', 'GOLDEN|GG|1', 'RH TESTE', '2026-11-04');
  assert.equal(r.acao, 'criada'); assert.equal(r.atuacao.id, 'GOLDEN|CAM|2');
  assert.equal(r.atuacao.superiorId, 'GOLDEN|GG|1'); assert.equal(r.atuacao.origem, 'definido'); assert.equal(r.atuacao.funcao, 'CAMAREIRA');
  assert.equal(S.atuacoes.find(x => x.id === 'GOLDEN|CAM|1').superiorId, 'GOLDEN|SUP|1', 'a primeira continua com a supervisora');
  const n = S.atuacoes.length;
  assert.equal(definirSuperior(S, 'GOLDEN|CAM|1', 'GOLDEN|GG|1', 'RH TESTE').acao, 'nenhuma');
  assert.equal(S.atuacoes.length, n);
  validarArvore(S.atuacoes, 'GOLDEN');
});

test('definirSuperior recusa raiz, a própria pessoa, outra organização e ciclo, sem alterar nada', () => {
  const S = estadoFalso();
  const antes = JSON.stringify(S.atuacoes);
  assert.throws(() => definirSuperior(S, 'GOLDEN|GG|1', 'GOLDEN|SUP|1', 'x'), e => e.codigo === 'raiz_com_superior');
  assert.throws(() => definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|SUP|1', 'x'), e => e.codigo === 'autoavaliacao');
  assert.throws(() => definirSuperior(S, 'GOLDEN|COZ1|1', 'BRANO|BR3|1', 'x'), e => e.codigo === 'superior_fora_da_organizacao');
  assert.throws(() => definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|CAM|1', 'x'), e => e.codigo === 'ciclo');
  assert.throws(() => definirSuperior(S, 'NAO|EXISTE|1', 'GOLDEN|CAM|1', 'x'), e => e.codigo === 'atuacao_inexistente');
  assert.equal(JSON.stringify(S.atuacoes), antes);
});

test('removerSuperior: com duas atuações encerra uma e passa os subordinados; a última volta ao pool', () => {
  const S = estadoFalso();
  definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|GG|1', 'RH');
  const segunda = definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|DUPLO-VINCULO|1', 'RH').atuacao;   // SUP|2 sob DUPLO
  definirSuperior(S, 'GOLDEN|COZ1|1', segunda.id, 'RH');                                       // COZ1 sob SUP|2
  const r = removerSuperior(S, segunda.id, 'RH', '2026-11-04');
  assert.equal(r.acao, 'encerrada');
  assert.equal(segunda.fim, '2026-11-04'); assert.notEqual(segunda.situacao, 'ativa');
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|COZ1|1').superiorId, 'GOLDEN|SUP|1', 'subordinado passa para a outra atuação da mesma pessoa');
  validarArvore(S.atuacoes, 'GOLDEN');
  assert.equal(removerSuperior(S, 'GOLDEN|CAM|1', 'RH').acao, 'sem_superior');
  assert.ok(semSuperior(S.atuacoes, 'GOLDEN').some(a => a.id === 'GOLDEN|CAM|1'));
  assert.equal(removerSuperior(S, 'GOLDEN|CAM|1', 'RH').acao, 'nenhuma');
});

test('marcarLider e definirCampoPessoa escrevem nas atuações da pessoa na organização', () => {
  const S = estadoFalso({ pil: pilotoDuplo() });
  marcarLider(S, 'GOLDEN|COZ1|1', true);
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|COZ1|1').podeLiderar, true);
  definirCampoPessoa(S, 'CAM', 'GOLDEN', 'setor', 'Lavanderia');
  assert.deepEqual(atuacoesDe(S.atuacoes, 'CAM').map(a => [a.setor, a.equipe]), [['Lavanderia', 'Lavanderia'], ['Lavanderia', 'Lavanderia']]);
  definirCampoPessoa(S, 'CAM', 'GOLDEN', 'situacao', 'Férias');
  definirCampoPessoa(S, 'CAM', 'GOLDEN', 'funcao', 'CAMAREIRA LIDER');
  const v = pessoasDa(S, 'GOLDEN').find(p => p.id === 'CAM');
  assert.equal(v.situacao, 'Férias'); assert.equal(v.funcao, 'CAMAREIRA LIDER'); assert.equal(v.cargo, 'CAMAREIRA');
  assert.throws(() => definirCampoPessoa(S, 'BR2', 'GOLDEN', 'setor', 'x'), e => e.codigo === 'pessoa_fora_da_organizacao');
});

test('lote: definirUnicoSuperior deixa uma atuação com o superior escolhido; limparSuperiores tira todos', () => {
  const S = estadoFalso({ pil: pilotoDuplo() });
  const r = definirUnicoSuperior(S, 'CAM', 'GOLDEN', 'GOLDEN|DUPLO-VINCULO|1', 'RH');
  assert.equal(r.atuacao.superiorId, 'GOLDEN|DUPLO-VINCULO|1');
  assert.deepEqual(S.atuacoes.filter(a => a.pessoaRef === 'CAM' && a.situacao === 'ativa' && !a.fim).map(a => a.superiorId), ['GOLDEN|DUPLO-VINCULO|1']);
  assert.throws(() => definirUnicoSuperior(S, 'GG', 'GOLDEN', 'GOLDEN|SUP|1', 'RH'), e => e.codigo === 'raiz_com_superior');
  limparSuperiores(S, 'CAM', 'GOLDEN', 'RH');
  assert.deepEqual(pessoasDa(S, 'GOLDEN').find(p => p.id === 'CAM').avaliadores, []);
  validarArvore(S.atuacoes, 'GOLDEN');
});

test('selecionarOrganizacao reconstrói as visões; organizacoesVisiveis restringe o avaliador às suas', () => {
  const S = estadoFalso({ perfil: { papel: 'admin' } });
  const v = selecionarOrganizacao(S, 'BRANO');
  assert.equal(S.organizacaoSelecionada, 'BRANO');
  assert.deepEqual(ids(v.pessoas), ['ANA', 'BR2', 'BR3']);
  assert.throws(() => selecionarOrganizacao(S, 'NAO EXISTE'), e => e.codigo === 'organizacao_fora_do_escopo');
  S.perfil = { papel: 'avaliador', pessoaId: 'ANA' };
  assert.deepEqual(organizacoesVisiveis(S).map(o => o.id), ['BRANO', 'GOLDEN']);
  assert.throws(() => selecionarOrganizacao(S, 'LAGHETTO CORPORATIVO'), e => e.codigo === 'organizacao_fora_do_escopo');
  S.perfil = { papel: 'rh_unidade' };
  assert.equal(organizacoesVisiveis(S).length, 3);
});

test('colabDe carrega a atuação avaliada; atuacoesVisiveis é por atuação', () => {
  const S = estadoFalso({ pil: pilotoDuplo(), perfil: { papel: 'avaliador', pessoaId: 'GG' } });
  const c = colabDe(S, 'GOLDEN|CAM|2');
  assert.equal(c.atuacaoId, 'GOLDEN|CAM|2'); assert.equal(c.id, 'CAM'); assert.deepEqual(c.avaliadores, ['GERENTE GERAL TESTE']);
  assert.equal(c.ordem, 2); assert.equal(c.totalAtuacoes, 2); assert.equal(c.origem, 'inferido_por_cargo');
  assert.deepEqual(atuacoesVisiveis(S).map(a => a.id).sort(), ['GOLDEN|BR1|1', 'GOLDEN|CAM|2', 'GOLDEN|PJ-SEM-ORG|1', 'GOLDEN|REC1|1']);
});

test('idDocumentoAvaliacao: só caracteres permitidos, | vira : e é injetiva', () => {
  const id = idDocumentoAvaliacao('HOTEL LAGHETTO GOLDEN|81094d172da6|1|colab');
  assert.match(id, /^[A-Za-z0-9_\-.~:@+]+$/);
  assert.equal(id, 'HOTEL~20LAGHETTO~20GOLDEN:81094d172da6:1:colab');
  const chaves = ['A B|x|1|colab', 'A_B|x|1|colab', 'A~20B|x|1|colab', 'GOLDEN A&B|x|1|colab', 'A:B|x|1|colab', 'A|B:x|1|colab', 'SÃO|x|1|lider'];
  const gerados = chaves.map(idDocumentoAvaliacao);
  assert.equal(new Set(gerados).size, chaves.length);
  for (const g of gerados) assert.match(g, /^[A-Za-z0-9_\-.~:@+]+$/);
});
