/**
 * Atuação: pessoa + organização + função + superior. É o que gera avaliação.
 * Regra estrutural (spec 3.4, D14): cada superior diferente gera uma atuação.
 * Invariantes (spec 3.5): sem ciclos; exatamente uma raiz por organização; no máximo um superior.
 * Puro: não lê disco, não toca tela. Erros carregam `codigo` fixo para a tela mostrar sem reinterpretar.
 */

class ErroArvore extends Error {
  constructor(codigo, mensagem, detalhe) { super(mensagem); this.codigo = codigo; this.detalhe = detalhe; }
}

export function criarAtuacao({ id, pessoaRef, organizacaoId, funcao, superiorId = null, ehRaiz = false, setor = null, turno = null, equipe = null, inicio, fim = null, situacao = 'ativa' }) {
  for (const [k, v] of Object.entries({ id, pessoaRef, organizacaoId, funcao, inicio })) {
    if (v == null || v === '') throw new Error(`criarAtuacao: campo obrigatório ausente: ${k}`);
  }
  return { id, pessoaRef, organizacaoId, funcao, superiorId, ehRaiz: !!ehRaiz, setor, turno, equipe, inicio, fim, situacao };
}

const daOrg = (atuacoes, organizacaoId) => atuacoes.filter(a => a.organizacaoId === organizacaoId);

export function atuacoesDe(atuacoes, pessoaRef) {
  return atuacoes.filter(a => a.pessoaRef === pessoaRef);
}

/** Atuações da organização sem superior definido e que não são raiz: o que trava a abertura de ciclo. */
export function semSuperior(atuacoes, organizacaoId) {
  return daOrg(atuacoes, organizacaoId).filter(a => a.superiorId == null && !a.ehRaiz);
}

export function validarArvore(atuacoes, organizacaoId) {
  const lista = daOrg(atuacoes, organizacaoId);
  const porId = new Map(atuacoes.map(a => [a.id, a]));
  const raizes = lista.filter(a => a.ehRaiz);

  if (raizes.length === 0) throw new ErroArvore('sem_raiz', `A organização ${organizacaoId} não tem atuação raiz`, { organizacaoId });
  if (raizes.length > 1) throw new ErroArvore('multiplas_raizes', `A organização ${organizacaoId} tem ${raizes.length} raízes`, { ids: raizes.map(r => r.id) });
  const raizComSup = raizes.find(r => r.superiorId != null);
  if (raizComSup) throw new ErroArvore('raiz_com_superior', `A raiz ${raizComSup.id} não pode ter superior`, { id: raizComSup.id });

  for (const a of lista) {
    if (a.superiorId == null) continue;
    const sup = porId.get(a.superiorId);
    if (!sup) throw new ErroArvore('superior_inexistente', `A atuação ${a.id} aponta para superior ${a.superiorId}, que não existe`, { id: a.id, superiorId: a.superiorId });
    if (sup.organizacaoId !== organizacaoId) throw new ErroArvore('superior_fora_da_organizacao', `A atuação ${a.id} (${organizacaoId}) aponta para superior em ${sup.organizacaoId}`, { id: a.id, superiorId: a.superiorId });
  }

  // Ciclos: caminhar de cada atuação até a raiz; revisitar um id no mesmo caminho é ciclo.
  for (const a of lista) {
    const vistos = new Set();
    let atual = a;
    while (atual && atual.superiorId != null) {
      if (vistos.has(atual.id)) throw new ErroArvore('ciclo', `Ciclo na hierarquia passando por ${atual.id}`, { ids: [...vistos] });
      vistos.add(atual.id);
      atual = porId.get(atual.superiorId);
    }
  }
}

/** Árvore derivada: nunca armazenada como desenho. Valida antes de montar. */
export function arvore(atuacoes, organizacaoId) {
  validarArvore(atuacoes, organizacaoId);
  const lista = daOrg(atuacoes, organizacaoId);
  const filhosDe = new Map();
  for (const a of lista) {
    if (a.superiorId == null) continue;
    if (!filhosDe.has(a.superiorId)) filhosDe.set(a.superiorId, []);
    filhosDe.get(a.superiorId).push(a);
  }
  const montar = a => ({ atuacao: a, filhos: (filhosDe.get(a.id) ?? []).map(montar) });
  return montar(lista.find(a => a.ehRaiz));
}
