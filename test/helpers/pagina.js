import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const raiz = new URL('../../', import.meta.url).pathname;

export function lerFixture(nome) {
  return JSON.parse(fs.readFileSync(raiz + 'test/fixtures/' + nome, 'utf8'));
}

/**
 * Monta app/index.html no jsdom com fetch simulado (data/base.json e data/piloto-golden.json)
 * e espera o boot terminar (S.pessoas preenchido).
 */
export async function carregarPagina(baseJson, piloto = {}) {
  const html = fs.readFileSync(raiz + 'app/index.html', 'utf8');
  const erros = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erros.push(e));
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.claude = { use: async () => null };
      window.scrollTo = () => {};
      window.fetch = async (url) => {
        const u = String(url);
        const corpo = u.includes('data/base.json') ? baseJson : u.includes('data/piloto-golden.json') ? piloto : null;
        if (corpo === null) return { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(corpo)), text: async () => JSON.stringify(corpo) };
      };
    },
  });
  const { window } = dom;
  const limite = Date.now() + 5000;
  while (!(window.S && window.S.pessoas)) {
    if (Date.now() > limite) throw new Error('boot não terminou em 5s. Erros: ' + erros.map(String).join(' | '));
    await new Promise((r) => setTimeout(r, 10));
  }
  return { window, document: window.document, S: window.S, erros };
}
