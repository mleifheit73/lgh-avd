/**
 * Persistência da montagem (Plano B, Tarefa 8): o banco do artefato guarda só o DELTA entre a base (atuações que a carga
 * gera a partir de base.json, piloto e tabela de equivalência, sempre iguais para a mesma entrada) e o estado atual.
 * A base nunca vai para o banco. Uma atuação carrega só ids, função (texto do cargo, não é dado pessoal) e estrutura:
 * nenhum nome, cargo da base ou hash de CPF.
 * Puro: não toca tela nem banco. Roda igual em Node (testes) e no navegador (bundle LGH).
 */

/** Campos de montagem: mudar qualquer um deles torna a atuação "alterada". A comparação usa o registro inteiro em JSON
 *  canônico (chaves ordenadas), então campo acessório que a escrita acrescente (encerradaPor, situacaoColab, equipe) também conta. */
export const CAMPOS_MONTAGEM = Object.freeze([
  'superiorId', 'ehRaiz', 'podeLiderar', 'origem', 'metodoInferencia', 'confirmadaPor', 'definidaEm', 'fim', 'situacao', 'funcao', 'setor',
]);
export const VERSAO_DELTA = 1;

const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const porId = (x, y) => comparar(x.id, y.id);
const copiar = o => JSON.parse(JSON.stringify(o));

/** JSON com chaves em ordem: dois registros iguais dão o mesmo texto, qualquer que seja a ordem em que os campos nasceram. */
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/**
 * Delta = { versao: 1, alteradas, criadas, removidasIds }, tudo ordenado por id. Determinístico.
 * alteradas: atuações da base cujo registro mudou (cópia do registro atual inteiro). criadas: ids que a base não tem.
 * removidasIds: ids da base que sumiram do estado (o adaptador não remove, encerra; o caso existe para o delta ser completo).
 */
export function calcularDelta(atuacoesBase, atuacoesAtuais) {
  const base = new Map((atuacoesBase || []).map(a => [a.id, a]));
  const atuais = new Set();
  const alteradas = [], criadas = [];
  for (const a of atuacoesAtuais || []) {
    atuais.add(a.id);
    const b = base.get(a.id);
    if (!b) criadas.push(copiar(a));
    else if (canonico(a) !== canonico(b)) alteradas.push(copiar(a));
  }
  const removidasIds = [...base.keys()].filter(id => !atuais.has(id)).sort(comparar);
  return { versao: VERSAO_DELTA, alteradas: alteradas.sort(porId), criadas: criadas.sort(porId), removidasIds };
}

/**
 * Novo array: a base sem as removidas, com as alteradas no lugar (mesma posição) e as criadas no fim, em ordem de id.
 * Nunca muta a base nem o delta. Criada cujo id já exista substitui (aplicar o mesmo delta duas vezes dá o mesmo estado).
 */
export function aplicarDelta(atuacoesBase, delta) {
  const d = delta || {};
  const removidas = new Set(d.removidasIds || []);
  const trocas = new Map([...(d.alteradas || []), ...(d.criadas || [])].map(a => [a.id, a]));
  const r = [];
  const vistos = new Set();
  for (const a of atuacoesBase || []) {
    if (removidas.has(a.id)) continue;
    vistos.add(a.id);
    r.push(copiar(trocas.has(a.id) ? trocas.get(a.id) : a));
  }
  for (const a of [...(d.criadas || [])].sort(porId)) if (!vistos.has(a.id) && !removidas.has(a.id)) { vistos.add(a.id); r.push(copiar(a)); }
  return r;
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
