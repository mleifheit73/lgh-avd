import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { semSuperior, validarArvore } from '../app/js/modelo/atuacao.js';
import { reconstruirViews, definirSuperior, criarAtuacaoNaOrganizacao } from '../app/js/adaptador.js';
import { pool, equipeDe, adicionarEmBloco, remover, marcarLider, confirmarInferido, marcarRaiz, poolRede, adicionarNaRede } from '../app/js/modelo/montagem.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const CORP = 'LAGHETTO CORPORATIVO';
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const corporativo = () => lerFixture('atuacoes-corporativo-mini.json');
/** Estrutura corporativa sem a atuação do gerente geral: a raiz do Golden fica sem ligação ao corporativo. */
const corpSemGG = () => corporativo().filter(a => a.pessoaRef !== 'GG');
/** Só o CEO: o diretor regional fica sem atuação, no pool de sem organização. */
const soCEO = () => corporativo().filter(a => a.pessoaRef === 'CEO-REDE');

function estado(extras = corporativo()) {
  const e = montarEstado(base(), piloto(), extras, FUSAO_MINI);
  const S = { ...e, pessoas: e.base.pessoas, piloto: piloto(), perfil: null, organizacaoSelecionada: 'GOLDEN' };
  reconstruirViews(S);
  return S;
}
const copia = S => JSON.parse(JSON.stringify(S.atuacoes));
const por = (S, id) => S.atuacoes.find(a => a.id === id);
/** Ids de atuação tirados do estado, nunca adivinhados: pessoa → atuação corrente n=1 na organização. */
const idDe = (S, pessoa, org = 'GOLDEN') => S.atuacoes.find(a => a.pessoaRef === pessoa && a.organizacaoId === org && a.situacao === 'ativa' && a.fim == null).id;
const ids = l => l.map(a => a.id);

/* ================= módulo puro ================= */

test('pool: atuações sem superior e não raiz, em ordem de nome; filtros de texto sem acento, cargo e setor', () => {
  const S = estado();
  const todos = pool(S, 'GOLDEN');
  assert.deepEqual(ids(todos).sort(), ids(semSuperior(S.atuacoes, 'GOLDEN')).sort(), 'mesmo conjunto de semSuperior');
  assert.ok(todos.every(a => a.superiorId == null && !a.ehRaiz));
  assert.ok(!ids(todos).includes(idDe(S, 'GG')), 'a raiz não entra no pool');
  assert.deepEqual(ids(pool(S, 'GOLDEN', { texto: 'cozinh' })), [idDe(S, 'COZ1')]);
  assert.deepEqual(ids(pool(S, 'GOLDEN', { texto: 'GOVERNANÇA' })), [idDe(S, 'SUP')], 'acento e caixa não importam');
  assert.deepEqual(ids(pool(S, 'GOLDEN', { texto: 'governanca' })), [idDe(S, 'SUP')]);
  assert.deepEqual(ids(pool(S, 'GOLDEN', { cargo: 'Cozinheiro' })), [idDe(S, 'COZ1')], 'cargo casa com a função');
  assert.deepEqual(ids(pool(S, 'GOLDEN', { setor: 'Administrativo' })), [idDe(S, 'ANA')]);
  const semSetor = pool(S, 'GOLDEN', { setor: 'Sem setor' });
  assert.ok(semSetor.length > 0 && semSetor.every(a => a.setor == null));
  const antes = copia(S); pool(S, 'GOLDEN', { texto: 'x' });
  assert.deepEqual(copia(S), antes, 'pool não muta');
});

test('adicionarEmBloco define superior, origem, autor e data; o pool lista de novo sem eles', () => {
  const S = estado();
  const sup = idDe(S, 'SUP'), coz = idDe(S, 'COZ1'), gar = idDe(S, 'GAR1');
  const equipeAntes = equipeDe(S, sup).length;
  const r = adicionarEmBloco(S, [coz, gar], sup, 'RH TESTE', '2026-11-04');
  assert.equal(r.ok, true); assert.deepEqual(r.aplicados, [coz, gar]); assert.deepEqual(r.recusados, []);
  for (const id of [coz, gar]) {
    const a = por(S, id);
    assert.equal(a.superiorId, sup); assert.equal(a.origem, 'definido'); assert.equal(a.confirmadaPor, 'RH TESTE'); assert.equal(a.definidaEm, '2026-11-04');
  }
  assert.equal(equipeDe(S, sup).length, equipeAntes + 2);
  assert.ok(!ids(pool(S, 'GOLDEN')).includes(coz) && !ids(pool(S, 'GOLDEN')).includes(gar));
});

test('adicionarEmBloco recusa o lote inteiro quando um id é o próprio superior, sem mudar nada', () => {
  const S = estado();
  const sup = idDe(S, 'SUP'); const antes = copia(S);
  const r = adicionarEmBloco(S, [idDe(S, 'COZ1'), sup], sup, 'RH', '2026-11-04');
  assert.equal(r.ok, false); assert.equal(r.codigo, 'proprio_superior'); assert.deepEqual(r.aplicados, []);
  assert.deepEqual(copia(S), antes);
});

test('R20: superior sem marca de líder é recusado no lote e no definirSuperior do adaptador', () => {
  const S = estado();
  const gar = idDe(S, 'GAR1');
  assert.equal(por(S, gar).podeLiderar, false, 'premissa da fixture: o garçom não está marcado como líder');
  const antes = copia(S);
  const r = adicionarEmBloco(S, [idDe(S, 'COZ1'), idDe(S, 'ANA')], gar, 'RH', '2026-11-04');
  assert.equal(r.ok, false); assert.equal(r.codigo, 'superior_sem_marca_de_lider');
  const d = definirSuperior(S, idDe(S, 'COZ1'), gar, 'RH', '2026-11-04');
  assert.equal(d.ok, false); assert.equal(d.codigo, 'superior_sem_marca_de_lider');
  assert.deepEqual(copia(S), antes);
  assert.equal(marcarLider(S, gar, true).ok, true);
  assert.equal(adicionarEmBloco(S, [idDe(S, 'COZ1')], gar, 'RH', '2026-11-04').ok, true, 'marcado como líder, passa');
});

test('lote com uma pessoa recusada (avaliação mútua): ela fica exatamente como estava, as outras entram', () => {
  const S = estado();
  const cam = idDe(S, 'CAM'), sup = idDe(S, 'SUP'), coz = idDe(S, 'COZ1');
  assert.equal(por(S, cam).superiorId, sup, 'premissa: a camareira está sob a supervisora');
  assert.equal(marcarLider(S, cam, true).ok, true);
  const supAntes = JSON.parse(JSON.stringify(por(S, sup)));
  const r = adicionarEmBloco(S, [sup, coz], cam, 'RH', '2026-11-04');
  assert.equal(r.ok, true);
  assert.deepEqual(r.aplicados, [coz]);
  assert.deepEqual(r.recusados, [{ id: sup, codigo: 'avaliacao_mutua' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(por(S, sup))), supAntes);
  assert.equal(por(S, coz).superiorId, cam);
  const so = adicionarEmBloco(S, [sup], cam, 'RH', '2026-11-04');
  assert.equal(so.ok, false); assert.equal(so.codigo, 'avaliacao_mutua', 'lote só com recusados devolve o código');
});

test('remover devolve ao pool e o pool a lista de novo', () => {
  const S = estado();
  const cam = idDe(S, 'CAM');
  assert.ok(!ids(pool(S, 'GOLDEN')).includes(cam));
  const r = remover(S, cam, 'RH TESTE', '2026-11-04');
  assert.equal(r.ok, true);
  assert.equal(por(S, cam).superiorId, null); assert.equal(por(S, cam).origem, 'definido'); assert.equal(por(S, cam).confirmadaPor, 'RH TESTE');
  assert.ok(ids(pool(S, 'GOLDEN')).includes(cam));
});

test('confirmarInferido troca a origem sem mudar o superior; recusa sem superior e o que já é definido', () => {
  const S = estado();
  const rec = idDe(S, 'REC1');
  const antes = JSON.parse(JSON.stringify(por(S, rec)));
  assert.match(antes.origem, /^inferido_/);
  const r = confirmarInferido(S, rec, 'RH TESTE', '2026-11-04');
  assert.equal(r.ok, true);
  const a = por(S, rec);
  assert.equal(a.superiorId, antes.superiorId); assert.equal(a.origem, 'definido'); assert.equal(a.metodoInferencia, null);
  assert.equal(a.confirmadaPor, 'RH TESTE'); assert.equal(a.definidaEm, '2026-11-04');
  assert.equal(confirmarInferido(S, rec, 'RH').codigo, 'nao_inferido');
  assert.equal(confirmarInferido(S, idDe(S, 'COZ1'), 'RH').codigo, 'sem_superior');
});

test('marcarRaiz troca a raiz da organização e rejeita atuação com superior', () => {
  const S = estado();
  const gg = idDe(S, 'GG'), sup = idDe(S, 'SUP'), cam = idDe(S, 'CAM');
  const antes = copia(S);
  const x = marcarRaiz(S, cam, 'RH', '2026-11-04');
  assert.equal(x.ok, false); assert.equal(x.codigo, 'raiz_com_superior');
  assert.deepEqual(copia(S), antes);
  const r = marcarRaiz(S, sup, 'RH', '2026-11-04');
  assert.equal(r.ok, true); assert.deepEqual(r.anteriores, [gg]);
  assert.equal(por(S, sup).ehRaiz, true); assert.equal(por(S, gg).ehRaiz, false);
  assert.doesNotThrow(() => validarArvore(S.atuacoes, 'GOLDEN'));
  assert.ok(ids(pool(S, 'GOLDEN')).includes(gg), 'a raiz anterior volta ao pool');
  assert.ok(!ids(pool(S, 'GOLDEN')).includes(sup));
  const br3 = idDe(S, 'BR3', 'BRANO');
  assert.equal(marcarRaiz(S, br3, 'RH').ok, true, 'organização sem raiz ganha a primeira');
  assert.doesNotThrow(() => validarArvore(S.atuacoes, 'BRANO'));
});

test('marcarLider: marca e desmarca; desmarcar quem tem equipe é recusado (R20)', () => {
  const S = estado();
  const coz = idDe(S, 'COZ1'), sup = idDe(S, 'SUP');
  assert.equal(marcarLider(S, coz, true).ok, true); assert.equal(por(S, coz).podeLiderar, true);
  assert.equal(marcarLider(S, coz, false).ok, true); assert.equal(por(S, coz).podeLiderar, false);
  const r = marcarLider(S, sup, false);
  assert.equal(r.ok, false); assert.equal(r.codigo, 'lider_com_equipe'); assert.equal(por(S, sup).podeLiderar, true);
  assert.equal(marcarLider(S, 'NAO|EXISTE|1', true).codigo, 'atuacao_inexistente');
});

test('poolRede: gerente geral sem ligação e PJ sem organização; adicionar cria a atuação corporativa, a lista da carga fica intacta', () => {
  const S = estado(corpSemGG());
  const dr = idDe(S, 'DR', CORP), gg = idDe(S, 'GG');
  const item = poolRede(S).find(i => i.chave === `r:${gg}`);
  assert.ok(item, 'o gerente geral do Golden está no pool da Rede'); assert.equal(item.tipo, 'raiz');
  const r = adicionarNaRede(S, [item.chave], dr, 'RH TESTE', '2026-11-04');
  assert.equal(r.ok, true, JSON.stringify(r));
  const nova = S.atuacoes.find(a => a.pessoaRef === 'GG' && a.organizacaoId === CORP);
  assert.ok(nova); assert.equal(nova.superiorId, dr); assert.equal(nova.origem, 'definido'); assert.equal(nova.funcao, por(S, gg).funcao);
  assert.equal(nova.inicio, '2026-11-04'); assert.equal(nova.confirmadaPor, 'RH TESTE');
  assert.ok(!poolRede(S).some(i => i.pessoaId === 'GG'));

  const T = estado(soCEO());
  const ceo = idDe(T, 'CEO-REDE', CORP);
  const semOrg = T.semOrganizacao.length;
  const p = poolRede(T).find(i => i.chave === 'p:DR');
  assert.ok(p, 'o diretor regional sem atuação está no pool'); assert.equal(p.funcao, 'DIRETOR REGIONAL');
  assert.equal(adicionarNaRede(T, ['p:DR'], ceo, 'RH', '2026-11-04').ok, true);
  assert.ok(T.atuacoes.some(a => a.pessoaRef === 'DR' && a.organizacaoId === CORP && a.superiorId === ceo));
  assert.ok(!poolRede(T).some(i => i.pessoaId === 'DR'));
  assert.equal(T.semOrganizacao.length, semOrg, 'S.semOrganizacao não é editada: o Desfazer restaura só S.atuacoes');
});

test('criarAtuacaoNaOrganizacao recusa superior sem marca de líder, a própria pessoa e organização errada', () => {
  const S = estado(corporativo());
  const ggCorp = idDe(S, 'GG', CORP), dr = idDe(S, 'DR', CORP);
  const antes = copia(S);
  assert.equal(criarAtuacaoNaOrganizacao(S, { pessoaId: 'SUP', organizacaoId: CORP, superiorAtuacaoId: ggCorp, funcao: 'X', autor: 'RH' }).codigo, 'superior_sem_marca_de_lider');
  assert.equal(criarAtuacaoNaOrganizacao(S, { pessoaId: 'DR', organizacaoId: CORP, superiorAtuacaoId: dr, funcao: 'X', autor: 'RH' }).codigo, 'autoavaliacao');
  assert.equal(criarAtuacaoNaOrganizacao(S, { pessoaId: 'SUP', organizacaoId: 'GOLDEN', superiorAtuacaoId: dr, funcao: 'X', autor: 'RH' }).codigo, 'superior_fora_da_organizacao');
  assert.equal(adicionarNaRede(S, ['p:NINGUEM'], dr, 'RH').recusados[0].codigo, 'fora_do_pool');
  assert.deepEqual(copia(S), antes);
});

test('adicionarNaRede não inventa função: sem cargo na carga recusa sem_funcao; com a função informada, grava ela', () => {
  const T = estado(soCEO());
  const ceo = idDe(T, 'CEO-REDE', CORP);
  T.semOrganizacao.find(p => p.id === 'DR').vinculosPJ = [{ empresa: 'LAGHETTO ADMINISTRADORA DE HOTEIS', cargo: null }];
  assert.equal(poolRede(T).find(i => i.chave === 'p:DR').funcao, null, 'premissa: o diretor regional está sem cargo na carga');
  const antes = copia(T);
  const r = adicionarNaRede(T, ['p:DR'], ceo, 'RH', '2026-11-04');
  assert.equal(r.ok, false); assert.equal(r.codigo, 'sem_funcao'); assert.deepEqual(r.recusados, [{ chave: 'p:DR', codigo: 'sem_funcao' }]);
  assert.deepEqual(copia(T), antes);
  assert.ok(!T.atuacoes.some(a => a.funcao === 'Sem função'));
  assert.equal(adicionarNaRede(T, ['p:DR'], ceo, 'RH', '2026-11-04', { funcao: '  ' }).codigo, 'sem_funcao', 'só espaço não conta');
  const ok = adicionarNaRede(T, ['p:DR'], ceo, 'RH', '2026-11-04', { funcao: 'Diretor regional' });
  assert.equal(ok.ok, true);
  assert.equal(T.atuacoes.find(a => a.pessoaRef === 'DR' && a.organizacaoId === CORP).funcao, 'Diretor regional');
});

/* ================= raiz da estrutura corporativa (Tarefa 9: a Rede nasce vazia e precisa de uma primeira atuação) ================= */

test('definirRaizDaRede: com a Rede vazia, uma pessoa do pool vira a raiz corporativa (sem superior, líder, definida pelo RH)', async () => {
  const { definirRaizDaRede } = await import('../app/js/modelo/montagem.js');
  const S = estado([]);
  assert.ok(!S.atuacoes.some(a => a.organizacaoId === CORP), 'premissa: a Rede nasce vazia');
  const p = poolRede(S).find(i => i.chave === 'p:CEO-REDE');
  assert.ok(p, 'o CEO sem organização está no pool');
  const semOrg = S.semOrganizacao.length;
  const r = definirRaizDaRede(S, 'p:CEO-REDE', 'RH TESTE', '2026-11-04');
  assert.equal(r.ok, true, JSON.stringify(r));
  const raiz = S.atuacoes.find(a => a.pessoaRef === 'CEO-REDE' && a.organizacaoId === CORP);
  assert.ok(raiz); assert.equal(raiz.ehRaiz, true); assert.equal(raiz.superiorId, null); assert.equal(raiz.podeLiderar, true);
  assert.equal(raiz.origem, 'definido'); assert.equal(raiz.confirmadaPor, 'RH TESTE'); assert.equal(raiz.inicio, '2026-11-04');
  assert.equal(raiz.funcao, p.funcao, 'função é o cargo da carga, nada inventado');
  assert.doesNotThrow(() => validarArvore(S.atuacoes, CORP));
  assert.equal(S.semOrganizacao.length, semOrg, 'S.semOrganizacao não é editada');
  assert.ok(!poolRede(S).some(i => i.pessoaId === 'CEO-REDE'), 'a raiz sai do pool');
  /* segunda raiz é recusada: a Rede já tem raiz */
  assert.equal(definirRaizDaRede(S, 'p:DR', 'RH', '2026-11-04').codigo, 'raiz_ja_definida');
});

test('definirRaizDaRede: gerente geral de unidade pode ser a raiz; sem cargo na carga pede função; chave fora do pool é recusada', async () => {
  const { definirRaizDaRede } = await import('../app/js/modelo/montagem.js');
  const S = estado([]);
  const gg = idDe(S, 'GG');
  const antes = copia(S);
  assert.equal(definirRaizDaRede(S, 'x:nada', 'RH').codigo, 'fora_do_pool');
  assert.deepEqual(S.atuacoes, antes, 'recusa não altera nada');
  const r = definirRaizDaRede(S, `r:${gg}`, 'RH', '2026-11-04');
  assert.equal(r.ok, true, JSON.stringify(r));
  const raiz = S.atuacoes.find(a => a.pessoaRef === 'GG' && a.organizacaoId === CORP);
  assert.ok(raiz && raiz.ehRaiz && raiz.superiorId == null);
  assert.equal(por(S, gg).ehRaiz, true, 'a atuação na unidade continua raiz da unidade');
  /* pessoa sem cargo na carga: só com função informada */
  const T = estado([]);
  const semCargo = poolRede(T).find(i => i.tipo === 'pessoa' && !i.funcao);
  if (semCargo) {
    assert.equal(definirRaizDaRede(T, semCargo.chave, 'RH', '2026-11-04').codigo, 'sem_funcao');
    assert.equal(definirRaizDaRede(T, semCargo.chave, 'RH', '2026-11-04', { funcao: 'Diretor Geral' }).ok, true);
    assert.equal(T.atuacoes.find(a => a.pessoaRef === semCargo.pessoaId && a.organizacaoId === CORP).funcao, 'Diretor Geral');
  }
});
