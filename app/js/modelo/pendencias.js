/**
 * Fila de pendências (Plano B, Tarefa 6): tudo o que o RH ainda precisa resolver, de duas origens.
 *  - carga: o que a carga das bases registrou em S.base.pendencias (CPF, cargo, empresa, duplicidade...);
 *  - hierarquia: o que a árvore de atuações mostra hoje (sem líder, sem raiz, avaliação mútua...).
 *
 * Puro: não toca tela nem disco, não escreve em S. Toda contagem sai de S.atuacoes, S.semOrganizacao e S.base
 * (fonte única): a tela e a trava de abertura de ciclo (podeAbrirCiclo, em montagem.js) leem daqui e não divergem.
 * Roda igual em Node (testes) e no navegador (bundle LGH).
 */
import { validarArvore } from './atuacao.js';
import { ehCorrente, nomeExibicao, precisaDeLider, atuacoesSemLider, situacaoFuncional } from '../adaptador.js';
import { ligacaoDaUnidade, poolSemOrganizacao } from '../arvore-ui.js';

export const CODIGOS_CARGA = [
  'sem_cpf', 'sem_cargo', 'sem_empresa', 'sem_nascimento', 'inicio_futuro',
  'tambem_na_base_clt', 'multiplas_empresas', 'sem_inicio', 'possivel_duplicado', 'cpf_repetido_na_pj',
];

export const CODIGOS_HIERARQUIA = [
  'sem_superior', 'superior_desligado', 'sem_organizacao', 'organizacao_sem_raiz', 'raiz_sem_ligacao_corporativa',
  'vinculo_inferido_nao_confirmado', 'avaliacao_mutua', 'vinculo_invalido',
];

/** Ordem da fila: hierarquia primeiro, do que mais trava para o que só pede conferência; depois a carga. */
export const ORDEM_FILA = [
  'sem_superior', 'superior_desligado', 'sem_organizacao', 'organizacao_sem_raiz', 'raiz_sem_ligacao_corporativa',
  'avaliacao_mutua', 'vinculo_invalido', 'vinculo_inferido_nao_confirmado', ...CODIGOS_CARGA,
];

/** Pendências de hierarquia que impedem abrir o ciclo (ver podeAbrirCiclo em montagem.js). As demais só pedem conferência. */
export const TRAVAM_CICLO = ['organizacao_sem_raiz', 'raiz_sem_ligacao_corporativa', 'sem_superior', 'superior_desligado', 'avaliacao_mutua', 'vinculo_invalido'];

export const DESCRICOES = {
  /* ---- carga ---- */
  sem_cpf: {
    descricao: 'Registro PJ sem CPF. Sem CPF a pessoa não consegue entrar no sistema nem ser reconhecida em outra base.',
    acaoSugerida: 'O RH pede o CPF ao gestor ou ao financeiro e corrige na base de origem; depois a carga é refeita.',
  },
  sem_cargo: {
    descricao: 'Vínculo sem cargo informado. Sem cargo não dá para escolher o formulário nem inferir o líder.',
    acaoSugerida: 'O RH informa o cargo na base de origem (folha ou cadastro PJ) e refaz a carga.',
  },
  sem_empresa: {
    descricao: 'Vínculo PJ sem empresa (filial) informada. Sem empresa a pessoa não entra em nenhuma organização.',
    acaoSugerida: 'O RH informa a empresa na base PJ ou, na Árvore, coloca a pessoa na organização correta.',
  },
  sem_nascimento: {
    descricao: 'Data de nascimento ausente. A faixa etária da pessoa não pode ser calculada.',
    acaoSugerida: 'O RH completa a data de nascimento na base de origem. Não impede a avaliação.',
  },
  inicio_futuro: {
    descricao: 'Início do vínculo posterior à data da carga. A pessoa ainda não deveria estar na equipe.',
    acaoSugerida: 'O RH confere a data de início: se estiver errada, corrige na base; se estiver certa, a pessoa só entra no ciclo depois dela.',
  },
  tambem_na_base_clt: {
    descricao: 'Pessoa aparece nas duas bases, CLT e PJ.',
    acaoSugerida: 'O RH decide o regime vigente e desativa o outro vínculo na base de origem.',
  },
  multiplas_empresas: {
    descricao: 'Pessoa PJ com vínculo em mais de uma empresa. Cada empresa pode gerar uma atuação com um líder diferente.',
    acaoSugerida: 'O RH confirma em quais empresas a pessoa trabalha de fato e encerra os vínculos que não valem mais.',
  },
  sem_inicio: {
    descricao: 'Vínculo sem data de início. Não dá para saber desde quando a pessoa está na equipe.',
    acaoSugerida: 'O RH informa a data de início na base de origem. Sem ela, a regra de tempo mínimo no ciclo não pode ser conferida.',
  },
  possivel_duplicado: {
    descricao: 'Nome parecido com o de outra pessoa da base. Pode ser a mesma pessoa cadastrada duas vezes.',
    acaoSugerida: 'O RH compara os dois cadastros: se forem a mesma pessoa, unifica; se forem pessoas diferentes, dá o assunto por encerrado.',
  },
  cpf_repetido_na_pj: {
    descricao: 'O mesmo CPF aparece em mais de um registro PJ.',
    acaoSugerida: 'O RH confere se é a mesma pessoa em duas empresas (mantém) ou erro de digitação (corrige o CPF na base).',
  },
  /* ---- hierarquia ---- */
  sem_superior: {
    descricao: 'Atuação sem líder definido. Sem líder, ninguém avalia esta pessoa e o ciclo não pode abrir.',
    acaoSugerida: 'Na Árvore, o RH escolhe o líder e adiciona a pessoa à equipe dele.',
  },
  superior_desligado: {
    descricao: 'O líder desta pessoa foi desligado; defina outro líder. Quem foi desligado não avalia, e o ciclo não pode abrir.',
    acaoSugerida: 'Na Árvore, o RH tira a pessoa da equipe do líder desligado e a adiciona à equipe do novo líder.',
  },
  sem_organizacao: {
    descricao: 'Pessoa PJ da carga que ainda não está em nenhuma organização, então fica fora de qualquer árvore.',
    acaoSugerida: 'Na visão Rede da Árvore, o RH coloca a pessoa na estrutura corporativa ou informa a empresa dela na base.',
  },
  organizacao_sem_raiz: {
    descricao: 'Organização sem raiz (gerente geral ou responsável). Sem raiz a árvore não existe e ninguém tem a quem subir.',
    acaoSugerida: 'Na Árvore, o RH marca quem é a raiz da organização.',
  },
  raiz_sem_ligacao_corporativa: {
    descricao: 'A raiz da unidade (gerente geral) não tem atuação na estrutura corporativa, então não há quem o avalie.',
    acaoSugerida: 'Na visão Rede da Árvore, o RH coloca o gerente geral na equipe do diretor responsável.',
  },
  vinculo_inferido_nao_confirmado: {
    descricao: 'Líder sugerido pela carga a partir do cargo ou da empresa, ainda sem confirmação do RH.',
    acaoSugerida: 'Na Árvore, o RH confirma o vínculo ou troca o líder.',
  },
  avaliacao_mutua: {
    descricao: 'Duas pessoas aparecem uma acima da outra na hierarquia (direta ou indiretamente): cada uma avaliaria a outra.',
    acaoSugerida: 'Na Árvore, o RH desfaz um dos vínculos e define quem realmente lidera quem.',
  },
  vinculo_invalido: {
    descricao: 'A atuação aponta para um líder que não existe, está encerrado, é de outra organização ou forma um ciclo.',
    acaoSugerida: 'Na Árvore, o RH remove o vínculo e define o líder correto.',
  },
};

/* ---------- leitura do estado ---------- */
const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const correntesDaOrg = (S, org) => (S.atuacoes || []).filter(a => a.organizacaoId === org && ehCorrente(a));
const pessoaPorId = (S, id) => (S.pessoasPorId && typeof S.pessoasPorId.get === 'function' ? S.pessoasPorId.get(id) : null)
  ?? (S.base?.pessoas || []).find(p => p.id === id) ?? null;
const nomeDe = (S, id) => nomeExibicao(S, pessoaPorId(S, id)) || id;
const nomeOrg = (S, id) => (S.organizacoes || []).find(o => o.id === id)?.nome || id;

/** A carga grava a pessoa em `pessoaRef` (base real) ou `pessoaId` (fixtures antigas): aceita as duas. */
const pessoaDaPendencia = p => p.pessoaId ?? p.pessoaRef ?? null;

function item(S, base) {
  const d = DESCRICOES[base.codigo];
  return { descricao: d.descricao, acaoSugerida: d.acaoSugerida, atuacaoId: null, detalhe: null, pessoaId: null, ...base };
}

/** Códigos de validarArvore para a atuação: vazio quando a ligação está sã. */
function motivoInvalido(a, porId, raizes, organizacaoId) {
  if (a.ehRaiz && a.superiorId != null) return 'raiz_com_superior';
  if (a.ehRaiz && raizes.length > 1 && a.id !== raizes[0].id) return 'multiplas_raizes';
  if (a.superiorId == null) return null;
  const sup = porId.get(a.superiorId);
  if (!sup) return 'superior_inexistente';
  if (sup.organizacaoId !== organizacaoId) return 'superior_fora_da_organizacao';
  return null;
}

/** Atuações que, subindo de superior em superior, voltam a um id já visto: presas num ciclo da hierarquia. */
function emCiclo(lista, porId) {
  const presas = new Set();
  for (const a of lista) {
    const vistos = new Set();
    let atual = a;
    while (atual && atual.superiorId != null) {
      if (vistos.has(atual.id)) { presas.add(a.id); break; }
      vistos.add(atual.id);
      atual = porId.get(atual.superiorId);
    }
  }
  return presas;
}

/** Pares de pessoas que estão uma acima da outra (R19), subindo de superior em superior pessoa a pessoa. */
function paresMutuos(lista, porId) {
  const sups = new Map();   // pessoa -> pessoas dos superiores (dentro da organização)
  for (const a of lista) {
    if (!sups.has(a.pessoaRef)) sups.set(a.pessoaRef, new Set());
    const s = a.superiorId != null ? porId.get(a.superiorId) : null;
    if (s && s.pessoaRef !== a.pessoaRef) sups.get(a.pessoaRef).add(s.pessoaRef);
  }
  const acima = new Map();   // pessoa -> todas as pessoas acima dela
  for (const p of sups.keys()) {
    const vistos = new Set(), pilha = [...sups.get(p)];
    while (pilha.length) {
      const q = pilha.pop();
      if (vistos.has(q)) continue;
      vistos.add(q);
      for (const r of sups.get(q) || []) if (!vistos.has(r)) pilha.push(r);
    }
    acima.set(p, vistos);
  }
  const pares = [];
  for (const [a, subindo] of acima) {
    for (const b of subindo) if (comparar(a, b) < 0 && acima.get(b)?.has(a)) pares.push([a, b]);
  }
  return pares.sort((x, y) => comparar(x[0], y[0]) || comparar(x[1], y[1]));
}

/** Itens de hierarquia de uma organização. */
function hierarquiaDe(S, org) {
  const itens = [];
  const lista = correntesDaOrg(S, org.id);
  const porId = new Map((S.atuacoes || []).filter(ehCorrente).map(a => [a.id, a]));
  const raizes = lista.filter(a => a.ehRaiz).sort((x, y) => comparar(x.id, y.id));
  const daAtuacao = (codigo, a, extra = {}) => item(S, { codigo, origem: 'hierarquia', pessoaId: a.pessoaRef, nome: nomeDe(S, a.pessoaRef),
    organizacaoId: org.id, atuacaoId: a.id, ...extra });

  if (raizes.length === 0) {
    itens.push(item(S, { codigo: 'organizacao_sem_raiz', origem: 'hierarquia', nome: nomeOrg(S, org.id), organizacaoId: org.id,
      detalhe: lista.length ? `${lista.length} atuações sem raiz` : 'Organização sem nenhuma atuação' }));
  } else if (org.tipo === 'unidade' && !ligacaoDaUnidade(S, org.id).ligada) {
    itens.push(daAtuacao('raiz_sem_ligacao_corporativa', raizes[0], { detalhe: 'A raiz não tem atuação na estrutura corporativa' }));
  }

  /* regra única (precisaDeLider, adaptador.js): desligado e afastado não entram como sem líder; a Matriz e o Painel contam igual */
  for (const a of atuacoesSemLider(S, org.id)) itens.push(daAtuacao('sem_superior', a));
  for (const a of lista) {
    const sup = a.superiorId != null ? porId.get(a.superiorId) : null;
    if (sup && precisaDeLider(S, a) && situacaoFuncional(sup) === 'Desligado') {
      itens.push(daAtuacao('superior_desligado', a, { detalhe: `líder desligado: ${nomeDe(S, sup.pessoaRef)}`, superiorAtuacaoId: sup.id }));
    }
  }

  const invalidos = new Set();
  for (const a of lista) {
    const m = motivoInvalido(a, porId, raizes, org.id);
    if (m) { invalidos.add(a.id); itens.push(daAtuacao('vinculo_invalido', a, { detalhe: m })); }
  }
  for (const id of emCiclo(lista, porId)) {
    if (!invalidos.has(id)) { invalidos.add(id); itens.push(daAtuacao('vinculo_invalido', porId.get(id), { detalhe: 'ciclo' })); }
  }
  /* rede de segurança: se validarArvore ainda recusa por algo que as checagens acima não viram, a organização fica
     marcada em vez de passar em silêncio (a trava de ciclo nunca libera uma árvore que a validação recusa). */
  if (raizes.length > 0 && invalidos.size === 0) {
    try { validarArvore(S.atuacoes || [], org.id); }
    catch (e) {
      itens.push(item(S, { codigo: 'vinculo_invalido', origem: 'hierarquia', nome: nomeOrg(S, org.id), organizacaoId: org.id,
        detalhe: e.codigo || 'arvore_invalida' }));
    }
  }

  for (const [a, b] of paresMutuos(lista, porId)) {
    const aa = lista.find(x => x.pessoaRef === a);
    itens.push(daAtuacao('avaliacao_mutua', aa, { detalhe: `${nomeDe(S, a)} e ${nomeDe(S, b)}`, pessoaParId: b }));
  }

  for (const a of lista) {
    if (a.superiorId != null && (a.origem === 'inferido_por_cargo' || a.origem === 'inferido_por_empresa')) {
      itens.push(daAtuacao('vinculo_inferido_nao_confirmado', a));
    }
  }
  return itens;
}

/** Itens da carga: uma pendência de S.base.pendencias por item, com a organização onde a pessoa atua. */
function cargaDe(S, organizacaoId) {
  const correntes = (S.atuacoes || []).filter(ehCorrente);
  const orgsDa = new Map();
  for (const a of correntes) {
    if (!orgsDa.has(a.pessoaRef)) orgsDa.set(a.pessoaRef, []);
    orgsDa.get(a.pessoaRef).push(a.organizacaoId);
  }
  const itens = [];
  for (const p of S.base?.pendencias || []) {
    const pid = pessoaDaPendencia(p);
    if (!DESCRICOES[p.codigo]) continue;
    const orgs = (orgsDa.get(pid) || []).slice().sort();
    if (organizacaoId != null && !orgs.includes(organizacaoId)) continue;
    itens.push(item(S, { codigo: p.codigo, origem: 'carga', pessoaId: pid, nome: nomeDe(S, pid),
      organizacaoId: organizacaoId ?? orgs[0] ?? null, detalhe: p.detalhe ?? null }));
  }
  return itens;
}

const posicao = c => { const i = ORDEM_FILA.indexOf(c); return i < 0 ? ORDEM_FILA.length : i; };

/**
 * Fila de pendências. Com organizacaoId: as da carga das pessoas que atuam nela mais as de hierarquia dela.
 * Com null (visão Rede, só RH regional e holding): tudo, inclusive pessoas sem organização (organizacaoId null).
 * Item: { codigo, origem, descricao, acaoSugerida, pessoaId, nome, organizacaoId, atuacaoId, detalhe }.
 * Ordem: hierarquia antes da carga (ORDEM_FILA), depois nome, depois ids (estável).
 */
export function filaDePendencias(S, organizacaoId = null) {
  const orgs = (S.organizacoes || []).filter(o => organizacaoId == null || o.id === organizacaoId);
  const itens = [];
  for (const o of orgs) itens.push(...hierarquiaDe(S, o));
  if (organizacaoId == null) {
    for (const p of poolSemOrganizacao(S)) {
      itens.push(item(S, { codigo: 'sem_organizacao', origem: 'hierarquia', pessoaId: p.id, nome: nomeDe(S, p.id), organizacaoId: null }));
    }
  }
  itens.push(...cargaDe(S, organizacaoId));
  return itens.sort((x, y) => posicao(x.codigo) - posicao(y.codigo)
    || x.nome.localeCompare(y.nome, 'pt-BR')
    || comparar(x.organizacaoId ?? '', y.organizacaoId ?? '')
    || comparar(x.atuacaoId ?? '', y.atuacaoId ?? '')
    || comparar(x.pessoaId ?? '', y.pessoaId ?? '')
    || comparar(x.detalhe ?? '', y.detalhe ?? ''));
}

export function contagemPorCodigo(itens) {
  const m = {};
  for (const i of itens || []) m[i.codigo] = (m[i.codigo] || 0) + 1;
  return m;
}

/** Totais para o contador da Árvore. */
export function resumoFila(S, organizacaoId) {
  const itens = filaDePendencias(S, organizacaoId);
  const hierarquia = itens.filter(i => i.origem === 'hierarquia').length;
  return { total: itens.length, hierarquia, carga: itens.length - hierarquia };
}
