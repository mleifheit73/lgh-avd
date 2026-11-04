import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';
import { semSuperior, atuacoesDe } from '../app/js/modelo/atuacao.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const OPCOES_CORP = { ...OPCOES, atuacoesExtras: lerFixture('atuacoes-corporativo-mini.json') };
const CORP = 'LAGHETTO CORPORATIVO';
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const pilotoDuplo = () => { const p = piloto(); p['CAMAREIRA TESTE'].avaliadores = ['SUPERVISOR DE GOVERNANCA TESTE', 'GERENTE GERAL TESTE']; return p; };
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})";
const ADMIN = "entrar({nome:'Teste Holding', cargo:'RH', papel:'admin', nivel:'N6'})";
const correntes = (S, org) => JSON.parse(JSON.stringify(S.atuacoes)).filter(a => a.organizacaoId === org && a.situacao === 'ativa' && a.fim == null);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
/** Partes do medidor calculadas direto de S.atuacoes: denominador = atuações correntes menos a raiz. */
function partes(S, org) {
  const l = correntes(S, org).filter(a => !a.ehRaiz);
  const com = l.filter(a => a.superiorId);
  const inf = com.filter(a => /^inferido_/.test(a.origem)).length, def = com.filter(a => a.origem === 'definido').length;
  const soltas = l.filter(a => !a.superiorId);
  return { M: l.length, N: com.length, inf, def, outra: com.length - inf - def,
    semCarga: soltas.filter(a => a.origem !== 'definido').length, semRH: soltas.filter(a => a.origem === 'definido').length };
}
const medidorEsperado = p => `${p.N} de ${p.M} com líder`;
const detalheEsperado = p => `${plural(p.def, 'definido', 'definidos')} pelo RH · ${plural(p.inf, 'inferido', 'inferidos')} pela carga`;
const compactoEsperado = p => `${p.N} de ${p.M} com líder · ${plural(p.inf, 'inferido', 'inferidos')}`;
const REGIONAL = "entrar({nome:'Teste Regional', cargo:'RH', papel:'rh_regional', nivel:'N5'})";
const GG_AVALIADOR = "entrar({nome:'Gerente Geral Teste', cargo:'Gerente geral', papel:'avaliador', nivel:'N4'})";
const temRede = sel => [...sel.options].some(o => o.value === CORP || /Rede/.test(o.textContent));
const caixa = (document, id) => [...document.querySelectorAll('.ar-caixa')].find(c => c.dataset.atuacao === id);
function escolher(window, document, sel, valor) {
  const el = document.querySelector(sel); el.value = valor; el.dispatchEvent(new window.Event('change'));
}

test('Árvore: aba logo depois da Matriz, exige verMatriz', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH);
  const abas = [...document.querySelectorAll('#nav button')].map(b => b.dataset.tela);
  assert.equal(abas[abas.indexOf('matriz') + 1], 'arvore');
  assert.equal(document.querySelector('#nav [data-tela="arvore"]').textContent.replace(/^\d+/, ''), 'Árvore');
  assert.ok(document.querySelector('#t-arvore'));
});

test('Árvore da unidade: medidor bate com resumoOrganizacao, toda atuação tem caixa, Sem líder lista os nomes', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH); window.irPara('arvore');
  assert.equal(document.querySelector('#t-arvore').hidden, false);
  const p = partes(S, 'GOLDEN'); const med = document.querySelector('#ar-medidor').textContent;
  assert.ok(med.includes(medidorEsperado(p)), med);
  assert.ok(med.includes(detalheEsperado(p)), med);
  assert.ok(!/com líder definido/.test(med), 'título não mistura inferido com definido');
  if (p.semCarga) assert.ok(med.includes(`${p.semCarga} da carga, sem líder`), med);
  assert.equal(p.def + p.inf + p.outra + p.semCarga + p.semRH, p.M);
  const ids = [...document.querySelectorAll('#t-arvore .ar-caixa')].map(c => c.dataset.atuacao).sort();
  assert.deepEqual(ids, [...correntes(S, 'GOLDEN').map(a => a.id)].sort());
  const sem = document.querySelector('#ar-sem-lider');
  assert.equal(sem.querySelectorAll('[data-alvo]').length, semSuperior(S.atuacoes, 'GOLDEN').length);
  assert.match(sem.textContent, /Supervisor de Governança Teste/, 'nome de exibição do piloto');
  for (const a of semSuperior(S.atuacoes, 'GOLDEN')) assert.ok(caixa(document, a.id).classList.contains('ar-sem-superior'), a.id);
  assert.ok(!caixa(document, 'GOLDEN|GG|1').classList.contains('ar-sem-superior'));
  const leg = document.querySelector('#ar-legenda').textContent;
  for (const t of ['Da carga, sem superior', 'Inferido pelo cargo', 'Inferido pela empresa', 'Definido pelo RH']) assert.match(leg, new RegExp(t));
});

test('Árvore: trocar de organização re-renderiza, e os dois seletores andam juntos', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(REGIONAL); window.irPara('arvore');   /* I1 (R12): o RH da unidade só tem a sua; quem troca é o regional */
  escolher(window, document, '#ar-org', 'BRANO');
  assert.equal(S.organizacaoSelecionada, 'BRANO');
  assert.equal(document.querySelector('#org-seletor').value, 'BRANO');
  const pb = partes(S, 'BRANO'); const med = document.querySelector('#ar-medidor').textContent;
  assert.ok(med.includes(medidorEsperado(pb)) && med.includes(detalheEsperado(pb)), med);
  assert.ok(med.includes(`${pb.semCarga} da carga, sem líder`), med);
  assert.match(document.querySelector('#ar-arvore').textContent, /não tem raiz/);
  assert.equal(document.querySelectorAll('#t-arvore .ar-caixa').length, correntes(S, 'BRANO').length);
  assert.match(document.querySelector('#ar-cabecalho').textContent, /sem gerente geral/i);
  escolher(window, document, '#org-seletor', 'GOLDEN');
  assert.equal(document.querySelector('#ar-org').value, 'GOLDEN');
  assert.ok(caixa(document, 'GOLDEN|GG|1'));
  const emp = [...document.querySelector('#ar-empresa').options].map(o => o.value);
  assert.deepEqual(emp, [...document.querySelector('#org-empresa').options].map(o => o.value));
});

test('visão Rede: Golden como cartão fechado na caixa do gerente geral sob o DR; Brano sem ligação; clique abre a unidade', async () => {
  const { window, document, S, erros } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
  window.eval(ADMIN); window.irPara('arvore');
  const op = [...document.querySelector('#ar-org').options].find(o => o.value === CORP);
  assert.match(op.textContent, /Rede \(estrutura corporativa\)/);
  escolher(window, document, '#ar-org', CORP);
  assert.equal(S.organizacaoSelecionada, CORP);
  const cartao = document.querySelector('[data-unidade="GOLDEN"]');
  assert.ok(cartao);
  assert.equal(cartao.closest('.ar-caixa').dataset.atuacao, 'LAGHETTO CORPORATIVO|GG|1');
  const pai = cartao.closest('.ar-caixa').closest('ul').closest('li').querySelector(':scope > .ar-caixa');
  assert.equal(pai.dataset.atuacao, 'LAGHETTO CORPORATIVO|DR|1');
  assert.match(cartao.textContent, /Gerente geral: GERENTE GERAL TESTE/);
  const pg = partes(S, 'GOLDEN');
  assert.ok(cartao.textContent.includes(compactoEsperado(pg)), cartao.textContent);
  assert.ok(pg.semCarga + pg.semRH > 0);
  assert.ok(cartao.classList.contains('ar-unidade-vermelha'), 'unidade com gente sem líder fica vermelha na Rede');
  const faixa = document.querySelector('#ar-sem-ligacao').textContent;
  assert.match(faixa, /Unidades sem ligação ao corporativo: 1/); assert.match(faixa, /BRANO/); assert.match(faixa, /raiz/);
  const pool = window.LGH.poolSemOrganizacao(S).length;
  assert.match(document.querySelector('#ar-pool').textContent, new RegExp(`${pool === 0 ? 'Nenhuma pessoa' : pool} sem organização`));
  cartao.click();
  assert.equal(S.organizacaoSelecionada, 'GOLDEN');
  assert.equal(document.querySelector('#ar-org').value, 'GOLDEN');
  const cab = document.querySelector('#ar-cabecalho');
  assert.match(cab.textContent, /Gerente geral: GERENTE GERAL TESTE · avaliado por: DIRETOR REGIONAL TESTE \(estrutura corporativa\)/);
  cab.querySelector('[data-ir-org]').click();
  assert.equal(S.organizacaoSelecionada, CORP);
  assert.deepEqual(erros.map(String), [], 'nenhum erro no console da página');
});

test('cabeçalho da unidade: sem estrutura corporativa, o gerente geral aparece sem ligação, em vermelho', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(ADMIN); window.irPara('arvore');
  const alerta = document.querySelector('#ar-cabecalho .ar-alerta');
  assert.ok(alerta); assert.match(alerta.textContent, /sem ligação ao corporativo/);
  escolher(window, document, '#ar-org', CORP);
  assert.match(document.querySelector('#ar-arvore').textContent, /não tem raiz/);
  assert.match(document.querySelector('#ar-sem-ligacao').textContent, /Unidades sem ligação ao corporativo: 2/);
});

test('avaliador não vê a opção Rede: só as organizações onde atua', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
  window.eval("entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})");
  window.irPara('arvore');
  const ops = [...document.querySelector('#ar-org').options];
  assert.ok(!ops.some(o => o.value === CORP || /Rede/.test(o.textContent)));
  assert.deepEqual(ops.map(o => o.value), JSON.parse(JSON.stringify(window.LGH.organizacoesVisiveis(S).map(o => o.id))));
});

test('pessoa com duas atuações aparece em duas caixas na tela', async () => {
  const { window, document, S } = await carregarPagina(base(), pilotoDuplo(), null, OPCOES);
  window.eval(RH); window.irPara('arvore');
  const cam = [...document.querySelectorAll('#t-arvore .ar-caixa')].filter(c => c.dataset.pessoa === 'CAM');
  assert.equal(cam.length, atuacoesDe(S.atuacoes, 'CAM').length);
  assert.equal(cam.length, 2);
  assert.ok(cam.every(c => /Camareira Teste/.test(c.textContent)));
});

test('clique na caixa seleciona a atuação e avisa; recolher não redesenha; Sem líder marca a caixa', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval(RH); window.irPara('arvore');
  let evento = null;
  document.addEventListener('lgh-arvore-selecionada', e => { evento = e.detail.atuacaoId; });
  const rec = caixa(document, 'GOLDEN|REC1|1');
  rec.querySelector('.ar-nome').click();
  assert.equal(S.arSelecionada, 'GOLDEN|REC1|1'); assert.equal(evento, 'GOLDEN|REC1|1');
  assert.ok(rec.classList.contains('ar-ativa'));
  caixa(document, 'GOLDEN|GG|1').click();
  assert.ok(!rec.classList.contains('ar-ativa'));
  const gg = caixa(document, 'GOLDEN|GG|1'); const btn = gg.querySelector('.ar-colapso');
  const filhos = gg.parentElement.querySelector(':scope > ul');
  assert.equal(filhos.hidden, false);
  S.arSelecionada = null; btn.click();
  assert.equal(filhos.hidden, true); assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(S.arSelecionada, null, 'o botão de recolher não seleciona a caixa');
  assert.ok(document.contains(gg), 'mesmo nó: não houve re-render');
  btn.click(); assert.equal(filhos.hidden, false);
  btn.click();
  const nome = document.querySelector('#ar-sem-lider [data-alvo="GOLDEN|SUP|1"]');
  nome.click();
  assert.ok(caixa(document, 'GOLDEN|SUP|1').classList.contains('ar-marcada'));
});

test('visão Rede: cartão da unidade sai do vermelho quando todos têm líder', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
  window.eval(ADMIN);
  for (const a of window.LGH.semSuperior(S.atuacoes, 'GOLDEN')) assert.equal(window.LGH.definirSuperior(S, a.id, 'GOLDEN|GG|1', 'RH Teste').ok, true, a.id);
  window.eval('reconstruirViews()');
  window.irPara('arvore'); escolher(window, document, '#ar-org', CORP);
  const cartao = document.querySelector('[data-unidade="GOLDEN"]');
  assert.ok(!cartao.classList.contains('ar-unidade-vermelha'));
  const pg = partes(S, 'GOLDEN'); assert.equal(pg.N, pg.M);
  assert.ok(cartao.textContent.includes(compactoEsperado(pg)), cartao.textContent);
});

test('verRede (R12/R21): só RH regional e holding; recurso registrado com esses dois papéis', async () => {
  const { window } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
  assert.deepEqual(JSON.parse(window.eval("JSON.stringify(RECURSOS.find(r=>r.k==='verRede'))")),
    { k: 'verRede', n: 'Ver a estrutura corporativa (visão Rede)', p: ['rh_regional', 'admin'] });
});

for (const [rotulo, login, ve] of [['admin', ADMIN, true], ['rh_regional', REGIONAL, true], ['rh_unidade', RH, false], ['avaliador que é gerente geral e tem atuação corporativa', GG_AVALIADOR, false]]) {
  test(`opção Rede, cartões e faixa de ligação: ${rotulo} ${ve ? 'vê' : 'não vê'}`, async () => {
    const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES_CORP);
    window.eval(login); window.irPara('arvore');
    assert.equal(temRede(document.querySelector('#ar-org')), ve);
    assert.equal(temRede(document.querySelector('#org-seletor')), ve);
    if (ve) {
      assert.match([...document.querySelector('#org-seletor').options].find(o => o.value === CORP).textContent, /Rede \(estrutura corporativa\)/);
      escolher(window, document, '#ar-org', CORP);
      assert.ok(document.querySelector('[data-unidade="GOLDEN"]'));
      assert.equal(document.querySelector('#ar-sem-ligacao').hidden, false);
      return;
    }
    if (rotulo.startsWith('avaliador')) {
      assert.ok(S.atuacoes.some(a => a.pessoaRef === 'GG' && a.organizacaoId === CORP), 'a pessoa tem atuação corporativa');
      assert.notEqual(S.organizacaoSelecionada, CORP);
    }
    escolher(window, document, '#ar-org', 'GOLDEN');
    assert.equal(document.querySelector('[data-unidade]'), null);
    assert.equal(document.querySelector('#ar-sem-ligacao').hidden, true);
    assert.equal(document.querySelector('#ar-cabecalho [data-ir-org]'), null, 'sem link para a Rede');
    assert.match(document.querySelector('#ar-cabecalho').textContent, /avaliado por/);
  });
}

test('P28: avaliador vê na Árvore só a própria subárvore (as atuações dele e quem está abaixo), sem medidor nem Sem líder da organização', async () => {
  const { window, document, S } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})"); window.irPara('arvore');
  const sup = S.atuacoes.find(a => a.pessoaRef === 'SUP' && a.organizacaoId === 'GOLDEN' && a.situacao === 'ativa' && a.fim == null).id;
  const esperado = new Set([sup]);
  const filhosDe = id => S.atuacoes.filter(a => a.superiorId === id && a.situacao === 'ativa' && a.fim == null).map(a => a.id);
  for (const fila = [sup]; fila.length;) { const id = fila.shift(); for (const f of filhosDe(id)) { esperado.add(f); fila.push(f); } }
  const ids = [...document.querySelectorAll('#t-arvore .ar-caixa')].map(c => c.dataset.atuacao).sort();
  assert.deepEqual(ids, [...esperado].sort(), 'só a subárvore do avaliador');
  assert.ok(ids.length < correntes(S, 'GOLDEN').length, 'premissa: a organização tem mais gente que a subárvore');
  assert.equal(document.querySelector('#ar-sem-lider').hidden, true);
  assert.match(document.querySelector('#ar-medidor').textContent, /sua equipe/i);
  /* RH da unidade continua vendo tudo */
  window.eval(RH); window.irPara('arvore');
  assert.equal(document.querySelectorAll('#t-arvore .ar-caixa').length, correntes(S, 'GOLDEN').length);
});

test('P28: o contador de pendências da organização não aparece para o avaliador', async () => {
  const { window, document } = await carregarPagina(base(), piloto(), null, OPCOES);
  window.eval("entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})"); window.irPara('arvore');
  assert.equal(document.querySelector('#ar-pendencias').textContent.trim(), '');
  window.eval(RH); window.irPara('arvore');
  assert.match(document.querySelector('#ar-pendencias').textContent, /pendência/);
});
