/**
 * Adaptador (Plano B, Tarefa 3): as telas antigas passam a ler e escrever atuações.
 *
 * Fonte única (ruling R4): S.atuacoes, S.organizacoes, S.pessoas, S.pessoasPorId, S.base.
 * PESSOAS, AVALIAVEIS e os demais derivados da página são VISÕES reconstruídas a partir daqui por reconstruirViews(S).
 * Toda escrita passa pelas funções deste módulo (definirSuperior, removerSuperior, marcarLider, definirCampoPessoa...),
 * e quem chama reconstrói as visões em seguida.
 *
 * Escopo por atuação (spec 6): nenhuma função de lista devolve a rede inteira; tudo é relativo a uma organização.
 * Puro: não toca tela nem disco. Roda igual em Node (testes) e no navegador (bundle LGH).
 */
import { chaveEmpresa } from './carga/normalizar.js';
import { validarArvore } from './modelo/atuacao.js';
import { normalizarNome } from './modelo/nome.js';

export const SEM_SETOR = 'Sem setor';
export const SITUACAO_PADRAO = 'Ativo';
const NIVEIS = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'];

class ErroAdaptador extends Error {
  constructor(codigo, mensagem, detalhe) { super(mensagem); this.codigo = codigo; this.detalhe = detalhe; }
}

/** Atuação corrente: ativa e sem fim (mesma regra de atuacao.js). */
export const ehCorrente = a => !!a && a.situacao === 'ativa' && a.fim == null;

/**
 * Situação funcional (Ativo, Férias, Afastado, Desligado) que a Matriz grava na atuação (situacaoColab, ver definirCampoPessoa).
 * Fonte única em S.atuacoes; sem registro vale SITUACAO_PADRAO.
 */
export const SITUACOES_NO_CICLO = Object.freeze(['Ativo', 'Férias']);
export const situacaoFuncional = a => (a && a.situacaoColab) || SITUACAO_PADRAO;

/**
 * Regra única (C2, revisão final do Plano B) de "esta atuação precisa de líder": corrente, não é a raiz da organização e a
 * situação funcional é Ativo ou Férias. Desligado e Afastado ficam fora do ciclo e não contam como sem líder.
 * A Matriz (chip), o Painel do RH (KPI), a Árvore (medidor e lista Sem líder), a fila de Pendências e a trava de abertura de
 * ciclo leem esta função (ou semLider/atuacoesSemLider, que a usam), então os números nunca divergem entre as telas.
 * S fica na assinatura para a regra poder ler o estado no futuro sem mudar quem chama.
 */
export function precisaDeLider(S, atuacao) {
  return ehCorrente(atuacao) && !atuacao.ehRaiz && SITUACOES_NO_CICLO.includes(situacaoFuncional(atuacao));
}
/** Precisa de líder e não tem superior. */
export function semLider(S, atuacao) { return precisaDeLider(S, atuacao) && atuacao.superiorId == null; }
/** Atuações da organização sem líder (semLider), em ordem de id. */
export function atuacoesSemLider(S, organizacaoId) {
  return (S.atuacoes || []).filter(a => a.organizacaoId === organizacaoId && semLider(S, a))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
const hoje = () => new Date().toISOString().slice(0, 10);
const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ---------- índices (derivados de S.base, que não muda depois do boot) ---------- */
function pessoaPorId(S, id) {
  const m = S.pessoasPorId;
  if (m && typeof m.get === 'function') return m.get(id) ?? null;
  return (S.pessoas || []).find(p => p.id === id) ?? null;
}
function vinculosDe(S, pessoaId) {
  const base = S.base || { vinculos: [] };
  if (!S._vinculosPorPessoa || S._vinculosBase !== base) {
    const m = new Map();
    for (const v of base.vinculos || []) {
      if (!m.has(v.pessoaId)) m.set(v.pessoaId, []);
      m.get(v.pessoaId).push(v);
    }
    Object.defineProperty(S, '_vinculosPorPessoa', { value: m, writable: true, configurable: true, enumerable: false });
    Object.defineProperty(S, '_vinculosBase', { value: base, writable: true, configurable: true, enumerable: false });
  }
  return S._vinculosPorPessoa.get(pessoaId) || [];
}
function organizacao(S, id) { return (S.organizacoes || []).find(o => o.id === id) ?? null; }
function atuacaoPorId(S, id) { return (S.atuacoes || []).find(a => a.id === id) ?? null; }
function correntesDaOrg(S, organizacaoId) { return (S.atuacoes || []).filter(a => a.organizacaoId === organizacaoId && ehCorrente(a)); }
function correntesDaPessoa(S, pessoaId, organizacaoId) {
  return (S.atuacoes || []).filter(a => a.pessoaRef === pessoaId && ehCorrente(a) && (organizacaoId == null || a.organizacaoId === organizacaoId))
    .sort((x, y) => comparar(x.id, y.id));
}

/** Nome para a tela: o do piloto validado pelo RH (com acentos e caixa) quando a pessoa está nele; senão o da base. */
export function nomeExibicao(S, pessoa) {
  if (!pessoa) return '';
  const p = S.piloto && S.piloto[normalizarNome(pessoa.nome)];
  return (p && p.nome) || pessoa.nome;
}

/** Pessoa da base cujo nome (ou nome alternativo) casa com `nome` normalizado. null se nenhuma ou se houver homônimo. */
export function pessoaIdPorNome(S, nome) {
  const k = normalizarNome(nome);
  if (!k) return null;
  const achados = (S.pessoas || []).filter(p => [p.nome, ...(p.nomesAlternativos || [])].some(n => normalizarNome(n) === k));
  return achados.length === 1 ? achados[0].id : null;
}

/** Pessoa do perfil logado: pessoaId explícito ou pelo nome. */
export function pessoaDoPerfil(S) {
  if (!S.perfil) return null;
  if (S.perfil.pessoaId) return S.perfil.pessoaId;
  return pessoaIdPorNome(S, S.perfil.nome);
}

/** Vínculo que sustenta a atuação: o CLT cuja filial é da organização; senão o primeiro PJ; senão o primeiro. */
export function vinculoDaAtuacao(S, a) {
  const vs = vinculosDe(S, a.pessoaRef);
  const org = organizacao(S, a.organizacaoId);
  const filiais = new Set((org?.filiais || []).map(chaveEmpresa));
  return vs.find(v => v.regime === 'CLT' && filiais.has(chaveEmpresa(v.filial)))
    || vs.find(v => v.regime !== 'CLT')
    || vs[0] || null;
}

/* ---------- leitura ---------- */

/** Registro público de uma pessoa numa organização, na forma que os blocos da v34 esperam. null se não tem atuação corrente lá. */
export function pessoaNaOrganizacao(S, pessoaId, organizacaoId) {
  const pessoa = pessoaPorId(S, pessoaId);
  const minhas = correntesDaPessoa(S, pessoaId, organizacaoId);
  if (!pessoa || minhas.length === 0) return null;
  const a0 = minhas[0];
  const v = vinculoDaAtuacao(S, a0) || {};
  const org = organizacao(S, organizacaoId);
  const filiais = new Set((org?.filiais || []).map(chaveEmpresa));
  const avaliadores = [];
  for (const a of minhas) {
    if (!a.superiorId) continue;
    const sup = atuacaoPorId(S, a.superiorId);
    const nome = sup ? nomeExibicao(S, pessoaPorId(S, sup.pessoaRef)) : null;
    if (nome && !avaliadores.includes(nome)) avaliadores.push(nome);
  }
  const setor = a0.setor || SEM_SETOR;
  return {
    id: pessoa.id,
    nome: nomeExibicao(S, pessoa),
    cargo: v.cargo || a0.funcao || 'Sem cargo',
    cargoCod: v.codigo || '',
    filial: v.filial || v.empresa || 'Sem filial',
    cnpj: v.empresa || '',
    setor,
    equipe: setor,
    avaliadores,
    lider: minhas.some(a => a.podeLiderar),
    externo: !(v.regime === 'CLT' && filiais.has(chaveEmpresa(v.filial))),
    situacao: a0.situacaoColab || SITUACAO_PADRAO,
    funcao: a0.funcao,
    faixaEtaria: pessoa.faixaEtaria ?? null,
    raiz: minhas.some(a => a.ehRaiz),
    organizacaoId,
    atuacoes: minhas.map(a => a.id),
  };
}

/** Pessoas com atuação corrente na organização, cada uma uma vez, por nome. */
export function pessoasDa(S, organizacaoId) {
  const ids = [];
  const vistos = new Set();
  for (const a of correntesDaOrg(S, organizacaoId)) if (!vistos.has(a.pessoaRef)) { vistos.add(a.pessoaRef); ids.push(a.pessoaRef); }
  return ids.map(id => pessoaNaOrganizacao(S, id, organizacaoId)).filter(Boolean)
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR') || comparar(x.id, y.id));
}

/** Atuações cujo superior é uma atuação corrente da pessoa nessa organização. */
export function avaliadosDe(S, pessoaId, organizacaoId) {
  const minhas = new Set(correntesDaPessoa(S, pessoaId, organizacaoId).map(a => a.id));
  if (minhas.size === 0) return [];
  return correntesDaOrg(S, organizacaoId).filter(a => a.superiorId && minhas.has(a.superiorId))
    .sort((x, y) => comparar(x.pessoaRef, y.pessoaRef) || comparar(x.id, y.id));
}

/** Atuações que o perfil logado alcança na organização selecionada. Avaliador: só as que ele supervisiona. */
export function atuacoesVisiveis(S) {
  if (!S.perfil || !S.organizacaoSelecionada || !noEscopo(S, S.organizacaoSelecionada)) return [];
  if (S.perfil.papel === 'avaliador') {
    const pid = pessoaDoPerfil(S);
    return pid ? avaliadosDe(S, pid, S.organizacaoSelecionada) : [];
  }
  return correntesDaOrg(S, S.organizacaoSelecionada).sort((x, y) => comparar(x.id, y.id));
}

/** Pessoas que o perfil logado alcança. Nunca a rede inteira: sempre dentro da organização selecionada (Review Focus 1). */
export function visiveis(S) {
  if (!S.perfil || !S.organizacaoSelecionada || !noEscopo(S, S.organizacaoSelecionada)) return [];
  if (S.perfil.papel === 'avaliador') {
    const ids = [...new Set(atuacoesVisiveis(S).map(a => a.pessoaRef))];
    return ids.map(id => pessoaNaOrganizacao(S, id, S.organizacaoSelecionada)).filter(Boolean)
      .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  }
  return pessoasDa(S, S.organizacaoSelecionada);
}

/**
 * Registro de avaliação: a pessoa como os blocos esperam, mais a atuação avaliada (S.colab, spec 3.7).
 * avaliadores, funcao, setor e lider são os DESTA atuação; ordem/total dizem qual atuação da pessoa na organização ela é.
 */
export function colabDe(S, atuacao) {
  const a = typeof atuacao === 'string' ? atuacaoPorId(S, atuacao) : atuacao;
  if (!a) return null;
  const p = pessoaNaOrganizacao(S, a.pessoaRef, a.organizacaoId);
  if (!p) return null;
  const sup = a.superiorId ? atuacaoPorId(S, a.superiorId) : null;
  const ordem = p.atuacoes.indexOf(a.id) + 1;
  const setor = a.setor || SEM_SETOR;
  return {
    ...p,
    atuacaoId: a.id,
    funcao: a.funcao,
    setor, equipe: setor,
    avaliadores: sup ? [nomeExibicao(S, pessoaPorId(S, sup.pessoaRef))] : [],
    avaliadoresDaPessoa: p.avaliadores,
    superiorId: a.superiorId,
    lider: !!a.podeLiderar,
    situacao: a.situacaoColab || SITUACAO_PADRAO,
    raiz: !!a.ehRaiz,
    origem: a.origem,
    ordem: ordem > 0 ? ordem : 1,
    totalAtuacoes: p.atuacoes.length,
  };
}

const ROTULOS_ORIGEM = {
  definido: 'Definido pelo RH',
  inferido_por_cargo: 'Inferido pelo cargo',
  inferido_por_empresa: 'Inferido pela empresa',
  carga: 'Da carga, sem superior',
};
export function rotuloOrigem(atuacao) {
  return ROTULOS_ORIGEM[atuacao && atuacao.origem] || 'Origem não registrada';
}

/**
 * Nível derivado da posição (spec 6, D20). N3 (chefe de setor) fica para o Plano C.
 * Corporativa: raiz → N6; quem tem raiz de unidade como subordinado direto → N5; subordinado direto da raiz → N6.
 * Unidade: raiz → N4; com subordinado que lidera alguém → N2; só subordinados diretos → N1; sem subordinados → null.
 * papel 'admin' (RH da holding) → N6 pelo papel. Pessoa com várias atuações: o maior nível entre elas.
 */
export function nivelDe(S, pessoaId, papel) {
  if (papel === 'admin') return 'N6';
  const todas = (S.atuacoes || []).filter(ehCorrente);
  const filhos = new Map();
  for (const a of todas) if (a.superiorId) { if (!filhos.has(a.superiorId)) filhos.set(a.superiorId, []); filhos.get(a.superiorId).push(a); }
  const porId = new Map(todas.map(a => [a.id, a]));
  const tipoDe = id => organizacao(S, id)?.tipo;
  const ehRaizDeUnidade = pid => todas.some(a => a.pessoaRef === pid && a.ehRaiz && tipoDe(a.organizacaoId) !== 'corporativa');
  let melhor = -1;
  for (const a of todas.filter(x => x.pessoaRef === pessoaId)) {
    const subs = filhos.get(a.id) || [];
    let n = null;
    if (tipoDe(a.organizacaoId) === 'corporativa') {
      const sup = a.superiorId ? porId.get(a.superiorId) : null;
      if (a.ehRaiz) n = 'N6';
      else if (subs.some(s => ehRaizDeUnidade(s.pessoaRef))) n = 'N5';
      else if (sup && sup.ehRaiz) n = 'N6';
    } else if (a.ehRaiz) n = 'N4';
    if (!n && subs.length) n = subs.some(s => (filhos.get(s.id) || []).length > 0) ? 'N2' : 'N1';
    if (n) melhor = Math.max(melhor, NIVEIS.indexOf(n));
  }
  return melhor < 0 ? null : NIVEIS[melhor];
}

/**
 * Organizações do escopo do RH da unidade (R12): a unidade do perfil (perfil.unidade; sem ela, perfil.escopo, que na lista de
 * usuários da v34 traz o nome do hotel) casada pelo nome normalizado com o nome ou o id da organização, nas duas normalizações
 * da carga (normalizarNome de nome.js e chaveEmpresa); sem casamento direto, a tabela de equivalência de organizações
 * (S.equivalencias: empresa -> organizacaoId, a mesma que a carga usa). Nada casa: lista vazia (sem acesso, nunca a rede).
 */
export function organizacoesDaUnidade(S, perfil = S.perfil) {
  const alvo = perfil ? String(perfil.unidade || perfil.escopo || '').trim() : '';
  if (!alvo) return [];
  const todas = S.organizacoes || [];
  const n = normalizarNome(alvo), k = chaveEmpresa(alvo);
  const casa = o => [o.nome, o.id].some(x => normalizarNome(x) === n || (k && chaveEmpresa(x) === k));
  const diretas = todas.filter(casa);
  if (diretas.length) return diretas;
  const linha = (S.equivalencias || []).find(e => normalizarNome(e.empresa) === n || (k && chaveEmpresa(e.empresa) === k));
  return linha ? todas.filter(o => o.id === linha.organizacaoId) : [];
}

/**
 * Organizações que o perfil pode escolher. Avaliador: só onde tem atuação corrente. RH da unidade: só a da sua unidade (R12,
 * organizacoesDaUnidade). RH regional e holding: todas (R12: a base pública ainda não traz regional).
 */
export function organizacoesVisiveis(S) {
  const todas = S.organizacoes || [];
  if (S.perfil && S.perfil.papel === 'avaliador') {
    const pid = pessoaDoPerfil(S);
    const minhas = new Set((S.atuacoes || []).filter(a => a.pessoaRef === pid && ehCorrente(a)).map(a => a.organizacaoId));
    return todas.filter(o => minhas.has(o.id));
  }
  if (S.perfil && S.perfil.papel === 'rh_unidade') {
    const minhas = new Set(organizacoesDaUnidade(S).map(o => o.id));
    return todas.filter(o => minhas.has(o.id));
  }
  return todas;
}

/** A organização está entre as que o perfil pode escolher? (I1: visiveis e atuacoesVisiveis também conferem, além de selecionarOrganizacao.) */
function noEscopo(S, organizacaoId) { return organizacoesVisiveis(S).some(o => o.id === organizacaoId); }

/** Organização inicial: a do piloto, se existir; senão a primeira unidade; senão a primeira. */
export function organizacaoInicial(S, preferida) {
  const lista = S.organizacoes || [];
  if (preferida && lista.some(o => o.id === preferida)) return preferida;
  return (lista.find(o => o.tipo === 'unidade') || lista[0] || {}).id ?? null;
}

/* ---------- visões ---------- */

/** Reconstrói as visões da organização selecionada e guarda em S.views. A página copia para PESSOAS e AVALIAVEIS. */
export function reconstruirViews(S) {
  const organizacaoId = S.organizacaoSelecionada;
  const pessoas = organizacaoId ? pessoasDa(S, organizacaoId) : [];
  const atuacoesPorId = new Map((S.atuacoes || []).map(a => [a.id, a]));
  S.views = {
    organizacaoId,
    organizacao: organizacao(S, organizacaoId),
    pessoas,
    pessoaPorId: new Map(pessoas.map(p => [p.id, p])),
    atuacoesPorId,
    atuacoes: organizacaoId ? correntesDaOrg(S, organizacaoId) : [],
  };
  return S.views;
}

export function selecionarOrganizacao(S, organizacaoId) {
  if (!organizacoesVisiveis(S).some(o => o.id === organizacaoId)) {
    throw new ErroAdaptador('organizacao_fora_do_escopo', `Organização ${organizacaoId} não existe ou não está no escopo do perfil`, { organizacaoId });
  }
  S.organizacaoSelecionada = organizacaoId;
  return reconstruirViews(S);
}

/* ---------- escrita (sempre em S.atuacoes) ----------
 * Toda escrita estrutural é uma transação (ruling R15): valida antes, aplica, verifica a árvore da organização depois e,
 * se algo não fecha, desfaz a mudança inteira. Nunca lança: devolve { ok: true, acao, atuacao } ou { ok: false, codigo, mensagem }.
 */

function exigir(S, id, papel) {
  const a = atuacaoPorId(S, id);
  if (!a || !ehCorrente(a)) throw new ErroAdaptador('atuacao_inexistente', `${papel} ${id} não existe ou não está corrente`, { id });
  return a;
}
/**
 * Ids de atuação nunca se repetem (ruling R16): S.idsUsados guarda todo id que já existiu neste estado (a página semeia com as
 * atuações da carga e com a parte de atuação de cada chave de ENVIADAS). Desfazer não tira id do conjunto: um id desfeito não
 * volta a ser usado, então uma atuação nova nunca herda avaliação de outra.
 */
export function idsUsados(S) {
  if (!S.idsUsados || typeof S.idsUsados.has !== 'function') S.idsUsados = new Set();
  for (const a of S.atuacoes || []) S.idsUsados.add(a.id);
  return S.idsUsados;
}
function proximoId(S, organizacaoId, pessoaId) {
  const usados = idsUsados(S);
  let n = 1;
  while (usados.has(`${organizacaoId}|${pessoaId}|${n}`)) n++;
  const id = `${organizacaoId}|${pessoaId}|${n}`;
  usados.add(id);
  return id;
}

/* ---- verificação estrutural da organização ---- */
/** Ciclo entre atuações (vale também em organização sem raiz, onde validarArvore para no sem_raiz). */
function cicloDeAtuacoes(S, organizacaoId) {
  const porId = new Map((S.atuacoes || []).filter(ehCorrente).map(a => [a.id, a]));
  for (const a of correntesDaOrg(S, organizacaoId)) {
    const vistos = new Set();
    for (let atual = a; atual && atual.superiorId != null; atual = porId.get(atual.superiorId)) {
      if (vistos.has(atual.id)) return true;
      vistos.add(atual.id);
    }
  }
  return false;
}
/** Avaliação mútua entre pessoas (R15): grafo pessoa superior → pessoa subordinada na organização, sem ciclo. */
function cicloDePessoas(S, organizacaoId) {
  const porId = new Map((S.atuacoes || []).filter(ehCorrente).map(a => [a.id, a]));
  const abaixo = new Map();
  for (const a of correntesDaOrg(S, organizacaoId)) {
    const sup = a.superiorId ? porId.get(a.superiorId) : null;
    if (!sup) continue;
    if (!abaixo.has(sup.pessoaRef)) abaixo.set(sup.pessoaRef, new Set());
    abaixo.get(sup.pessoaRef).add(a.pessoaRef);
  }
  const estado = new Map();   // 1 visitando, 2 feito
  const visitar = p => {
    if (estado.get(p) === 1) return true;
    if (estado.get(p) === 2) return false;
    estado.set(p, 1);
    for (const q of abaixo.get(p) || []) if (visitar(q)) return true;
    estado.set(p, 2);
    return false;
  };
  return [...abaixo.keys()].some(visitar);
}
function codigoArvore(S, organizacaoId) {
  try { validarArvore(S.atuacoes || [], organizacaoId); return null; } catch (e) { return e.codigo || e.code || 'arvore_invalida'; }
}
/** Pessoa `de` está acima de `ate` (direta ou indiretamente) na organização? */
function estaAcima(S, organizacaoId, de, ate) {
  const porId = new Map((S.atuacoes || []).filter(ehCorrente).map(a => [a.id, a]));
  const superioresDe = p => correntesDaPessoa(S, p, organizacaoId).map(a => a.superiorId && porId.get(a.superiorId)).filter(Boolean).map(a => a.pessoaRef);
  const vistos = new Set(); const fila = superioresDe(ate);
  while (fila.length) {
    const p = fila.shift();
    if (p === de) return true;
    if (vistos.has(p)) continue;
    vistos.add(p); fila.push(...superioresDe(p));
  }
  return false;
}

/**
 * Transação sobre as atuações de uma organização: guarda cópia, roda `fn`, confere a árvore e desfaz tudo se algo falhar.
 * Regras depois da escrita: nenhum ciclo entre atuações; nenhuma avaliação mútua entre pessoas (se não havia antes);
 * validarArvore não pode passar a falhar, nem falhar com código diferente do que já falhava antes (ex.: sem_raiz da carga).
 */
function transacao(S, organizacaoId, fn) {
  const tamanho = (S.atuacoes || []).length;
  const copias = new Map((S.atuacoes || []).filter(a => a.organizacaoId === organizacaoId).map(a => [a, { ...a }]));
  const antes = { arvore: codigoArvore(S, organizacaoId), pessoas: cicloDePessoas(S, organizacaoId) };
  const desfazer = () => {
    S.atuacoes.length = tamanho;
    for (const [obj, copia] of copias) {
      for (const k of Object.keys(obj)) if (!(k in copia)) delete obj[k];
      Object.assign(obj, copia);
    }
  };
  let r;
  try { r = fn(); } catch (e) {
    desfazer();
    return { ok: false, codigo: e.codigo || 'erro', mensagem: e.message };
  }
  let falha = null;
  if (cicloDeAtuacoes(S, organizacaoId)) falha = ['ciclo', 'A mudança cria um ciclo entre atuações'];
  else if (!antes.pessoas && cicloDePessoas(S, organizacaoId)) falha = ['avaliacao_mutua', 'A mudança faria duas pessoas se avaliarem mutuamente na organização'];
  else {
    const depois = codigoArvore(S, organizacaoId);
    if (depois && depois !== antes.arvore) falha = [depois, `A mudança deixa a árvore de ${organizacaoId} inválida (${depois})`];
  }
  if (falha) { desfazer(); return { ok: false, codigo: falha[0], mensagem: falha[1] }; }
  return { ok: true, ...r };
}
function marcarDefinido(a, autor, quando) {
  a.origem = 'definido'; a.confirmadaPor = autor ?? null; a.definidaEm = quando;
  delete a.superiorAnterior;   /* P30: o RH decidiu o vínculo de novo; a pendência superior_saiu_da_carga encerra */
}

/**
 * Define `superiorAtuacaoId` como superior da pessoa da atuação `atuacaoId`.
 * Sem superior: passa a ter. Já tem outro: nasce uma segunda atuação da pessoa com este superior (D14).
 * Já tem este mesmo superior em alguma atuação: nada muda.
 * Recusa: raiz, a própria pessoa, outra organização, ciclo, avaliação mútua entre pessoas (R15) e superior sem marca de líder
 * (R20: podeLiderar precisa ser true, ver exigirLider; a Matriz já só oferece líderes, e a carga não passa por aqui).
 * Devolve { ok: true, acao: 'definido' | 'criada' | 'nenhuma', atuacao } ou { ok: false, codigo, mensagem }.
 */
export function definirSuperior(S, atuacaoId, superiorAtuacaoId, autor, quando = hoje()) {
  const a = atuacaoPorId(S, atuacaoId);
  return transacao(S, a ? a.organizacaoId : null, () => definirSuperiorSemTransacao(S, atuacaoId, superiorAtuacaoId, autor, quando));
}
function definirSuperiorSemTransacao(S, atuacaoId, superiorAtuacaoId, autor, quando) {
  const a = exigir(S, atuacaoId, 'Atuação');
  const sup = exigir(S, superiorAtuacaoId, 'Superior');
  if (a.ehRaiz) throw new ErroAdaptador('raiz_com_superior', `A atuação ${a.id} é raiz da organização e não tem superior`, { id: a.id });
  if (sup.pessoaRef === a.pessoaRef) throw new ErroAdaptador('autoavaliacao', 'Ninguém se autoavalia: a pessoa não pode ser superior de si mesma', { id: a.id });
  if (sup.organizacaoId !== a.organizacaoId) throw new ErroAdaptador('superior_fora_da_organizacao', `O superior ${sup.id} é de outra organização`, { id: a.id, superiorId: sup.id });
  const minhas = correntesDaPessoa(S, a.pessoaRef, a.organizacaoId);
  const ja = minhas.find(x => x.superiorId === sup.id);
  if (ja) return { acao: 'nenhuma', atuacao: ja };
  if (estaAcima(S, a.organizacaoId, a.pessoaRef, sup.pessoaRef)) {
    throw new ErroAdaptador('avaliacao_mutua', 'Avaliação mútua: esta pessoa já está acima do superior escolhido na organização', { id: a.id, superiorId: sup.id });
  }
  exigirLider(sup);
  const alvo = a.superiorId == null ? a : null;
  if (alvo) {
    // ciclo: subindo a partir do superior não se pode chegar à própria atuação
    const porId = new Map((S.atuacoes || []).filter(ehCorrente).map(x => [x.id, x]));
    const vistos = new Set();
    for (let atual = sup; atual; atual = atual.superiorId ? porId.get(atual.superiorId) : null) {
      if (atual.id === alvo.id) throw new ErroAdaptador('ciclo', `Definir ${sup.id} como superior de ${alvo.id} cria um ciclo`, { id: alvo.id, superiorId: sup.id });
      if (vistos.has(atual.id)) break;
      vistos.add(atual.id);
    }
    alvo.superiorId = sup.id;
    marcarDefinido(alvo, autor, quando);
    return { acao: 'definido', atuacao: alvo };
  }
  const nova = {
    id: proximoId(S, a.organizacaoId, a.pessoaRef), pessoaRef: a.pessoaRef, organizacaoId: a.organizacaoId, funcao: a.funcao,
    superiorId: sup.id, ehRaiz: false, setor: a.setor ?? null, turno: a.turno ?? null, equipe: a.equipe ?? null,
    inicio: a.inicio, fim: null, situacao: 'ativa', origem: 'definido', metodoInferencia: null, confirmadaPor: autor ?? null,
    definidaEm: quando, podeLiderar: !!a.podeLiderar,
  };
  if (a.situacaoColab) nova.situacaoColab = a.situacaoColab;
  S.atuacoes.push(nova);
  return { acao: 'criada', atuacao: nova };
}

/**
 * Tira o superior da atuação. Se a pessoa tem outra atuação corrente na organização, esta é encerrada (fim = quando),
 * e os subordinados dela passam para a outra atuação da mesma pessoa. Se é a última, fica sem superior (volta ao pool).
 * Devolve { ok: true, acao: 'encerrada' | 'sem_superior' | 'nenhuma', atuacao } ou { ok: false, codigo, mensagem }.
 */
export function removerSuperior(S, atuacaoId, autor, quando = hoje()) {
  const a = atuacaoPorId(S, atuacaoId);
  return transacao(S, a ? a.organizacaoId : null, () => removerSuperiorSemTransacao(S, atuacaoId, autor, quando));
}
function removerSuperiorSemTransacao(S, atuacaoId, autor, quando) {
  const a = exigir(S, atuacaoId, 'Atuação');
  if (a.superiorId == null) return { acao: 'nenhuma', atuacao: a };
  const outras = correntesDaPessoa(S, a.pessoaRef, a.organizacaoId).filter(x => x.id !== a.id);
  if (outras.length) { encerrar(S, a, outras[0], autor, quando); return { acao: 'encerrada', atuacao: a }; }
  a.superiorId = null;
  marcarDefinido(a, autor, quando);
  return { acao: 'sem_superior', atuacao: a };
}

/** Encerra a atuação `a` (fim = quando) e passa os subordinados dela para `destino`, outra atuação da mesma pessoa. */
function encerrar(S, a, destino, autor, quando) {
  for (const s of (S.atuacoes || []).filter(x => x.superiorId === a.id && ehCorrente(x))) {
    s.superiorId = destino.id;
    marcarDefinido(s, autor, quando);
  }
  a.fim = quando; a.situacao = 'encerrada'; a.encerradaPor = autor ?? null;
}

/**
 * R20 (M2, revisão final do Plano B): só lidera quem tem a marca de líder estritamente verdadeira (podeLiderar === true).
 * Ausente (undefined, null) conta como sem marca: nenhuma escrita deixa atuação sem o campo (carga, bootstrap e adaptador
 * gravam booleano), então a ausência só pode ser dado incompleto, e dado incompleto não autoriza ninguém a avaliar.
 * Regra única: definirSuperior, definirUnicoSuperior, criarAtuacaoNaOrganizacao e montagem.js (adicionarEmBloco, adicionarNaRede) usam esta.
 */
export const temMarcaDeLider = a => !!a && a.podeLiderar === true;
export function exigirLider(sup) {
  if (!temMarcaDeLider(sup)) throw new ErroAdaptador('superior_sem_marca_de_lider', `${sup && sup.id} não está marcado como líder`, { superiorId: sup && sup.id });
}

/**
 * Confirma o vínculo inferido pela carga (Tarefa 5): o superior fica, a origem passa a 'definido' com autor e data,
 * e o método de inferência sai. Recusa atuação sem superior (sem_superior) e já definida (nao_inferido).
 */
export function confirmarInferido(S, atuacaoId, autor, quando = hoje()) {
  const a = atuacaoPorId(S, atuacaoId);
  return transacao(S, a ? a.organizacaoId : null, () => {
    const x = exigir(S, atuacaoId, 'Atuação');
    if (x.superiorId == null) throw new ErroAdaptador('sem_superior', `A atuação ${x.id} não tem superior para confirmar`, { id: x.id });
    if (!/^inferido_/.test(x.origem || '')) throw new ErroAdaptador('nao_inferido', `O vínculo de ${x.id} não é inferido`, { id: x.id });
    marcarDefinido(x, autor, quando);
    x.metodoInferencia = null;
    return { acao: 'confirmado', atuacao: x };
  });
}

/**
 * Raiz da organização (Tarefa 5, D20): marca a atuação como raiz e tira a marca da raiz anterior da mesma organização,
 * que fica sem superior (volta ao pool). Recusa atuação com superior (raiz_com_superior). Depois da troca a árvore precisa
 * ser válida (validarArvore, exatamente uma raiz); se não for, nada muda.
 */
export function marcarRaiz(S, atuacaoId, autor, quando = hoje()) {
  const a = atuacaoPorId(S, atuacaoId);
  return transacao(S, a ? a.organizacaoId : null, () => {
    const x = exigir(S, atuacaoId, 'Atuação');
    if (x.superiorId != null) throw new ErroAdaptador('raiz_com_superior', `A atuação ${x.id} tem superior e não pode ser raiz`, { id: x.id });
    if (x.ehRaiz) return { acao: 'nenhuma', atuacao: x };
    const anteriores = correntesDaOrg(S, x.organizacaoId).filter(r => r.ehRaiz);
    for (const r of anteriores) { r.ehRaiz = false; marcarDefinido(r, autor, quando); }
    x.ehRaiz = true;
    marcarDefinido(x, autor, quando);
    validarArvore(S.atuacoes, x.organizacaoId);   // lança com o código de validarArvore; a transação desfaz
    return { acao: 'raiz', atuacao: x, anteriores: anteriores.map(r => r.id) };
  });
}

/**
 * Atuação nova de uma pessoa numa organização, sob um superior de lá (Tarefa 5): é como o RH liga ao corporativo quem está
 * sem organização (PJ da carga) ou o gerente geral de uma unidade. Origem 'definido', id que nunca se repete (R16).
 * Chama-se criarAtuacaoNaOrganizacao, e não criarAtuacao, porque o bundle reexporta modelo/atuacao.js, que já tem criarAtuacao.
 * Recusa: pessoa inexistente, superior de outra organização, sem marca de líder (R20), a própria pessoa, avaliação mútua.
 * A pessoa já sob este superior: nada muda (acao 'nenhuma').
 */
export function criarAtuacaoNaOrganizacao(S, { pessoaId, organizacaoId, superiorAtuacaoId, funcao, autor, quando = hoje() } = {}) {
  return transacao(S, organizacaoId, () => {
    if (!organizacao(S, organizacaoId)) throw new ErroAdaptador('organizacao_inexistente', `Organização ${organizacaoId} não existe`, { organizacaoId });
    if (!pessoaPorId(S, pessoaId)) throw new ErroAdaptador('pessoa_inexistente', `Pessoa ${pessoaId} não existe na base`, { pessoaId });
    const sup = exigir(S, superiorAtuacaoId, 'Superior');
    if (sup.organizacaoId !== organizacaoId) throw new ErroAdaptador('superior_fora_da_organizacao', `O superior ${sup.id} é de outra organização`, { pessoaId, superiorId: sup.id });
    if (sup.pessoaRef === pessoaId) throw new ErroAdaptador('autoavaliacao', 'Ninguém se autoavalia: a pessoa não pode ser superior de si mesma', { pessoaId });
    const ja = correntesDaPessoa(S, pessoaId, organizacaoId).find(x => x.superiorId === sup.id);
    if (ja) return { acao: 'nenhuma', atuacao: ja };
    if (estaAcima(S, organizacaoId, pessoaId, sup.pessoaRef)) {
      throw new ErroAdaptador('avaliacao_mutua', 'Avaliação mútua: esta pessoa já está acima do superior escolhido na organização', { pessoaId, superiorId: sup.id });
    }
    exigirLider(sup);
    if (funcao == null || funcao === '') throw new ErroAdaptador('sem_funcao', `A atuação nova de ${pessoaId} precisa de função`, { pessoaId });
    const nova = {
      id: proximoId(S, organizacaoId, pessoaId), pessoaRef: pessoaId, organizacaoId, funcao,
      superiorId: sup.id, ehRaiz: false, setor: null, turno: null, equipe: null,
      inicio: quando, fim: null, situacao: 'ativa', origem: 'definido', metodoInferencia: null, confirmadaPor: autor ?? null,
      definidaEm: quando, podeLiderar: false,
    };
    S.atuacoes.push(nova);
    return { acao: 'criada', atuacao: nova };
  });
}

/**
 * Primeira atuação de uma organização que ainda não tem raiz (Tarefa 9): é como o RH da holding começa a estrutura
 * corporativa, que nasce vazia (D20). Nasce raiz, sem superior, com marca de líder (R23), origem 'definido'.
 * Recusa: organização ou pessoa inexistente, organização que já tem raiz (raiz_ja_definida: use marcarRaiz),
 * pessoa que já tem atuação corrente lá (pessoa_ja_na_organizacao), função vazia (sem_funcao: nada é inventado).
 */
export function criarRaizNaOrganizacao(S, { pessoaId, organizacaoId, funcao, autor, quando = hoje() } = {}) {
  return transacao(S, organizacaoId, () => {
    if (!organizacao(S, organizacaoId)) throw new ErroAdaptador('organizacao_inexistente', `Organização ${organizacaoId} não existe`, { organizacaoId });
    if (!pessoaPorId(S, pessoaId)) throw new ErroAdaptador('pessoa_inexistente', `Pessoa ${pessoaId} não existe na base`, { pessoaId });
    const raiz = correntesDaOrg(S, organizacaoId).find(a => a.ehRaiz);
    if (raiz) throw new ErroAdaptador('raiz_ja_definida', `${organizacaoId} já tem raiz (${raiz.id})`, { organizacaoId, raizId: raiz.id });
    if (correntesDaPessoa(S, pessoaId, organizacaoId).length) throw new ErroAdaptador('pessoa_ja_na_organizacao', `${pessoaId} já tem atuação em ${organizacaoId}`, { pessoaId, organizacaoId });
    if (funcao == null || funcao === '') throw new ErroAdaptador('sem_funcao', `A atuação nova de ${pessoaId} precisa de função`, { pessoaId });
    const nova = {
      id: proximoId(S, organizacaoId, pessoaId), pessoaRef: pessoaId, organizacaoId, funcao,
      superiorId: null, ehRaiz: true, setor: null, turno: null, equipe: null,
      inicio: quando, fim: null, situacao: 'ativa', origem: 'definido', metodoInferencia: null, confirmadaPor: autor ?? null,
      definidaEm: quando, podeLiderar: true,
    };
    S.atuacoes.push(nova);
    validarArvore(S.atuacoes, organizacaoId);
    return { acao: 'criada', atuacao: nova };
  });
}

/** Marca de líder da atuação (D17). */
export function marcarLider(S, atuacaoId, valor) {
  const a = exigir(S, atuacaoId, 'Atuação');
  a.podeLiderar = !!valor;
  return a;
}

/**
 * Campo de todas as atuações correntes da pessoa na organização: 'funcao', 'setor' (equipe acompanha: equipe é o setor, D16)
 * ou 'situacao' (situação funcional da tela: Ativo, Férias, Afastado, Desligado; gravada em situacaoColab).
 */
export function definirCampoPessoa(S, pessoaId, organizacaoId, campo, valor) {
  const minhas = correntesDaPessoa(S, pessoaId, organizacaoId);
  if (!minhas.length) throw new ErroAdaptador('pessoa_fora_da_organizacao', `${pessoaId} não tem atuação corrente em ${organizacaoId}`, { pessoaId, organizacaoId });
  for (const a of minhas) {
    if (campo === 'funcao') a.funcao = valor;
    else if (campo === 'setor') { const s = !valor || valor === SEM_SETOR ? null : valor; a.setor = s; a.equipe = s; }
    else if (campo === 'situacao') a.situacaoColab = valor;
    else throw new ErroAdaptador('campo_invalido', `Campo ${campo} não é editável por aqui`, { campo });
  }
  return minhas;
}

/**
 * Lote "definir avaliador" (substitui quem estiver lá): a pessoa fica com uma atuação só na organização, com este superior.
 * Atuações a mais são encerradas (subordinados passam para a que fica). Devolve { acao, atuacao } ou erro com `codigo`.
 */
export function definirUnicoSuperior(S, pessoaId, organizacaoId, superiorAtuacaoId, autor, quando = hoje()) {
  return transacao(S, organizacaoId, () => {
    // tudo validado antes de mexer em qualquer atuação; a transação desfaz se a verificação final falhar
    const minhas = correntesDaPessoa(S, pessoaId, organizacaoId);
    if (!minhas.length) throw new ErroAdaptador('pessoa_fora_da_organizacao', `${pessoaId} não tem atuação corrente em ${organizacaoId}`, { pessoaId });
    const sup = exigir(S, superiorAtuacaoId, 'Superior');
    if (sup.organizacaoId !== organizacaoId) throw new ErroAdaptador('superior_fora_da_organizacao', `O superior ${sup.id} é de outra organização`, { pessoaId });
    exigirLider(sup);
    if (minhas.some(a => a.ehRaiz)) throw new ErroAdaptador('raiz_com_superior', `${pessoaId} é raiz de ${organizacaoId}`, { pessoaId });
    if (sup.pessoaRef === pessoaId) throw new ErroAdaptador('autoavaliacao', 'Ninguém se autoavalia', { pessoaId });
    if (estaAcima(S, organizacaoId, pessoaId, sup.pessoaRef)) throw new ErroAdaptador('avaliacao_mutua', 'Avaliação mútua: esta pessoa já está acima do superior escolhido', { pessoaId });
    const fica = minhas.find(a => a.superiorId === sup.id) || minhas[0];
    for (const a of minhas) if (a !== fica) encerrar(S, a, fica, autor, quando);
    if (fica.superiorId === sup.id) return { acao: 'nenhuma', atuacao: fica };
    fica.superiorId = null;
    return definirSuperiorSemTransacao(S, fica.id, sup.id, autor, quando);
  });
}

/** Lote "remover avaliadores": a pessoa fica com uma atuação, sem superior. */
export function limparSuperiores(S, pessoaId, organizacaoId, autor, quando = hoje()) {
  return transacao(S, organizacaoId, () => {
    const minhas = correntesDaPessoa(S, pessoaId, organizacaoId);
    for (const a of minhas.slice(1)) encerrar(S, a, minhas[0], autor, quando);
    if (minhas[0]) removerSuperiorSemTransacao(S, minhas[0].id, autor, quando);
    return { acao: minhas[0] ? 'sem_superior' : 'nenhuma', atuacao: minhas[0] || null };
  });
}

/* ---------- banco do artefato ---------- */

/**
 * Id de documento da coleção `avaliacoes` a partir da chave `atuacaoId|tipo` (ruling R5).
 * Permitidos: letras, dígitos e _ - . ~ : @ +. O `|` vira `:`; qualquer outro caractere (inclusive `:` e `~`) vira ~XX em hexadecimal UTF-8.
 * Injetiva: chaves diferentes nunca dão o mesmo id.
 */
export function idDocumentoAvaliacao(chave) {
  // UTF-8 por encodeURIComponent (o jsdom não tem TextEncoder); o que ele não escapa (! ' ( ) * ~) vai em hexadecimal à mão
  const hex = c => '~' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  const seg = s => Array.from(s).map(c => {
    if (/[A-Za-z0-9_\-.@+]/.test(c)) return c;
    const e = encodeURIComponent(c);
    return e === c ? hex(c) : e.replace(/%/g, '~');
  }).join('');
  return String(chave).split('|').map(seg).join(':');
}
