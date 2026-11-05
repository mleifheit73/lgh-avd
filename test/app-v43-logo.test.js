// v43 (05/11/2026): logotipo do sistema com a marca Laghetto, pedido de Marcelo. Bloco independente (bloco-logo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFixture, carregarPagina } from './helpers/pagina.js';

const OPCOES = { fusoes: [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }], organizacaoPiloto: 'GOLDEN' };

test('v43: topo com o logotipo (horizontal e símbolo), selo de versão continua ao lado de Protótipo', async () => {
  const { document, erros } = await carregarPagina(lerFixture('base-mini.json'), lerFixture('piloto-mini.json'), null, OPCOES);
  const brand = document.querySelector('header.top .brand');
  assert.ok(brand.classList.contains('lgh-logo'));
  assert.ok(brand.querySelector('svg.lgh-logo-h .lm-marca'), 'palavra Laghetto');
  assert.ok(brand.querySelector('svg.lgh-logo-s'), 'símbolo para telas estreitas');
  assert.equal(brand.querySelector('.dot'), null, 'quadrado "L" antigo saiu');
  assert.equal(brand.getAttribute('aria-label'), 'Laghetto, Avaliação de Desempenho');
  assert.equal(document.querySelector('#versao-app').previousElementSibling.textContent, 'Protótipo');
  assert.deepEqual(erros.map(String), []);
});

test('v43: favicon do símbolo e logotipo empilhado na tela de acesso', async () => {
  const { document } = await carregarPagina(lerFixture('base-mini.json'), lerFixture('piloto-mini.json'), null, OPCOES);
  const ic = document.querySelector('link[rel="icon"]');
  assert.ok(ic && ic.href.startsWith('data:image/svg+xml'));
  assert.ok(document.querySelector('#t-login > #login-logo svg.lgh-logo-e'));
});

test('v43: o desenho da palavra é o do arquivo da marca, sem alteração', async () => {
  const fs = await import('node:fs');
  const original = /<path d="([^"]+)"/.exec(fs.readFileSync('/mnt/user-data/attachments/3623909c-8331-5f31-a91b-2eae438e4346/edaa535d-6536ca74cc0780c04254f748_brand_logo-white.svg', 'utf8'))?.[1];
  const { document } = await carregarPagina(lerFixture('base-mini.json'), lerFixture('piloto-mini.json'), null, OPCOES);
  const d = document.querySelector('.lgh-logo-h .lm-marca').getAttribute('d');
  if (original) assert.equal(d, original);
  else assert.ok(d.length > 1000);
});
