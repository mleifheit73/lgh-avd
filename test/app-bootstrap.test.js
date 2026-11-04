import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lerFixture } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { organizacoesDe } from '../app/js/modelo/organizacao.js';
import { atuacoesIniciais } from '../app/js/modelo/bootstrap.js';
import { atuacoesDe, validarArvore, semSuperior } from '../app/js/modelo/atuacao.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const temDadosReais = fs.existsSync('out/base.json') && fs.existsSync('app/data/base.json') && fs.existsSync('app/data/piloto-golden.json');
const base = () => lerFixture('base-mini.json');
const pilotoMini = () => lerFixture('piloto-mini.json');
const iniciais = (piloto = {}, fusoes = FUSAO_MINI) => atuacoesIniciais(base(), organizacoesDe(base(), fusoes), piloto, { organizacaoPiloto: 'GOLDEN' });

test('atuacoesIniciais: CLT na organização da filial, sem superior, origem carga', () => {
  const { atuacoes } = iniciais();
  const a = atuacoes.find(x => x.pessoaRef === 'CAM');
  assert.equal(a.organizacaoId, 'GOLDEN'); assert.equal(a.superiorId, null); assert.equal(a.origem, 'carga');
  assert.equal(a.metodoInferencia, null); assert.equal(a.confirmadaPor, null); assert.equal(a.podeLiderar, false);
  assert.equal(a.funcao, 'CAMAREIRA');
});
test('atuacoesIniciais: ids determinísticos e estáveis, e todas as atuações têm origem', () => {
  const um = iniciais(pilotoMini()).atuacoes; const dois = iniciais(pilotoMini()).atuacoes;
  assert.deepEqual(um.map(a => a.id), dois.map(a => a.id));
  assert.equal(um.find(a => a.pessoaRef === 'CAM').id, 'GOLDEN|CAM|1');
  assert.equal(new Set(um.map(a => a.id)).size, um.length);
  assert.ok(um.every(a => ['carga', 'inferido_por_cargo', 'inferido_por_empresa', 'definido'].includes(a.origem)));
});
test('atuacoesIniciais: PJ inferido entra com origem e método; sem casamento vai para semOrganizacao', () => {
  const { atuacoes, semOrganizacao } = iniciais();
  const gg = atuacoes.find(x => x.pessoaRef === 'GG');
  assert.equal(gg.origem, 'inferido_por_empresa'); assert.equal(gg.metodoInferencia, 'nome');
  assert.equal(gg.organizacaoId, 'GOLDEN'); assert.equal(gg.ehRaiz, true);
  assert.deepEqual(semOrganizacao.map(p => p.id).sort(), ['CEO-REDE', 'DR', 'PJ-SEM-ORG']);
  assert.deepEqual(semOrganizacao.find(p => p.id === 'PJ-SEM-ORG').vinculosPJ, [{ empresa: 'EMPRESA SEM FILIAL', cargo: 'CONSULTOR EXTERNO' }]);
});
test('R23: a raiz e quem ficou com subordinado nascem líderes, com log quando o piloto não marcou', () => {
  const { atuacoes, log } = iniciais(pilotoMini());
  const por = id => atuacoes.find(a => a.id === id);
  assert.equal(por('GOLDEN|GG|1').ehRaiz, true);
  assert.equal(por('GOLDEN|GG|1').podeLiderar, true, 'raiz lidera');
  assert.ok(log.some(l => l.codigo === 'lider_inferido_por_raiz' && l.atuacaoId === 'GOLDEN|GG|1'));
  assert.equal(por('GOLDEN|CAM|1').podeLiderar, false, 'a camareira não tem subordinado e continua sem marca');
  assert.equal(por('GOLDEN|SUP|1').podeLiderar, true);
  assert.ok(!log.some(l => /^lider_inferido/.test(l.codigo) && l.atuacaoId === 'GOLDEN|SUP|1'), 'o piloto já marcou a supervisora: sem log');
  const comSub = new Set(atuacoes.map(a => a.superiorId).filter(Boolean));
  for (const a of atuacoes) if (a.ehRaiz || comSub.has(a.id)) assert.equal(a.podeLiderar, true, a.id);
  /* sem piloto ninguém vem marcado: quem tem subordinado só tem pelo piloto, então só a raiz é inferida */
  const sem = iniciais({});
  assert.equal(sem.atuacoes.find(a => a.id === 'GOLDEN|GG|1').podeLiderar, true);
  const p = pilotoMini(); p['SUPERVISOR DE GOVERNANCA TESTE'] = { ...p['SUPERVISOR DE GOVERNANCA TESTE'], lider: false };
  const r = iniciais(p);
  assert.equal(r.atuacoes.find(a => a.id === 'GOLDEN|SUP|1').podeLiderar, true, 'tem a camareira abaixo');
  assert.ok(r.log.some(l => l.codigo === 'lider_inferido_por_subordinados' && l.atuacaoId === 'GOLDEN|SUP|1'));
});
test('atuacoesIniciais: pessoa com CLT e PJ na mesma organização tem uma atuação só, a da carga', () => {
  const { atuacoes } = iniciais();
  const d = atuacoes.filter(x => x.pessoaRef === 'DUPLO-VINCULO');
  assert.equal(d.length, 1); assert.equal(d[0].origem, 'carga'); assert.equal(d[0].funcao, 'ANALISTA DE RESERVAS');
});
test('atuacoesIniciais: Ana tem duas atuações, uma em cada organização', () => {
  const { atuacoes } = iniciais();
  const ana = atuacoesDe(atuacoes, 'ANA');
  assert.deepEqual(ana.map(a => a.organizacaoId).sort(), ['BRANO', 'GOLDEN']);
});
test('atuacoesIniciais: piloto dá setor, podeLiderar e superior inferido_por_cargo na mesma organização', () => {
  const { atuacoes, log } = iniciais(pilotoMini());
  const cam = atuacoes.find(a => a.pessoaRef === 'CAM');
  assert.equal(cam.superiorId, 'GOLDEN|SUP|1'); assert.equal(cam.origem, 'inferido_por_cargo'); assert.equal(cam.setor, 'Governança');
  const sup = atuacoes.find(a => a.pessoaRef === 'SUP');
  assert.equal(sup.podeLiderar, true); assert.equal(sup.superiorId, null); assert.equal(sup.setor, 'Governança');
  assert.equal(atuacoes.find(a => a.pessoaRef === 'REC1').superiorId, 'GOLDEN|GG|1');
  const br2 = atuacoes.find(a => a.pessoaRef === 'BR2');   // Brano não está no piloto: fica com a carga e sem superior
  assert.equal(br2.organizacaoId, 'BRANO'); assert.equal(br2.superiorId, null); assert.equal(br2.origem, 'carga');
  assert.ok(!log.some(l => l.codigo === 'avaliador_nao_encontrado'));
});
test('atuacoesIniciais: avaliador sem atuação na organização do piloto é logado e o superior fica null; Ana mantém as duas atuações', () => {
  const { atuacoes, log } = iniciais(pilotoMini());
  const ana = atuacoesDe(atuacoes, 'ANA');
  assert.deepEqual(ana.map(a => a.organizacaoId).sort(), ['BRANO', 'GOLDEN']);
  assert.ok(ana.every(a => a.superiorId === null));
  const l = log.filter(x => x.codigo === 'avaliador_fora_da_organizacao' && x.id.includes('ANA'));
  assert.ok(l.length >= 1 && l.every(x => x.avaliador === 'CEO DA REDE TESTE'));
  assert.ok(!log.some(x => x.codigo === 'realocado_pelo_piloto' && x.pessoaId === 'ANA'), 'Ana já tem atuação no Golden');
});
test('atuacoesIniciais: pessoa do piloto só com PJ sem organização ganha atuação no piloto e sai do pool', () => {
  const { atuacoes, semOrganizacao, log } = iniciais(pilotoMini());
  const a = atuacoesDe(atuacoes, 'PJ-SEM-ORG');
  assert.equal(a.length, 1);
  assert.equal(a[0].organizacaoId, 'GOLDEN'); assert.equal(a[0].origem, 'inferido_por_cargo'); assert.equal(a[0].metodoInferencia, 'piloto');
  assert.equal(a[0].superiorId, 'GOLDEN|GG|1'); assert.equal(a[0].setor, 'Manutenção'); assert.equal(a[0].funcao, 'CONSULTOR EXTERNO');
  assert.ok(!semOrganizacao.some(p => p.id === 'PJ-SEM-ORG'));
  assert.ok(log.some(l => l.codigo === 'atuacao_criada_pelo_piloto' && l.pessoaId === 'PJ-SEM-ORG'));
});
test('atuacoesIniciais: várias atuações fora do piloto e nenhuma nele: move a primeira por id e loga as mantidas', () => {
  const p = { 'ANA TESTE DUPLA FILIAL': { nome: 'x', setor: 's', equipe: 's', lider: false, avaliadores: [], funcao: 'x', situacao: 'Ativo' } };
  // Ana: GOLDEN RESORT e BRANO, nenhuma em OUTRA
  const b = base();
  const orgs = organizacoesDe(b, [{ id: 'OUTRA', nome: 'Outra', filiais: ['GOLDEN A&B'] }]);
  const r = atuacoesIniciais(b, orgs, p, { organizacaoPiloto: 'OUTRA' });
  assert.deepEqual(atuacoesDe(r.atuacoes, 'ANA').map(a => a.organizacaoId).sort(), ['GOLDEN RESORT', 'OUTRA']);
  const m = r.log.find(l => l.codigo === 'realocado_pelo_piloto_multiplas');
  assert.deepEqual(m.mantidas, ['GOLDEN RESORT']);
  assert.equal(r.log.find(l => l.codigo === 'realocado_pelo_piloto' && l.pessoaId === 'ANA').de, 'BRANO');
});
test('atuacoesIniciais: pessoa do piloto com vínculo em outra filial é realocada para a organização do piloto (R10)', () => {
  const { atuacoes, log } = iniciais(pilotoMini());
  const br1 = atuacoesDe(atuacoes, 'BR1');
  assert.equal(br1.length, 1);
  assert.equal(br1[0].organizacaoId, 'GOLDEN'); assert.equal(br1[0].metodoInferencia, 'piloto');
  assert.equal(br1[0].origem, 'inferido_por_cargo'); assert.equal(br1[0].superiorId, 'GOLDEN|GG|1'); assert.equal(br1[0].setor, 'Recepção');
  assert.deepEqual(log.find(l => l.codigo === 'realocado_pelo_piloto' && l.pessoaId === 'BR1'), { codigo: 'realocado_pelo_piloto', mensagem: log.find(l => l.codigo === 'realocado_pelo_piloto' && l.pessoaId === 'BR1').mensagem, pessoaId: 'BR1', de: 'BRANO', para: 'GOLDEN' });
  assert.ok(!atuacoes.some(a => a.pessoaRef === 'BR1' && a.organizacaoId === 'BRANO'));
  assert.ok(atuacoes.some(a => a.pessoaRef === 'BR2' && a.organizacaoId === 'BRANO'), 'quem não está no piloto não é movido');
});
test('atuacoesIniciais: sem a organização do piloto em organizacoes, nada é realocado', () => {
  const { atuacoes, log } = atuacoesIniciais(base(), organizacoesDe(base(), FUSAO_MINI), pilotoMini(), { organizacaoPiloto: 'NAO EXISTE' });
  assert.equal(atuacoes.find(a => a.pessoaRef === 'BR1').organizacaoId, 'BRANO');
  assert.ok(!log.some(l => l.codigo === 'realocado_pelo_piloto'));
});
test('atuacoesIniciais: avaliador inexistente na base é logado como nao_encontrado', () => {
  const p = { 'CAMAREIRA TESTE': { nome: 'x', setor: 'S', equipe: 'S', lider: false, avaliadores: ['FULANO QUE NAO EXISTE'], funcao: 'x', situacao: 'Ativo' } };
  const { atuacoes, log } = iniciais(p);
  assert.equal(atuacoes.find(a => a.pessoaRef === 'CAM').superiorId, null);
  assert.ok(log.some(l => l.codigo === 'avaliador_nao_encontrado' && l.avaliador === 'FULANO QUE NAO EXISTE'));
});
test('atuacoesIniciais: dois avaliadores na mesma organização geram uma atuação por superior (D14), com log', () => {
  const p = { 'COZINHEIRO UM TESTE': { nome: 'x', setor: 'Cozinha', equipe: 'Cozinha', lider: false, avaliadores: ['SUPERVISOR DE GOVERNANCA TESTE', 'GERENTE GERAL TESTE'], funcao: 'x', situacao: 'Ativo' } };
  const { atuacoes, log } = iniciais(p);
  const coz = atuacoesDe(atuacoes, 'COZ1').sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.deepEqual(coz.map(a => [a.id, a.superiorId]), [['GOLDEN|COZ1|1', 'GOLDEN|SUP|1'], ['GOLDEN|COZ1|2', 'GOLDEN|GG|1']]);
  assert.ok(coz.every(a => a.origem === 'inferido_por_cargo' && a.funcao === 'COZINHEIRO'));
  assert.ok(log.some(l => l.codigo === 'duplo_avaliador'));
});
test('atuacoesIniciais: raiz não recebe avaliador do piloto', () => {
  const p = { 'GERENTE GERAL TESTE': { nome: 'x', setor: 's', equipe: 's', lider: true, avaliadores: ['SUPERVISOR DE GOVERNANCA TESTE'], funcao: 'x', situacao: 'Ativo' } };
  const { atuacoes, log } = iniciais(p);
  const gg = atuacoes.find(a => a.pessoaRef === 'GG');
  assert.equal(gg.superiorId, null); assert.equal(gg.ehRaiz, true);
  assert.ok(log.some(l => l.codigo === 'raiz_ignora_avaliador'));
});
test('atuacoesIniciais: gerente geral vira raiz sem mudar a origem; organização sem gerente geral é logada', () => {
  const { atuacoes, log } = iniciais();
  const raizes = atuacoes.filter(a => a.ehRaiz && a.organizacaoId === 'GOLDEN');
  assert.equal(raizes.length, 1); assert.equal(raizes[0].pessoaRef, 'GG'); assert.equal(raizes[0].origem, 'inferido_por_empresa');
  assert.ok(log.some(l => l.codigo === 'organizacao_sem_raiz' && l.mensagem.includes('BRANO')));
  assert.ok(!log.some(l => l.codigo === 'organizacao_sem_raiz' && l.mensagem.includes('LAGHETTO CORPORATIVO')), 'a corporativa nasce vazia por desenho');
});
test('atuacoesIniciais: a corporativa nasce sem nenhuma atuação (R9: sem inferir CEO nem diretores)', () => {
  const { atuacoes } = iniciais(pilotoMini());
  assert.equal(atuacoes.filter(a => a.organizacaoId === 'LAGHETTO CORPORATIVO').length, 0);
});
test('atuacoesIniciais: GOLDEN com piloto passa em validarArvore, com os sem-superior à vista', () => {
  const { atuacoes } = iniciais(pilotoMini());
  validarArvore(atuacoes, 'GOLDEN');
  assert.ok(semSuperior(atuacoes, 'GOLDEN').some(a => a.pessoaRef === 'SUP'));
});
test('atuacoesIniciais: vínculo sem cargo ou sem início é logado, nunca inventado em silêncio', () => {
  const b = base();
  b.vinculos.push({ pessoaId: 'GAR1', regime: 'CLT', empresa: 'BRANO', empresaOriginal: 'BRANO', cargo: null, inicio: null, filial: 'BRANO', codigo: '999', chave: 'BRANO|999' });
  const { atuacoes, log } = atuacoesIniciais(b, organizacoesDe(b, FUSAO_MINI), {});
  const a = atuacoes.find(x => x.pessoaRef === 'GAR1' && x.organizacaoId === 'BRANO');
  assert.ok(a);
  assert.ok(log.some(l => l.codigo === 'cargo_ausente' && l.pessoaId === 'GAR1'));
  assert.ok(log.some(l => l.codigo === 'inicio_ausente' && l.pessoaId === 'GAR1'));
});
test('montarEstado com a estrutura corporativa definida: árvore corporativa válida e GG com duas atuações', () => {
  const extras = lerFixture('atuacoes-corporativo-mini.json');
  const e = montarEstado(base(), pilotoMini(), extras, FUSAO_MINI);
  validarArvore(e.atuacoes, 'LAGHETTO CORPORATIVO');
  assert.equal(atuacoesDe(e.atuacoes, 'GG').length, 2);
  assert.equal(e.pessoasPorId.get('GG').nome, 'GERENTE GERAL TESTE');
  assert.equal(e.organizacoes.length, 3);
  assert.ok(e.atuacoes.find(a => a.id === 'LAGHETTO CORPORATIVO|GG|1').confirmadaPor === 'RH TESTE');
});
test('montarEstado dá id estável ao extra sem id', () => {
  const e = montarEstado(base(), {}, [{ pessoaRef: 'CEO-REDE', organizacaoId: 'LAGHETTO CORPORATIVO', funcao: 'CEO DA REDE', ehRaiz: true, inicio: '2026-01-10' }], FUSAO_MINI);
  assert.equal(e.atuacoes.find(a => a.pessoaRef === 'CEO-REDE').id, 'LAGHETTO CORPORATIVO|CEO-REDE|1');
});
test('base real: PJ inferidos, pool sem organização, raiz do Golden', { skip: !temDadosReais }, () => {
  const baseReal = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const piloto = JSON.parse(fs.readFileSync('app/data/piloto-golden.json', 'utf8'));
  const orgs = organizacoesDe(baseReal);
  const { atuacoes, semOrganizacao, log } = atuacoesIniciais(baseReal, orgs, piloto);
  const inferidas = atuacoes.filter(a => a.origem === 'inferido_por_empresa');
  const porMetodo = {};
  for (const a of inferidas) porMetodo[a.metodoInferencia] = (porMetodo[a.metodoInferencia] ?? 0) + 1;
  const porCodigo = {};
  for (const l of log) porCodigo[l.codigo] = (porCodigo[l.codigo] ?? 0) + 1;
  const golden = atuacoes.filter(a => a.organizacaoId === 'HOTEL LAGHETTO GOLDEN');
  const raizesGolden = golden.filter(a => a.ehRaiz);
  console.log(`# organizações: ${orgs.length}; atuações: ${atuacoes.length}; inferidas por empresa: ${inferidas.length} ${JSON.stringify(porMetodo)}; sem organização: ${semOrganizacao.length}`);
  console.log(`# atuações no Golden: ${golden.length}; raízes: ${raizesGolden.map(a => a.pessoaRef + ' ' + a.funcao).join(', ')}; log por código: ${JSON.stringify(porCodigo)}`);
  const semPiloto = atuacoesIniciais(baseReal, orgs, {});
  assert.equal(semPiloto.semOrganizacao.length - (porCodigo.atuacao_criada_pelo_piloto ?? 0), semOrganizacao.length, 'o pool diminui exatamente pelas atuações criadas pelo piloto');
  const invalidas = log.filter(l => l.codigo === 'arvore_invalida_na_carga');
  const outros = invalidas.filter(l => l.erro !== 'sem_raiz');
  console.log(`# arvore_invalida_na_carga: ${invalidas.length} (sem_raiz: ${invalidas.length - outros.length}; outros códigos: ${JSON.stringify(outros.map(l => [l.organizacaoId, l.erro]))})`);
  validarArvore(atuacoes, 'HOTEL LAGHETTO GOLDEN');
  assert.ok(!invalidas.some(l => l.organizacaoId === 'HOTEL LAGHETTO GOLDEN'));
  assert.deepEqual(outros, [], 'toda árvore inválida fora a do Golden é só sem_raiz');
  assert.ok(inferidas.length >= 100);
  assert.ok(semOrganizacao.length >= 100 && semOrganizacao.length <= 140);
  assert.equal(raizesGolden.length, 1);
  assert.equal(raizesGolden[0].podeLiderar, true, 'R23: a raiz do Golden nasce líder');
  const comSubReal = new Set(atuacoes.map(a => a.superiorId).filter(Boolean));
  assert.ok(atuacoes.filter(a => comSubReal.has(a.id)).every(a => a.podeLiderar), 'R23: todo superior da carga é líder');
  console.log(`# criadas pelo piloto (só PJ sem organização): ${porCodigo.atuacao_criada_pelo_piloto ?? 0}; realocadas: ${porCodigo.realocado_pelo_piloto ?? 0}; mantidas (múltiplas): ${porCodigo.realocado_pelo_piloto_multiplas ?? 0}`);
  assert.equal(porCodigo.avaliador_fora_da_organizacao ?? 0, 0, 'todo avaliador do piloto tem atuação no Golden');
  assert.ok((porCodigo.realocado_pelo_piloto ?? 0) >= 1);
  if (golden.filter(a => ['GERENTE GERAL', 'GERENTE GERAL SENIOR'].includes(a.funcao.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase())).length > 1) {
    assert.ok(log.some(l => l.codigo === 'multiplas_raizes_candidatas' && l.organizacaoId === 'HOTEL LAGHETTO GOLDEN'));
  }
  assert.equal(new Set(atuacoes.map(a => a.id)).size, atuacoes.length, 'ids únicos');
});

test('atuacoesIniciais: ciclo vindo do piloto é logado como arvore_invalida_na_carga, sem desfazer nada', () => {
  const p = pilotoMini();
  p['SUPERVISOR DE GOVERNANCA TESTE'] = { ...p['SUPERVISOR DE GOVERNANCA TESTE'], avaliadores: ['CAMAREIRA TESTE'] };   // CAM avalia SUP e SUP avalia CAM
  const { atuacoes, log } = iniciais(p);
  const l = log.find(x => x.codigo === 'arvore_invalida_na_carga' && x.organizacaoId === 'GOLDEN');
  assert.equal(l.erro, 'ciclo');
  assert.equal(atuacoes.find(a => a.pessoaRef === 'CAM').superiorId, 'GOLDEN|SUP|1', 'nada é desfeito');
  assert.ok(!log.some(x => x.codigo === 'arvore_invalida_na_carga' && x.organizacaoId === 'LAGHETTO CORPORATIVO' && x.erro !== 'sem_raiz'));
});
test('atuacoesIniciais: exclusões silenciosas viram log (PJ ignorado, pessoa sem vínculo, pessoa inexistente)', () => {
  const b = base();
  b.pessoas.push({ id: 'ORFA', nome: 'PESSOA SEM VINCULO TESTE', status: 'ativo', motivoStatus: null, cpfHash: null, faixaEtaria: null, nomesAlternativos: [] });
  b.vinculos.push({ pessoaId: 'FANTASMA', regime: 'CLT', empresa: 'BRANO', empresaOriginal: 'BRANO', cargo: 'X', inicio: '2022-01-01', filial: 'BRANO', codigo: '1', chave: 'BRANO|1' });
  b.vinculos.push({ pessoaId: 'CAM', regime: 'PJ', empresa: 'EMPRESA SEM FILIAL', empresaOriginal: 'EMPRESA SEM FILIAL LTDA', cargo: 'CONSULTOR', inicio: '2026-01-10' });
  const { log } = atuacoesIniciais(b, organizacoesDe(b, FUSAO_MINI), {}, { organizacaoPiloto: 'GOLDEN' });
  assert.ok(log.some(l => l.codigo === 'vinculo_pj_sem_organizacao_ignorado' && l.pessoaId === 'CAM' && l.empresa === 'EMPRESA SEM FILIAL'));
  assert.ok(log.some(l => l.codigo === 'pessoa_sem_vinculo' && l.pessoaId === 'ORFA'));
  assert.ok(log.some(l => l.codigo === 'pessoa_inexistente' && l.pessoaId === 'FANTASMA'));
});
test('atuacoesIniciais: regime desconhecido é logado e tratado como PJ', () => {
  const b = base();
  b.vinculos.push({ pessoaId: 'GAR1', regime: 'ESTAGIO', empresa: 'BRANO', empresaOriginal: 'BRANO', cargo: 'ESTAGIARIO', inicio: '2026-01-10' });
  const { atuacoes, log } = atuacoesIniciais(b, organizacoesDe(b, FUSAO_MINI), {}, { organizacaoPiloto: 'GOLDEN' });
  assert.ok(log.some(l => l.codigo === 'regime_desconhecido' && l.regime === 'ESTAGIO'));
  const a = atuacoes.find(x => x.pessoaRef === 'GAR1' && x.organizacaoId === 'BRANO');
  assert.equal(a.origem, 'inferido_por_empresa');
});
test('atuacoesIniciais: tabela de equivalência vazia é logada uma vez', () => {
  const { log } = atuacoesIniciais(base(), organizacoesDe(base(), FUSAO_MINI), {}, { equivalencias: [], organizacaoPiloto: 'GOLDEN' });
  assert.equal(log.filter(l => l.codigo === 'tabela_equivalencia_indisponivel').length, 1);
  assert.equal(iniciais().log.filter(l => l.codigo === 'tabela_equivalencia_indisponivel').length, 0);
});
