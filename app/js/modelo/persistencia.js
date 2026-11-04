/**
 * Persistência da montagem (Plano B, Tarefa 8): o banco do artefato guarda só o DELTA entre a base (atuações que a carga
 * gera a partir de base.json, piloto e tabela de equivalência, sempre iguais para a mesma entrada) e o estado atual.
 * A base nunca vai para o banco.
 *
 * O que vai para o banco (M7, exatamente): em `alteradas`, por atuação, id, organizacaoId e só os grupos de campos de
 * CAMPOS_MONTAGEM que mudaram (superior, raiz, origem, método de inferência, confirmadaPor e definidaEm; marca de líder;
 * situação, fim e encerradaPor; função; setor e equipe; situação funcional situacaoColab). Em `criadas`, o registro inteiro
 * da atuação nova (id, pessoaRef, organizacaoId, função, setor, turno, equipe, início, superior, raiz, origem, marca de
 * líder, confirmadaPor, definidaEm). Função é o texto do cargo de trabalho e confirmadaPor/encerradaPor são o nome de quem
 * fez a alteração no sistema (o perfil logado), como o autor do documento. Nunca vai: nome, cargo da base ou faixa etária da
 * pessoa avaliada, CPF ou hash de CPF.
 * Puro: não toca tela nem banco. Roda igual em Node (testes) e no navegador (bundle LGH).
 */
import { validarArvore } from './atuacao.js';

/**
 * Campos que as escritas da montagem e da Matriz gravam numa atuação que já existe na base (verificado em adaptador.js:
 * definirSuperior, removerSuperior, encerrar, confirmarInferido, marcarRaiz, marcarLider, definirCampoPessoa).
 * Em grupos: o grupo inteiro vai para o delta quando qualquer campo dele muda, para nunca juntar parte de um vínculo antigo
 * com parte de um vínculo novo da carga (ex.: "confirmado pelo RH" sobre um superior que o RH nunca viu).
 * Campo da base fora desta lista (pessoaRef, início, turno...) nunca vai em `alteradas`: depois de uma carga nova vale o da base.
 */
export const GRUPOS_MONTAGEM = Object.freeze([
  Object.freeze(['superiorId', 'ehRaiz', 'origem', 'metodoInferencia', 'confirmadaPor', 'definidaEm', 'superiorAnterior']),
  Object.freeze(['podeLiderar']),
  Object.freeze(['situacao', 'fim', 'encerradaPor']),
  Object.freeze(['funcao']),
  Object.freeze(['setor', 'equipe']),
  Object.freeze(['situacaoColab']),
]);
export const CAMPOS_MONTAGEM = Object.freeze(GRUPOS_MONTAGEM.flat());
/** 2: `alteradas` passou a levar só os campos de montagem que mudaram (I3). Documento versão 1 (registro inteiro) ainda é lido. */
export const VERSAO_DELTA = 2;

const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const porId = (x, y) => comparar(x.id, y.id);
const copiar = o => JSON.parse(JSON.stringify(o));

/** JSON com chaves em ordem: dois valores iguais dão o mesmo texto, qualquer que seja a ordem em que os campos nasceram. */
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}
const igual = (x, y) => canonico(x) === canonico(y);

/** Parte alterada de uma atuação da base: id, organizacaoId e os grupos de CAMPOS_MONTAGEM que mudaram. null se nada mudou. */
function parteAlterada(b, a) {
  const parte = { id: a.id, organizacaoId: a.organizacaoId };
  let mudou = false;
  for (const grupo of GRUPOS_MONTAGEM) {
    if (grupo.every(k => igual(a[k], b[k]))) continue;
    mudou = true;
    for (const k of grupo) if (a[k] !== undefined) parte[k] = copiar(a[k]);
  }
  return mudou ? parte : null;
}

/**
 * Delta = { versao, alteradas, criadas, removidasIds }, tudo ordenado por id. Determinístico.
 * alteradas: atuações da base com algum campo de montagem diferente (só id, organizacaoId e os grupos que mudaram).
 * criadas: ids que a base não tem (registro inteiro).
 * removidasIds: ids da base que sumiram do estado (o adaptador não remove, encerra; o caso existe para o delta ser completo).
 */
export function calcularDelta(atuacoesBase, atuacoesAtuais) {
  const base = new Map((atuacoesBase || []).map(a => [a.id, a]));
  const atuais = new Set();
  const alteradas = [], criadas = [];
  for (const a of atuacoesAtuais || []) {
    atuais.add(a.id);
    const b = base.get(a.id);
    if (!b) { criadas.push(copiar(a)); continue; }
    const parte = parteAlterada(b, a);
    if (parte) alteradas.push(parte);
  }
  const removidasIds = [...base.keys()].filter(id => !atuais.has(id)).sort(comparar);
  return { versao: VERSAO_DELTA, alteradas: alteradas.sort(porId), criadas: criadas.sort(porId), removidasIds };
}

/** Mescla a alterada sobre o registro da base. Versão 1 trazia o registro inteiro: fica como antes (todas as chaves dele). */
function mesclar(b, alterada, versao) {
  if (versao != null && versao < 2) return copiar(alterada);
  const r = copiar(b);
  for (const k of CAMPOS_MONTAGEM) if (k in alterada) r[k] = copiar(alterada[k]);
  return r;
}

/**
 * Novo array: a base sem as removidas, com as alteradas mescladas no lugar (mesma posição; só CAMPOS_MONTAGEM sai da
 * alterada, o resto vem da base) e as criadas no fim, em ordem de id.
 * Nunca muta a base nem o delta. Criada cujo id já exista substitui (aplicar o mesmo delta duas vezes dá o mesmo estado).
 * Alterada cujo id a base não tem mais é ignorada (aplicarDeltaConferido conta e informa).
 */
export function aplicarDelta(atuacoesBase, delta) {
  const d = delta || {};
  const removidas = new Set(d.removidasIds || []);
  const alteradas = new Map((d.alteradas || []).map(a => [a.id, a]));
  const criadas = new Map((d.criadas || []).map(a => [a.id, a]));
  const r = [];
  const vistos = new Set();
  for (const a of atuacoesBase || []) {
    if (removidas.has(a.id)) continue;
    vistos.add(a.id);
    if (criadas.has(a.id)) r.push(copiar(criadas.get(a.id)));
    else if (alteradas.has(a.id)) r.push(mesclar(a, alteradas.get(a.id), d.versao));
    else r.push(copiar(a));
  }
  for (const a of [...(d.criadas || [])].sort(porId)) if (!vistos.has(a.id) && !removidas.has(a.id)) { vistos.add(a.id); r.push(copiar(a)); }
  return r;
}

const corrente = a => a.situacao === 'ativa' && a.fim == null;
function codigoArvore(atuacoes, organizacaoId) {
  try { validarArvore(atuacoes, organizacaoId); return null; } catch (e) { return e.codigo || 'arvore_invalida'; }
}
/** Superior que não existe (ou não está corrente), de outra organização, ou ciclo entre atuações da organização. */
function codigoLigacoes(atuacoes, organizacaoId) {
  const porIdCorrente = new Map(atuacoes.filter(corrente).map(a => [a.id, a]));
  const lista = atuacoes.filter(a => a.organizacaoId === organizacaoId && corrente(a));
  for (const a of lista) {
    if (a.superiorId == null) continue;
    const sup = porIdCorrente.get(a.superiorId);
    if (!sup) return 'superior_inexistente';
    if (sup.organizacaoId !== organizacaoId) return 'superior_fora_da_organizacao';
  }
  for (const a of lista) {
    const vistos = new Set();
    for (let x = a; x && x.superiorId != null; x = porIdCorrente.get(x.superiorId)) {
      if (vistos.has(x.id)) return 'ciclo';
      vistos.add(x.id);
    }
  }
  return null;
}

/**
 * Aplica o delta de UMA organização e confere a árvore dela depois (I3). Recusa (devolve as atuações de entrada intactas)
 * quando o resultado tem superior inexistente, de outra organização ou ciclo, ou quando validarArvore passa a falhar com
 * código diferente do que já falhava sem o delta (organização da carga sem raiz continua aceitando delta).
 * Também recusa delta com atuação de outra organização (o documento é por organização).
 * Devolve { ok, atuacoes, codigo, ignoradas }: ignoradas são ids de alteradas que a base não tem mais (a carga nova não
 * trouxe a atuação); não recusam, mas a tela informa.
 */
export function aplicarDeltaConferido(atuacoes, delta, organizacaoId) {
  const d = delta || {};
  const lista = atuacoes || [];
  const deOutra = [...(d.alteradas || []), ...(d.criadas || [])].some(a => a.organizacaoId !== organizacaoId);
  if (deOutra) return { ok: false, atuacoes: lista, codigo: 'atuacao_de_outra_organizacao', ignoradas: [], perdidas: [] };
  const ids = new Set(lista.map(a => a.id));
  const ignoradas = (d.alteradas || []).map(a => a.id).filter(id => !ids.has(id)).sort(comparar);
  const depois = aplicarDelta(lista, d);
  /* P30 (decisão de Marcelo, 04/11): superior que saiu na carga nova não derruba a montagem inteira. A atuação volta ao
     vínculo da base (ou fica sem superior, se nasceu no delta), guarda `superiorAnterior` e vira pendência
     superior_saiu_da_carga na fila. Ciclo e árvore inválida continuam recusando a organização inteira. */
  const perdidas = desligarSuperioresPerdidos(depois, lista, organizacaoId);
  const antes = codigoArvore(lista, organizacaoId);
  const codigo = codigoLigacoes(depois, organizacaoId) || (() => { const c = codigoArvore(depois, organizacaoId); return c && c !== antes ? c : null; })();
  if (codigo) return { ok: false, atuacoes: lista, codigo, ignoradas, perdidas: [] };
  return { ok: true, atuacoes: depois, codigo: null, ignoradas, perdidas };
}

const GRUPO_VINCULO = GRUPOS_MONTAGEM[0];
/** Atuações correntes da organização cujo superior não existe mais (ou é de outra organização): ids, em ordem. Edita `depois`. */
function desligarSuperioresPerdidos(depois, base, organizacaoId) {
  const porIdCorrente = new Map(depois.filter(corrente).map(a => [a.id, a]));
  const naBase = new Map(base.map(a => [a.id, a]));
  const perdidas = [];
  for (const a of depois) {
    if (a.organizacaoId !== organizacaoId || !corrente(a) || a.superiorId == null) continue;
    const sup = porIdCorrente.get(a.superiorId);
    if (sup && sup.organizacaoId === organizacaoId) continue;
    const perdido = a.superiorId;
    const b = naBase.get(a.id);
    if (b && (b.superiorId == null || porIdCorrente.get(b.superiorId)?.organizacaoId === organizacaoId)) {
      for (const k of GRUPO_VINCULO) { if (k in b) a[k] = b[k]; else delete a[k]; }
    } else {
      a.superiorId = null;
    }
    a.superiorAnterior = perdido;
    perdidas.push(a.id);
  }
  return perdidas.sort(comparar);
}

/** Organização de um id de atuação `organizacao|pessoa|n` (a organização pode, em tese, conter `|`: só os dois últimos saem). */
export function organizacaoDoId(id) {
  const p = String(id).split('|');
  return p.length >= 3 ? p.slice(0, -2).join('|') : null;
}

/** Organizações tocadas pelo delta, em ordem. Removida sem a atuação da base à mão: organização lida do prefixo do id. */
export function organizacoesNoDelta(delta, atuacoesBase = null) {
  return Object.keys(deltaPorOrganizacao(delta, atuacoesBase)).sort(comparar);
}

/**
 * { [organizacaoId]: Delta }. Criada e alterada pertencem à própria organizacaoId; removida, à organização da atuação na
 * base (atuacoesBase, quando dada) ou à do prefixo do id.
 */
export function deltaPorOrganizacao(delta, atuacoesBase = null) {
  const d = delta || {};
  const orgBase = new Map((atuacoesBase || []).map(a => [a.id, a.organizacaoId]));
  const partes = {};
  const parte = org => (partes[org] ||= { versao: VERSAO_DELTA, alteradas: [], criadas: [], removidasIds: [] });
  for (const a of d.alteradas || []) parte(a.organizacaoId).alteradas.push(a);
  for (const a of d.criadas || []) parte(a.organizacaoId).criadas.push(a);
  for (const id of d.removidasIds || []) parte(orgBase.get(id) ?? organizacaoDoId(id)).removidasIds.push(id);
  const ordenado = {};
  for (const org of Object.keys(partes).sort(comparar)) {
    const p = partes[org];
    ordenado[org] = { versao: p.versao, alteradas: p.alteradas.sort(porId), criadas: p.criadas.sort(porId), removidasIds: p.removidasIds.sort(comparar) };
  }
  return ordenado;
}

/**
 * Id do documento `montagem/<id>`: o banco só aceita letras, dígitos e _ - . ~ : @ +; o resto vira `_`
 * ('HOTEL LAGHETTO GOLDEN' → 'HOTEL_LAGHETTO_GOLDEN'). Não é injetiva em tese: o corpo do documento guarda a organizacaoId
 * verdadeira, e a página recusa gravar duas organizações no mesmo documento.
 */
export function idDocMontagem(organizacaoId) {
  return String(organizacaoId).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_');
}
