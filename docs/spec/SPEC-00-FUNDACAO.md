# SPEC: Fundação do Sistema de Avaliação de Desempenho

**Projeto:** Sistema Inteligente de Avaliação de Desempenho e Promoções, Rede Laghetto Hotéis
**Subprojeto:** 0, Fundação
**Data:** 2026-11-03
**Status:** aprovado por Marcelo Leifheit em 03/11/2026, com a condição de que as regras de negócio contestadas sejam configuráveis (seção 12)
**Destino do produto:** uso interno da Rede Laghetto. Não é produto multiempresa.

---

## 1. Por que este subprojeto existe

O protótipo validado com o RH em 22/10/2026 demonstra o fluxo de avaliação, mas tudo que sustenta esse fluxo é simulado: as pessoas estão escritas dentro do arquivo da página, os vínculos de liderança foram inferidos por cargo (suposição minha, não dado do RH) e nada persiste quando a aba fecha.

A Fundação substitui essa base simulada por dados reais e persistentes. Sem ela, qualquer módulo construído acima repousa sobre dado que não existe.

### Está dentro deste spec

Identidade e acesso, carga das bases de pessoas, modelo de organização e atuação, montagem da árvore de hierarquia pelo RH de cada unidade, fila de pendências de qualidade de dados, escopo de leitura, e persistência.

### Está fora deste spec

O motor de avaliação (subprojeto 1), a avaliação de experiência de 45 e 90 dias (subprojeto 2), o teste de função pré-promoção (subprojeto 3) e a camada de IA (subprojeto 4). Cada um terá spec próprio.

---

## 2. Decisões fechadas

Decididas por Marcelo em 03/11/2026, salvo onde indicado.

| # | Decisão | Consequência |
|---|---|---|
| D1 | Produto é interno da Rede Laghetto | Banco único, sem cadastro de cliente, sem assinatura, sem LGPD de terceiros |
| D2 | Construir a Fundação antes do ciclo | Nada é construído sobre dado simulado |
| D3 | O RH/DP de cada unidade monta a própria hierarquia | Exige tela de montagem, painel de progresso e trava de ciclo |
| D4 | Login para liderança e RH agora; colaboradores na fase 2 | Conta de colaborador já modelada no banco, login desligado |
| D5 | Navegação por dois eixos: organização e empresa | Entrada pela organização, filtro por empresa contratante |
| D6 | Organograma congelado em cópia no momento da abertura do ciclo | Transferência entre unidades não corrompe ciclo passado |
| D7 | Pessoa com duas atuações recebe duas avaliações separadas | Chave da avaliação inclui a atuação |
| D8 | Escala de 1 a 5, sem zero | Validação trava fora da faixa |
| D9 | Nota geral é a média de todos os critérios, pesando por quantidade | Mantido como está hoje. Pilares não pesam igual |
| D10 | Árvore para ler e validar, lista para montar | Duas telas com trabalhos distintos |
| D11 | Desligamento detectado pela carga; pessoa vira inativa, nada é apagado | Janela de até 30 dias entre desligamento real e carga aceita conscientemente |
| D12 | Montagem da árvore não conta com Setor vindo do Domínio | RH preenche setor na plataforma; se o export trouxer um dia, entra como valor inicial |
| D13 | Periodicidade por tipo de formulário: Gerente do Hotel e Gerente de Hospedagem anual; Líderes da Operação, Colaboradores e ascendente semestral | Sem respaldo em documento do RH. A homologar (P16) |
| D14 | Duplo gestor gera duas avaliações, uma por líder | Contraria a decisão do RH de outubro (P15). Simplifica o modelo: cada superior gera uma atuação |
| D15 | Regras contestadas são parâmetros configuráveis pelo RH da holding, com auditoria | Seção 12 |
| D16 | Turno sai do modelo (03/11, 21h55). Equipe passa a ser o setor | Relatado por Marcelo a partir de conversa com o RH, sem documento. Atuação perde o campo turno; painel de montagem filtra por cargo e setor |
| D17 | Marcar uma pessoa como líder cria a conta de Avaliador automaticamente (03/11, 22h20) | Líder é marca da pessoa na organização; define o formulário (líder ou colaborador), a lista de avaliadores e a conta N1. Desmarcar exige que ela não avalie ninguém |
| D18 | Formulários versionados, editáveis só pelo RH da holding (03/11, 22h30) | Versão publicada é imutável; cada avaliação grava a versão; versão nova vale a partir do próximo ciclo por padrão; comparação entre versões por identificador de pergunta |
| D19 | Evolução e painéis só com dado real (03/11, 22h30) | Nenhuma nota simulada em tela, nem rotulada. Sem histórico, a tela diz "sem histórico" |
| D20 | Estrutura corporativa como organização, acima dos hotéis (03/11, 23h10) | Seção 3.3 e 3.5. Gerente geral tem atuação no hotel (raiz) e na estrutura corporativa (subordinado do diretor regional). Só o RH da holding edita a estrutura corporativa e as raízes |

---

## 3. Modelo de dados

O erro conceitual que este modelo corrige: tratar "empresa" como uma coisa só. Quem paga e onde a pessoa atua são eixos diferentes, e confundi-los gera tanto hierarquia errada quanto avaliação duplicada.

### 3.1 Pessoa

Uma pessoa por CPF. O CPF é a identidade única em toda a rede.

Campos de origem (carga, somente leitura na plataforma): nome, CPF, data de nascimento.
Campos da plataforma: status (ativo, licença, afastado, férias, desligado), data do status.

A pessoa existe independente de regime de contratação e de onde trabalha.

### 3.2 Vínculo contratual

Liga pessoa a empresa pagadora. Uma pessoa pode ter mais de um.

Campos: pessoa, empresa, regime (CLT ou PJ), cargo de origem, data de início, filial de folha (quando CLT), código de folha (quando CLT).

**Este objeto não define hierarquia e não gera avaliação.** Serve ao RH e ao DP para controle administrativo e aparece como etiqueta e como filtro nas telas.

### 3.3 Organização

Uma estrutura com cadeia de liderança própria e um topo. Três tipos:

- **Unidade hoteleira:** Hotel Laghetto Golden, Chateau du Golden, Villa Moura
- **Área administrativa:** Pós-Vendas da LGM, Marketing, TI, Fiscal
- **Empresa distinta do grupo:** Brano Administradora de Condomínios, Condomínio Athivabrasil
- **Estrutura corporativa (D20):** uma única organização, "Laghetto Corporativo", com raiz no CEO e, abaixo, diretores gerais, diretores regionais e as diretorias de área. É o que liga os hotéis entre si sem criar uma árvore única da rede.

Campos: nome, tipo, regional (quando aplicável), situação (ativa ou inativa), origem (sugerida pela carga ou definida pelo RH).

**Como os hotéis se ligam ao corporativo (D20):** o gerente geral de cada unidade tem duas atuações: raiz da unidade e subordinado do seu diretor regional na estrutura corporativa. É o mesmo mecanismo de D14, sem regra nova. Ele é avaliado pelo diretor regional pela atuação corporativa; a unidade é avaliada por ele. Toda raiz de unidade precisa de uma atuação corrente na estrutura corporativa; faltar vira pendência e trava o ciclo (seção 7.4).

**Quem edita:** a estrutura corporativa e as raízes das unidades são editadas só pelo RH da holding (permissões "Editar estrutura corporativa" e "Definir raiz da unidade"). O RH da unidade monta apenas dentro da própria unidade.

A árvore de hierarquia existe por organização, nunca por empresa pagadora e nunca para a rede inteira de uma vez.

### 3.4 Atuação

O centro do modelo. Liga pessoa a organização, com função e superior.

Campos: pessoa, organização, função, superior (outra atuação), setor, equipe, líder (marca, D17), data de início, data de fim, situação. Turno não existe no modelo (D16).

**Regra que define quando criar uma atuação nova:** **cada superior diferente gera uma atuação.** Mudar apenas de empresa pagadora não cria atuação. Mudar de função sob o mesmo superior também não: é alteração da atuação existente, com histórico.

Esta regra substitui a formulação anterior ("função diferente e superior diferente"), que caiu quando Marcelo decidiu que duplo gestor gera duas avaliações (D14). Com a regra nova, duplo gestor e múltiplas atuações são o mesmo mecanismo. Esta regra é **estrutural, não configurável**: mudar depois exige migração de banco.

Exemplos verificados contra a realidade da rede:

- A governanta do Hotel Golden é paga por CNPJ diferente do hotel. Tem **uma** atuação (Governanta, no Hotel Golden, sob o Gerente de Hospedagem) e **um** vínculo contratual, com a empresa que a paga. A árvore do Golden a contém uma vez. O CNPJ divergente não gera atuação nem avaliação extra.
- Ana Carolina Rocha é Gerente de Pós-Vendas na LGM, sob Marcelo Leifheit, e Gerente na Brano, sob o CEO da Brano. Tem **duas** atuações, aparece em **duas** árvores, recebe **duas** avaliações independentes. Uma pessoa, não duas.
- No organograma do Pós-Vendas, a mesma Ana Carolina é gerente da área e ao mesmo tempo responsável direta pelas frentes de Escritura e Reservas, além das supervisoras que respondem a ela. Isso é **uma** atuação com vários subordinados diretos, não várias atuações. Subordinado direto a mais não cria atuação nova.
- Uma camareira do Golden avaliada pela Supervisora de Andares e pela Governanta Geral (o duplo gestor citado pelo RH em outubro) tem **duas** atuações na mesma organização, com a mesma função e superiores diferentes. Recebe duas avaliações no mesmo ciclo. O cadastro sinaliza que ela tem dois avaliadores, e a árvore a mostra sob as duas caixas.

### 3.5 Árvore

A árvore é derivada, nunca desenhada e nunca armazenada como desenho. É a recursão sobre o campo superior das atuações de uma organização.

Invariantes (sobre as atuações correntes, isto é, ativas e sem data de fim; as encerradas ficam no histórico e fora da árvore de hoje):
- Nenhuma atuação é superior de si mesma, direta ou indiretamente (sem ciclos)
- Toda organização tem exatamente uma atuação raiz, marcada explicitamente como raiz (`ehRaiz`) e sem superior
- Uma atuação tem no máximo um superior, e ele pertence à mesma organização e está corrente
- Atuação sem superior e sem marca de raiz não é erro de validação: é pendência, e é o que trava a abertura do ciclo (seção 7.4)
- Raiz de unidade sem atuação corrente na estrutura corporativa é pendência da unidade e também trava o ciclo (D20)

### 3.6 Snapshot de ciclo

Quando o ciclo de uma organização é aberto, o sistema grava uma cópia imutável da árvore daquela organização naquele instante, amarrada ao ciclo.

O ciclo passa a referenciar o snapshot, não a árvore corrente. Transferência, promoção ou desligamento posteriores não alteram ciclo já aberto.

**Emenda:** admissão ou troca de líder com ciclo aberto exige emenda explícita ao snapshot, registrada com autor, data e motivo. Nunca alteração silenciosa.

### 3.7 Chave da avaliação

`organização + ciclo + atuação + tipo de formulário`

O protótipo usa hoje `pessoa + tipo`, o que faz a segunda avaliação de uma pessoa com duas atuações sobrescrever a primeira. Precisa mudar antes do módulo de ciclo.

---

## 4. Carga de dados

### 4.1 Fontes

**Base CLT, exportada do Domínio.** 1.608 registros, 37 filiais. Campos disponíveis: regional, filial, código, nome, RG, código do cargo, cargo, CPF, nascimento, admissão.

**Base PJ, planilha de controle do RH.** 229 linhas, das quais 226 válidas (195 sem nenhuma pendência, 31 com). Campos: nome, objeto do contrato (equivale a cargo), contratante, CPF, nascimento, início do contrato.

**Constatação central:** 130 dos 226 PJ (57%) ocupam cargo de chefia, incluindo 14 Gerentes de Hospedagem, 14 Gerentes Gerais contando os sêniores, 7 Supervisores de Recepção e 5 Chefes de Cozinha. A camada que avalia está majoritariamente na base PJ. Nenhuma hierarquia é possível carregando apenas a base CLT.

**Nenhuma das duas fontes traz setor nem chefe imediato.** Por isso D3: a hierarquia é montada na plataforma pelo RH/DP de cada unidade.

### 4.2 Chaves

Identidade da pessoa: CPF.
Identidade do vínculo CLT: filial mais código. Código isolado produz 417 colisões na rede e não serve como chave.

### 4.3 Problemas conhecidos e tratamento

| Problema | Ocorrências | Tratamento |
|---|---|---|
| Mesmo CPF nas duas bases | 10 | Uma pessoa, dois vínculos anexados, marca de pendência. **O sistema não escolhe regime.** |
| Mesma empresa com grafias diferentes | 6 empresas com grafia duplicada, 46 grafias para 40 empresas | Normalização por regra, tabela de equivalência gerada e submetida ao RH |
| Cabeçalho repetido no meio da planilha | 2 linhas (a contagem de 3 em 03/11 incluía o cabeçalho verdadeiro) | Descartadas na carga, registradas no log |
| Pessoa contratada por várias empresas na mesma célula | 12 | Quebra em vínculos contratuais separados |
| Sem CPF | 6 | Entra na fila de pendências. Sem CPF não há login |
| Sem cargo | 7 | Entra na fila de pendências |
| Sem empresa | 5 | Entra na fila de pendências |
| Contratação futura (início posterior a 03/11/2026) | 4 | Cadastrada com situação pendente, fora de ciclo até a data de início |
| Data de nascimento ausente ou inválida | 20 (19 vazias na PJ, 1 digitada com letra O no lugar do zero) | Pendência `sem_nascimento`. Nunca silêncio |
| Data de início ausente | 4 | Pendência `sem_inicio` |
| Pessoa sem CPF com nome igual ao de pessoa com CPF | 1 (Tiago Boemeke de Oliveira, CLT com CPF e PJ sem) | Pendência `possivel_duplicado`. O sistema não funde sem CPF; o RH decide |
| RG com hífen confundido com cargo pelo parser | 3 (bug herdado do script de outubro, corrigido em 03/11) | Âncora do cargo exige letra após o hífen |
| CLT com 1.608 linhas mas 1.606 pessoas | 2 pessoas com vínculo em dois CNPJs | Dois vínculos da mesma pessoa, como previsto em 4.2 |

Nenhum destes é descartado em silêncio. Todos aparecem em tela para o RH resolver.

### 4.4 Atualização

Carga manual por upload nesta fase, com integração automática prevista para depois (registrado na ata de 22/10). Toda carga nova compara por CPF, preserva histórico e joga admitidos sem atuação na fila de pendências da unidade.

**Proteções da carga (adicionadas na revisão de 03/11):** a linha de filial é reconhecida pela estrutura do export, não por lista de nomes, para razão social nova não cair na filial anterior; toda linha com conteúdo vai para registro, estrutura conhecida ou log, nunca some; o "Total de empregados" de cada filial é conferido e divergência aborta a carga; regional com zero registros ou arquivo repetido aborta a carga; pessoa sem CPF fica fora da comparação entre cargas, porque não tem identidade estável.

**Desligamento (D11).** Pessoa presente na carga anterior e ausente da nova é marcada como **inativa, por inferência da carga de DD/MM**. Nada é apagado: as atuações recebem data de fim, as avaliações ficam amarradas aos ciclos, e a pessoa passa a aparecer no repositório de inativos, que é uma visão filtrada e não uma cópia. O acesso é revogado no mesmo ato.

Três proteções obrigatórias:
- A comparação é por CPF sobre o **conjunto inteiro** da carga (R1, R2 e R3 juntos), nunca arquivo por arquivo. Pessoa transferida entre filiais ou com dois CNPJs não pode virar inativa por engano.
- A inativação é rotulada como inferida, e o RH pode reverter.
- **Trava contra inativação em massa:** se a carga propuser inativar mais do que o limite configurado (padrão: 5% da organização ou 10 pessoas, o que for menor), o sistema segura todas as inativações daquela organização e pede confirmação do RH antes de aplicar. Exportar uma filial a menos por engano não pode cortar o acesso de 40 pessoas. **A trava é da pessoa:** quem atua em duas organizações e tem uma delas travada não é inativado em nenhuma, porque a revogação de acesso é uma só.

---

## 5. Identidade e acesso

Login por CPF, porque parte dos colaboradores não tem e-mail corporativo. Senha inicial igual aos quatro últimos dígitos do CPF, com troca obrigatória no primeiro acesso. Redefinição disponível ao próprio usuário e ao RH da unidade.

Nesta fase o login é liberado para liderança e RH, cerca de 200 contas. As contas de colaborador existem no banco desde já, desligadas, para não exigir reescrita na fase 2.

**O CPF não trafega nem fica armazenado em texto aberto na camada de apresentação.** O protótipo já usa hash com sal, e a produção mantém o princípio.

**Revogação (D11).** O acesso cai no momento em que a pessoa é marcada como inativa, seja pela carga, seja por ação direta do RH. Fica registrado: com a revogação dependendo da carga mensal, uma pessoa desligada pode manter acesso por até 30 dias. Marcelo aceitou essa janela em 03/11/2026. O RH da unidade pode inativar manualmente a qualquer momento para fechar a janela quando julgar necessário.

---

## 6. Escopo de leitura

Regra: **o escopo é por atuação, não por pessoa.**

Consequência obrigatória: o CEO da Brano vê a avaliação de Ana Carolina na Brano e não vê a da LGM. Marcelo vê a da LGM e não vê a da Brano. Quem ocupa duas organizações tem duas vidas funcionais separadas, e o sistema precisa manter essa separação.

O protótipo filtra hoje por pessoa, o que vazaria nesse caso. Correção faz parte deste subprojeto.

Abrangências de leitura, com o nível como rótulo derivado e não como campo digitável:

| Abrangência | Nível | Enxerga |
|---|---|---|
| Própria equipe | N1 | Apenas subordinados diretos da atuação |
| Equipe e liderados | N2 | A cadeia abaixo da atuação, recursiva |
| Setor | N3 | O setor dentro da organização |
| Organização | N4 | Toda a organização |
| Regional | N5 | Todas as organizações da regional |
| Rede | N6 | Tudo |

Papel administrativo (o que pode editar) continua como eixo separado da abrangência (o que pode ver).

**Derivação do nível (D20):** quem só tem subordinados diretos é N1; quem tem líderes abaixo de si é N2; chefe de setor é N3; raiz da unidade é N4; diretor regional é N5; CEO, diretores gerais e RH da holding são N6. A coluna "Nível" da tela de usuários é calculada, nunca digitada.

**Papel de acompanhante:** o manual do RH cita gestor geral, RH/DP da unidade e equipe de R&S acompanhando avaliações. Acompanhar não é avaliar nem administrar. É um terceiro papel e não existe hoje no RBAC. Entra neste subprojeto como papel de leitura sobre atuações específicas.

---

## 7. Telas

### 7.1 Árvore da organização (entrada)

Mostra a estrutura gerada a partir das atuações, em dois níveis de zoom (D20):

- **Visão Rede:** a árvore da estrutura corporativa. Cada unidade aparece como caixa fechada sob o seu diretor regional, com o nome do gerente geral e o medidor de completude da unidade. Caixa vermelha quando a unidade está sem raiz ou sem ligação ao corporativo. Clicar desce para a unidade.
- **Visão Unidade:** a árvore da unidade. Cabeçalho "Gerente geral: Fulano · avaliado por: Diretor Regional R2 (estrutura corporativa)", clicável para subir.

Destaca em vermelho quem está sem superior e caixas vazias. Cabeçalho com seletor de organização, filtro por empresa contratante e medidor de completude ("138 de 173 com líder, 35 sem líder").

É a tela que o RH corporativo usa para validar as organizações e a que vai para reunião. Não é editável por arrasto.

### 7.2 Painel de montagem (clique numa caixa da árvore)

Inverte a pergunta. Em vez de perguntar o líder de cada uma das 173 pessoas, pergunta a equipe de cada um dos 5 a 8 líderes.

Equipe atual à direita, com remoção individual. Abaixo, o conjunto de pessoas sem superior na organização, filtrável por cargo e setor (turno saiu, D16), com seleção múltipla e adição em bloco. A governanta seleciona as 12 camareiras do setor numa ação. Na visão Rede, o pool são os PJ sem organização e os gerentes gerais.

Ações: adicionar em bloco, remover, marcar pessoa como líder, desfazer.

### 7.3 Fila de pendências

Lista de trabalho com os casos da seção 4.3, cada um com motivo e ação sugerida. Contador visível na árvore.

### 7.4 Trava de abertura de ciclo

Organização com pessoa sem superior não abre ciclo. O botão fica desabilitado com o motivo escrito. No piloto apareceu gente sem avaliador, e isso não pode chegar em produção.

---

## 8. Critérios de aceite

1. As duas bases carregam e produzem uma pessoa por CPF, com os 10 casos duplicados apontando para uma pessoa só e marcados como pendentes
2. As 46 grafias de empresa colapsam em 40, com tabela de equivalência exibível
3. Nenhuma linha é descartada em silêncio: toda exclusão aparece no log de carga
4. A árvore de uma organização renderiza a partir das atuações, sem desenho armazenado
5. Tentativa de criar ciclo na hierarquia é rejeitada com mensagem
6. Organização sem raiz, ou com mais de uma, é rejeitada com mensagem
7. Ana Carolina Rocha aparece nas árvores da LGM e da Brano como a mesma pessoa, com duas atuações
8. Um usuário com abrangência N1 em uma organização não enxerga nenhuma atuação de outra organização
9. Abertura de ciclo congela o snapshot e alteração posterior na árvore não muda o ciclo aberto
10. Emenda a snapshot de ciclo aberto exige autor, data e motivo
11. Unidade com pessoa sem superior não abre ciclo
12. Desfazer cobre a montagem da árvore com no mínimo 30 passos
13. Nenhum CPF em texto aberto na camada de apresentação

Cada critério vira teste executável, rodado a cada implementação nova, com o resultado exibido e não apenas afirmado.

---

## 9. Pendências abertas

Nenhuma destas bloqueia a Fundação, mas todas bloqueiam o subprojeto 1.

| # | Pendência | Conflito | Quem resolve |
|---|---|---|---|
| P1 | Periodicidade | POP diz 1 por ano em todos os formulários. Manual assinado pela Christine diz a cada 6 meses. Nomes dos arquivos dizem Anual. Questionário de outubro diz que o mês oficial é abril, mês único. Marcelo decidiu em 03/11 que varia por nível (D13, ver P16) | RH corporativo |
| P2 | Justificativa obrigatória | Marcelo diz em todos os critérios. POP diz apenas quando a nota for 1, 2 ou 5 | RH corporativo |
| P3 | Autoavaliação | Marcelo diz que não existe. Manual diz que existe em dois trechos | RH corporativo |
| P4 | Avaliador do contrato de experiência | POP inverte avaliador e avaliado em relação ao manual. Provável erro de cópia no POP | RH corporativo |
| P5 | Classificação da nota | POP define 5 rótulos por nota inteira. Planilha define 3 faixas. Nota com vírgula não cai em rótulo do POP | RH corporativo |
| P6 | Estrutura canônica do formulário | POP define Técnicas, Comportamentais, Resultados, Justificativa e PDI. Planilhas em uso têm outros pilares | RH corporativo |
| P7 | Nota geral para promoção | Com duas atuações, qual nota atende ao pré-requisito do POP | RH corporativo |
| P8 | Lista de organizações | Não existe em nenhum arquivo recebido. Sem ela não há como estimar prazo | Marcelo e RH |
| P9 | PJ no piloto | Carregar os 226 PJ só na aba nova, ou já nas telas que o RH viu | Marcelo |
| P10 | Fluxo de 45 e 90 dias | Prazo trabalhista fatal. Perder a data efetiva a pessoa por omissão | Jurídico, antes de produção |
| P11 | Teste de função pré-promoção | Documento assinado, sem alteração salarial, prorrogável | Jurídico, antes de produção |
| P14 | Contestação e direito de resposta | RH decidiu em outubro que existe. Falta saber como acontece hoje e por onde entra enquanto o colaborador não tem login | RH corporativo |
| P15 | Duplo gestor | RH decidiu em outubro "uma única avaliação". Marcelo decidiu em 03/11 "duas avaliações". Precisa ser combinado com o RH antes da homologação | Marcelo e RH |
| P16 | Periodicidade por nível | Decisão de Marcelo (D13) não consta em documento. POP diz anual para todos, manual diz semestral para todos. Apresentar ao RH como proposta | Marcelo e RH |

---

## 10. Impacto no protótipo existente

A aba de árvore entra como bloco independente e removível, conforme a regra de construção do projeto.

Três pontos tocam o que já funciona e precisam de autorização explícita antes de serem mexidos:

1. **Chave da avaliação.** Precisa incluir a atuação, senão a segunda avaliação sobrescreve a primeira
2. **Escopo de leitura.** Precisa passar de pessoa para atuação, senão vaza entre organizações
3. **Carga dos PJ.** Inclui os líderes reais do Golden e muda a Matriz e o Formulário que o RH já viu (pendência P9)

---

## 11. Infraestrutura

Protótipo em artefato, servindo de especificação executável. Migração posterior para Cloudflare Workers com D1, com prefixo `lgh-avd-` e ambientes separados.

O projeto `painel-retencao` existente na conta (Worker, D1 `painel-retencao-lgm`, KV `painel-retencao-cargas`) não é tocado, lido nem reaproveitado.

A Fundação cabe no plano gratuito: 200 contas ativas e cerca de 3.000 avaliações por ano ficam muito abaixo dos limites. Não há custo novo nesta fase.

---

## 12. Parâmetros configuráveis

Condição de aprovação de Marcelo (03/11/2026): as regras de negócio contestadas não podem ficar cravadas no código. Entram numa tela de configuração restrita ao RH da holding, e toda alteração registra quem mudou, quando, de que valor para que valor.

### Configurável

| Parâmetro | Valores | Padrão inicial | Pendência relacionada |
|---|---|---|---|
| Periodicidade, por tipo de formulário | anual, semestral | D13 | P1, P16 |
| Justificativa obrigatória | em todos os critérios; só nas notas 1, 2 e 5 | todos (como o protótipo) | P2 |
| Classificação da nota | 5 rótulos por inteiro (POP); 3 faixas (planilha) | 3 faixas (como o protótipo) | P5 |
| Escala | mínimo e máximo | 1 a 5 | fechada (D8) |
| Peso dos pilares | por quantidade de critérios; igual | por quantidade (D9) | fechada |
| Limite da trava de inativação em massa | percentual e número absoluto | 5% ou 10 pessoas | D11 |
| Janela de alerta de prazo | dias antes do vencimento | 15 | |
| Quem abre e quem encerra ciclo | por papel | líder abre, RH regional encerra | fechada |
| Formulários (D18) | pilares e perguntas, por tipo, versionados | planilhas do RH como versão 1 | P6 |
| Vigência de versão nova de formulário | próximo ciclo; ciclo atual | próximo ciclo | a confirmar com o RH |

Uma mudança de parâmetro vale para ciclos abertos depois dela. Ciclo já aberto mantém os parâmetros com que foi aberto, gravados junto com o snapshot (seção 3.6). Isso impede que uma mudança de regra no meio do ano altere avaliação já enviada.

### Fixo por desenho, não configurável

Mudar qualquer um destes exige migração de banco e é decisão de arquitetura, não de configuração:

- O modelo pessoa, vínculo contratual, organização e atuação (seção 3)
- A regra "cada superior gera uma atuação" (D14)
- A chave da avaliação: organização, ciclo, atuação e tipo (seção 3.7)
- A imutabilidade da avaliação enviada e o versionamento de correções
- O snapshot de organograma por ciclo (seção 3.6)
- O escopo de leitura por atuação (seção 6)
