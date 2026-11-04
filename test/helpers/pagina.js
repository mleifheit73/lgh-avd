import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const raiz = new URL('../../', import.meta.url).pathname;

export function lerFixture(nome) {
  return JSON.parse(fs.readFileSync(raiz + 'test/fixtures/' + nome, 'utf8'));
}

/**
 * Monta app/index.html no jsdom com fetch simulado (data/base.json, data/piloto-golden.json e a tabela de equivalência real)
 * e espera o boot terminar (S.pronto === true). Rejeita se o boot falhar (S.erroBoot) ou passar de 5s.
 * claudeStub (opcional) substitui window.claude, por exemplo para simular o banco do artefato. false: a página carrega sem
 * window.claude, como fora do claude.ai (M5).
 * opcoes (opcional) vira window.LGH_CONFIG: { fusoes, organizacaoPiloto, organizacaoInicial, atuacoesExtras }.
 * O bundle de verdade (app/js/lgh.bundle.js, gerado pelo pretest) é executado antes dos scripts da página:
 * o jsdom não carrega <script src> sem resources, então o texto do arquivo é avaliado na janela.
 */
export async function carregarPagina(baseJson, piloto = {}, claudeStub = null, opcoes = null) {
  const html = fs.readFileSync(raiz + 'app/index.html', 'utf8');
  const caminhoBundle = raiz + 'app/js/lgh.bundle.js';
  if (!fs.existsSync(caminhoBundle)) throw new Error('app/js/lgh.bundle.js ausente: rode npm run build:bundle');
  const bundle = fs.readFileSync(caminhoBundle, 'utf8');
  const equivalencias = JSON.parse(fs.readFileSync(raiz + 'app/js/modelo/equivalencia-organizacoes.json', 'utf8'));
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
      if (claudeStub !== false) window.claude = claudeStub || { use: async () => null };
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = function () {};
      if (opcoes) window.LGH_CONFIG = JSON.parse(JSON.stringify(opcoes));
      window.eval(bundle);
      window.fetch = async (url) => {
        const u = String(url);
        const corpo = u.includes('data/base.json') ? baseJson : u.includes('data/piloto-golden.json') ? piloto
          : u.includes('equivalencia-organizacoes.json') ? equivalencias : null;
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
