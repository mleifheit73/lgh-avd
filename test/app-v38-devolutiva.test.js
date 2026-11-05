// v38 (05/11/2026): parecer por IA gravado junto da avaliação, carregado sozinho, sem botão quando já existe (novo só
// pelo RH com motivo); registro da devolutiva do líder, imutável, acrescentável; tudo no histórico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const AVAL = "entrar({nome:'Supervisor de Governança Teste', cargo:'x', papel:'avaliador', nivel:'N1'})";
const RH = "entrar({nome:'Teste RH', cargo:'RH', papel:'rh_unidade', nivel:'N4', escopo:'Golden'})";
const tick = () => new Promise(r => setTimeout(r, 30));

/* stub de IA: devolve um texto fixo; stub de banco: guarda o que for gravado */
function stubs(docs = {}) {
  const sets = [];
  const sample = Object.assign(async () => ({ text: 'Resumo\nTexto do parecer de teste.' }), { limits: async () => ({}) });
  const ref = c => ({ get: async () => ({ exists: c in docs, data: () => docs[c] }), set: async d => { docs[c] = JSON.parse(JSON.stringify(d)); sets.push(c); }, delete: async () => { delete docs[c]; } });
  return { sets, docs, use: async n => n === 'sample' ? sample : n === 'db' ? { doc: ref, collection: nome => ({ doc: id => ref(nome + '/' + id), get: async () => ({ docs: Object.keys(docs).filter(k => k.startsWith(nome + '/')).map(k => ({ id: k.slice(nome.length + 1), exists: true, data: () => docs[k] })) }) }) } : null };
}
async function enviarComo(login, st) {
  const r = await carregarPagina(base(), piloto(), st, OPCOES);
  await tick();
  r.window.eval(login); r.window.irPara('avaliador');
  [...r.document.querySelectorAll('#t-avaliador button')].find(b => /^Avaliar$/.test(b.textContent.trim())).click();
  r.document.querySelectorAll('#t-form input.nota').forEach(i => { i.value = '4'; i.dispatchEvent(new r.window.Event('input', { bubbles: true })); i.dispatchEvent(new r.window.Event('change', { bubbles: true })); });
  r.document.querySelectorAll('#t-form textarea').forEach(t => { t.value = 'Obs.'; t.dispatchEvent(new r.window.Event('input', { bubbles: true })); });
  r.document.querySelector('#fm-salvar').click(); r.document.querySelector('#fm-salvar').click();
  await tick();
  return r;
}

test('v38: gerar o parecer grava no registro da avaliação com autor e hora; ao voltar, carrega sozinho e o botão some', async () => {
  const st = stubs();
  const { window, document, S, erros } = await enviarComo(AVAL, st);
  window.irPara('relatorio');
  assert.equal(document.querySelector('#rel-gerar').hidden, false);
  document.querySelector('#rel-gerar').click();
  await tick(); await tick();
  const chave = window.eval('chaveAval()');
  const reg = window.eval('ENVIADAS')[chave].slice(-1)[0];
  assert.ok(reg.devolutiva && reg.devolutiva.pareceres.length === 1, JSON.stringify(reg.devolutiva));
  const par = reg.devolutiva.pareceres[0];
  assert.equal(par.versao, 1); assert.match(par.texto, /parecer de teste/); assert.equal(par.por, 'Supervisor de Governança Teste'); assert.ok(par.em);
  assert.ok(st.sets.some(c => c.startsWith('avaliacoes/')), 'gravado no banco');
  const doc = Object.values(st.docs).find(d => d.chave === chave);
  assert.ok(doc && doc.versoes.slice(-1)[0].devolutiva.pareceres.length === 1, 'o documento do banco tem o parecer');
  /* sair e voltar: carrega sozinho, botão some, rótulo diz quem gerou */
  window.irPara('avaliador'); window.irPara('relatorio');
  assert.match(document.querySelector('#rel-texto').textContent, /parecer de teste/);
  assert.equal(document.querySelector('#rel-gerar').hidden, true, 'sem botão de gerar quando já existe parecer');
  assert.match(document.querySelector('#rel-parecer-meta').textContent, /Gerado por IA em .* por Supervisor de Governança Teste/);
  assert.equal(document.querySelector('#rel-novo-parecer'), null, 'avaliador não pode pedir novo parecer');
  assert.deepEqual(erros.map(String), []);
});

test('v38: RH autoriza novo parecer com motivo; o anterior fica no histórico como versão 1', async () => {
  const st = stubs();
  const { window, document } = await enviarComo(AVAL, st);
  window.irPara('relatorio'); document.querySelector('#rel-gerar').click(); await tick(); await tick();
  const atuacaoAvaliada = window.eval('chaveAval()').split('|').slice(0, 3).join('|');
  window.eval(RH); window.irPara('avaliador');
  /* RH abre a gaveta da pessoa avaliada e a devolutiva dela */
  const nome = document.querySelector(`#av-equipes [data-av2-pessoa="${atuacaoAvaliada}"]`);
  assert.ok(nome, 'RH vê nomes clicáveis: ' + document.querySelector('#av-equipes').innerHTML.slice(0, 300));
  nome.click();
  document.querySelector('[data-av2-devolutiva="0"]').click();
  assert.equal(window.S.tela, 'relatorio');
  const btn = document.querySelector('#rel-novo-parecer');
  assert.ok(btn, 'RH vê o botão de autorizar novo parecer');
  window.prompt = () => 'Conversa refeita a pedido do colaborador';
  btn.click();
  assert.equal(document.querySelector('#rel-gerar').hidden, false, 'botão de gerar volta');
  document.querySelector('#rel-gerar').click(); await tick(); await tick();
  const chave = window.eval('chaveAval()');
  const reg = window.eval('ENVIADAS')[chave].slice(-1)[0];
  assert.equal(reg.devolutiva.pareceres.length, 2);
  assert.equal(reg.devolutiva.pareceres[1].versao, 2);
  assert.equal(reg.devolutiva.pareceres[1].motivo, 'Conversa refeita a pedido do colaborador');
  assert.equal(reg.devolutiva.pareceres[1].autorizadoPor, 'Teste RH');
  assert.equal(document.querySelector('#rel-gerar').hidden, true);
});

test('v38: registro da devolutiva do líder é opcional, imutável e acrescentável; aparece no histórico do Formulário e na gaveta', async () => {
  const st = stubs();
  const { window, document, S } = await enviarComo(AVAL, st);
  window.irPara('relatorio');
  const ta = document.querySelector('#rel-registro-texto'), salvar = document.querySelector('#rel-registro-salvar');
  assert.ok(ta && salvar, 'campo e botão existem');
  assert.equal(salvar.disabled, true, 'vazio: nada a salvar');
  ta.value = 'Conversamos sobre pontualidade; combinado sair mais cedo de casa.'; ta.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(salvar.disabled, false);
  salvar.click(); await tick();
  const chave = window.eval('chaveAval()');
  const reg = window.eval('ENVIADAS')[chave].slice(-1)[0];
  assert.equal(reg.devolutiva.registros.length, 1);
  assert.equal(reg.devolutiva.registros[0].por, 'Supervisor de Governança Teste');
  assert.ok(reg.devolutiva.registros[0].em);
  const lista = document.querySelector('#rel-registros');
  assert.match(lista.textContent, /pontualidade/);
  assert.equal(lista.querySelector('textarea, input'), null, 'registro salvo não é editável');
  ta.value = 'Segundo registro.'; ta.dispatchEvent(new window.Event('input', { bubbles: true })); salvar.click(); await tick();
  assert.equal(window.eval('ENVIADAS')[chave].slice(-1)[0].devolutiva.registros.length, 2);
  /* histórico do Formulário e gaveta mostram */
  window.irPara('form');
  assert.match(document.querySelector('#fm-versoes').textContent, /pontualidade/);
  window.irPara('avaliador');
  document.querySelector('#av-equipes [data-av2-pessoa], #av-equipes .av2-nome').click();
  await tick();   /* a gaveta recebe os registros no próximo quadro */
  assert.match(document.querySelector('#av2-dr-corpo').textContent, /pontualidade/);
  assert.ok(Object.values(st.docs).some(d => d.chave === chave && d.versoes.slice(-1)[0].devolutiva.registros.length === 2), 'gravado no banco');
});
