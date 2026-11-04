// C2 (revisão final do Plano B): uma regra só para "precisa de líder", lida pelas quatro telas e pela trava.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { montarEstado } from './helpers/estado.js';
import { reconstruirViews, precisaDeLider, semLider, atuacoesSemLider, definirCampoPessoa, marcarLider, ehCorrente } from '../app/js/adaptador.js';
import { resumoOrganizacao } from '../app/js/arvore-ui.js';
import { filaDePendencias, contagemPorCodigo, TRAVAM_CICLO, DESCRICOES } from '../app/js/modelo/pendencias.js';
import { podeAbrirCiclo, adicionarEmBloco, pool } from '../app/js/modelo/montagem.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN', atuacoesExtras: lerFixture('atuacoes-corporativo-mini.json') };
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
const idDe = (S, pessoa, org = 'GOLDEN') => S.atuacoes.find(a => a.pessoaRef === pessoa && a.organizacaoId === org && ehCorrente(a)).id;

function estado() {
  const e = montarEstado(lerFixture('base-mini.json'), lerFixture('piloto-mini.json'), lerFixture('atuacoes-corporativo-mini.json'), FUSAO_MINI);
  const S = { ...e, pessoas: e.base.pessoas, piloto: lerFixture('piloto-mini.json'), perfil: null, organizacaoSelecionada: 'GOLDEN' };
  reconstruirViews(S);
  return S;
}

/** Os quatro números da tela para a organização selecionada, cada um lido de onde a tela o mostra. */
function quatroNumeros(window, document, S) {
  window.irPara('matriz');
  const chip = document.querySelector('#m-pendentes');
  const matriz = chip.hidden ? 0 : Number(/^(\d+) sem avaliador$/.exec(chip.textContent)[1]);
  window.irPara('rh');
  const kpi = [...document.querySelectorAll('#rh-kpis .kpi')].find(k => /Sem avaliador/.test(k.textContent));
  const painel = Number(kpi.querySelector('.v').textContent);
  window.irPara('arvore');
  const faixa = document.querySelector('#ar-sem-lider .ar-faixa b');
  const arvoreLista = document.querySelector('#ar-sem-lider').hidden || !/^Sem líder/.test(faixa.textContent) ? 0 : Number(/Sem líder: (\d+)/.exec(faixa.textContent)[1]);
  const medidor = resumoOrganizacao(S, S.organizacaoSelecionada).semSuperior;
  window.irPara('pendencias');
  const chipPe = document.querySelector('#pe-chips [data-codigo="sem_superior"] b');
  const pendencias = chipPe ? Number(chipPe.textContent) : 0;
  return { matriz, painel, arvoreLista, medidor, pendencias };
}

test('precisaDeLider: corrente, não raiz, Ativo ou Férias; semLider exige ainda não ter superior', () => {
  const base = { id: 'x', situacao: 'ativa', fim: null, ehRaiz: false, superiorId: null };
  assert.equal(precisaDeLider({}, base), true, 'sem situação registrada vale Ativo');
  assert.equal(precisaDeLider({}, { ...base, situacaoColab: 'Férias' }), true);
  assert.equal(precisaDeLider({}, { ...base, situacaoColab: 'Desligado' }), false);
  assert.equal(precisaDeLider({}, { ...base, situacaoColab: 'Afastado' }), false);
  assert.equal(precisaDeLider({}, { ...base, ehRaiz: true }), false);
  assert.equal(precisaDeLider({}, { ...base, fim: '2026-11-01' }), false);
  assert.equal(precisaDeLider({}, undefined), false);
  assert.equal(semLider({}, base), true);
  assert.equal(semLider({}, { ...base, superiorId: 'y' }), false);
});

test('C2: marcar Desligado na Matriz deixa Matriz, Painel, Árvore e Pendências com o mesmo número', async () => {
  const { window, document, S, erros } = await carregarPagina(lerFixture('base-mini.json'), lerFixture('piloto-mini.json'), null, OPCOES);
  window.eval(ADMIN);
  window.eval("trocarOrganizacao('GOLDEN')");
  const antes = quatroNumeros(window, document, S);
  assert.equal(new Set(Object.values(antes)).size, 1, `antes: ${JSON.stringify(antes)}`);
  /* a camareira tem líder (SUP); desligada, o adaptador tira o superior: ela sai do ciclo e não pode virar "sem líder" */
  const cam = S.atuacoes.find(a => a.id === 'GOLDEN|CAM|1');
  assert.ok(cam.superiorId, 'premissa: a camareira tem líder');
  window.irPara('matriz');
  const sel = document.querySelector('[data-si="CAM"]');
  sel.value = 'Desligado'; sel.dispatchEvent(new window.Event('change'));
  assert.equal(cam.situacaoColab, 'Desligado');
  assert.equal(cam.superiorId, null, 'desligado fica sem superior');
  const depois = quatroNumeros(window, document, S);
  assert.equal(new Set(Object.values(depois)).size, 1, `depois: ${JSON.stringify(depois)}`);
  assert.equal(depois.matriz, antes.matriz, 'a camareira desligada não entra como sem líder');
  assert.equal(depois.matriz, atuacoesSemLider(S, 'GOLDEN').length);
  /* a trava conta o mesmo */
  const t = window.LGH.montagem.podeAbrirCiclo(S, 'GOLDEN');
  assert.equal(t.codigo, 'sem_superior');
  assert.match(t.motivo, new RegExp(`^${depois.matriz} `));
  const r = resumoOrganizacao(S, 'GOLDEN');
  assert.equal(r.foraDoCiclo, 1);
  assert.equal(r.total, r.raiz + r.foraDoCiclo + r.comSuperior + r.semSuperior);
  assert.equal(r.precisamDeLider, r.definidos + r.inferidos + r.comLiderOutraOrigem + r.semLiderCarga + r.semLiderRH);
  assert.deepEqual(erros.map(String), []);
});

test('C2: líder desligado com equipe gera superior_desligado, aparece na Árvore e trava o ciclo', () => {
  const S = estado();
  const gg = idDe(S, 'GG');
  /* tudo resolvido: todo o pool vai para o gerente geral, e a camareira continua sob SUP */
  assert.equal(adicionarEmBloco(S, pool(S, 'GOLDEN').map(a => a.id), gg, 'RH', '2026-11-04').ok, true);
  assert.deepEqual(podeAbrirCiclo(S, 'GOLDEN'), { pode: true, motivo: null, codigo: null }, JSON.stringify(podeAbrirCiclo(S, 'GOLDEN')));
  const cam = S.atuacoes.find(a => a.id === idDe(S, 'CAM'));
  assert.equal(cam.superiorId, idDe(S, 'SUP'));
  definirCampoPessoa(S, 'SUP', 'GOLDEN', 'situacao', 'Desligado');
  const fila = filaDePendencias(S, 'GOLDEN');
  const itens = fila.filter(i => i.codigo === 'superior_desligado');
  assert.equal(itens.length, 1);
  assert.equal(itens[0].atuacaoId, cam.id);
  assert.equal(itens[0].pessoaId, 'CAM');
  assert.match(itens[0].descricao, /o líder desta pessoa foi desligado; defina outro líder/i);
  assert.equal(contagemPorCodigo(fila).sem_superior ?? 0, 0, 'o próprio desligado não vira sem líder');
  assert.ok(TRAVAM_CICLO.includes('superior_desligado'));
  assert.ok(DESCRICOES.superior_desligado.acaoSugerida);
  const t = podeAbrirCiclo(S, 'GOLDEN');
  assert.equal(t.pode, false);
  assert.equal(t.codigo, 'superior_desligado');
  assert.equal(t.motivo, '1 pessoa com líder desligado');
  /* afastado como subordinado de líder desligado não trava (está fora do ciclo) */
  definirCampoPessoa(S, 'CAM', 'GOLDEN', 'situacao', 'Afastado');
  assert.equal(filaDePendencias(S, 'GOLDEN').filter(i => i.codigo === 'superior_desligado').length, 0);
  assert.equal(podeAbrirCiclo(S, 'GOLDEN').pode, true);
});

test('C2: na tela, líder desligado com equipe aparece em "Fora do ciclo, com equipe" e a equipe não some', async () => {
  const { window, document, S, erros } = await carregarPagina(lerFixture('base-mini.json'), lerFixture('piloto-mini.json'), null, OPCOES);
  window.eval(ADMIN);
  window.eval("trocarOrganizacao('GOLDEN')");
  window.irPara('matriz');
  const sel = document.querySelector('[data-si="SUP"]');
  sel.value = 'Desligado'; sel.dispatchEvent(new window.Event('change'));
  window.irPara('arvore');
  const fora = document.querySelector('#ar-fora-ciclo');
  assert.ok(fora, 'faixa dos fora do ciclo com equipe');
  assert.match(fora.textContent, /Fora do ciclo, com equipe: 1/);
  assert.match(fora.textContent, /Desligado/);
  assert.ok([...document.querySelectorAll('#ar-sem-lider .ar-caixa')].some(c => c.dataset.atuacao === 'GOLDEN|CAM|1'), 'a camareira continua visível');
  assert.ok(![...document.querySelectorAll('#ar-sem-lider .ar-faixa:not(#ar-fora-ciclo) li button')].some(b => b.dataset.alvo === 'GOLDEN|SUP|1'), 'o desligado não está em Sem líder');
  window.irPara('pendencias');
  assert.equal(document.querySelector('#pe-chips [data-codigo="superior_desligado"] b').textContent, '1');
  assert.deepEqual(erros.map(String), []);
});

test('marcarLider no adaptador não mexe na regra: a raiz nunca precisa de líder', () => {
  const S = estado();
  const gg = idDe(S, 'GG');
  marcarLider(S, gg, false);
  assert.equal(precisaDeLider(S, S.atuacoes.find(a => a.id === gg)), false);
});

test('M4: Desligado é atômico; se limparSuperiores recusar, a situação não muda e a tela diz por quê', async () => {
  const { window, document, S, erros } = await carregarPagina(lerFixture('base-mini.json'), lerFixture('piloto-mini.json'), null, OPCOES);
  window.eval(ADMIN);
  window.eval("trocarOrganizacao('GOLDEN')");
  window.irPara('matriz');
  const cam = S.atuacoes.find(a => a.id === 'GOLDEN|CAM|1');
  const sup = cam.superiorId;
  const passos = window.eval('HIST.length');
  /* recusa simulada do adaptador: o resto do LGH continua o de verdade */
  window.LGH = Object.assign({}, window.LGH, { limparSuperiores: () => ({ ok: false, codigo: 'recusa_teste', mensagem: 'recusa simulada' }) });
  const sel = document.querySelector('[data-si="CAM"]');
  sel.value = 'Desligado'; sel.dispatchEvent(new window.Event('change'));
  assert.equal(cam.situacaoColab ?? 'Ativo', 'Ativo', 'situação não mudou');
  assert.equal(cam.superiorId, sup, 'superior continua');
  assert.equal(window.eval('HIST.length'), passos, 'recusa não deixa passo vazio no Desfazer');
  assert.match(document.querySelector('#lote-msg').textContent, /Não foi possível mudar a situação de .* para Desligado: recusa simulada/);
  assert.equal(document.querySelector('[data-si="CAM"]').value, 'Ativo', 'a tela volta a mostrar a situação real');
  assert.deepEqual(erros.map(String), []);
});

test('M2: marca de líder precisa ser estritamente true; ausente é recusada em todas as escritas', async () => {
  const ad = await import('../app/js/adaptador.js');
  const mo = await import('../app/js/modelo/montagem.js');
  assert.equal(ad.temMarcaDeLider({ podeLiderar: true }), true);
  for (const v of [undefined, null, false, 1, 'sim']) assert.equal(ad.temMarcaDeLider({ podeLiderar: v }), false, String(v));
  const S = estado();
  const sup = S.atuacoes.find(a => a.id === idDe(S, 'SUP'));
  delete sup.podeLiderar;
  const coz = idDe(S, 'COZ1');
  assert.equal(ad.definirSuperior(S, coz, sup.id, 'RH').codigo, 'superior_sem_marca_de_lider');
  assert.equal(ad.definirUnicoSuperior(S, 'COZ1', 'GOLDEN', sup.id, 'RH').codigo, 'superior_sem_marca_de_lider');
  assert.equal(ad.criarAtuacaoNaOrganizacao(S, { pessoaId: 'GAR1', organizacaoId: 'GOLDEN', superiorAtuacaoId: sup.id, funcao: 'X', autor: 'RH' }).codigo, 'superior_sem_marca_de_lider');
  assert.equal(mo.adicionarEmBloco(S, [coz], sup.id, 'RH').codigo, 'superior_sem_marca_de_lider');
  const dr = S.atuacoes.find(a => a.id === idDe(S, 'DR', 'LAGHETTO CORPORATIVO'));
  delete dr.podeLiderar;
  assert.equal(mo.adicionarNaRede(S, ['p:PJ-SEM-ORG'], dr.id, 'RH').codigo, 'superior_sem_marca_de_lider');
  assert.equal(S.atuacoes.find(a => a.id === coz).superiorId, null, 'nada mudou');
});

test('M3: tirar a marca de líder de quem tem equipe é recusado mesmo com homônimo na base', async () => {
  const b = lerFixture('base-mini.json');
  const nomeSup = b.pessoas.find(p => p.id === 'SUP').nome;
  b.pessoas.find(p => p.id === 'GAR1').nome = nomeSup;   /* homônimo sintético do supervisor */
  const { window, S, erros } = await carregarPagina(b, lerFixture('piloto-mini.json'), null, OPCOES);
  window.eval(ADMIN);
  window.eval("trocarOrganizacao('GOLDEN')");
  assert.equal(window.LGH.pessoaIdPorNome(S, nomeSup), null, 'premissa: o nome sozinho não resolve');
  const r = window.eval("LGH_LID.definirLider(PESSOAS.find((p) => p.id === 'SUP'), false)");
  assert.equal(r.ok, false);
  assert.match(r.msg, /ainda avalia 1 pessoa/);
  assert.equal(S.atuacoes.find(a => a.id === 'GOLDEN|SUP|1').podeLiderar, true, 'a marca ficou');
  assert.equal(window.eval("avaliadosDe('SUP').length"), 1, 'o id resolve');
  assert.deepEqual(erros.map(String), []);
});

test('C2 (reconferência): o pool do painel de montagem segue a mesma regra; desligado e afastado não entram', () => {
  const S = estado();
  const sup = idDe(S, 'SUP'), coz = idDe(S, 'COZ1');
  const antes = pool(S, 'GOLDEN').map(a => a.id);
  assert.ok(antes.includes(sup) && antes.includes(coz), 'premissa: os dois estão no pool');
  definirCampoPessoa(S, 'SUP', 'GOLDEN', 'situacao', 'Desligado');
  definirCampoPessoa(S, 'COZ1', 'GOLDEN', 'situacao', 'Afastado');
  const depois = pool(S, 'GOLDEN').map(a => a.id);
  assert.ok(!depois.includes(sup) && !depois.includes(coz));
  assert.deepEqual(depois.sort(), atuacoesSemLider(S, 'GOLDEN').map(a => a.id).sort(), 'pool = atuações sem líder da regra única');
});
