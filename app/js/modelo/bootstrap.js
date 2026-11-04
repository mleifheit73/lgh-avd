/**
 * Atuações iniciais a partir da base pública, das organizações e do piloto Golden (Plano B, tarefa 2).
 * Toda atuação carrega `origem`: o que a carga trouxe fica separado do que foi inferido, e nada inferido vale até o RH confirmar.
 * Puro: não toca tela nem disco.
 */
import { criarAtuacao, validarArvore } from './atuacao.js';
import { chaveEmpresa } from '../carga/normalizar.js';
import { inferirOrganizacao, EQUIVALENCIAS } from './organizacao.js';
import { normalizarNome } from './nome.js';

export const INICIO_DESCONHECIDO = '1900-01-01';   // sentinela: a carga não trouxe data de início. Sempre acompanhada de log `inicio_ausente`
export const FUNCAO_DESCONHECIDA = 'NÃO INFORMADA';
const FUNCOES_RAIZ = new Set(['GERENTE GERAL', 'GERENTE GERAL SENIOR']);

export function idAtuacao(organizacaoId, pessoaId, n) { return `${organizacaoId}|${pessoaId}|${n}`; }

const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function montar(dados, extra) {
  return { ...criarAtuacao(dados), origem: extra.origem, metodoInferencia: extra.metodoInferencia ?? null, confirmadaPor: null, podeLiderar: !!extra.podeLiderar };
}

/**
 * piloto: { [nomeNormalizado]: { nome, setor, equipe, lider, avaliadores: string[], funcao, situacao } } (app/data/piloto-golden.json).
 * Devolve { atuacoes, semOrganizacao, log }. O log tem `codigo` fixo para a tela listar sem reinterpretar.
 */
export const ORGANIZACAO_PILOTO = 'HOTEL LAGHETTO GOLDEN';

export function atuacoesIniciais(base, organizacoes, piloto = {}, { equivalencias = EQUIVALENCIAS, organizacaoPiloto = ORGANIZACAO_PILOTO } = {}) {
  const log = [];
  const aviso = (codigo, mensagem, detalhe = {}) => log.push({ codigo, mensagem, ...detalhe });
  const pessoas = new Map(base.pessoas.map(p => [p.id, p]));

  if (!equivalencias || equivalencias.length === 0) aviso('tabela_equivalencia_indisponivel', 'Tabela de equivalência de organizações vazia ou não carregada: PJ que dependem dela ficam sem organização');

  const orgDaFilial = new Map();
  for (const o of organizacoes) for (const f of o.filiais ?? []) orgDaFilial.set(chaveEmpresa(f), o.id);

  const pilotoDe = pessoa => {
    if (!pessoa) return null;
    for (const nome of [pessoa.nome, ...(pessoa.nomesAlternativos ?? [])]) {
      const p = piloto[normalizarNome(nome)];
      if (p) return p;
    }
    return null;
  };

  const pilotoAtivo = organizacoes.some(o => o.id === organizacaoPiloto);
  const prioridade = o => (o === 'carga' ? 0 : o === 'inferido_por_empresa' ? 1 : 2);

  // 1. Um candidato por (pessoa, organização). CLT vence PJ (spec 3.4: vínculo não cria atuação).
  const candidatos = new Map();   // `${org}|${pessoa}` -> candidato
  const ordem = [];
  const pjVinculo = new Map();    // pessoaId -> primeiro vínculo PJ sem organização
  const pjSemOrg = new Map();     // pessoaId -> [{ empresa, cargo }]
  for (const v of base.vinculos) {
    let orgId; let origem; let metodo = null;
    if (!pessoas.has(v.pessoaId)) { aviso('pessoa_inexistente', `Vínculo aponta para pessoa ${v.pessoaId}, que não está na base`, { pessoaId: v.pessoaId }); continue; }
    if (v.regime !== 'CLT' && v.regime !== 'PJ') aviso('regime_desconhecido', `Vínculo de ${v.pessoaId} com regime "${v.regime}": tratado como PJ`, { pessoaId: v.pessoaId, regime: v.regime });
    if (v.regime === 'CLT') {
      orgId = orgDaFilial.get(chaveEmpresa(v.filial));
      origem = 'carga';
      if (!orgId) { aviso('filial_sem_organizacao', `Vínculo CLT da pessoa ${v.pessoaId} na filial ${v.filial}, sem organização correspondente`, { pessoaId: v.pessoaId }); continue; }
    } else {
      const r = inferirOrganizacao(chaveEmpresa(v.empresa), organizacoes, equivalencias);
      if (!r) {
        if (!pjSemOrg.has(v.pessoaId)) pjSemOrg.set(v.pessoaId, []);
        pjSemOrg.get(v.pessoaId).push({ empresa: v.empresa, cargo: v.cargo ?? null });
        if (!pjVinculo.has(v.pessoaId)) pjVinculo.set(v.pessoaId, v);
        continue;
      }
      orgId = r.organizacaoId; origem = 'inferido_por_empresa'; metodo = r.metodo;
    }
    const chave = `${orgId}|${v.pessoaId}`;
    const atual = candidatos.get(chave);
    if (atual && prioridade(atual.origem) <= prioridade(origem)) continue;   // mantém o de maior confiança: carga, depois empresa, depois piloto
    if (!atual) ordem.push(chave);
    candidatos.set(chave, { pessoaId: v.pessoaId, orgId, origem, metodo, vinculo: v });
  }

  // R10: quem está no piloto validado pelo RH tem atuação na organização do piloto (spec 3.4: a organização segue a operação, não o CNPJ pagador).
  // Já tem atuação lá: nada muda (as outras ficam onde a carga pôs). Não tem: move a primeira (por id de organização) das que a carga criou
  // ou, se só havia PJ sem organização, cria a atuação a partir desse vínculo.
  if (pilotoAtivo) {
    for (const pessoa of base.pessoas) {
      if (!pilotoDe(pessoa)) continue;
      const pid = pessoa.id;
      const minhas = ordem.filter(k => candidatos.get(k).pessoaId === pid);
      if (minhas.some(k => candidatos.get(k).orgId === organizacaoPiloto)) continue;
      if (minhas.length > 0) {
        const k = [...minhas].sort((x, y) => comparar(candidatos.get(x).orgId, candidatos.get(y).orgId))[0];
        const c = candidatos.get(k);
        aviso('realocado_pelo_piloto', `${pid} está no piloto: atuação movida de ${c.orgId} para ${organizacaoPiloto}`, { pessoaId: pid, de: c.orgId, para: organizacaoPiloto });
        if (minhas.length > 1) aviso('realocado_pelo_piloto_multiplas', `${pid} tem ${minhas.length} atuações fora do piloto: só a primeira foi movida, as outras ficam`, { pessoaId: pid, mantidas: minhas.filter(x => x !== k).map(x => candidatos.get(x).orgId) });
        const novo = `${organizacaoPiloto}|${pid}`;
        candidatos.delete(k);
        ordem[ordem.indexOf(k)] = novo;
        candidatos.set(novo, { ...c, orgId: organizacaoPiloto, origem: 'inferido_por_cargo', metodo: 'piloto' });
      } else if (pjVinculo.has(pid)) {
        const novo = `${organizacaoPiloto}|${pid}`;
        aviso('atuacao_criada_pelo_piloto', `${pid} está no piloto e só tinha PJ sem organização: atuação criada em ${organizacaoPiloto}`, { pessoaId: pid, para: organizacaoPiloto });
        ordem.push(novo);
        candidatos.set(novo, { pessoaId: pid, orgId: organizacaoPiloto, origem: 'inferido_por_cargo', metodo: 'piloto', vinculo: pjVinculo.get(pid) });
      }
    }
  }

  // 2. Atuação n=1 de cada candidato, com setor, equipe e podeLiderar do piloto quando a pessoa está nele.
  const atuacoes = [];
  const porChave = new Map();
  for (const chave of ordem) {
    const c = candidatos.get(chave);
    const p = pilotoDe(pessoas.get(c.pessoaId));
    let funcao = c.vinculo.cargo;
    if (!funcao) { funcao = FUNCAO_DESCONHECIDA; aviso('cargo_ausente', `Vínculo de ${c.pessoaId} sem cargo na carga`, { pessoaId: c.pessoaId }); }
    let inicio = c.vinculo.inicio;
    if (!inicio) { inicio = INICIO_DESCONHECIDO; aviso('inicio_ausente', `Vínculo de ${c.pessoaId} sem data de início na carga`, { pessoaId: c.pessoaId }); }
    const a = montar(
      { id: idAtuacao(c.orgId, c.pessoaId, 1), pessoaRef: c.pessoaId, organizacaoId: c.orgId, funcao, setor: p?.setor ?? null, equipe: p?.equipe ?? null, inicio },
      { origem: c.origem, metodoInferencia: c.metodo, podeLiderar: p ? !!p.lider : false },
    );
    atuacoes.push(a);
    porChave.set(chave, a);
  }

  // 3. Raiz: gerente geral de cada organização (a corporativa nasce vazia, a estrutura dela é definida pelo RH).
  const raizes = new Set();
  const nomeDe = a => normalizarNome(pessoas.get(a.pessoaRef)?.nome);
  for (const o of organizacoes) {
    if (o.tipo === 'corporativa') continue;
    const cand = atuacoes
      .filter(a => a.organizacaoId === o.id && FUNCOES_RAIZ.has(normalizarNome(a.funcao)))
      .sort((x, y) => comparar(nomeDe(x), nomeDe(y)) || comparar(x.id, y.id));
    if (cand.length === 0) {
      aviso('organizacao_sem_raiz', `A organização ${o.id} não tem gerente geral na carga: sem raiz até o RH definir`, { organizacaoId: o.id });
      continue;
    }
    if (cand.length > 1) {
      aviso('multiplas_raizes_candidatas', `A organização ${o.id} tem ${cand.length} gerentes gerais (${cand.map(a => a.pessoaRef).join(', ')}): só o primeiro por nome virou raiz, o RH decide`, { organizacaoId: o.id, ids: cand.map(a => a.id) });
    }
    cand[0].ehRaiz = true;
    raizes.add(cand[0].id);
  }

  // 4. Superiores do piloto, só dentro da mesma organização. Origem 'carga' vira 'inferido_por_cargo'.
  const idsPorNome = new Map();
  for (const p of base.pessoas) {
    for (const nome of [p.nome, ...(p.nomesAlternativos ?? [])]) {
      const k = normalizarNome(nome);
      if (!idsPorNome.has(k)) idsPorNome.set(k, new Set());
      idsPorNome.get(k).add(p.id);
    }
  }
  const adicionais = [];
  for (const a of atuacoes) {
    const p = pilotoDe(pessoas.get(a.pessoaRef));
    if (!p || !p.avaliadores?.length) continue;
    if (raizes.has(a.id)) { aviso('raiz_ignora_avaliador', `${a.pessoaRef} é raiz de ${a.organizacaoId}: avaliador do piloto não aplicado`, { id: a.id }); continue; }
    const superiores = [];
    for (const nomeAv of p.avaliadores) {
      const ids = idsPorNome.get(normalizarNome(nomeAv));
      if (!ids) { aviso('avaliador_nao_encontrado', `Avaliador "${nomeAv}" de ${a.pessoaRef} não existe na base`, { id: a.id, avaliador: nomeAv }); continue; }
      const sup = [...ids].filter(i => i !== a.pessoaRef).map(i => porChave.get(`${a.organizacaoId}|${i}`)).find(Boolean);
      if (!sup) { aviso('avaliador_fora_da_organizacao', `Avaliador "${nomeAv}" de ${a.pessoaRef} não tem atuação em ${a.organizacaoId}`, { id: a.id, avaliador: nomeAv }); continue; }
      if (!superiores.includes(sup.id)) superiores.push(sup.id);
    }
    if (superiores.length === 0) continue;
    a.superiorId = superiores[0];
    if (a.origem === 'carga') a.origem = 'inferido_por_cargo';
    if (superiores.length > 1) aviso('duplo_avaliador', `${a.pessoaRef} tem ${superiores.length} avaliadores em ${a.organizacaoId}: uma atuação por superior (D14)`, { id: a.id, superiores });
    superiores.slice(1).forEach((supId, i) => {
      adicionais.push(montar(
        { id: idAtuacao(a.organizacaoId, a.pessoaRef, i + 2), pessoaRef: a.pessoaRef, organizacaoId: a.organizacaoId, funcao: a.funcao, superiorId: supId, setor: a.setor, equipe: a.equipe, inicio: a.inicio },
        { origem: a.origem, metodoInferencia: a.metodoInferencia, podeLiderar: a.podeLiderar },
      ));
    });
  }
  atuacoes.push(...adicionais);

  // 4b. Marca de líder inferida (R23): a raiz e toda atuação que ficou com subordinado lideram, mesmo sem marca no piloto.
  //     Só atuação marcada como líder recebe subordinado (R20); sem isso a carga entregaria líder sem marca com equipe.
  const comSubordinado = new Set(atuacoes.map(a => a.superiorId).filter(Boolean));
  for (const a of atuacoes) {
    if (a.podeLiderar) continue;
    if (a.ehRaiz) {
      a.podeLiderar = true;
      aviso('lider_inferido_por_raiz', `${a.pessoaRef} é raiz de ${a.organizacaoId}: marcada como líder`, { atuacaoId: a.id });
    } else if (comSubordinado.has(a.id)) {
      a.podeLiderar = true;
      aviso('lider_inferido_por_subordinados', `${a.pessoaRef} tem subordinados em ${a.organizacaoId}: marcada como líder`, { atuacaoId: a.id });
    }
  }

  // 5. Quem só tem PJ sem correspondência e nenhuma atuação vai para o pool "sem organização".
  const comAtuacao = new Set(atuacoes.map(a => a.pessoaRef));
  const semOrganizacao = [];
  for (const [pessoaId, vinculosPJ] of pjSemOrg) {
    if (comAtuacao.has(pessoaId)) {
      for (const j of vinculosPJ) aviso('vinculo_pj_sem_organizacao_ignorado', `PJ de ${pessoaId} na empresa ${j.empresa} sem organização: ignorado porque a pessoa já tem atuação`, { pessoaId, empresa: j.empresa, cargo: j.cargo });
      continue;
    }
    const pessoa = pessoas.get(pessoaId);
    if (pessoa) semOrganizacao.push({ ...pessoa, vinculosPJ });
  }
  const comVinculo = new Set(base.vinculos.map(v => v.pessoaId));
  for (const p of base.pessoas) if (!comVinculo.has(p.id)) aviso('pessoa_sem_vinculo', `Pessoa ${p.id} não tem nenhum vínculo na base`, { pessoaId: p.id });

  // 6. Visibilidade: valida a árvore de cada organização sem desfazer nada. O RH corrige na montagem.
  for (const o of organizacoes) {
    try { validarArvore(atuacoes, o.id); } catch (e) {
      aviso('arvore_invalida_na_carga', e.message, { organizacaoId: o.id, erro: e.codigo || e.code });
    }
  }
  return { atuacoes, semOrganizacao, log };
}
