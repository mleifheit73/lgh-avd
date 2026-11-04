/**
 * Montagem da árvore (Plano B, Tarefa 5): o painel que pergunta "qual é a equipe deste líder" em vez de "quem é o líder
 * de cada pessoa" (spec 7.2).
 *
 * Puro: não toca tela nem disco. Toda escrita reaproveita as escritas transacionais do adaptador (definirSuperior,
 * removerSuperior, marcarLider, confirmarInferido, marcarRaiz, criarAtuacaoNaOrganizacao), então ciclo, avaliação mútua
 * e validarArvore valem aqui também, com rollback. Nada lança: devolve { ok, codigo, ... }.
 * Leitura sai de S.atuacoes, S.semOrganizacao e S.base (fonte única).
 */
import { ID_CORPORATIVO } from './organizacao.js';
import { filaDePendencias, TRAVAM_CICLO } from './pendencias.js';
import {
  ehCorrente, nomeExibicao, vinculoDaAtuacao, SEM_SETOR, definirSuperior, removerSuperior,
  marcarLider as marcarLiderAdaptador, confirmarInferido as confirmarInferidoAdaptador,
  marcarRaiz as marcarRaizAdaptador, criarAtuacaoNaOrganizacao, criarRaizNaOrganizacao, temMarcaDeLider, semLider,
} from '../adaptador.js';

const hoje = () => new Date().toISOString().slice(0, 10);
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const atuacaoPorId = (S, id) => (S.atuacoes || []).find(a => a.id === id) ?? null;
const pessoaPorId = (S, id) => (S.pessoasPorId && typeof S.pessoasPorId.get === 'function' ? S.pessoasPorId.get(id) : null)
  ?? (S.base?.pessoas || []).find(p => p.id === id) ?? null;
const nomeDe = (S, pessoaId) => nomeExibicao(S, pessoaPorId(S, pessoaId)) || pessoaId;
const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Cargo do vínculo que sustenta a atuação (o da folha), para o filtro de cargo. */
export function cargoDaAtuacao(S, a) {
  const v = vinculoDaAtuacao(S, a);
  return (v && v.cargo) || null;
}

function casaFiltro(S, a, filtro, nome) {
  const { cargo, setor, turno, texto } = filtro || {};
  if (cargo) {
    const c = semAcento(cargo);
    if (semAcento(a.funcao) !== c && semAcento(cargoDaAtuacao(S, a)) !== c) return false;
  }
  if (setor && (a.setor || SEM_SETOR) !== setor) return false;
  if (turno && a.turno !== turno) return false;
  if (texto) {
    const t = semAcento(texto);
    if (!semAcento(nome).includes(t) && !semAcento(a.funcao).includes(t)) return false;
  }
  return true;
}

/**
 * Pool da organização: atuações que precisam de líder e ainda não têm (semLider do adaptador, regra única), filtradas.
 * filtro.texto: sem acento, contido no nome de exibição ou na função. filtro.cargo: igual à função ou ao cargo do vínculo.
 * filtro.setor: igual ao setor (null conta como 'Sem setor'). Ordem: nome, depois id. Devolve array novo.
 */
export function pool(S, organizacaoId, filtro = {}) {
  return (S.atuacoes || [])
    .filter(a => a.organizacaoId === organizacaoId && semLider(S, a))   /* regra única (C2): desligado e afastado não precisam de líder */
    .map(a => ({ a, nome: nomeDe(S, a.pessoaRef) }))
    .filter(({ a, nome }) => casaFiltro(S, a, filtro, nome))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR') || comparar(x.a.id, y.a.id))
    .map(({ a }) => a);
}

/** Equipe direta de uma atuação: atuações correntes cujo superior é ela. Ordem: nome, depois id. */
export function equipeDe(S, atuacaoId) {
  return (S.atuacoes || []).filter(a => a.superiorId === atuacaoId && ehCorrente(a))
    .map(a => ({ a, nome: nomeDe(S, a.pessoaRef) }))
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR') || comparar(x.a.id, y.a.id))
    .map(({ a }) => a);
}

/** Pré-condições do lote inteiro: superior existe, é líder (R20) e não está na própria lista. */
function conferirSuperior(S, ids, superiorAtuacaoId) {
  const sup = atuacaoPorId(S, superiorAtuacaoId);
  if (!sup || !ehCorrente(sup)) return { ok: false, codigo: 'atuacao_inexistente', aplicados: [], recusados: [] };
  if (ids.includes(superiorAtuacaoId)) return { ok: false, codigo: 'proprio_superior', aplicados: [], recusados: [] };
  if (!temMarcaDeLider(sup)) return { ok: false, codigo: 'superior_sem_marca_de_lider', aplicados: [], recusados: [] };
  return null;
}

/**
 * Adiciona várias atuações do pool à equipe de `superiorAtuacaoId`, uma transação do adaptador por id:
 * a recusada fica exatamente como estava e as outras entram. Recusa o lote inteiro (nada muda) quando um id é o
 * próprio superior (proprio_superior) ou o superior não é líder (superior_sem_marca_de_lider, R20).
 * Devolve { ok, aplicados: [ids], recusados: [{ id, codigo }] }; ok é falso só quando nada foi aplicado e houve recusa.
 */
export function adicionarEmBloco(S, ids, superiorAtuacaoId, autor, quando = hoje()) {
  const lista = [...new Set(ids || [])];
  const erro = conferirSuperior(S, lista, superiorAtuacaoId);
  if (erro) return erro;
  const aplicados = [], recusados = [];
  for (const id of lista) {
    const r = definirSuperior(S, id, superiorAtuacaoId, autor, quando);
    if (r.ok) aplicados.push(r.atuacao ? r.atuacao.id : id);
    else recusados.push({ id, codigo: r.codigo });
  }
  const ok = aplicados.length > 0 || recusados.length === 0;
  return ok ? { ok, aplicados, recusados } : { ok, codigo: recusados[0].codigo, aplicados, recusados };
}

/** Tira a atuação da equipe (volta ao pool, ou encerra a segunda atuação da pessoa). */
export function remover(S, atuacaoId, autor, quando = hoje()) {
  return removerSuperior(S, atuacaoId, autor, quando);
}

/**
 * Marca de líder (D17). Desmarcar quem tem equipe é recusado (lider_com_equipe): pela R20 só líder tem subordinados,
 * então primeiro a equipe sai, depois a marca.
 */
export function marcarLider(S, atuacaoId, valor) {
  const a = atuacaoPorId(S, atuacaoId);
  if (!a || !ehCorrente(a)) return { ok: false, codigo: 'atuacao_inexistente' };
  if (!valor && equipeDe(S, atuacaoId).length) return { ok: false, codigo: 'lider_com_equipe' };
  marcarLiderAdaptador(S, atuacaoId, valor);
  return { ok: true, acao: valor ? 'marcado' : 'desmarcado', atuacao: a };
}

/** Confirma o vínculo inferido pela carga: superior mantido, origem 'definido' (transação do adaptador). */
export function confirmarInferido(S, atuacaoId, autor, quando = hoje()) {
  return confirmarInferidoAdaptador(S, atuacaoId, autor, quando);
}

/** Troca a raiz da organização (transação do adaptador; recusa raiz_com_superior). */
export function marcarRaiz(S, atuacaoId, autor, quando = hoje()) {
  return marcarRaizAdaptador(S, atuacaoId, autor, quando);
}

/* ---------- visão Rede (D20): o pool são os PJ sem organização e os gerentes gerais sem ligação ao corporativo ---------- */

/**
 * Pool da estrutura corporativa. Três tipos de item, cada um com chave única:
 *  - 'pessoa': da lista S.semOrganizacao, sem atuação corrente em lugar nenhum (chave p:<pessoaId>);
 *  - 'raiz': raiz de unidade cuja pessoa não tem atuação corrente no corporativo (chave r:<atuacaoId>);
 *  - 'atuacao': atuação corporativa sem superior que não é a raiz (chave a:<atuacaoId>).
 * Cada item: { chave, tipo, pessoaId, nome, funcao, setor, origem, atuacaoId?, organizacaoId? }. Filtro como em pool().
 */
export function poolRede(S, filtro = {}) {
  const correntes = (S.atuacoes || []).filter(ehCorrente);
  const comAtuacao = new Set(correntes.map(a => a.pessoaRef));
  const noCorporativo = new Set(correntes.filter(a => a.organizacaoId === ID_CORPORATIVO).map(a => a.pessoaRef));
  const itens = [];
  for (const p of S.semOrganizacao || []) {
    if (comAtuacao.has(p.id)) continue;
    const funcao = (p.vinculosPJ || []).map(v => v.cargo).find(Boolean) || null;
    itens.push({ chave: `p:${p.id}`, tipo: 'pessoa', pessoaId: p.id, nome: nomeDe(S, p.id), funcao, setor: null, origem: 'sem_organizacao' });
  }
  const unidades = new Set((S.organizacoes || []).filter(o => o.tipo === 'unidade').map(o => o.id));
  for (const a of correntes.filter(x => x.ehRaiz && unidades.has(x.organizacaoId)).sort((x, y) => comparar(x.id, y.id))) {
    if (noCorporativo.has(a.pessoaRef)) continue;
    itens.push({ chave: `r:${a.id}`, tipo: 'raiz', pessoaId: a.pessoaRef, atuacaoId: a.id, organizacaoId: a.organizacaoId,
      nome: nomeDe(S, a.pessoaRef), funcao: a.funcao, setor: null, origem: a.origem });
  }
  for (const a of pool(S, ID_CORPORATIVO)) {
    itens.push({ chave: `a:${a.id}`, tipo: 'atuacao', pessoaId: a.pessoaRef, atuacaoId: a.id, organizacaoId: ID_CORPORATIVO,
      nome: nomeDe(S, a.pessoaRef), funcao: a.funcao, setor: a.setor, origem: a.origem });
  }
  const { cargo, setor, texto } = filtro || {};
  return itens.filter(i => {
    if (cargo && semAcento(i.funcao) !== semAcento(cargo)) return false;
    if (setor && (i.setor || SEM_SETOR) !== setor) return false;
    if (texto) { const t = semAcento(texto); if (!semAcento(i.nome).includes(t) && !semAcento(i.funcao).includes(t)) return false; }
    return true;
  }).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR') || comparar(x.chave, y.chave));
}

/**
 * Adiciona itens do pool da Rede à equipe de uma atuação corporativa. 'pessoa' e 'raiz' ganham uma atuação nova no
 * corporativo (criarAtuacaoNaOrganizacao); 'atuacao' recebe o superior (definirSuperior). Uma transação por item.
 * A pessoa de S.semOrganizacao sai do pool porque passa a ter atuação: a lista não é editada, para o Desfazer
 * (que restaura S.atuacoes) devolvê-la ao pool sem perder ninguém.
 * Função da atuação nova: o cargo da carga. Sem cargo na carga, nada é inventado (regra de ouro): o item é recusado com
 * sem_funcao, a menos que opcoes.funcao venha preenchida (o RH informa na tela).
 * Devolve { ok, aplicados: [chaves], recusados: [{ chave, codigo }] }.
 */
export function adicionarNaRede(S, chaves, superiorAtuacaoId, autor, quando = hoje(), opcoes = {}) {
  const funcaoInformada = String(opcoes.funcao ?? '').trim();
  const lista = [...new Set(chaves || [])];
  const sup = atuacaoPorId(S, superiorAtuacaoId);
  if (!sup || !ehCorrente(sup)) return { ok: false, codigo: 'atuacao_inexistente', aplicados: [], recusados: [] };
  if (sup.organizacaoId !== ID_CORPORATIVO) return { ok: false, codigo: 'superior_fora_da_organizacao', aplicados: [], recusados: [] };
  const porChave = new Map(poolRede(S).map(i => [i.chave, i]));
  if (lista.some(c => porChave.get(c)?.pessoaId === sup.pessoaRef)) return { ok: false, codigo: 'proprio_superior', aplicados: [], recusados: [] };
  if (!temMarcaDeLider(sup)) return { ok: false, codigo: 'superior_sem_marca_de_lider', aplicados: [], recusados: [] };
  const aplicados = [], recusados = [];
  for (const chave of lista) {
    const item = porChave.get(chave);
    if (!item) { recusados.push({ chave, codigo: 'fora_do_pool' }); continue; }
    const r = item.tipo === 'atuacao'
      ? definirSuperior(S, item.atuacaoId, sup.id, autor, quando)
      : criarAtuacaoNaOrganizacao(S, { pessoaId: item.pessoaId, organizacaoId: ID_CORPORATIVO, superiorAtuacaoId: sup.id,
        funcao: item.funcao || funcaoInformada || null, autor, quando });
    if (r.ok) aplicados.push(chave); else recusados.push({ chave, codigo: r.codigo });
  }
  const ok = aplicados.length > 0 || recusados.length === 0;
  return ok ? { ok, aplicados, recusados } : { ok, codigo: recusados[0].codigo, aplicados, recusados };
}

/**
 * Primeira atuação da estrutura corporativa (Tarefa 9): a Rede nasce vazia (D20) e adicionarNaRede exige um superior,
 * então o RH da holding escolhe um item do pool ('pessoa' sem organização ou 'raiz' de unidade) e ele vira a raiz
 * corporativa: sem superior, marca de líder, origem 'definido'. Item 'atuacao' já está no corporativo: use marcarRaiz.
 * Função: o cargo da carga; sem cargo, só com opcoes.funcao (nada é inventado). Devolve { ok, codigo?, atuacao? }.
 */
export function definirRaizDaRede(S, chave, autor, quando = hoje(), opcoes = {}) {
  const item = poolRede(S).find(i => i.chave === chave);
  if (!item) return { ok: false, codigo: 'fora_do_pool' };
  if (item.tipo === 'atuacao') return { ok: false, codigo: 'ja_no_corporativo' };
  const funcao = item.funcao || String(opcoes.funcao ?? '').trim() || null;
  return criarRaizNaOrganizacao(S, { pessoaId: item.pessoaId, organizacaoId: ID_CORPORATIVO, funcao, autor, quando });
}

/* ---------- trava de abertura de ciclo (Tarefa 7, spec 7.4) ---------- */

/**
 * Pode abrir o ciclo desta organização? Lê da fila de pendências (fonte única): a trava e a tela Pendências nunca divergem.
 * Motivos, o primeiro que valer: organização sem raiz; raiz sem ligação à estrutura corporativa (só tipo unidade, D20);
 * pessoas sem líder (regra única precisaDeLider: desligado e afastado não contam); pessoas cujo líder foi desligado; avaliação mútua; árvore inválida (código de validarArvore). Vínculo inferido ainda não confirmado
 * e pendência de carga NÃO travam: pedem conferência, mas há líder e a árvore é válida.
 * Devolve { pode, motivo, codigo }; codigo é o código da pendência que travou. Não escreve em S.
 */
export function podeAbrirCiclo(S, organizacaoId) {
  if (!(S.organizacoes || []).some(o => o.id === organizacaoId)) {
    return { pode: false, motivo: 'organização não encontrada', codigo: 'organizacao_inexistente' };
  }
  const travas = filaDePendencias(S, organizacaoId).filter(i => TRAVAM_CICLO.includes(i.codigo));
  const de = codigo => travas.filter(i => i.codigo === codigo);
  const nega = (motivo, codigo) => ({ pode: false, motivo, codigo });

  if (de('organizacao_sem_raiz').length) return nega('organização sem raiz definida', 'organizacao_sem_raiz');
  if (de('raiz_sem_ligacao_corporativa').length) return nega('raiz sem ligação à estrutura corporativa', 'raiz_sem_ligacao_corporativa');
  const semLider = de('sem_superior');
  if (semLider.length) {
    const pessoas = new Set(semLider.map(i => i.pessoaId)).size;
    const motivo = pessoas === semLider.length
      ? `${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'} sem líder definido`
      : `${semLider.length} atuações sem líder definido (${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'})`;
    return nega(motivo, 'sem_superior');
  }
  const lideresDesligados = de('superior_desligado');
  if (lideresDesligados.length) {
    const pessoas = new Set(lideresDesligados.map(i => i.pessoaId)).size;
    return nega(`${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'} com líder desligado`, 'superior_desligado');
  }
  const mutuas = de('avaliacao_mutua');
  if (mutuas.length) return nega(`avaliação mútua entre ${mutuas[0].detalhe}${mutuas.length > 1 ? ` (e mais ${mutuas.length - 1})` : ''}`, 'avaliacao_mutua');
  const invalidos = de('vinculo_invalido');
  if (invalidos.length) return nega(`árvore inválida: ${invalidos[0].detalhe || 'arvore_invalida'}`, 'vinculo_invalido');
  return { pode: true, motivo: null, codigo: null };
}
