/**
 * Entrada do bundle do navegador (app/js/lgh.bundle.js, global LGH). Ver scripts/build-bundle.mjs.
 * Só reexporta: a lógica fica nos módulos, testados direto no Node.
 */
export * from './modelo/organizacao.js';
export * from './modelo/bootstrap.js';
export * from './modelo/atuacao.js';
export * from './modelo/nome.js';
export * from './carga/normalizar.js';
export * from './adaptador.js';
export * from './arvore-ui.js';
export * as montagem from './modelo/montagem.js';
export * as pendencias from './modelo/pendencias.js';
export * as persistencia from './modelo/persistencia.js';
