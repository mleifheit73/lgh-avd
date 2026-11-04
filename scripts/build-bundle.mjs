/**
 * Bundle do navegador (Plano B, Tarefa 3, ruling R11).
 *  1. copia src/carga/*.js e src/modelo/atuacao.js para app/js/ (sem alteração, módulos do Plano A);
 *  2. gera app/js/lgh.bundle.js (IIFE, global LGH) a partir de app/js/lgh.js.
 * O jsdom não executa <script type="module">; a página carrega o bundle como script clássico.
 * O bundle é derivado e fica fora do git. Roda sozinho (npm run build:bundle) e antes de npm test (pretest).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(raiz, ...p);

/** dirApp: pasta do artefato (padrão app/). Os testes de build passam uma cópia temporária, para não disputar app/js com os outros testes. */
export function copiarModulosPlanoA(dirApp = rel('app')) {
  fs.mkdirSync(path.join(dirApp, 'js/carga'), { recursive: true });
  fs.mkdirSync(path.join(dirApp, 'js/modelo'), { recursive: true });
  for (const f of fs.readdirSync(rel('src/carga')).filter((x) => x.endsWith('.js'))) fs.copyFileSync(rel('src/carga', f), path.join(dirApp, 'js/carga', f));
  fs.copyFileSync(rel('src/modelo/atuacao.js'), path.join(dirApp, 'js/modelo/atuacao.js'));
}

export function gerarBundle(dirApp = rel('app')) {
  copiarModulosPlanoA(dirApp);
  esbuild.buildSync({
    entryPoints: [path.join(dirApp, 'js/lgh.js')],
    outfile: path.join(dirApp, 'js/lgh.bundle.js'),
    bundle: true,
    format: 'iife',
    globalName: 'LGH',
    platform: 'browser',
    target: 'es2020',
    charset: 'utf8',
    banner: { js: '/* Gerado por scripts/build-bundle.mjs a partir de app/js/lgh.js. Não editar à mão. */' },
    logLevel: 'warning',
    // organizacao.js lê a tabela de equivalência pelo import.meta só no Node; no navegador cai para [] e a página passa a tabela.
    logOverride: { 'empty-import-meta': 'silent' },
  });
  return path.join(dirApp, 'js/lgh.bundle.js');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const saida = gerarBundle();
  console.log(`${path.relative(raiz, saida)}: ${fs.statSync(saida).size} bytes`);
}
