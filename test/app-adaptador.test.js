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
const pick = r => ({ ok: r.ok, codigo: r.codigo });
/** Chamada de preparação que precisa dar certo: falhando, o teste para aqui em vez de passar vazio. */
const certo = r => { assert.equal(r.ok, true, `preparação recusada: ${r.codigo}`); return r; };

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
  marcarLider(S, 'GOLDEN|DUPLO-VINCULO|1', true);   // R20: só líder recebe subordinado; DUPLO não lidera na fixture (o gerente geral é raiz e já nasce líder, R23)
  certo(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|DUPLO-VINCULO|1', 'RH TESTE'));   // DUPLO passa a ter um líder abaixo
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
  marcarLider(S, 'GOLDEN|DUPLO-VINCULO|1', true);   // R20: só líder recebe subordinado; DUPLO não lidera na fixture (o gerente geral é raiz e já nasce líder, R23)
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
  assert.deepEqual(pick(definirSuperior(S, 'GOLDEN|GG|1', 'GOLDEN|SUP|1', 'x')), { ok: false, codigo: 'raiz_com_superior' });
  assert.deepEqual(pick(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|SUP|1', 'x')), { ok: false, codigo: 'autoavaliacao' });
  assert.deepEqual(pick(definirSuperior(S, 'GOLDEN|COZ1|1', 'BRANO|BR3|1', 'x')), { ok: false, codigo: 'superior_fora_da_organizacao' });
  assert.deepEqual(pick(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|CAM|1', 'x')), { ok: false, codigo: 'avaliacao_mutua' });
  assert.deepEqual(pick(definirSuperior(S, 'NAO|EXISTE|1', 'GOLDEN|CAM|1', 'x')), { ok: false, codigo: 'atuacao_inexistente' });
  assert.equal(JSON.stringify(S.atuacoes), antes);
});

test('removerSuperior: com duas atuações encerra uma e passa os subordinados; a última volta ao pool', () => {
  const S = estadoFalso();
  marcarLider(S, 'GOLDEN|DUPLO-VINCULO|1', true);   // R20: só líder recebe subordinado; DUPLO não lidera na fixture (o gerente geral é raiz e já nasce líder, R23)
  certo(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|GG|1', 'RH'));
  const segunda = certo(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|DUPLO-VINCULO|1', 'RH')).atuacao;   // SUP|2 sob DUPLO
  certo(definirSuperior(S, 'GOLDEN|COZ1|1', segunda.id, 'RH'));                                     // COZ1 sob SUP|2
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
  marcarLider(S, 'GOLDEN|DUPLO-VINCULO|1', true);
  const r = definirUnicoSuperior(S, 'CAM', 'GOLDEN', 'GOLDEN|DUPLO-VINCULO|1', 'RH');
  assert.equal(r.atuacao.superiorId, 'GOLDEN|DUPLO-VINCULO|1');
  assert.deepEqual(S.atuacoes.filter(a => a.pessoaRef === 'CAM' && a.situacao === 'ativa' && !a.fim).map(a => a.superiorId), ['GOLDEN|DUPLO-VINCULO|1']);
  assert.deepEqual(pick(definirUnicoSuperior(S, 'GG', 'GOLDEN', 'GOLDEN|SUP|1', 'RH')), { ok: false, codigo: 'raiz_com_superior' });
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

/* ================= correções da revisão (R15, R16) ================= */

/** Estado do revisor: R raiz, X sob R, A sob X, B sob A. */
function estadoRevisor() {
  const mk = (id, p, sup, raiz = false) => ({ id, pessoaRef: p, organizacaoId: 'O', funcao: 'F', inicio: '2026-01-01', superiorId: sup, ehRaiz: raiz, situacao: 'ativa', fim: null, origem: 'carga', podeLiderar: true });
  return { organizacoes: [{ id: 'O', tipo: 'unidade', nome: 'O', filiais: [] }], base: { pessoas: [], vinculos: [] },
    pessoas: ['R', 'A', 'X', 'B'].map(id => ({ id, nome: id })), atuacoes: [mk('R', 'R', null, true), mk('X', 'X', 'R'), mk('A1', 'A', 'X'), mk('B1', 'B', 'A1')] };
}

test('R15: avaliação mútua é recusada (reprodução do revisor) e a árvore fica intacta', () => {
  const S = estadoRevisor();
  const antes = JSON.stringify(S.atuacoes);
  assert.deepEqual(pick(definirSuperior(S, 'A1', 'B1', 't')), { ok: false, codigo: 'avaliacao_mutua' });
  assert.equal(JSON.stringify(S.atuacoes), antes);
  validarArvore(S.atuacoes, 'O');
  const r = removerSuperior(S, 'A1', 't');
  assert.equal(r.ok, true); assert.equal(r.acao, 'sem_superior');
  validarArvore(S.atuacoes, 'O');
});

test('R15: removerSuperior que criaria ciclo é desfeito inteiro (estado mútuo vindo de fora do adaptador)', () => {
  const S = estadoRevisor();
  S.atuacoes.push({ ...S.atuacoes[2], id: 'A2', superiorId: 'B1' });   // A|2 sob B, enquanto A avalia B: só possível sem o adaptador
  const antes = JSON.stringify(S.atuacoes);
  const r = removerSuperior(S, 'A1', 't');
  assert.equal(r.ok, false); assert.equal(r.codigo, 'ciclo');
  assert.equal(JSON.stringify(S.atuacoes), antes);
});

test('R15: removerSuperior na primeira atuação com uma segunda existente mantém a árvore válida', () => {
  const S = estadoFalso();
  marcarLider(S, 'GOLDEN|DUPLO-VINCULO|1', true);   // R20: só líder recebe subordinado; DUPLO não lidera na fixture (o gerente geral é raiz e já nasce líder, R23)
  certo(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|GG|1', 'RH'));
  const sup2 = certo(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|DUPLO-VINCULO|1', 'RH')).atuacao;
  const r = removerSuperior(S, 'GOLDEN|SUP|1', 'RH');
  assert.equal(r.ok, true); assert.equal(r.acao, 'encerrada');
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|CAM|1').superiorId, sup2.id, 'a camareira passa para a atuação que fica');
  validarArvore(S.atuacoes, 'GOLDEN');
});

test('R15: escrita em organização sem raiz (sem_raiz já vinha da carga) continua permitida', () => {
  const S = estadoFalso();
  marcarLider(S, 'BRANO|BR3|1', true);   // R20: só líder recebe subordinado; BR3 não lidera na fixture
  const r = definirSuperior(S, 'BRANO|BR2|1', 'BRANO|BR3|1', 'RH');
  assert.equal(r.ok, true);
});

test('R16: id de atuação nunca se repete, nem depois de desfeito', () => {
  const S = estadoFalso();
  marcarLider(S, 'GOLDEN|DUPLO-VINCULO|1', true);   // R20: só líder recebe subordinado; DUPLO não lidera na fixture (o gerente geral é raiz e já nasce líder, R23)
  const snap = JSON.parse(JSON.stringify(S.atuacoes));
  const a = certo(definirSuperior(S, 'GOLDEN|CAM|1', 'GOLDEN|GG|1', 'RH')).atuacao;
  assert.equal(a.id, 'GOLDEN|CAM|2');
  S.atuacoes = snap;                                  // desfazer como a página faz: troca S.atuacoes, mantém S.idsUsados
  const b = certo(definirSuperior(S, 'GOLDEN|CAM|1', 'GOLDEN|GG|1', 'RH')).atuacao;
  assert.equal(b.id, 'GOLDEN|CAM|3');
});

test('definirUnicoSuperior recusado não deixa mudança parcial (atuações extras não são encerradas)', () => {
  const S = estadoFalso();
  marcarLider(S, 'GOLDEN|DUPLO-VINCULO|1', true);   // R20: só líder recebe subordinado; DUPLO não lidera na fixture (o gerente geral é raiz e já nasce líder, R23)
  certo(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|GG|1', 'RH'));
  certo(definirSuperior(S, 'GOLDEN|SUP|1', 'GOLDEN|DUPLO-VINCULO|1', 'RH'));   // SUP com duas atuações
  assert.equal(atuacoesDe(S.atuacoes, 'SUP').length, 2, 'premissa: SUP tem duas atuações');
  marcarLider(S, 'GOLDEN|CAM|1', true);
  const antes = JSON.stringify(S.atuacoes);
  const r = definirUnicoSuperior(S, 'SUP', 'GOLDEN', 'GOLDEN|CAM|1', 'RH');   // a camareira é avaliada por SUP: mútua
  assert.equal(r.ok, false); assert.equal(r.codigo, 'avaliacao_mutua');
  assert.equal(JSON.stringify(S.atuacoes), antes);
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|GAR1|1').podeLiderar, false, 'premissa: o garçom não lidera');
  assert.equal(pick(definirUnicoSuperior(S, 'COZ1', 'GOLDEN', 'GOLDEN|GAR1|1', 'RH')).codigo, 'superior_sem_marca_de_lider');
});
