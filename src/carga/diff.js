/**
 * Diferença entre duas cargas consolidadas (spec 4.4, D11).
 * Pessoa presente na anterior e ausente da nova, por identidade no CONJUNTO inteiro, vira inativação proposta,
 * rotulada como inferida. Agrupada por organização. Se a organização exceder o limite, o grupo inteiro trava
 * e nada dela é aplicado até o RH confirmar. Limite = min(percentual × tamanho, absoluto).
 */
const refDe = p => p.cpf ?? p.idProvisorio;

export function diffCarga(anterior, nova, opcoes) {
  const { limitePercentual, limiteAbsoluto, organizacaoDe } = opcoes ?? {};
  if (typeof organizacaoDe !== 'function') throw new Error('diffCarga exige opcoes.organizacaoDe(vinculo)');
  if (!(limitePercentual >= 0) || !(limiteAbsoluto >= 0)) throw new Error('diffCarga exige limitePercentual e limiteAbsoluto numéricos');

  const refsNova = new Set(nova.pessoas.map(refDe));
  const refsAnt = new Set(anterior.pessoas.map(refDe));

  const novos = nova.pessoas.filter(p => !refsAnt.has(refDe(p)));

  // Organização de cada pessoa na carga anterior: pelo primeiro vínculo dela (uma pessoa pode ter mais de um; usa-se todos).
  const orgsPorPessoa = new Map();
  for (const v of anterior.vinculos) {
    const o = organizacaoDe(v);
    if (o == null) continue;
    if (!orgsPorPessoa.has(v.pessoaRef)) orgsPorPessoa.set(v.pessoaRef, new Set());
    orgsPorPessoa.get(v.pessoaRef).add(o);
  }
  const tamanhoOrg = new Map();
  for (const orgs of orgsPorPessoa.values()) for (const o of orgs) tamanhoOrg.set(o, (tamanhoOrg.get(o) ?? 0) + 1);

  const inativacoesPropostas = [];
  for (const p of anterior.pessoas) {
    const ref = refDe(p);
    if (refsNova.has(ref)) continue;
    for (const o of orgsPorPessoa.get(ref) ?? [null]) {
      inativacoesPropostas.push({ pessoaRef: ref, organizacaoId: o, origem: 'inferido_pela_carga' });
    }
  }

  const porOrg = new Map();
  for (const i of inativacoesPropostas) {
    if (!porOrg.has(i.organizacaoId)) porOrg.set(i.organizacaoId, []);
    porOrg.get(i.organizacaoId).push(i);
  }

  const travadas = [];
  const aplicaveis = [];
  for (const [org, itens] of porOrg) {
    const tamanho = tamanhoOrg.get(org) ?? itens.length;
    const limite = Math.min(limitePercentual * tamanho, limiteAbsoluto);
    if (itens.length > limite) {
      travadas.push({ organizacaoId: org, quantidade: itens.length, motivo: `A carga propõe inativar ${itens.length} de ${tamanho} pessoas de ${org}, acima do limite de ${Math.floor(limite)}. Confirmação do RH necessária antes de aplicar.` });
    } else {
      aplicaveis.push(...itens);
    }
  }

  return { novos, inativacoesPropostas, travadas, aplicaveis };
}
