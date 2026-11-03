import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAtuacao, validarArvore, arvore, atuacoesDe, semSuperior } from '../src/modelo/atuacao.js';

const at = o => criarAtuacao({ inicio: '2020-01-01', ...o });

test('Ana Carolina: duas atuações em duas organizações, uma pessoa', () => {
  const a = [
    at({ id: 'm', pessoaRef: 'MARCELO', organizacaoId: 'LGM-POSVENDAS', funcao: 'Diretor', superiorId: null, ehRaiz: true }),
    at({ id: 'a1', pessoaRef: 'ANA', organizacaoId: 'LGM-POSVENDAS', funcao: 'Gerente', superiorId: 'm' }),
    at({ id: 'ceo', pessoaRef: 'CEO-BRANO', organizacaoId: 'BRANO', funcao: 'CEO', superiorId: null, ehRaiz: true }),
    at({ id: 'a2', pessoaRef: 'ANA', organizacaoId: 'BRANO', funcao: 'Gerente', superiorId: 'ceo' }),
  ];
  assert.equal(atuacoesDe(a, 'ANA').length, 2);
  assert.doesNotThrow(() => validarArvore(a, 'LGM-POSVENDAS'));
  assert.doesNotThrow(() => validarArvore(a, 'BRANO'));
  assert.equal(arvore(a, 'LGM-POSVENDAS').filhos[0].atuacao.pessoaRef, 'ANA');
  assert.equal(arvore(a, 'BRANO').filhos[0].atuacao.pessoaRef, 'ANA');
});

test('camareira com duplo gestor: duas atuações na mesma organização, mesma função', () => {
  const a = [
    at({ id: 'gg', pessoaRef: 'GG', organizacaoId: 'GOLDEN', funcao: 'Gerente Geral', superiorId: null, ehRaiz: true }),
    at({ id: 'sup', pessoaRef: 'SUP', organizacaoId: 'GOLDEN', funcao: 'Supervisora de Andares', superiorId: 'gg' }),
    at({ id: 'gov', pessoaRef: 'GOV', organizacaoId: 'GOLDEN', funcao: 'Governanta', superiorId: 'gg' }),
    at({ id: 'c1', pessoaRef: 'CAM', organizacaoId: 'GOLDEN', funcao: 'Camareira', superiorId: 'sup' }),
    at({ id: 'c2', pessoaRef: 'CAM', organizacaoId: 'GOLDEN', funcao: 'Camareira', superiorId: 'gov' }),
  ];
  assert.doesNotThrow(() => validarArvore(a, 'GOLDEN'));
  assert.equal(atuacoesDe(a, 'CAM').length, 2);
  const raiz = arvore(a, 'GOLDEN');
  const sob = raiz.filhos.map(f => f.filhos.map(n => n.atuacao.pessoaRef));
  assert.deepEqual(sob, [['CAM'], ['CAM']]);   // aparece sob as duas caixas
});

test('ciclo é rejeitado', () => {
  const a = [
    at({ id: 'x', pessoaRef: 'X', organizacaoId: 'O', funcao: 'f', superiorId: 'y' }),
    at({ id: 'y', pessoaRef: 'Y', organizacaoId: 'O', funcao: 'f', superiorId: 'x' }),
    at({ id: 'r', pessoaRef: 'R', organizacaoId: 'O', funcao: 'f', superiorId: null, ehRaiz: true }),
  ];
  assert.throws(() => validarArvore(a, 'O'), e => e.codigo === 'ciclo');
});

test('duas raízes são rejeitadas, nenhuma raiz é rejeitada, raiz com superior é rejeitada', () => {
  const duas = [at({ id: 'a', pessoaRef: 'A', organizacaoId: 'O', funcao: 'f', superiorId: null, ehRaiz: true }),
                at({ id: 'b', pessoaRef: 'B', organizacaoId: 'O', funcao: 'f', superiorId: null, ehRaiz: true })];
  assert.throws(() => validarArvore(duas, 'O'), e => e.codigo === 'multiplas_raizes');
  assert.throws(() => validarArvore([], 'O'), e => e.codigo === 'sem_raiz');
  const comSup = [at({ id: 'a', pessoaRef: 'A', organizacaoId: 'O', funcao: 'f', superiorId: null }),
                  at({ id: 'b', pessoaRef: 'B', organizacaoId: 'O', funcao: 'f', superiorId: 'a', ehRaiz: true })];   // única raiz, mas com superior
  assert.throws(() => validarArvore(comSup, 'O'), e => e.codigo === 'raiz_com_superior');
});

test('superior de outra organização é rejeitado; superior inexistente é rejeitado', () => {
  const fora = [at({ id: 'r', pessoaRef: 'R', organizacaoId: 'A', funcao: 'f', superiorId: null, ehRaiz: true }),
                at({ id: 'rb', pessoaRef: 'RB', organizacaoId: 'B', funcao: 'f', superiorId: null, ehRaiz: true }),
                at({ id: 's', pessoaRef: 'S', organizacaoId: 'B', funcao: 'f', superiorId: 'r' })];
  assert.throws(() => validarArvore(fora, 'B'), e => e.codigo === 'superior_fora_da_organizacao');
  const inex = [at({ id: 'r', pessoaRef: 'R', organizacaoId: 'O', funcao: 'f', superiorId: null, ehRaiz: true }),
                at({ id: 's', pessoaRef: 'S', organizacaoId: 'O', funcao: 'f', superiorId: 'nao-existe' })];
  assert.throws(() => validarArvore(inex, 'O'), e => e.codigo === 'superior_inexistente');
});

test('semSuperior lista quem trava o ciclo; sem superior é pendência, não erro', () => {
  const a = [at({ id: 'r', pessoaRef: 'R', organizacaoId: 'O', funcao: 'f', superiorId: null, ehRaiz: true }),
             at({ id: 's', pessoaRef: 'S', organizacaoId: 'O', funcao: 'f', superiorId: null })];
  assert.equal(semSuperior(a, 'O').length, 1);
  assert.equal(semSuperior(a, 'O')[0].pessoaRef, 'S');
  assert.doesNotThrow(() => validarArvore(a, 'O'));
});

test('criarAtuacao exige os campos obrigatórios e devolve os opcionais com padrão', () => {
  assert.throws(() => criarAtuacao({ pessoaRef: 'P', organizacaoId: 'O', funcao: 'f', inicio: '2020-01-01' }), /id/);
  const a = at({ id: 'x', pessoaRef: 'P', organizacaoId: 'O', funcao: 'f', superiorId: null });
  assert.equal(a.ehRaiz, false);
  assert.equal(a.situacao, 'ativa');
  assert.equal(a.fim, null);
});
