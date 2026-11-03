# Plano A: Modelo de dados e carga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar as duas bases de pessoas (CLT do Domínio e PJ da planilha do RH) numa base única, consolidada por CPF, com vínculos, organizações e atuações modelados, pendências marcadas, invariantes da árvore validados e detecção de desligamento com trava, tudo como biblioteca testável em Node, sem tela.

**Architecture:** Módulos ES puros em `src/`, cada um com uma responsabilidade e uma assinatura fixa, para serem reaproveitados sem alteração tanto pela página do protótipo (Plano B) quanto pelo Worker do Cloudflare depois. Nenhum módulo toca DOM. Um CLI em `src/cli/` encadeia os módulos sobre os arquivos reais e grava a saída consolidada. Os dados reais do Projeto são as fixtures dos testes de integração.

**Tech Stack:** Node 20+, módulos ES, `node --test` nativo (sem dependências de teste), `xlsx` apenas no script de conversão da planilha PJ. Git.

**Spec:** `claude/SPEC-00-FUNDACAO.md` no Projeto (cópia local em `docs/spec/SPEC-00-FUNDACAO.md`). O plano argumenta a partir do spec; o executor lê os dois.

## Global Constraints

- Identidade de pessoa é o CPF com 11 dígitos, sem máscara. Identidade de vínculo CLT é `filial + codigo` (spec 4.2).
- Nenhuma linha de entrada é descartada em silêncio: toda exclusão vai para o log de carga com motivo (spec 4.3, aceite 3).
- Nenhum CPF em texto aberto em artefato publicado (spec 5, aceite 13). Nesta fase o CLI grava CPF em `out/`, que é local e nunca é publicado. O Plano B define o hash antes de qualquer publicação.
- Inferência é rotulada como inferência: todo campo derivado por regra (empresa normalizada, inativação por carga) carrega a origem (spec 4.4, ESTADO seção 6).
- Regra estrutural fixa: cada superior diferente gera uma atuação; uma atuação tem no máximo um superior; toda organização tem exatamente uma raiz; sem ciclos (spec 3.4, 3.5, 12).
- Trava de inativação em massa: padrão 5% da organização ou 10 pessoas, o que for menor (spec 4.4). Valor vem por parâmetro, não cravado.
- Sem travessão em nenhum texto gerado, incluindo mensagens de log e de erro.
- Datas internas em ISO `YYYY-MM-DD`. A base CLT traz `DD/MM/YYYY`, a PJ traz ISO. O módulo de carga converte, nunca o consumidor.

## Review Focus

Entradas que o spec implica, nenhuma tarefa testaria por padrão, e que vão morder alguém de verdade. Cada uma recebe teste na tarefa dona do código.

1. **CSV com BOM e com linha de filial no meio dos dados.** O export real tem os dois. Parser que ignora o BOM perde a primeira coluna da primeira linha; parser que não reconhece a linha de filial atribui todo mundo à filial errada. Teste na Tarefa 2.
2. **CPF com máscara na PJ (`000.000.000-06`) e sem máscara na CLT.** Se a consolidação comparar sem normalizar, os 10 duplicados viram 20 pessoas. Teste na Tarefa 4.
3. **Mesma pessoa com nome grafado diferente nas duas bases.** A consolidação precisa escolher um nome e registrar o outro, nunca falhar nem duplicar. Teste na Tarefa 4.
4. **Arquivo de uma regional vazio ou ausente na carga nova.** Sem trava, toda a regional vira inativa e perde acesso. Teste na Tarefa 6.
5. **Atuação cujo superior é de outra organização.** O modelo permite uma pessoa em duas organizações, mas uma atuação não pode apontar para superior fora da organização dela, senão a árvore de uma organização inclui gente de outra. Teste na Tarefa 5.

---

## File Structure

```
lgh-avd/
  package.json                 type module; scripts: test, carga
  docs/spec/SPEC-00-FUNDACAO.md  cópia do spec do Projeto
  docs/plans/                  este plano
  data/
    clt/R1.csv R2.csv R3.csv   cópias dos CSVs do Projeto (fixtures reais)
    pj/pj-2026.json            saída do conversor da planilha
  src/
    carga/normalizar.js        chaveEmpresa, cpfLimpo, dataISO
    carga/clt.js               parseCLT
    carga/pj.js                parsePJ
    carga/consolidar.js        consolidar
    carga/diff.js              diffCarga
    modelo/atuacao.js          criarAtuacao, validarArvore, arvore
    cli/converter-pj.js        xlsx → data/pj/pj-2026.json
    cli/carga.js               encadeia tudo → out/
  test/
    normalizar.test.js clt.test.js pj.test.js consolidar.test.js
    atuacao.test.js diff.test.js cli.test.js
  out/                         gitignored; saída do CLI
```

Decisões de estrutura, para o executor não refazer:
- `src/carga/` sabe ler arquivos de origem e nada mais. `src/modelo/` sabe as regras do domínio e não sabe de onde o dado veio. O CLI é o único lugar que conhece os dois.
- Toda função é pura: recebe dado, devolve dado, não lê disco. Quem lê disco é o CLI e os testes.
- Erros de regra (ciclo, duas raízes) lançam `Error` com mensagem em português e campo `codigo` fixo, para o Plano B mostrar na tela sem reinterpretar.

---

### Task 1: Repositório, runner de testes e normalizadores

**Files:**
- Create: `package.json`, `.gitignore`, `src/carga/normalizar.js`, `test/normalizar.test.js`
- Create: `docs/spec/SPEC-00-FUNDACAO.md` (cópia do Projeto), `docs/plans/PLANO-00A-MODELO-E-CARGA.md` (este arquivo)

**Interfaces:**
- Produces:
  - `chaveEmpresa(texto: string): string` — maiúsculas, sem acento, sem sufixo societário (LTDA, S.A, SA, EIRELI, ME), só `[A-Z0-9& ]`, espaços colapsados.
  - `cpfLimpo(texto: string | null): string | null` — só dígitos; devolve `null` se não tiver exatamente 11.
  - `dataISO(texto: string | null): string | null` — aceita `DD/MM/YYYY` e `YYYY-MM-DD`, devolve `YYYY-MM-DD` ou `null`.
  - `separarEmpresas(texto: string): string[]` — quebra por vírgula ou por ` e ` seguido de maiúscula; aplica `chaveEmpresa` em cada parte; remove vazios e repetidos.

- [ ] **Step 1: Inicializar o repositório**

```bash
mkdir -p lgh-avd && cd lgh-avd && git init
```
`package.json` com `"type": "module"` e `"scripts": {"test": "node --test test/", "carga": "node src/cli/carga.js"}`. `.gitignore` com `out/` e `node_modules/`.

- [ ] **Step 2: Escrever os testes que falham**

```js
// test/normalizar.test.js
import test from 'node:test'; import assert from 'node:assert/strict';
import { chaveEmpresa, cpfLimpo, dataISO, separarEmpresas } from '../src/carga/normalizar.js';

test('chaveEmpresa colapsa as 4 grafias da LSH', () => {
  const g = ['LSH BARRA EMPREENDIMENTOS IMOBILIARIOS S.A','LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS S.A',
             'LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS S.A.','LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS SA'];
  assert.equal(new Set(g.map(chaveEmpresa)).size, 1);
  assert.equal(chaveEmpresa(g[0]), 'LSH BARRA EMPREENDIMENTOS IMOBILIARIOS');
});
test('chaveEmpresa trata acento e LTDA', () => {
  assert.equal(chaveEmpresa('LAGHETTO HOTÉIS LTDA'), chaveEmpresa('LAGHETTO HOTEIS LTDA'));
  assert.equal(chaveEmpresa('LAGHETTO HOTÉIS LTDA FILIAL 21 - SÃO PAULO'), 'LAGHETTO HOTEIS FILIAL 21 SAO PAULO');
});
test('cpfLimpo aceita com e sem máscara, rejeita incompleto', () => {
  assert.equal(cpfLimpo('000.000.000-06'), '00000000006');
  assert.equal(cpfLimpo('00000000006'), '00000000006');
  assert.equal(cpfLimpo('1234'), null);
  assert.equal(cpfLimpo(null), null);
});
test('dataISO aceita os dois formatos', () => {
  assert.equal(dataISO('13/10/1994'), '1994-10-13');
  assert.equal(dataISO('2026-09-28 00:00:00'), '2026-09-28');
  assert.equal(dataISO(''), null);
});
test('separarEmpresas quebra a célula tripla da Gerente Fiscal', () => {
  const r = separarEmpresas('LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS SA, SIENA ADMINISTRAÇÃO E PARTICIPAÇÕES LTDA e LAGHETTO HOTEIS LTDA');
  assert.deepEqual(r, ['LSH BARRA EMPREENDIMENTOS IMOBILIARIOS','SIENA ADMINISTRACAO E PARTICIPACOES','LAGHETTO HOTEIS']);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL, módulo `normalizar.js` não encontrado.

- [ ] **Step 4: Implementar `src/carga/normalizar.js`**

As quatro funções com as assinaturas do bloco Interfaces. `separarEmpresas` usa o padrão `/,| e (?=[A-ZÀ-Ü])/`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: 5 testes, todos PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(carga): normalizadores de empresa, CPF e data com testes"
```

---

### Task 2: Parser da base CLT

**Files:**
- Create: `src/carga/clt.js`, `test/clt.test.js`, `test/fixtures/clt-mini.csv`
- Create: `data/clt/R1.csv`, `R2.csv`, `R3.csv` (cópias dos CSVs do Projeto)

**Interfaces:**
- Consumes: `cpfLimpo`, `dataISO` da Tarefa 1.
- Produces:
  - `parseCLT(csvTexto: string, regional: 'R1'|'R2'|'R3'): { registros: RegistroCLT[], log: LogItem[] }`
  - `RegistroCLT = { regional, filial, codigo, nome, rg, cargoCod, cargo, cpf, nascimento, admissao, chave }` onde `chave = filial + '|' + codigo`, datas em ISO, `cpf` já limpo ou `null`.
  - `LogItem = { nivel: 'info'|'aviso'|'erro', codigo: string, mensagem: string, linha?: number }`

- [ ] **Step 1: Criar a fixture mínima**

`test/fixtures/clt-mini.csv` com BOM, separador `;`, uma linha de filial `LAGHETTO RESORT GOLDEN`, três linhas de pessoa (uma com RG vazio, para provar que o CPF não cai no RG), uma segunda linha de filial `LAGHETTO FL 18 A&B GOLDEN` e mais duas pessoas. Oito linhas no total.

- [ ] **Step 2: Escrever os testes que falham**

```js
test('parseCLT reconhece filial e usa o cargo como âncora', () => {
  const { registros } = parseCLT(lerFixture('clt-mini.csv'), 'R1');
  assert.equal(registros.length, 5);
  assert.equal(registros[0].filial, 'LAGHETTO RESORT GOLDEN');
  assert.equal(registros[3].filial, 'LAGHETTO FL 18 A&B GOLDEN');
});
test('parseCLT com RG vazio não põe o CPF no RG', () => {
  const r = parseCLT(lerFixture('clt-mini.csv'), 'R1').registros[1];
  assert.equal(r.rg, null);
  assert.match(r.cpf, /^\d{11}$/);
});
test('parseCLT sobre os três CSVs reais fecha em 1608 e zero colisão de chave', () => {
  const todos = ['R1','R2','R3'].flatMap(r => parseCLT(lerData(`clt/${r}.csv`), r).registros);
  assert.equal(todos.length, 1608);
  assert.equal(new Set(todos.map(x => x.filial)).size, 37);
  assert.equal(new Set(todos.map(x => x.chave)).size, 1608);
  const porCodigo = new Set(todos.map(x => x.codigo));
  assert.equal(1608 - porCodigo.size, 417);
});
test('parseCLT ignora BOM', () => {
  const semBom = lerFixture('clt-mini.csv').replace(/^﻿/, '');
  assert.deepEqual(parseCLT(semBom,'R1').registros, parseCLT(lerFixture('clt-mini.csv'),'R1').registros);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- test/clt.test.js`
Expected: FAIL, `parseCLT` não definido.

- [ ] **Step 4: Implementar `parseCLT` em `src/carga/clt.js`**

Porta direta do script Python em `claude/dados/carga-das-bases.md`: linha de filial é a que tem primeira célula vazia e texto começando por nome de empresa; cargo é a âncora `^\d+\s*-\s*\S`; antes do cargo vem nome e RG; depois vêm CPF e duas datas. Linha sem cargo reconhecível vai para o log como `aviso` com código `linha_sem_cargo`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- test/clt.test.js`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(carga): parser da base CLT com âncora no cargo e fixtures reais"
```

---

### Task 3: Conversor e parser da base PJ

**Files:**
- Create: `src/cli/converter-pj.js`, `src/carga/pj.js`, `test/pj.test.js`, `test/fixtures/pj-mini.json`
- Create: `data/pj/pj-2026.json` (saída do conversor sobre a planilha real)

**Interfaces:**
- Consumes: `cpfLimpo`, `dataISO`, `separarEmpresas` da Tarefa 1.
- Produces:
  - `parsePJ(linhas: string[][]): { registros: RegistroPJ[], log: LogItem[], equivalencia: Record<string,string[]> }`
  - `RegistroPJ = { nome, cargo, cpf, nascimento, inicio, empresas: string[], grafiasOriginais: string[] }`
  - `equivalencia` mapeia empresa normalizada para as grafias originais encontradas.
  - Linhas de entrada: arrays de strings, uma por linha da planilha, já sem as duas linhas de cabeçalho.

- [ ] **Step 1: Escrever o conversor**

`src/cli/converter-pj.js`: lê `xlsx` com o pacote `xlsx` (única dependência de produção; `npm i xlsx`), aba `PJs`, devolve `string[][]` a partir da linha 3, grava `data/pj/pj-2026.json` como `{ linhas: string[][] }`. Rodar uma vez sobre a planilha real.

- [ ] **Step 2: Criar a fixture mínima**

`test/fixtures/pj-mini.json` com 6 linhas: uma normal, uma com CPF mascarado, uma com célula de três empresas, uma linha de cabeçalho repetido (`CONTRATANTE ATUAL`), uma sem CPF, uma com início futuro.

- [ ] **Step 3: Escrever os testes que falham**

```js
test('parsePJ descarta cabeçalho repetido e registra no log', () => {
  const { registros, log } = parsePJ(lerFixture('pj-mini.json').linhas);
  assert.equal(registros.length, 5);
  assert.ok(log.some(l => l.codigo === 'cabecalho_repetido'));
});
test('parsePJ quebra múltiplas empresas e guarda as grafias', () => {
  const r = parsePJ(lerFixture('pj-mini.json').linhas).registros.find(x => x.empresas.length > 1);
  assert.equal(r.empresas.length, 3);
  assert.equal(r.grafiasOriginais.length, 3);
});
test('parsePJ sobre a planilha real: 226 válidos, 40 empresas, 6 com grafia múltipla', () => {
  const { registros, equivalencia, log } = parsePJ(lerData('pj/pj-2026.json').linhas);
  assert.equal(registros.length, 226);
  assert.equal(log.filter(l => l.codigo === 'cabecalho_repetido').length, 3);
  assert.equal(Object.keys(equivalencia).length, 40);
  assert.equal(Object.values(equivalencia).filter(g => g.length > 1).length, 6);
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npm test -- test/pj.test.js`
Expected: FAIL.

- [ ] **Step 5: Implementar `parsePJ` em `src/carga/pj.js`**

Colunas por índice: 1 nome, 2 cargo, 3 contratante, 4 CPF, 5 nascimento, 6 início. Linha cujo contratante começa com `CONTRATANTE` é cabeçalho repetido. Linha sem nome é ignorada com log `linha_vazia`.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test -- test/pj.test.js`
Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(carga): conversor e parser da base PJ com equivalência de empresas"
```

---

### Task 4: Consolidação por CPF

**Files:**
- Create: `src/carga/consolidar.js`, `test/consolidar.test.js`

**Interfaces:**
- Consumes: `RegistroCLT[]` da Tarefa 2, `RegistroPJ[]` da Tarefa 3.
- Produces:
  - `consolidar(clt: RegistroCLT[], pj: RegistroPJ[], opcoes: { hoje: string }): { pessoas: Pessoa[], vinculos: Vinculo[], pendencias: Pendencia[], log: LogItem[] }`
  - `Pessoa = { cpf, nome, nascimento, status: 'ativo'|'pendente', nomesAlternativos: string[] }`; pessoa sem CPF recebe `cpf: null` e `idProvisorio: 'sem-cpf-' + n`.
  - `Vinculo = { pessoaRef: cpf | idProvisorio, regime: 'CLT'|'PJ', empresa, cargo, inicio, filial?, codigo?, chave? }`
  - `Pendencia = { pessoaRef, codigo: 'tambem_na_base_clt'|'multiplas_empresas'|'sem_cpf'|'sem_cargo'|'sem_empresa'|'inicio_futuro', detalhe: string }`
  - Nome da pessoa: o da base CLT quando existir nas duas; o outro vai para `nomesAlternativos`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('consolidar funde os 10 CPFs presentes nas duas bases em uma pessoa cada', () => {
  const { pessoas, vinculos, pendencias } = consolidar(cltReal(), pjReal(), { hoje: '2026-11-03' });
  const dup = pendencias.filter(p => p.codigo === 'tambem_na_base_clt');
  assert.equal(dup.length, 10);
  for (const p of dup) {
    assert.equal(pessoas.filter(x => x.cpf === p.pessoaRef).length, 1);
    assert.equal(vinculos.filter(v => v.pessoaRef === p.pessoaRef).length >= 2, true);
  }
});
test('consolidar: contagem de pendências bate com o levantamento', () => {
  const { pendencias } = consolidar(cltReal(), pjReal(), { hoje: '2026-11-03' });
  const c = cod => pendencias.filter(p => p.codigo === cod).length;
  assert.equal(c('multiplas_empresas'), 12);
  assert.equal(c('sem_cpf'), 6);
  assert.equal(c('sem_cargo'), 7);
  assert.equal(c('sem_empresa'), 5);
  assert.equal(c('inicio_futuro'), 4);
});
test('consolidar normaliza CPF mascarado antes de comparar', () => {
  const clt = [{ cpf: '00000000006', nome: 'ADELIA GOMES MENESES', filial: 'X', codigo: '1', chave: 'X|1', cargo: 'A', admissao: '2020-01-01' }];
  const pj  = [{ cpf: '00000000006', nome: 'Adélia Gomes Meneses', empresas: ['E'], cargo: 'B', inicio: '2026-09-28' }];
  const { pessoas } = consolidar(clt, pj, { hoje: '2026-11-03' });
  assert.equal(pessoas.length, 1);
  assert.equal(pessoas[0].nome, 'ADELIA GOMES MENESES');
  assert.deepEqual(pessoas[0].nomesAlternativos, ['Adélia Gomes Meneses']);
});
test('consolidar: total de pessoas = CLT + PJ - duplicados', () => {
  const { pessoas } = consolidar(cltReal(), pjReal(), { hoje: '2026-11-03' });
  assert.equal(pessoas.length, 1608 + 226 - 10);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/consolidar.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `consolidar` em `src/carga/consolidar.js`**

Índice por CPF limpo. Registro sem CPF nunca é fundido com ninguém. `inicio_futuro` compara `inicio > opcoes.hoje`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- test/consolidar.test.js`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(carga): consolidação por CPF com vínculos e pendências"
```

---

### Task 5: Modelo de atuação e invariantes da árvore

**Files:**
- Create: `src/modelo/atuacao.js`, `test/atuacao.test.js`

**Interfaces:**
- Produces:
  - `criarAtuacao({ id, pessoaRef, organizacaoId, funcao, superiorId: string|null, ehRaiz?: boolean, setor?, turno?, equipe?, inicio }): Atuacao`. `ehRaiz` marca explicitamente o topo da organização; `superiorId: null` sem `ehRaiz` significa "superior ainda não definido", que é o estado que trava o ciclo.
  - `validarArvore(atuacoes: Atuacao[], organizacaoId: string): void` — lança `Error` com `codigo` em `'ciclo' | 'sem_raiz' | 'multiplas_raizes' | 'raiz_com_superior' | 'superior_fora_da_organizacao' | 'superior_inexistente'`. `sem_raiz` quando nenhuma atuação da organização tem `ehRaiz`; `multiplas_raizes` quando mais de uma tem; `raiz_com_superior` quando uma com `ehRaiz` tem `superiorId` preenchido. Atuação sem superior e sem `ehRaiz` **não** é erro de validação: é pendência, listada por `semSuperior`.
  - `arvore(atuacoes: Atuacao[], organizacaoId: string): No` onde `No = { atuacao, filhos: No[] }`, raiz única.
  - `atuacoesDe(atuacoes, pessoaRef): Atuacao[]`
  - `semSuperior(atuacoes, organizacaoId): Atuacao[]` — atuações com `superiorId` nulo e sem `ehRaiz` (o que trava o ciclo).

- [ ] **Step 1: Escrever os testes que falham**

```js
test('Ana Carolina: duas atuações em duas organizações, uma pessoa', () => {
  const a = [
    criarAtuacao({ id:'m', pessoaRef:'MARCELO', organizacaoId:'LGM-POSVENDAS', funcao:'Diretor', superiorId:null, ehRaiz:true, inicio:'2026-03-01' }),
    criarAtuacao({ id:'a1', pessoaRef:'ANA', organizacaoId:'LGM-POSVENDAS', funcao:'Gerente', superiorId:'m', inicio:'2026-03-01' }),
    criarAtuacao({ id:'ceo', pessoaRef:'CEO-BRANO', organizacaoId:'BRANO', funcao:'CEO', superiorId:null, ehRaiz:true, inicio:'2024-01-01' }),
    criarAtuacao({ id:'a2', pessoaRef:'ANA', organizacaoId:'BRANO', funcao:'Gerente', superiorId:'ceo', inicio:'2025-01-01' }),
  ];
  assert.equal(atuacoesDe(a,'ANA').length, 2);
  assert.equal(arvore(a,'LGM-POSVENDAS').filhos[0].atuacao.pessoaRef, 'ANA');
  assert.equal(arvore(a,'BRANO').filhos[0].atuacao.pessoaRef, 'ANA');
});
test('camareira com duplo gestor: duas atuações na mesma organização', () => {
  const a = [
    criarAtuacao({ id:'gg', pessoaRef:'GG', organizacaoId:'GOLDEN', funcao:'Gerente Geral', superiorId:null, ehRaiz:true, inicio:'2020-01-01' }),
    criarAtuacao({ id:'sup', pessoaRef:'SUP', organizacaoId:'GOLDEN', funcao:'Supervisora de Andares', superiorId:'gg', inicio:'2021-01-01' }),
    criarAtuacao({ id:'gov', pessoaRef:'GOV', organizacaoId:'GOLDEN', funcao:'Governanta', superiorId:'gg', inicio:'2021-01-01' }),
    criarAtuacao({ id:'c1', pessoaRef:'CAM', organizacaoId:'GOLDEN', funcao:'Camareira', superiorId:'sup', inicio:'2022-01-01' }),
    criarAtuacao({ id:'c2', pessoaRef:'CAM', organizacaoId:'GOLDEN', funcao:'Camareira', superiorId:'gov', inicio:'2022-01-01' }),
  ];
  assert.doesNotThrow(() => validarArvore(a,'GOLDEN'));
  assert.equal(atuacoesDe(a,'CAM').length, 2);
});
test('ciclo é rejeitado', () => {
  const a = [
    criarAtuacao({ id:'x', pessoaRef:'X', organizacaoId:'O', funcao:'f', superiorId:'y', inicio:'2020-01-01' }),
    criarAtuacao({ id:'y', pessoaRef:'Y', organizacaoId:'O', funcao:'f', superiorId:'x', inicio:'2020-01-01' }),
  ];
  assert.throws(() => validarArvore(a,'O'), e => e.codigo === 'ciclo');
});
test('duas raízes são rejeitadas, nenhuma raiz é rejeitada', () => {
  const duas = [criarAtuacao({ id:'a', pessoaRef:'A', organizacaoId:'O', funcao:'f', superiorId:null, ehRaiz:true, inicio:'2020-01-01' }),
                criarAtuacao({ id:'b', pessoaRef:'B', organizacaoId:'O', funcao:'f', superiorId:null, ehRaiz:true, inicio:'2020-01-01' })];
  assert.throws(() => validarArvore(duas,'O'), e => e.codigo === 'multiplas_raizes');
  assert.throws(() => validarArvore([],'O'), e => e.codigo === 'sem_raiz');
});
test('superior de outra organização é rejeitado', () => {
  const a = [criarAtuacao({ id:'r', pessoaRef:'R', organizacaoId:'A', funcao:'f', superiorId:null, ehRaiz:true, inicio:'2020-01-01' }),
             criarAtuacao({ id:'s', pessoaRef:'S', organizacaoId:'B', funcao:'f', superiorId:'r', inicio:'2020-01-01' })];
  assert.throws(() => validarArvore(a,'B'), e => e.codigo === 'superior_fora_da_organizacao');
});
test('semSuperior lista quem trava o ciclo', () => {
  const a = [criarAtuacao({ id:'r', pessoaRef:'R', organizacaoId:'O', funcao:'f', superiorId:null, ehRaiz:true, inicio:'2020-01-01' }),
             criarAtuacao({ id:'s', pessoaRef:'S', organizacaoId:'O', funcao:'f', superiorId:null, inicio:'2020-01-01' })];
  assert.equal(semSuperior(a,'O').length, 1);
  assert.doesNotThrow(() => validarArvore(a,'O'));   // sem superior é pendência, não erro
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/atuacao.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/modelo/atuacao.js`**

Detecção de ciclo por caminhada a partir de cada atuação com conjunto de visitados. `arvore` monta por índice de `superiorId`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- test/atuacao.test.js`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(modelo): atuação, árvore e invariantes com os casos Ana Carolina e duplo gestor"
```

---

### Task 6: Diferença entre cargas e trava de inativação

**Files:**
- Create: `src/carga/diff.js`, `test/diff.test.js`

**Interfaces:**
- Consumes: saída de `consolidar` (Tarefa 4) de duas cargas.
- Produces:
  - `diffCarga(anterior: Consolidado, nova: Consolidado, opcoes: { limitePercentual: number, limiteAbsoluto: number, organizacaoDe: (vinculo) => string }): Diff`
  - `Diff = { novos: Pessoa[], inativacoesPropostas: { pessoaRef, organizacaoId, origem: 'inferido_pela_carga' }[], travadas: { organizacaoId, quantidade, motivo }[], aplicaveis: {...}[] }`
  - Regra: pessoa presente na anterior e ausente da nova (por CPF, no conjunto inteiro) entra em `inativacoesPropostas`. Agrupa por organização. Se a quantidade da organização exceder `min(limitePercentual * tamanho, limiteAbsoluto)`, o grupo inteiro vai para `travadas`; senão para `aplicaveis`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('transferência entre filiais não gera inativação', () => {
  const ant = consolidado([{ cpf:'1', filial:'GOLDEN' }, { cpf:'2', filial:'GOLDEN' }]);
  const nov = consolidado([{ cpf:'1', filial:'CHATEAU' }, { cpf:'2', filial:'GOLDEN' }]);
  const d = diffCarga(ant, nov, { limitePercentual:0.05, limiteAbsoluto:10, organizacaoDe: v => v.filial });
  assert.equal(d.inativacoesPropostas.length, 0);
});
test('sumiu da carga vira inativação inferida', () => {
  const ant = consolidado([{ cpf:'1', filial:'GOLDEN' }, { cpf:'2', filial:'GOLDEN' }]);
  const nov = consolidado([{ cpf:'1', filial:'GOLDEN' }]);
  const d = diffCarga(ant, nov, { limitePercentual:0.5, limiteAbsoluto:10, organizacaoDe: v => v.filial });
  assert.deepEqual(d.aplicaveis.map(x => x.pessoaRef), ['2']);
  assert.equal(d.aplicaveis[0].origem, 'inferido_pela_carga');
});
test('arquivo de uma regional ausente trava a regional inteira', () => {
  const ant = consolidado(cem('GOLDEN').concat(cem('VIVACE')));
  const nov = consolidado(cem('GOLDEN'));
  const d = diffCarga(ant, nov, { limitePercentual:0.05, limiteAbsoluto:10, organizacaoDe: v => v.filial });
  assert.equal(d.travadas.length, 1);
  assert.equal(d.travadas[0].organizacaoId, 'VIVACE');
  assert.equal(d.travadas[0].quantidade, 100);
  assert.equal(d.aplicaveis.length, 0);
});
test('limite é o menor entre percentual e absoluto', () => {
  const ant = consolidado(cem('GOLDEN'));
  const nov = consolidado(cem('GOLDEN').slice(0, 94));   // 6 sumiram: 6% > 5%, mas 6 < 10
  const d = diffCarga(ant, nov, { limitePercentual:0.05, limiteAbsoluto:10, organizacaoDe: v => v.filial });
  assert.equal(d.travadas.length, 1);
});
```

`consolidado(...)` e `cem(filial)` são helpers do teste que montam um `Consolidado` mínimo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/diff.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `diffCarga` em `src/carga/diff.js`**

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- test/diff.test.js`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(carga): diff entre cargas com trava contra inativação em massa"
```

---

### Task 7: CLI de carga de ponta a ponta

**Files:**
- Create: `src/cli/carga.js`, `test/cli.test.js`

**Interfaces:**
- Consumes: tudo das Tarefas 1 a 6.
- Produces: `npm run carga -- data/clt/R1.csv data/clt/R2.csv data/clt/R3.csv data/pj/pj-2026.json` grava `out/base.json` (`{ geradoEm, pessoas, vinculos, pendencias, equivalenciaEmpresas, log }`) e imprime o resumo: totais, pendências por código, empresas com grafia múltipla, chaves com colisão.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('CLI gera out/base.json com os totais do levantamento', async () => {
  await rodarCli(['data/clt/R1.csv','data/clt/R2.csv','data/clt/R3.csv','data/pj/pj-2026.json']);
  const b = JSON.parse(fs.readFileSync('out/base.json','utf8'));
  assert.equal(b.pessoas.length, 1824);
  assert.equal(b.vinculos.filter(v => v.regime==='CLT').length, 1608);
  assert.equal(b.vinculos.filter(v => v.regime==='PJ').length >= 226, true);   // multi-empresa gera mais de um
  assert.equal(b.pendencias.length, 44);
  assert.equal(Object.keys(b.equivalenciaEmpresas).length, 40);
  assert.equal(b.log.filter(l => l.nivel==='erro').length, 0);
});
```

Sobre o 44: `pendencias` tem **uma entrada por par (pessoa, código)**. Uma pessoa sem CPF e sem cargo gera duas entradas. É assim que a Tarefa 4 define `Pendencia`, e 44 é a soma do levantamento de 03/11 (12 + 10 + 7 + 6 + 5 + 4), conferida sobre os dados reais.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/cli.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/cli/carga.js`**

Lê os arquivos, encadeia `parseCLT` x3, `parsePJ`, `consolidar`, grava e imprime. É o único módulo que toca disco além dos testes.

- [ ] **Step 4: Rodar e confirmar que passa, e rodar a suíte inteira**

Run: `npm test`
Expected: todos PASS. Colar o resumo impresso pelo CLI no commit.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cli): carga de ponta a ponta sobre as bases reais"
```

---

## Self-Review

**Cobertura do spec.** Seção 3.1 a 3.5: Tarefas 4 e 5. Seção 3.6 (snapshot de ciclo) e 3.7 (chave da avaliação): fora deste plano por desenho, entram no Plano C junto com ciclo. Seção 4 inteira: Tarefas 1 a 4 e 6. Seção 5 (acesso), 6 (escopo), 7 (telas), 12 (parâmetros): Planos B e C. Aceites 1, 2, 3, 5, 6, 7 cobertos aqui; 4, 8 a 13 nos planos seguintes.

**Consistência de tipos.** `RegistroCLT.chave`, `Pessoa.cpf | idProvisorio`, `Vinculo.pessoaRef`, `Atuacao.pessoaRef` usam o mesmo identificador. `LogItem` é um tipo só em todos os módulos.

**Review Focus.** Item 1 na Tarefa 2 (teste de BOM e de filial). Item 2 na Tarefa 4 (CPF mascarado). Item 3 na Tarefa 4 (nomes alternativos). Item 4 na Tarefa 6 (regional ausente). Item 5 na Tarefa 5 (superior fora da organização).

**Proporção.** O plano tem assinaturas e testes, não corpos. Os únicos blocos de código são testes, que são a especificação executável.

**Decisão pendente de execução.** Onde o repositório vive: no computador de Marcelo pela ponte, ou num remoto. Não bloqueia a escrita do plano, bloqueia o primeiro commit.
