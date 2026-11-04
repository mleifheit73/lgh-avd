/**
 * Árvore da organização (Plano B, Tarefa 4): render e contagens da tela Árvore.
 *
 * Puro: não toca DOM nem disco. Recebe nós de arvore() (modelo/atuacao.js) e o estado S, devolve strings HTML e objetos.
 * Toda contagem sai de S.atuacoes e S.semOrganizacao (fonte única). Nada aqui é estimado nem simulado.
 * Roda igual em Node (testes) e no navegador (bundle LGH).
 */
import { ID_CORPORATIVO } from './modelo/organizacao.js';
import { semSuperior } from './modelo/atuacao.js';
import { ehCorrente, rotuloOrigem } from './adaptador.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Rótulo curto da origem do vínculo, para caber na caixa; o texto completo de rotuloOrigem vai no title. */
const ORIGEM_CURTA = { definido: 'RH', inferido_por_cargo: 'Cargo', inferido_por_empresa: 'Empresa', carga: 'Carga' };
const CLASSE_ORIGEM = { definido: 't-ok', inferido_por_cargo: 't-warn', inferido_por_empresa: 't-warn', carga: 't-pend' };
export function rotuloOrigemCurto(atuacao) {
  return ORIGEM_CURTA[atuacao && atuacao.origem] || 'Sem registro';
}
/** Legenda da tela: as quatro origens, na ordem em que o RH as encontra (carga, inferências, definição). */
export const LEGENDA_ORIGEM = ['carga', 'inferido_por_cargo', 'inferido_por_empresa', 'definido']
  .map(origem => ({ origem, curto: ORIGEM_CURTA[origem], texto: rotuloOrigem({ origem }), classe: CLASSE_ORIGEM[origem] }));

/**
 * HTML aninhado da árvore a partir de um nó { atuacao, filhos }.
 * opcoes:
 *  - profundidadeAberta (padrão 1): listas de filhos em profundidade maior que esta nascem com `hidden`.
 *  - pessoas: Map pessoaId -> pessoa (nome da base). opcoes.nome(pessoaId, atuacao), se vier, tem precedência.
 *  - destacarSemSuperior: caixa de atuação sem superior que não é raiz ganha a classe ar-sem-superior.
 *  - extra(atuacao): HTML acrescentado dentro da caixa (a visão Rede põe ali o cartão fechado da unidade).
 * Cada caixa: data-atuacao, data-pessoa, data-nivel (0 na raiz do nó recebido), data-subordinados (diretos).
 */
export function renderArvore(no, opcoes = {}) {
  if (!no || !no.atuacao) return '';
  const { profundidadeAberta = 1, pessoas = null, destacarSemSuperior = false, extra = null } = opcoes;
  const nomeDe = typeof opcoes.nome === 'function'
    ? opcoes.nome
    : (pid) => (pessoas && typeof pessoas.get === 'function' && pessoas.get(pid)?.nome) || pid;
  const partes = [];
  const caixa = (n, nivel) => {
    const a = n.atuacao;
    const qtd = n.filhos.length;
    const semSup = destacarSemSuperior && a.superiorId == null && !a.ehRaiz;
    const aberto = nivel + 1 <= profundidadeAberta;
    partes.push(`<div class="ar-caixa${semSup ? ' ar-sem-superior' : ''}" tabindex="0" data-atuacao="${esc(a.id)}" data-pessoa="${esc(a.pessoaRef)}" data-nivel="${nivel}" data-subordinados="${qtd}">`);
    partes.push(`<div class="ar-cab"><b class="ar-nome">${esc(nomeDe(a.pessoaRef, a))}</b>`);
    if (a.ehRaiz) partes.push(`<span class="tag t-ok ar-raiz" title="Raiz da organização: não tem superior aqui">Raiz</span>`);
    partes.push(`<span class="tag ${CLASSE_ORIGEM[a.origem] || 't-pend'} ar-origem" data-origem="${esc(a.origem || '')}" title="${esc(rotuloOrigem(a))}">${esc(rotuloOrigemCurto(a))}</span>`);
    partes.push(`</div><div class="ar-funcao">${esc(a.funcao || 'Sem função')}</div><div class="ar-pe">`);
    if (a.podeLiderar) partes.push(`<span class="ar-lider" title="Marcado como líder: pode avaliar outras pessoas">Líder</span>`);
    if (semSup) partes.push(`<span class="ar-falta">Sem líder</span>`);
    partes.push(`<span class="ar-subs">${qtd === 0 ? 'Sem subordinados' : qtd === 1 ? '1 subordinado direto' : `${qtd} subordinados diretos`}</span>`);
    if (qtd) partes.push(`<button type="button" class="ar-colapso" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'} os subordinados">${aberto ? 'Recolher' : 'Expandir'}</button>`);
    partes.push('</div>');
    if (extra) partes.push(extra(a) || '');
    partes.push('</div>');
  };
  const lista = (nos, nivel) => {
    const oculto = nivel > profundidadeAberta;
    partes.push(`<ul class="ar-nivel${nivel > 0 ? ' ar-sub' : ''}" data-profundidade="${nivel}"${oculto ? ' hidden' : ''}>`);
    for (const n of nos) {
      partes.push('<li class="ar-no">');
      caixa(n, nivel);
      if (n.filhos.length) lista(n.filhos, nivel + 1);
      partes.push('</li>');
    }
    partes.push('</ul>');
  };
  lista([no], 0);
  return partes.join('');
}

/* ---------- leitura do estado ---------- */
const correntesDaOrg = (atuacoes, org) => (atuacoes || []).filter(a => a.organizacaoId === org && ehCorrente(a));
function organizacao(S, id) { return (S.organizacoes || []).find(o => o.id === id) ?? null; }

/**
 * Subárvores que arvore() não alcança: uma por atuação sem superior que não é raiz, com quem estiver abaixo dela.
 * É o que a tela mostra em "Sem líder". Mesma forma de nó de arvore(). Ordem estável por id.
 */
export function foraDaArvore(atuacoes, organizacaoId) {
  const lista = correntesDaOrg(atuacoes, organizacaoId);
  const filhosDe = new Map();
  for (const a of lista) {
    if (a.superiorId == null) continue;
    if (!filhosDe.has(a.superiorId)) filhosDe.set(a.superiorId, []);
    filhosDe.get(a.superiorId).push(a);
  }
  const vistos = new Set();
  const montar = a => {
    vistos.add(a.id);
    return { atuacao: a, filhos: (filhosDe.get(a.id) ?? []).filter(f => !vistos.has(f.id)).map(montar) };
  };
  return semSuperior(atuacoes || [], organizacaoId).sort((x, y) => comparar(x.id, y.id)).map(montar);
}

/** Pessoas do pool da carga (PJ sem filial correspondente) que ainda não ganharam atuação corrente em lugar nenhum. */
export function poolSemOrganizacao(S) {
  const comAtuacao = new Set((S.atuacoes || []).filter(ehCorrente).map(a => a.pessoaRef));
  return (S.semOrganizacao || []).filter(p => !comAtuacao.has(p.id));
}

/**
 * Contagens da organização, por atuação (quem tem dois líderes conta duas vezes, como na avaliação).
 * total = raiz + comSuperior + semSuperior. inferidos/definidos contam a origem do vínculo de todas as atuações correntes.
 * semOrganizacao: tamanho do pool da rede (não é da organização), para o RH distribuir.
 */
export function resumoOrganizacao(S, organizacaoId) {
  const lista = correntesDaOrg(S.atuacoes, organizacaoId);
  const raizes = lista.filter(a => a.ehRaiz);
  return {
    total: lista.length,
    pessoas: new Set(lista.map(a => a.pessoaRef)).size,
    raiz: raizes.length,
    raizId: raizes.length === 1 ? raizes[0].id : null,
    comSuperior: lista.filter(a => a.superiorId != null).length,
    semSuperior: semSuperior(S.atuacoes || [], organizacaoId).length,
    inferidos: lista.filter(a => a.origem === 'inferido_por_cargo' || a.origem === 'inferido_por_empresa').length,
    definidos: lista.filter(a => a.origem === 'definido').length,
    semOrganizacao: poolSemOrganizacao(S).length,
  };
}

/** Atuação raiz corrente da organização (a primeira por id, se houver mais de uma, o que validarArvore recusa). */
export function raizDe(S, organizacaoId) {
  return correntesDaOrg(S.atuacoes, organizacaoId).filter(a => a.ehRaiz).sort((x, y) => comparar(x.id, y.id))[0] ?? null;
}

/**
 * Ligação de uma organização com a estrutura corporativa (D20): a raiz dela (o gerente geral, numa unidade),
 * as atuações correntes dessa pessoa no corporativo e os superiores dessas atuações (quem avalia o gerente geral).
 */
export function ligacaoDaUnidade(S, organizacaoId) {
  const raiz = raizDe(S, organizacaoId);
  if (!raiz) return { raiz: null, corporativas: [], superiores: [], ligada: false, motivo: 'sem_raiz' };
  const correntes = (S.atuacoes || []).filter(ehCorrente);
  const porId = new Map(correntes.map(a => [a.id, a]));
  const corporativas = correntes.filter(a => a.organizacaoId === ID_CORPORATIVO && a.pessoaRef === raiz.pessoaRef)
    .sort((x, y) => comparar(x.id, y.id));
  const superiores = corporativas.map(a => a.superiorId && porId.get(a.superiorId)).filter(Boolean);
  const ligada = corporativas.length > 0;
  return { raiz, corporativas, superiores, ligada, motivo: ligada ? null : 'sem_atuacao_corporativa' };
}

/** Ids das unidades ligadas ao corporativo e das sem ligação (sem raiz, ou raiz sem atuação corporativa). */
export function ligacoesCorporativas(S) {
  const ligadas = [], semLigacao = [], motivos = {};
  for (const o of (S.organizacoes || []).filter(x => x.tipo === 'unidade')) {
    const l = ligacaoDaUnidade(S, o.id);
    if (l.ligada) ligadas.push(o.id);
    else { semLigacao.push(o.id); motivos[o.id] = l.motivo; }
  }
  return { ligadas, semLigacao, motivos };
}

/** Unidades cuja raiz é a mesma pessoa da atuação corporativa informada: são os cartões fechados dentro da caixa dela. */
export function unidadesSob(S, atuacaoCorporativaId) {
  const a = (S.atuacoes || []).find(x => x.id === atuacaoCorporativaId);
  if (!a || !ehCorrente(a) || a.organizacaoId !== ID_CORPORATIVO) return [];
  return (S.organizacoes || []).filter(o => o.tipo === 'unidade')
    .filter(o => { const r = raizDe(S, o.id); return r && r.pessoaRef === a.pessoaRef; })
    .map(o => o.id);
}
