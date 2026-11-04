# Plano B: Árvore e montagem da hierarquia. Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o protótipo navegável (versão 34, de 04/11, 00h) a rodar sobre a base real consolidada pelo Plano A, com CLT e PJ juntos, e entregar as três telas da Fundação que o RH ainda não viu: a árvore de cada organização, o painel de montagem da hierarquia e a fila de pendências, mais a trava que impede abrir ciclo com gente sem avaliador.

**Architecture:** O protótipo deixa de ser um arquivo único com dados cravados e vira um artefato de vários arquivos: `app/index.html` (telas), `app/js/` (os módulos do Plano A copiados sem alteração, mais os módulos novos de organização, montagem e adaptação), `app/data/base.json` (gerado, sem CPF, com hash). As telas antigas continuam existindo e passam a ler atuações em vez do array `PESSOAS`. Vínculos de liderança inferidos (por cargo, do protótipo de outubro; por empresa contratante, para PJ) entram rotulados como inferência e visíveis como tal em toda tela, para o RH confirmar ou substituir. Nenhuma função de regra toca DOM; a página é renderização fina sobre módulos testáveis em Node. O que o RH monta na tela persiste no banco do artefato (capacidade `db`) como delta sobre a base gerada: a base é a origem, o banco guarda só o que o RH mudou, e sem banco a página avisa e segue em memória. A publicação sai como **artefato novo**, em URL própria; a versão 26 continua no ar até Marcelo aprovar a troca. A publicação é ação fora do repositório e é uma parada obrigatória.

**Tech Stack:** Node 22, módulos ES, `node --test`, `jsdom` como dependência de desenvolvimento para testes de fumaça da página, Playwright (já instalado) só para captura de tela na verificação final. Sem framework. Publicação via ferramenta Artifact com `files` e `capabilities: { db, user }`.

**Spec:** `docs/spec/SPEC-00-FUNDACAO.md` (seções 3.3, 3.4, 3.5, 4.3, 7.1 a 7.4, 10). Decisões D3, D5, D10, D12, D14 e P9 ("PJ em todas as telas, piloto incluído").

## Global Constraints

- **Nenhum CPF, RG ou data de nascimento** em `app/`, em `dist/`, no HTML publicado ou em fixture. CPF só existe como hash SHA-256 com sal, como a versão 26 já faz. Teste de varredura obrigatório antes de cada publicação (aceite 13).
- `app/data/base.json` é **gerado** de `out/base.json` e **gitignored**, como `data/`. Contém nome, cargo, unidade, regime, pendências, faixa etária (derivada no build, nunca a data) e hash. Nomes reais são dado pessoal: ficam fora do git e dentro do artefato privado, que é o que Marcelo autorizou em outubro.
- A versão 26 exibe CPF mascarado e data de nascimento no array `PESSOAS`. Isso contraria a regra do projeto e **sai** na Tarefa 1: a página nova não tem esses campos em lugar nenhum. O gráfico de idade do Painel do RH passa a usar `faixaEtaria`.
- **Inferência é rotulada.** Toda atuação cujo superior não foi definido por pessoa recebe `origem: 'inferido_por_cargo' | 'inferido_por_empresa'`, e toda tela que a mostra exibe o rótulo. Vínculo definido pelo RH recebe `origem: 'definido'` com autor e data.
- **Fonte única e delta.** `base.json` é a origem dos dados. O banco do artefato guarda apenas as alterações do RH (`delta`), por organização. A página aplica `base + delta` ao carregar. Nunca gravar a base inteira no banco, nunca cravar dado no HTML.
- **Mesmo sal de hash** da versão 26: `SALT = "lgh-avd-2026::"` (linha 639 do HTML). Sem isso o login por CPF de Marcelo e Christine quebra.
- **Regra estrutural fixa:** cada superior diferente gera uma atuação; uma atuação tem um superior; uma raiz por organização, marcada com `ehRaiz`; sem ciclos. Usar `validarArvore` do Plano A sem reescrever.
- **O baseline é a versão 34** do protótipo (publicada em 04/11 às 00h), que já traz: colaborador fixo no Formulário (bloco FIX, D21), indicação de promoção (bloco IND, D22), histórico por colaborador, filtro por status, visão por ciclo, persistência das avaliações no banco do artefato (bloco DB), turno fora do modelo (D16), marca de líder com conta automática (bloco LID, D17), formulários versionados (bloco FORM, D18) e Evolução só com dado real (D19). A primeira tarefa só a copia. Os blocos DB, LID, FORM, FIX, IND e AV2 do fim do arquivo são mantidos e passam a ler as atuações pelo adaptador.
- **Turno não existe** (D16): nenhum campo, filtro ou texto de turno em lugar nenhum. Equipe é o setor.
- **Estrutura corporativa** (D20): a organização `LAGHETTO CORPORATIVO` (tipo `corporativa`, origem `definida`) é criada vazia na Tarefa 2 e montada só pelo RH da holding. Nenhuma inferência de diretor ou CEO: o pool da visão Rede mostra os PJ sem organização para o N6 montar.
- **Os módulos do Plano A não são alterados** neste plano. Bug neles é tarefa nova no Plano A, não remendo aqui.
- Visual mantém o sistema da versão 26: mesmos tokens de cor, mesmos dois temas, mesma tipografia. Tela nova parece a mesma plataforma. O implementador das Tarefas 5 e 6 carrega o skill `frontend-design` antes de escrever a tela.
- Sem travessão em nenhum texto.
- O Desfazer existente (`HIST`, `mudar`, `desfazer`, 30 passos) passa a cobrir a montagem. Não criar um segundo mecanismo.

## Review Focus

1. **1.822 pessoas numa página feita para 174.** A Matriz da versão 26 renderiza todas as linhas de uma vez. Com a rede inteira, trava o navegador. A Matriz passa a mostrar só a organização selecionada, e a árvore abre colapsada abaixo do segundo nível. Teste na Tarefa 4 e na Tarefa 5.
2. **Pessoa em duas organizações** (Ana Carolina; a camareira com duplo gestor). Aparece nas duas árvores, uma vez em cada, e uma única vez na lista de pessoas. Teste na Tarefa 3 e na Tarefa 5.
3. **Vínculo inferido tratado como fato.** A versão 26 inventou avaliadores por cargo e isso foi erro registrado. O rótulo de inferência tem que aparecer na Matriz, no Formulário e na árvore, não só no painel de montagem. Teste na Tarefa 4.
4. **Desfazer que não cobre a montagem.** Adicionar 12 camareiras em bloco e não poder voltar repete o erro de outubro. Teste na Tarefa 6.
5. **Hash de CPF calculado na página a cada carga.** Com 1.822 pessoas, `crypto.subtle` em série demora segundos. O hash é pré-calculado no build e gravado em `base.json`; a página só compara. Teste na Tarefa 1.

---

## File Structure

```
lgh-avd/
  app/
    index.html                    telas (vinda da versão 26, adaptada)
    js/carga/*.js                 cópia dos módulos do Plano A (build copia; não editar aqui)
    js/modelo/atuacao.js          cópia (idem)
    js/modelo/organizacao.js      NOVO: criarOrganizacao, organizacoesDe(base)
    js/modelo/bootstrap.js        NOVO: atuacoesIniciais(base, organizacoes) com rótulo de inferência
    js/modelo/montagem.js         NOVO: operações puras de montagem sobre atuações
    js/modelo/pendencias.js       NOVO: filaDePendencias(base, atuacoes, organizacaoId)
    js/modelo/persistencia.js     NOVO: calcularDelta, aplicarDelta (puros) e o adaptador do banco do artefato
    js/modelo/equivalencia-organizacoes.json  NOVO, versionado: empresa PJ → organização, com motivo, para os casos que nome e número não resolvem
    js/adaptador.js               NOVO: funções que as telas antigas chamam (visiveis, avaliadosDe...) lendo atuações
    data/base.json                GERADO, gitignored
  scripts/
    build-app.mjs                 copia src/ → app/js/, gera app/data/base.json, varre CPF, monta dist/
  dist/                           gitignored; o que é publicado
  test/
    app-base.test.js app-organizacao.test.js app-bootstrap.test.js app-adaptador.test.js
    app-arvore.test.js app-montagem.test.js app-pendencias.test.js app-trava.test.js app-build.test.js
    helpers/pagina.js             carrega app/index.html no jsdom com base de teste
    fixtures/base-mini.json       base sintética: 2 organizações, 14 pessoas, 1 em duas orgs, 1 duplo gestor, 3 pendências
```

Decisões de estrutura:
- `app/js/carga` e `app/js/modelo/atuacao.js` são **cópias feitas pelo build**, nunca editadas. Fonte única é `src/`.
- A página carrega módulos com `<script type="module">` e `import` relativo. O artefato é publicado com `files`, então `fetch('data/base.json')` funciona.
- Estado global da página continua em `S`, mas `S.pessoas`, `S.organizacoes` e `S.atuacoes` substituem `PESSOAS` e `AVALIAVEIS`. As telas antigas chamam o adaptador; nenhuma lê arrays globais diretamente.
- Teste de página usa `jsdom` com a fixture sintética, nunca com `base.json` real. Teste de integração sobre a base real existe só para contagem e varredura de CPF, e pula se `out/base.json` não existir.

---

### Task 1: Baseline no repositório, build e base pública sem CPF

**Files:**
- Create: `app/index.html` (cópia exata de `/tmp/claude-0/-home-claude/3623909c-8331-5f31-a91b-2eae438e4346/scratchpad/rh/index.html`, versão 26; se ausente, ler o artefato publicado `https://claude.ai/artifact/QxnVK1GAFkRcLKr1rNTEfN`)
- Create: `scripts/build-app.mjs`, `test/app-build.test.js`, `test/fixtures/base-mini.json`, `test/helpers/pagina.js`
- Modify: `package.json` (scripts `build:app`, devDependency `jsdom@^25`), `.gitignore` (`app/data/`, `app/js/carga/`, `app/js/modelo/atuacao.js`, `dist/`)

**Interfaces:**
- Produces:
  - `npm run build:app` → copia `src/carga/*.js` e `src/modelo/atuacao.js` para `app/js/`, gera `app/data/base.json`, monta `dist/` (cópia de `app/`), aborta com código 4 se encontrar CPF ou data de nascimento em qualquer arquivo de `dist/`.
  - `app/data/base.json = { geradoEm, commit, pessoas: PessoaPublica[], vinculos: Vinculo[] (sem campo cpf; pessoaRef vira pessoaId), pendencias, equivalenciaEmpresas }`
  - `PessoaPublica = { id: string (hash curto, 12 hex do SHA-256 do CPF com sal; ou idProvisorio), nome, status, motivoStatus, cpfHash: string|null (SHA-256 completo com sal, para login), faixaEtaria: 'até 24'|'25 a 34'|'35 a 44'|'45 a 54'|'55 ou mais'|null (calculada no build com a data de geração), nomesAlternativos }`. **Sem cpf, sem nascimento, sem idade exata.**
  - `app/data/inferencias-v26.json`: `{ [nomePessoa]: string[] }` extraído do `PESSOAS[].avaliadores` da versão 26 no Step 1, antes de remover o array. Gitignored (tem nomes).
  - `test/helpers/pagina.js`: `carregarPagina(baseJson): Promise<{ window, document, S }>`: monta `app/index.html` no jsdom, injeta a base no lugar do `fetch`, espera o boot.
  - `test/fixtures/base-mini.json`: 3 filiais CLT (`GOLDEN A&B` e `GOLDEN RESORT`, fundidas em `GOLDEN` pela fixture de fusões do teste, e `BRANO`), 11 pessoas no Golden e 4 na Brano, 1 pessoa nas duas (`ANA`), 1 camareira com dois superiores (`CAM`), 1 pessoa com CLT e PJ na mesma filial (`DUPLO-VINCULO`), 1 PJ cuja empresa é igual a uma filial (`GG`, gerente geral) e 1 PJ sem casamento (`PJ-SEM-ORG`), 3 pendências (`sem_cpf`, `possivel_duplicado`, `inicio_futuro`), mais a estrutura corporativa montada: `CEO-REDE` raiz, `DR` diretor regional abaixo, e `GG` (gerente geral do Golden) com segunda atuação sob `DR`; hashes sintéticos, CPFs no padrão `000.000.000-0N` só no gerador da fixture, nunca na fixture.

- [ ] **Step 1: Copiar a versão 26 e commitar como baseline, sem alteração**

```bash
mkdir -p app && cp <caminho da v26> app/index.html && git add app/index.html && git commit -m "chore(app): protótipo versão 26 como baseline do Plano B"
```

- [ ] **Step 2: Escrever os testes que falham**

```js
// test/app-build.test.js
test('build gera base.json sem CPF, sem nascimento, com hash', async () => {
  await rodar('npm run build:app');
  const b = JSON.parse(fs.readFileSync('app/data/base.json', 'utf8'));
  const txt = JSON.stringify(b);
  assert.equal(/\d{11}/.test(txt), false);
  assert.equal(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(txt), false);
  assert.equal('cpf' in b.pessoas[0], false);
  assert.equal('nascimento' in b.pessoas[0], false);
  assert.equal('idade' in b.pessoas[0], false);
  assert.ok(['até 24','25 a 34','35 a 44','45 a 54','55 ou mais',null].includes(b.pessoas[0].faixaEtaria));
  assert.match(b.pessoas.find(p => p.cpfHash).cpfHash, /^[0-9a-f]{64}$/);
  assert.match(b.pessoas[0].id, /^([0-9a-f]{12}|sem-cpf-\d+)$/);
}, soComDados);
test('build copia os módulos do Plano A sem alteração', async () => {
  await rodar('npm run build:app');
  assert.equal(fs.readFileSync('app/js/modelo/atuacao.js','utf8'), fs.readFileSync('src/modelo/atuacao.js','utf8'));
});
test('build aborta com código 4 se dist/ contiver CPF', async () => {
  fs.writeFileSync('app/data/vazamento.json', '{"x":"12345678901"}');
  await assert.rejects(rodar('npm run build:app'), e => e.code === 4);
  fs.rmSync('app/data/vazamento.json');
});
test('helper carrega a página no jsdom com a base mini e o boot termina', async () => {
  const { document, S } = await carregarPagina(lerFixture('base-mini.json'));
  assert.ok(document.querySelector('#nav'));
  assert.equal(S.pessoas.length, 14);
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- test/app-build.test.js`
Expected: FAIL.

- [ ] **Step 4: Implementar `scripts/build-app.mjs`, `test/helpers/pagina.js`, a fixture, e instalar `jsdom`**

Hash: `SHA-256(SALT + cpf)` com o mesmo `SALT = "lgh-avd-2026::"` da versão 26, via `node:crypto`. `id` = primeiros 12 hex do hash. O helper do jsdom substitui `window.fetch` por uma função que devolve a base passada, e o `index.html` passa a ler a base via `fetch('data/base.json')` dentro de `boot()`. Nesta tarefa o HTML muda só nisso e na remoção do array `PESSOAS` (com seus campos `cpf`, `nasc`, `idade`); o gráfico `#rh-idade` passa a agrupar por `faixaEtaria`. O build também grava `app/data/inferencias-v26.json` a partir do array removido, lido do arquivo original da versão 26 (caminho fixo no script), não do `app/index.html`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: todos PASS, inclusive os 56 do Plano A.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(app): build do artefato com base pública sem CPF, módulos copiados e harness jsdom"
```

---

### Task 2: Organizações iniciais e atuações inferidas rotuladas

**Files:**
- Create: `app/js/modelo/organizacao.js`, `app/js/modelo/bootstrap.js`, `test/app-organizacao.test.js`, `test/app-bootstrap.test.js`

**Interfaces:**
- Produces:
  - `criarOrganizacao({ id, nome, tipo: 'unidade'|'area'|'empresa'|'corporativa', regional?: string|null, situacao?: 'ativa', origem?: 'sugerida_pela_carga'|'definida' }): Organizacao`
  - `organizacoesDe(base, fusoes = FUSOES): Organizacao[]`: uma por filial CLT distinta (tipo `unidade`, regional do vínculo, `id = chaveEmpresa(filial)`, `origem: 'sugerida_pela_carga'`), exceto as filiais listadas em `fusoes`, que viram uma organização só, **mais** `{ id: 'LAGHETTO CORPORATIVO', nome: 'Laghetto Corporativo', tipo: 'corporativa', origem: 'definida' }`, sempre, vazia (D20). `FUSOES` tem uma entrada, a que o piloto de outubro já tratava como um hotel: `{ id: 'HOTEL LAGHETTO GOLDEN', nome: 'Hotel Laghetto Golden', filiais: ['LAGHETTO FL 18 A&B GOLDEN', 'LAGHETTO RESORT GOLDEN'] }`. **P8 continua aberta:** áreas administrativas e empresas distintas não são criadas aqui, e toda organização sugerida aparece com esse rótulo até o RH confirmar; PJ sem organização correspondente ficam no pool "sem organização".
  - `inferirOrganizacao(empresaNormalizada, organizacoes, equivalencias): { organizacaoId: string, metodo: 'nome'|'prefixo'|'numero'|'tabela' } | null`, em `organizacao.js`. Ordem: (1) `nome`: igual ao `id` ou a uma das filiais fundidas; (2) `prefixo`: um é prefixo do outro com pelo menos 20 caracteres, porque o Domínio trunca a razão social (`CONDOMINIO DO EDIFICIO COMERCIAL ATHIVAB`); (3) `numero`: mesmo número de filial, extraído por `/\b(?:FL|FILIAL|FLIAL)\s*0*(\d+)\b/`; (4) `tabela`: `equivalencia-organizacoes.json`, versionado, com `{ empresa, organizacaoId, motivo }`, começando com `GOLDEN GRAMADO RESORT LAGHETTO → HOTEL LAGHETTO GOLDEN` (é a pagadora do gerente geral sênior, do gerente de hospedagem e da governanta executiva do Golden). Nada casa → `null`. Medido em 03/11 sobre a base real: 240 vínculos PJ, 9 casam por nome, 71 por número, cerca de 24 por prefixo, 9 pela tabela; os cerca de 127 restantes são de `LAGHETTO HOTEIS` (57) e `LAGHETTO ADMINISTRADORA DE HOTEIS` (46) e outras sem filial própria, e vão para o pool. **Esse número aparece na tela** ("127 PJ sem organização, para o RH distribuir").
  - `atuacoesIniciais(base, organizacoes, inferenciasDaV26: { [nomePessoa]: string[] }): { atuacoes: Atuacao[], semOrganizacao: PessoaPublica[], log }`
    - Uma atuação por vínculo CLT, na organização da filial, `superiorId: null`, `funcao: cargo`, `origem: 'carga'`.
    - PJ com `inferirOrganizacao` não nulo recebe atuação nela com `origem: 'inferido_por_empresa'` e `metodoInferencia`; os demais vão para `semOrganizacao`. Pessoa com vínculo CLT e PJ na mesma organização recebe **uma** atuação (regra 3.4: vínculo não cria atuação).
    - Os vínculos de avaliador da versão 26 (`PESSOAS[].avaliadores`, extraídos pelo build para `app/data/inferencias-v26.json`) viram `superiorId` com `origem: 'inferido_por_cargo'`, **só quando avaliador e avaliado estão na mesma organização**.
    - Raiz: a atuação do cargo `GERENTE GERAL` (ou `GERENTE GERAL SENIOR`) de cada organização recebe `ehRaiz: true`, `origem: 'inferido_por_cargo'`. Organização sem gerente geral fica sem raiz e aparece como pendência.
    - Toda atuação tem `origem` e, quando inferida, `confirmadaPor: null`.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('organizacoesDe cria uma unidade por filial CLT com a regional', () => {
  const o = organizacoesDe(lerFixture('base-mini.json'));
  assert.deepEqual(o.map(x => x.id).sort(), ['BRANO', 'GOLDEN']);
  assert.equal(o.find(x => x.id === 'GOLDEN').tipo, 'unidade');
});
test('atuacoesIniciais: CLT na organização da filial, sem superior, origem carga', () => {
  const b = lerFixture('base-mini.json');
  const { atuacoes } = atuacoesIniciais(b, organizacoesDe(b), {});
  const a = atuacoes.find(x => x.pessoaRef === 'CAM1');
  assert.equal(a.organizacaoId, 'GOLDEN'); assert.equal(a.superiorId, null); assert.equal(a.origem, 'carga');
});
test('organizacoesDe inclui a estrutura corporativa vazia, tipo corporativa', () => {
  const o = organizacoesDe(lerFixture('base-mini.json'));
  const c = o.find(x => x.id === 'LAGHETTO CORPORATIVO');
  assert.equal(c.tipo, 'corporativa'); assert.equal(c.origem, 'definida');
});
test('organizacoesDe funde as filiais listadas em fusoes numa organização só', () => {
  const o = organizacoesDe(lerFixture('base-mini.json'), [{ id: 'GOLDEN', nome: 'Golden', filiais: ['GOLDEN A&B', 'GOLDEN RESORT'] }]);
  assert.equal(o.filter(x => ['GOLDEN A&B', 'GOLDEN RESORT'].includes(x.id)).length, 0);
  assert.deepEqual(o.find(x => x.id === 'GOLDEN').filiais, ['GOLDEN A&B', 'GOLDEN RESORT']);
});
test('inferirOrganizacao: nome, prefixo com 20+ caracteres, número de filial, tabela, e null', () => {
  const orgs = [{ id: 'LAGHETTO FL 12 LAGHETTO GRAMADO' }, { id: 'CONDOMINIO DO EDIFICIO COMERCIAL ATHIVAB' }, { id: 'GOLDEN', filiais: ['LAGHETTO RESORT GOLDEN'] }];
  const tab = [{ empresa: 'GOLDEN GRAMADO RESORT LAGHETTO', organizacaoId: 'GOLDEN', motivo: 'teste' }];
  assert.deepEqual(inferirOrganizacao('LAGHETTO RESORT GOLDEN', orgs, tab), { organizacaoId: 'GOLDEN', metodo: 'nome' });
  assert.deepEqual(inferirOrganizacao('CONDOMINIO DO EDIFICIO COMERCIAL ATHIVABRASIL', orgs, tab), { organizacaoId: 'CONDOMINIO DO EDIFICIO COMERCIAL ATHIVAB', metodo: 'prefixo' });
  assert.deepEqual(inferirOrganizacao('LAGHETTO HOTEIS FILIAL 12 GRAMADO', orgs, tab), { organizacaoId: 'LAGHETTO FL 12 LAGHETTO GRAMADO', metodo: 'numero' });
  assert.deepEqual(inferirOrganizacao('GOLDEN GRAMADO RESORT LAGHETTO', orgs, tab), { organizacaoId: 'GOLDEN', metodo: 'tabela' });
  assert.equal(inferirOrganizacao('LAGHETTO HOTEIS', orgs, tab), null);
  assert.equal(inferirOrganizacao('LAGHETTO FL 1', orgs, tab), null, 'prefixo curto demais não casa');
});
test('atuacoesIniciais: PJ inferido entra com origem e método; sem casamento vai para semOrganizacao', () => {
  const b = lerFixture('base-mini.json');
  const { atuacoes, semOrganizacao } = atuacoesIniciais(b, organizacoesDe(b), {});
  const gg = atuacoes.find(x => x.pessoaRef === 'GG');
  assert.equal(gg.origem, 'inferido_por_empresa'); assert.equal(gg.metodoInferencia, 'nome');
  assert.deepEqual(semOrganizacao.map(p => p.id), ['PJ-SEM-ORG']);
});
test('atuacoesIniciais: pessoa com CLT e PJ na mesma organização tem uma atuação só', () => {
  const b = lerFixture('base-mini.json');
  const { atuacoes } = atuacoesIniciais(b, organizacoesDe(b), {});
  assert.equal(atuacoes.filter(x => x.pessoaRef === 'DUPLO-VINCULO').length, 1);
});
test('base real: ao menos 100 vínculos PJ recebem organização e o restante é contado', { skip: !temDadosReais }, () => {
  const { atuacoes, semOrganizacao } = atuacoesIniciais(baseReal, organizacoesDe(baseReal), {});
  assert.ok(atuacoes.filter(a => a.origem === 'inferido_por_empresa').length >= 100);
  assert.ok(semOrganizacao.length >= 100 && semOrganizacao.length <= 140);
  assert.equal(organizacoesDe(baseReal).length, 37, '36 unidades mais a corporativa');
});
test('atuacoesIniciais: vínculo da v26 vira superior inferido_por_cargo só na mesma organização', () => {
  const b = lerFixture('base-mini.json');
  const { atuacoes } = atuacoesIniciais(b, organizacoesDe(b), { 'CAMAREIRA UM': ['SUPERVISORA ANDARES'], 'ANA': ['CEO BRANO'] });
  assert.equal(atuacoes.find(x => x.pessoaRef === 'CAM1').origem, 'inferido_por_cargo');
  assert.equal(atuacoes.find(x => x.pessoaRef === 'ANA' && x.organizacaoId === 'GOLDEN').superiorId, null);
});
test('atuacoesIniciais: gerente geral vira raiz; organização sem gerente geral fica sem raiz e é logada', () => {
  const b = lerFixture('base-mini.json');
  const { atuacoes, log } = atuacoesIniciais(b, organizacoesDe(b), {});
  assert.equal(atuacoes.filter(a => a.ehRaiz && a.organizacaoId === 'GOLDEN').length, 1);
  assert.ok(log.some(l => l.codigo === 'organizacao_sem_raiz' && l.mensagem.includes('BRANO')));
});
test('atuacoesIniciais: Ana tem duas atuações, uma em cada organização, e validarArvore aceita as duas', () => {
  const b = lerFixture('base-mini.json');
  const { atuacoes } = atuacoesIniciais(b, organizacoesDe(b), {});
  assert.equal(atuacoesDe(atuacoes, 'ANA').length, 2);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**: Run: `npm test -- test/app-organizacao.test.js test/app-bootstrap.test.js`, Expected: FAIL.
- [ ] **Step 3: Implementar os dois módulos**
- [ ] **Step 4: Rodar e confirmar que passa**: Run: `npm test`, Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "feat(app): organizações por filial e atuações iniciais com inferência rotulada"`

---

### Task 3: Adaptador: as telas antigas passam a ler atuações

**Files:**
- Create: `app/js/adaptador.js`, `test/app-adaptador.test.js`
- Modify: `app/index.html`: remover `const PESSOAS`, `const AVALIAVEIS`, `avaliadosDe`, `visiveis`; `boot()` carrega base, organizações e atuações em `S`; Matriz, Formulário, Evolução, Painel do RH e Painel do avaliador chamam o adaptador. Seletor de organização no topo (D5) com filtro por empresa.

**Interfaces:**
- Produces, todas puras, recebendo `S`:
  - `pessoasDa(S, organizacaoId): PessoaPublica[]`: pessoas com atuação corrente na organização, cada uma uma vez.
  - `avaliadosDe(S, pessoaId, organizacaoId): Atuacao[]`: atuações cujo superior é uma atuação dessa pessoa nessa organização.
  - `visiveis(S): PessoaPublica[]`: avaliador: `avaliadosDe` na organização selecionada; demais papéis: `pessoasDa` da organização selecionada. **Nunca a rede inteira** (Review Focus 1).
  - `rotuloOrigem(atuacao): string`: `'Definido pelo RH'`, `'Inferido pelo cargo'`, `'Inferido pela empresa'`, `'Da carga, sem superior'`.
  - `nivelDe(S, pessoaId): 'N1'|'N2'|'N3'|'N4'|'N5'|'N6'|null` (spec 6, D20): sem subordinados → `null`; só subordinados diretos sem líderes abaixo → N1; algum subordinado que é líder → N2; raiz de unidade → N4; na estrutura corporativa, subordinado direto da raiz corporativa → N6 (diretores gerais) e quem tem raiz de unidade abaixo → N5; raiz corporativa → N6; RH da holding → N6 pelo papel. N3 (chefe de setor) fica para o Plano C, quando setor existir na plataforma. A aba Usuários passa a exibir `nivelDe`, nunca o campo gravado.
  - `S.organizacaoSelecionada` default: `'LAGHETTO RESORT GOLDEN'` normalizado, se existir; senão a primeira.

- [ ] **Step 1: Testes que falham**

```js
test('pessoasDa lista cada pessoa uma vez mesmo com duas atuações na mesma organização', async () => {
  const { S } = await carregarPagina(lerFixture('base-mini.json'));
  const nomes = pessoasDa(S, 'GOLDEN').map(p => p.nome);
  assert.equal(nomes.filter(n => n === 'CAMAREIRA UM').length, 1);
});
test('visiveis para avaliador é só a equipe dele na organização selecionada', async () => {
  const { S } = await carregarPagina(lerFixture('base-mini.json'));
  S.perfil = { papel: 'avaliador', pessoaId: 'SUP' }; S.organizacaoSelecionada = 'GOLDEN';
  assert.deepEqual(visiveis(S).map(p => p.id).sort(), ['CAM1']);
});
test('nivelDe deriva da posição: supervisora N1, gerente geral N4, diretor regional N5, CEO N6', async () => {
  const { S } = await carregarPagina(lerFixture('base-mini.json'));
  assert.equal(nivelDe(S, 'SUP'), 'N1'); assert.equal(nivelDe(S, 'GG'), 'N4');
  assert.equal(nivelDe(S, 'DR'), 'N5'); assert.equal(nivelDe(S, 'CEO-REDE'), 'N6'); assert.equal(nivelDe(S, 'CAM'), null);
});
test('visiveis para RH nunca devolve pessoa de outra organização', async () => {
  const { S } = await carregarPagina(lerFixture('base-mini.json'));
  S.perfil = { papel: 'rh_unidade' }; S.organizacaoSelecionada = 'GOLDEN';
  assert.equal(visiveis(S).some(p => p.id === 'CEO'), false);
});
test('Matriz renderiza só a organização selecionada e mostra o rótulo de origem', async () => {
  const { document, S, window } = await carregarPagina(lerFixture('base-mini.json'));
  S.perfil = { papel: 'rh_unidade' }; window.irPara('matriz');
  const linhas = [...document.querySelectorAll('#m-tabela tbody tr')];
  assert.equal(linhas.length, 11);
  assert.ok(linhas.some(tr => /Inferido pelo cargo/.test(tr.textContent)));
});
test('Formulário lista no seletor só quem o avaliador avalia', async () => {
  const { document, S, window } = await carregarPagina(lerFixture('base-mini.json'));
  S.perfil = { papel: 'avaliador', pessoaId: 'SUP' }; window.irPara('form');
  assert.equal(document.querySelectorAll('#fm-colab option').length, 1);
});
test('chave da avaliação separa as duas atuações da mesma pessoa', async () => {
  const { S, window } = await carregarPagina(lerFixture('base-mini.json'));
  const [a1, a2] = atuacoesDe(S.atuacoes, 'CAM');
  S.colab = a1; S.tipo = 'colab'; const k1 = window.chaveAval();
  S.colab = a2; const k2 = window.chaveAval();
  assert.notEqual(k1, k2); assert.match(k1, /\|colab$/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**, Expected: FAIL.
- [ ] **Step 3: Implementar o adaptador e adaptar o HTML.** Trocar cada leitura de `PESSOAS`/`AVALIAVEIS` por chamada ao adaptador. `renderMatriz` ganha a coluna "Origem do vínculo" com `rotuloOrigem`. **Chave da avaliação passa a `atuacaoId + '|' + tipo`** (`chaveAval()` na linha 1414 da versão 26; `S.colab` passa a carregar a atuação, não só a pessoa). Spec 3.7 e 10.1 exigem autorização de Marcelo para isso; a aprovação deste plano é essa autorização, e sem ela a camareira com dois avaliadores tem a segunda avaliação sobrescrevendo a primeira já na demonstração. Teste adicional: duas avaliações da mesma pessoa em duas atuações ficam gravadas separadas em `ENVIADAS`.
- [ ] **Step 4: Rodar e confirmar que passa**: Run: `npm test`, Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "feat(app): telas antigas leem atuações pelo adaptador; matriz por organização com origem do vínculo"`

---

### Task 4: Tela Árvore da organização

**Files:**
- Create: `app/js/arvore-ui.js` (render puro: recebe `No` e devolve string HTML), `test/app-arvore.test.js`
- Modify: `app/index.html`: nova `<section id="t-arvore">` e entrada em `TELAS` com `req: 'verMatriz'`, posicionada depois da Matriz.

**Interfaces:**
- Produces:
  - `renderArvore(no: No, opcoes: { profundidadeAberta: number, pessoas: Map<id,PessoaPublica>, destacarSemSuperior: boolean }): string`: HTML aninhado; nós abaixo de `profundidadeAberta` vêm com `hidden`; cada caixa tem `data-atuacao`, nome, função, rótulo de origem e contagem de subordinados.
  - `resumoOrganizacao(S, organizacaoId): { total, comSuperior, semSuperior, inferidos, definidos, semOrganizacao }`.
  - Tela: cabeçalho com seletor de organização e filtro por empresa, medidor "N de M com líder definido, K sem líder", lista vermelha "Sem líder" com os nomes, árvore colapsável, legenda de origem. Clique numa caixa abre o painel de montagem (Tarefa 5).
  - **Visão Rede (D20):** opção "Rede" no seletor, que renderiza a árvore de `LAGHETTO CORPORATIVO` com `renderArvore`; cada atuação que é raiz de uma unidade (a pessoa tem outra atuação com `ehRaiz` em organização tipo `unidade`) vem como caixa fechada da unidade: nome da unidade, nome do gerente geral, medidor `resumoOrganizacao` da unidade, vermelha quando a unidade não tem raiz. Clicar troca o seletor para a unidade. Unidades cujo gerente geral não tem atuação corporativa aparecem numa faixa "Unidades sem ligação ao corporativo: N" com os nomes.
  - **Cabeçalho da unidade:** "Gerente geral: Fulano · avaliado por: Beltrano (estrutura corporativa)" com link que sobe para a Rede; "sem ligação ao corporativo" em vermelho quando falta.
  - `ligacoesCorporativas(S): { ligadas: string[], semLigacao: string[] }` com os ids das unidades.

- [ ] **Step 1: Testes que falham**

```js
test('renderArvore: raiz aberta, netos fechados por padrão, caixa carrega rótulo de origem', () => {
  const S = montarEstado(lerFixture('base-mini.json'));
  const html = renderArvore(arvore(S.atuacoes, 'GOLDEN'), { profundidadeAberta: 1, pessoas: S.pessoasPorId, destacarSemSuperior: true });
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('[data-atuacao]').length, 11);
  assert.ok(doc.querySelector('[data-atuacao="gg"]'));
  assert.equal(doc.querySelector('[data-nivel="2"]').hidden, true);
  assert.match(doc.querySelector('[data-atuacao="sup"]').textContent, /Inferido/);
});
test('resumoOrganizacao conta sem superior e inferidos', () => {
  const S = montarEstado(lerFixture('base-mini.json'));
  const r = resumoOrganizacao(S, 'GOLDEN');
  assert.equal(r.total, 11); assert.equal(r.semSuperior, 3); assert.equal(r.inferidos, 7);
});
test('camareira com dois superiores aparece sob as duas caixas', () => {
  const S = montarEstado(lerFixture('base-mini.json'));
  const doc = new JSDOM(renderArvore(arvore(S.atuacoes, 'GOLDEN'), { profundidadeAberta: 9, pessoas: S.pessoasPorId })).window.document;
  assert.equal([...doc.querySelectorAll('[data-atuacao]')].filter(el => el.dataset.pessoa === 'CAM').length, 2);
});
test('visão Rede mostra o Golden como caixa fechada sob DR e marca unidade sem ligação', async () => {
  const { document, S, window } = await carregarPagina(lerFixture('base-mini.json'));
  S.perfil = { papel: 'admin' }; window.irPara('arvore');
  document.querySelector('#ar-org').value = 'LAGHETTO CORPORATIVO'; document.querySelector('#ar-org').dispatchEvent(new window.Event('change'));
  const caixa = document.querySelector('[data-unidade="GOLDEN"]');
  assert.ok(caixa); assert.match(caixa.textContent, /GERENTE GERAL/i);
  assert.match(document.querySelector('#ar-sem-ligacao').textContent, /BRANO/);
  caixa.click(); assert.equal(document.querySelector('#ar-org').value, 'GOLDEN');
  assert.match(document.querySelector('#ar-cabecalho').textContent, /avaliado por/);
});
test('tela Árvore: trocar de organização re-renderiza e o medidor bate com resumoOrganizacao', async () => {
  const { document, S, window } = await carregarPagina(lerFixture('base-mini.json'));
  S.perfil = { papel: 'rh_unidade' }; window.irPara('arvore');
  document.querySelector('#ar-org').value = 'BRANO'; document.querySelector('#ar-org').dispatchEvent(new window.Event('change'));
  assert.match(document.querySelector('#ar-medidor').textContent, /4/);
});
test('tela Árvore com a base real renderiza o Golden em menos de 500 ms', { skip: !temDadosReais }, async () => { /* mede performance.now() em volta de renderArvore */ });
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar.** Carregar `frontend-design` antes da tela. Árvore em HTML/CSS (`<ul>` aninhado, conectores por `border-left`), sem biblioteca. Colapso por `hidden` nos filhos e um botão por caixa.
- [ ] **Step 4: Rodar e confirmar que passa.**
- [ ] **Step 5: Commit**: `git commit -m "feat(app): tela Árvore da organização, colapsável, com origem do vínculo e medidor"`

---

### Task 5: Painel de montagem

**Files:**
- Create: `app/js/modelo/montagem.js`, `test/app-montagem.test.js`
- Modify: `app/index.html`: painel lateral na tela Árvore (`#ar-painel`): equipe atual do líder clicado, pool filtrável, seleção em bloco.

**Interfaces:**
- Produces, puras sobre `atuacoes` (devolvem novo array; nunca mutam):
  - `pool(S, organizacaoId, filtro: { cargo?, setor?, turno?, texto? }): Atuacao[]`: atuações correntes da organização sem superior e não raiz, filtradas.
  - `adicionarEmBloco(atuacoes, ids: string[], superiorId: string, autor: string, quando: string): Atuacao[]`: define `superiorId` e `origem: 'definido'`, `confirmadaPor: autor`, `definidoEm: quando`; rejeita com `codigo: 'proprio_superior'` se algum id for o próprio superior; valida a árvore depois e lança o erro de `validarArvore` se quebrar.
  - `remover(atuacoes, id, autor, quando): Atuacao[]`: `superiorId: null`, `origem: 'definido'`, devolve ao pool.
  - `marcarLider(atuacoes, id): Atuacao[]`: marca `podeLiderar: true` (aparece na coluna de líderes).
  - `confirmarInferido(atuacoes, id, autor, quando): Atuacao[]`: mantém o superior, troca `origem` para `'definido'`.
  - `marcarRaiz(atuacoes, id, autor, quando): Atuacao[]`: define `ehRaiz: true` e tira a marca da raiz anterior da mesma organização; lança `codigo: 'raiz_com_superior'` se a atuação tiver superior.
  - Permissões novas em `RECURSOS` (D20): `editarCorporativo` ("Editar estrutura corporativa") e `definirRaiz` ("Definir raiz da unidade"), só `admin`. Na visão Rede e no "Marcar como raiz", a tela consulta `pode(...)`; RH da unidade vê mas não edita.
  - Tela: clicar numa caixa da árvore seleciona o líder; o painel mostra a equipe com "Remover" por linha, abaixo o pool com filtros e checkboxes, botão "Adicionar N à equipe de X" (desabilitado com 0 selecionados), e "Confirmar vínculo inferido" quando a caixa clicada tem subordinados inferidos. Toda mutação passa por `mudar(desc, fn)` da versão 26, logo entra no Desfazer.

- [ ] **Step 1: Testes que falham**

```js
test('adicionarEmBloco define superior, origem e autor, e não muta a entrada', () => { /* 2 camareiras do pool → SUP; origem 'definido'; original intacto */ });
test('adicionarEmBloco rejeita o próprio superior', () => { assert.throws(() => adicionarEmBloco(a, ['sup'], 'sup', 'RH', hoje), e => e.codigo === 'proprio_superior'); });
test('adicionarEmBloco que criaria ciclo lança o erro de validarArvore', () => { /* GG sob CAM1 → codigo 'ciclo' */ });
test('remover devolve ao pool e pool a lista de novo', () => {});
test('pool filtra por cargo e por texto sem acento', () => { /* 'camareir' acha CAMAREIRA */ });
test('confirmarInferido troca origem sem mudar superior', () => {});
test('marcarRaiz troca a raiz da organização e rejeita atuação com superior', () => {});
test('RH da unidade não vê os controles de montagem na visão Rede nem o botão de raiz', async () => {});
test('painel: adicionar 2 em bloco pela tela entra no HIST e desfazer restaura', async () => {
  const { document, S, window } = await carregarPagina(lerFixture('base-mini.json'));
  S.perfil = { papel: 'rh_unidade' }; window.irPara('arvore');
  document.querySelector('[data-atuacao="sup"]').click();
  document.querySelectorAll('#ar-pool input[type=checkbox]')[0].click();
  document.querySelectorAll('#ar-pool input[type=checkbox]')[1].click();
  document.querySelector('#ar-adicionar').click();
  assert.equal(avaliadosDe(S, 'SUP', 'GOLDEN').length, 3);
  window.desfazer();
  assert.equal(avaliadosDe(S, 'SUP', 'GOLDEN').length, 1);
});
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar.** Carregar `frontend-design`. O painel segue o wireframe do spec 7.2. Mensagens de erro em português, sem travessão, vindas do `codigo`.
- [ ] **Step 4: Rodar e confirmar que passa.**
- [ ] **Step 5: Commit**: `git commit -m "feat(app): painel de montagem com seleção em bloco, confirmação de inferência e desfazer"`

---

### Task 6: Fila de pendências

**Files:**
- Create: `app/js/modelo/pendencias.js`, `test/app-pendencias.test.js`
- Modify: `app/index.html`: nova `<section id="t-pendencias">`, `req: 'verPainelRH'`; contador na tela Árvore.

**Interfaces:**
- Produces:
  - `filaDePendencias(S, organizacaoId|null): Item[]` onde `Item = { codigo, descricao, pessoaId, nome, acaoSugerida, origem: 'carga'|'hierarquia' }`. Junta as pendências da carga (`base.pendencias`, filtradas pelas pessoas da organização, ou todas se `null`) com as da hierarquia: `sem_superior`, `sem_organizacao`, `organizacao_sem_raiz`, `raiz_sem_ligacao_corporativa`, `vinculo_inferido_nao_confirmado`.
  - `DESCRICOES`: mapa código → `{ descricao, acaoSugerida }` em português, cobrindo os 10 códigos da carga mais os 5 da hierarquia.
  - Tela: tabela com filtro por código e por organização, contadores no topo, link "Abrir na árvore" para itens de hierarquia.

- [ ] **Step 1: Testes que falham**

```js
test('filaDePendencias junta carga e hierarquia para a organização', () => { /* base-mini GOLDEN: 2 da carga + 3 sem_superior + N inferidos */ });
test('todo código tem descrição e ação sugerida', () => { for (const c of CODIGOS) assert.ok(DESCRICOES[c]?.descricao && DESCRICOES[c]?.acaoSugerida); });
test('pessoa sem organização aparece com organizacaoId null e só na visão da rede', () => {});
test('tela Pendências filtra por código', async () => {});
```

- [ ] **Step 2–5:** RED, implementar, GREEN, commit `feat(app): fila de pendências de carga e de hierarquia`.

---

### Task 7: Trava de abertura de ciclo

**Files:**
- Create: `test/app-trava.test.js`
- Modify: `app/index.html`: onde a versão 26 abre ciclo (`data-abrir` em `renderCiclos` e o botão do Painel do avaliador): consultar `resumoOrganizacao(S, org).semSuperior` e `validarArvore`.

**Interfaces:**
- Produces: `podeAbrirCiclo(S, organizacaoId): { pode: boolean, motivo: string|null }` em `app/js/modelo/montagem.js`. Motivos, nesta ordem: `'organização sem raiz definida'`, `'raiz sem ligação à estrutura corporativa'` (D20, só para tipo `unidade`), `'N pessoas sem líder definido'`, erro de `validarArvore`. Botão desabilitado com o motivo escrito ao lado (spec 7.4).

- [ ] **Step 1: Testes que falham**

```js
test('podeAbrirCiclo nega com pessoas sem líder e nomeia a quantidade', () => {});
test('podeAbrirCiclo nega organização sem raiz', () => {});
test('podeAbrirCiclo nega unidade cuja raiz não tem atuação corporativa', () => {});
test('podeAbrirCiclo permite quando todos têm líder e a árvore valida', () => {});
test('botão Abrir ciclo fica desabilitado e mostra o motivo', async () => { /* jsdom: #ci-lista [data-abrir] disabled e texto ao lado */ });
```

- [ ] **Step 2–5:** RED, implementar, GREEN, commit `feat(app): trava de abertura de ciclo por hierarquia incompleta`.

---

### Task 8: Persistência da montagem no banco do artefato

**Files:**
- Create: `app/js/modelo/persistencia.js`, `test/app-persistencia.test.js`
- Modify: `app/index.html`: `boot()` aplica o delta depois de carregar a base; toda mutação da Tarefa 5 grava o delta da organização; faixa de aviso quando não há banco.

**Interfaces:**
- Produces, puras:
  - `calcularDelta(atuacoesBase: Atuacao[], atuacoesAtuais: Atuacao[]): Delta` onde `Delta = { versao: 1, alteradas: Atuacao[], criadas: Atuacao[], removidasIds: string[] }`. Uma atuação é "alterada" quando `superiorId`, `ehRaiz`, `podeLiderar`, `origem`, `confirmadaPor` ou `definidoEm` diferem da base. Determinístico: mesma entrada, mesmo delta, ordenado por `id`.
  - `aplicarDelta(atuacoesBase, delta): Atuacao[]`: devolve novo array; `aplicarDelta(base, calcularDelta(base, atual))` é igual a `atual` (propriedade testada).
  - `organizacoesNoDelta(delta): string[]`.
- Adaptador do banco (fina, não testada em Node, testada no jsdom com um `claude.use` falso):
  - Declaração: `capabilities: { db: { rules: [{ path: 'montagem', read: 'view', write: 'admin' }] }, user: {} }`. Só Editor e dono gravam; todo mundo que abre o artefato lê.
  - Documento por organização: `db.doc('montagem/' + organizacaoId)` com o `Delta` daquela organização mais `{ autor: await user.id(), quando }`.
  - `claude.use('db')` nulo, ou falha na primeira leitura, mostra a faixa "Sem persistência nesta visualização: o que você montar aqui não fica salvo" e segue em memória. Timer de 10 segundos no carregamento, como o contrato da capacidade manda. Uma gravação por documento por vez; gravação só quando o delta muda.
  - O banco nunca recebe a base. Nunca recebe nome, cargo ou hash: só ids de atuação e os campos de montagem.

- [ ] **Step 1: Testes que falham**

```js
test('calcularDelta vazio quando nada mudou', () => { assert.deepEqual(calcularDelta(a, a).alteradas, []); });
test('calcularDelta captura superior definido e aplicarDelta reconstrói o estado', () => { /* adicionarEmBloco → delta.alteradas.length === 2; aplicarDelta(base, delta) deepEqual atual */ });
test('delta não contém nome, cargo nem hash', () => { assert.equal(/nome|cargo|cpfHash/.test(JSON.stringify(calcularDelta(a, b))), false); });
test('página sem banco mostra a faixa e continua funcionando', async () => { /* carregarPagina com claude.use → null; #faixa-persistencia visível; adicionar em bloco ainda funciona */ });
test('página com banco falso lê o delta no boot e grava ao montar', async () => { /* claude.use falso com doc.get/set em memória; após adicionarEmBloco, set chamado uma vez com delta da organização */ });
```

- [ ] **Step 2–5:** RED, implementar, GREEN, commit `feat(app): montagem persiste como delta no banco do artefato`.

---

### Task 9: Build final, varredura, captura de tela e publicação (PARADA)

**Files:**
- Modify: `scripts/build-app.mjs` (monta `dist/` completo), `README.md` (como publicar), `scripts/capturar-telas.mjs` (Playwright, abre `dist/index.html` com a base real, entra como admin pelo modo demonstração, captura Árvore, Montagem e Pendências em 1440 px e 390 px, `deviceScaleFactor: 2`, em `out/telas/`).

- [ ] **Step 1: `npm run build:app` e `npm test`**, Expected: tudo PASS, `dist/` montado, varredura de CPF, RG e data de nascimento em `dist/` com zero ocorrências.
- [ ] **Step 2: Contagem sobre a base real (teste de integração, pula sem dados):** `pessoasDa(S, 'HOTEL LAGHETTO GOLDEN')` ≥ 170 e inclui ao menos um PJ com cargo de gerência; `organizacoesDe` devolve 36; `semOrganizacao` entre 100 e 140.
- [ ] **Step 3: Capturas.** Rodar `scripts/capturar-telas.mjs`; o coordenador olha cada imagem e corrige antes de seguir. Texto cortado, caixa vazia, cor fora do sistema da versão 26 ou rótulo de inferência ausente é defeito, não detalhe.
- [ ] **Step 4: PARAR.** Publicar é ação fora do repositório. O coordenador apresenta a Marcelo: suíte verde com o número de testes, contagens do Step 2, capturas, lista de rulings, e pede autorização para publicar como **artefato novo** com `capabilities: { db, user }` (não sobrescrever a versão 26 até ele aprovar a troca). Publicação com a ferramenta Artifact, `files` = conteúdo de `dist/`.
- [ ] **Step 5: Commit e atualizar `claude/ESTADO-DO-PROJETO.md`**: `git commit -m "chore(app): build e publicação do Plano B"`; o ESTADO registra a URL nova, a decisão pendente de troca da versão 26 e os rulings.

---

## Self-Review

**Cobertura do spec.** 3.3 organização: Tarefa 2 (tipo `unidade` sugerida pela carga, fusão do Golden; P8 aberta e rotulada). 3.4 atuação: Tarefas 2, 3, 5. 3.5 invariantes: reuso de `validarArvore` nas Tarefas 2, 5, 7. 3.7 chave da avaliação: Tarefa 3, com a autorização pedida na aprovação do plano. 4.3 pendências em tela: Tarefa 6. 6 escopo por atuação: Tarefa 3 (adaptador). 7.1: Tarefa 4. 7.2: Tarefa 5. 7.3: Tarefa 6. 7.4: Tarefa 7. D5 dois eixos: Tarefa 3. P9: Tarefas 1 a 3. Seção 10 itens 1, 2 e 3: Tarefa 3. Aceites 4, 5, 6, 7, 8, 11, 12 e 13 têm teste nas Tarefas 2 a 5 e 9. **Fora, por desenho:** 3.6 snapshot e emenda (aceites 9 e 10), 5 acesso real, 12 parâmetros: Plano C.

**Consistência de tipos.** `Atuacao` ganha os campos `origem`, `metodoInferencia`, `confirmadaPor`, `definidoEm`, `podeLiderar` por cima do que `criarAtuacao` do Plano A produz; `criarAtuacao` não muda, o bootstrap acrescenta. `pessoaRef` continua sendo o id da pessoa, que no `base.json` é o hash curto. `S.pessoasPorId` é `Map`. `Organizacao` ganha `origem` e `filiais`. `Delta` definido na Tarefa 8 e usado só lá.

**Review Focus.** 1 nas Tarefas 3 e 4 (visiveis nunca é a rede; teste de 500 ms). 2 nas Tarefas 2, 3, 4. 3 nas Tarefas 3 e 4. 4 na Tarefa 5. 5 na Tarefa 1.

**Proporção.** Assinaturas e testes; corpos só onde a assinatura não determina.

**Decisões que o executor vai encontrar e já estão tomadas aqui:** os vínculos inferidos da versão 26 entram rotulados, não somem (senão a demonstração do fluxo quebra e o RH perde a referência); a raiz inicial é o Gerente Geral por cargo, rotulada, e os 19 gerentes gerais da rede são todos PJ, por isso a inferência de organização dos PJ importa; PJ sem organização correspondente vai para o pool e para a fila, não é descartado; a chave da avaliação muda para atuação nesta fase; nascimento e idade exata saem do artefato e entra faixa etária; o banco do artefato guarda só o delta.

**Aprovado por Marcelo em 03/11/2026 às 21h14 (os quatro pontos abaixo), com a estrutura corporativa (D20) incluída às 23h10.**

**O que Marcelo decidiu ao aprovar este plano:**
1. Autorizar a mudança da chave da avaliação para `atuação + tipo` (spec 10.1) e do escopo de leitura para atuação (spec 10.2). Recomendo sim nos dois.
2. Aceitar que as 36 organizações iniciais sejam as filiais de folha (com o Golden fundido), rotuladas como sugeridas, até o RH entregar a lista real (P8). Alternativa: esperar a lista do RH e não montar nada agora.
3. Aceitar a tabela de equivalência com a entrada do Golden, rotulada como inferência. Alternativa: deixar os 9 PJ do Golden no pool.
4. Aceitar que o artefato novo saia em URL própria e a versão 26 fique no ar até ele mandar trocar.
