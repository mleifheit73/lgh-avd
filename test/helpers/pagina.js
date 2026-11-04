import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const raiz = new URL('../../', import.meta.url).pathname;

export function lerFixture(nome) {
  return JSON.parse(fs.readFileSync(raiz + 'test/fixtures/' + nome, 'utf8'));
}

/**
 * Monta app/index.html no jsdom com fetch simulado (data/base.json e data/piloto-golden.json)
 * e espera o boot terminar (S.pronto === true). Rejeita se o boot falhar (S.erroBoot) ou passar de 5s.
 * claudeStub (opcional) substitui window.claude, por exemplo para simular o banco do artefato.
 */
export async function carregarPagina(baseJson, piloto = {}, claudeStub = null) {
  const html = fs.readFileSync(raiz + 'app/index.html', 'utf8');
  const erros = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => erros.push(e));
  virtualConsole.on('error', (...a) => erros.push(a.map(String).join(' ')));
  virtualConsole.on('warn', (...a) => erros.push(a.map(String).join(' ')));
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      if (claudeStub) claudeStub.janela = window; // o stub pode consultar o estado da página (ex.: S.pronto)
      window.claude = claudeStub || { use: async () => null };
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
  while (!(window.S && (window.S.pronto === true || window.S.erroBoot))) {
    if (Date.now() > limite) throw new Error('boot não terminou em 5s. Erros: ' + erros.map(String).join(' | '));
    await new Promise((r) => setTimeout(r, 10));
  }
  if (window.S.erroBoot) throw new Error('falha no boot: ' + window.S.erroBoot);
  return { window, document: window.document, S: window.S, erros };
}
