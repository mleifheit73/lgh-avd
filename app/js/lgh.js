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
