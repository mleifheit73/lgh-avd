// Selo de versão ao lado de "Protótipo" (pedido de Marcelo, 04/11 08h03): número e commit do build; "latest" só quando
// o banco do artefato diz que esta é a versão publicada mais recente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';

const FUSAO_MINI = [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }];
const OPCOES = { fusoes: FUSAO_MINI, organizacaoPiloto: 'GOLDEN' };
const base = () => lerFixture('base-mini.json');
const piloto = () => lerFixture('piloto-mini.json');
const tick = () => new Promise(r => setTimeout(r, 30));

function bancoCom(docs) {
  return { use: async n => n !== 'db' ? null : {
    doc: caminho => ({ get: async () => ({ exists: caminho in docs, data: () => docs[caminho] }), set: async () => {}, delete: async () => {} }),
    collection: nome => ({ doc: id => ({ get: async () => ({ exists: (nome + '/' + id) in docs, data: () => docs[nome + '/' + id] }), set: async () => {}, delete: async () => {} }), get: async () => ({ docs: [] }) }),
  } };
}

test('selo: sem banco mostra só número e commit do build', async () => {
  const { document, erros } = await carregarPagina(base(), piloto(), null, OPCOES);
  const selo = document.querySelector('#versao-app');
  assert.ok(selo, 'selo existe ao lado de Protótipo');
  assert.equal(selo.previousElementSibling.textContent, 'Protótipo');
  /* o harness carrega o arquivo fonte (sem build): marcadores viram "v? · sem build"; no dist o build põe número e commit */
  assert.match(selo.textContent, /^v(\S+ · \S+|\? · sem build)$/, selo.textContent);
  assert.ok(!/latest|desatualizada/.test(selo.textContent));
  assert.deepEqual(erros.map(String), []);
});

test('selo: banco com a mesma versão mostra "latest"; com versão maior mostra "desatualizada"', async () => {
  /* no fonte o número vem vazio; o teste simula o build cravando o número e chama a conferência de novo */
  const comNumero = async (docs) => {
    const r = await carregarPagina(base(), piloto(), bancoCom(docs), OPCOES);
    await tick();
    r.window.VERSAO_APP.numero = '36'; r.window.VERSAO_APP.commit = 'abc1234';
    await r.window.LGH_VERSAO.conferir();
    return r.document.querySelector('#versao-app').textContent;
  };
  assert.match(await comNumero({ 'config/versao': { numero: 36, commit: 'abc1234' } }), /^v36 · abc1234 · latest$/);
  assert.match(await comNumero({ 'config/versao': { numero: 37, commit: 'ffffff0' } }), /^v36 · abc1234 · desatualizada$/);
  assert.equal(await comNumero({}), 'v36 · abc1234', 'sem documento, sem rótulo');
});
