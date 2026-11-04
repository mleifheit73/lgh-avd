# Protótipo navegável, versão 34 (04/11/2026, 00h)

Cópia da página publicada no artefato que o RH conhece, com os campos `cpf` (mascarado) e `nasc` removidos do array `PESSOAS` antes de entrar no git. O artefato publicado ainda os contém; saem na Tarefa 1 do Plano B.

Blocos independentes no fim do arquivo, cada um removível: `bloco-av2` (histórico e filtros do painel), `bloco-db` (persistência no banco do artefato), `bloco-lid` (marca de líder), `bloco-form` (formulários versionados), `bloco-fix` (colaborador fixo e guarda de saída), `bloco-ind` (indicação de promoção).

`testes/` traz os testes Playwright de cada bloco. Rodam contra `file://` com `window.claude` simulado; ajustar o caminho no topo de cada arquivo (`URL`) e o import do Playwright. O Plano B os converte em testes de página do repositório.
