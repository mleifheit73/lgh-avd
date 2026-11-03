# lgh-avd

Sistema de Avaliação de Desempenho da Rede Laghetto Hotéis.

Subprojeto 0, Fundação. Plano A: modelo de dados e carga.

- Spec: `docs/spec/SPEC-00-FUNDACAO.md`
- Plano: `docs/plans/PLANO-00A-MODELO-E-CARGA.md`
- Fonte de verdade do projeto: Projeto "LAGHETTO - AVALIAÇÃO DE DESEMPENHO" no claude.ai, documento `claude/ESTADO-DO-PROJETO.md`

Rodar os testes: `npm test`

## Dados reais

`data/` não é versionado: contém CPF, RG e nascimento de pessoas reais. Para rodar a carga e os testes de integração, copie para `data/clt/R1.csv`, `R2.csv`, `R3.csv` os três CSVs da pasta `COLABORADORES DA REDE` do Projeto, e gere `data/pj/pj-2026.json` com `node src/cli/converter-pj.js <planilha PJ.xlsx>`. Sem `data/`, os testes de integração são pulados com aviso e os unitários rodam normalmente.
