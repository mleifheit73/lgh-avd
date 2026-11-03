/**
 * Diferença entre duas cargas consolidadas (spec 4.4, D11).
 * Pessoa presente na anterior e ausente da nova, por CPF no CONJUNTO inteiro, vira inativação proposta,
 * rotulada como inferida. A trava é avaliada por organização (limite = min(percentual × tamanho, absoluto)),
 * mas a inativação é da PESSOA: se qualquer organização dela estiver travada, nenhuma inativação dela é aplicável.
 * Pessoa sem CPF não tem identidade estável entre cargas e fica fora do diff, listada em semIdentidade.
 */
export function diffCarga(anterior, nova, opcoes) {
  const { limitePercentual, limiteAbsoluto, organizacaoDe } = opcoes ?? {};
  if (typeof organizacaoDe !== 'function') throw new Error('diffCarga exige opcoes.organizacaoDe(vinculo)');
  if (!(limitePercentual >= 0) || !(limiteAbsoluto >= 0)) throw new Error('diffCarga exige limitePercentual e limiteAbsoluto numéricos');

  const comCpf = lista => lista.filter(p => p.cpf);
  const semCpf = lista => lista.filter(p => !p.cpf);
  const semIdentidade = { anterior: semCpf(anterior.pessoas), nova: semCpf(nova.pessoas) };

  const cpfsNova = new Set(comCpf(nova.pessoas).map(p => p.cpf));
  const cpfsAnt = new Set(comCpf(anterior.pessoas).map(p => p.cpf));
  const novos = comCpf(nova.pessoas).filter(p => !cpfsAnt.has(p.cpf));

  const orgsPorPessoa = new Map();
  for (const v of anterior.vinculos) {
    if (!cpfsAnt.has(v.pessoaRef)) continue;
    const o = organizacaoDe(v);
    if (o == null) continue;
    if (!orgsPorPessoa.has(v.pessoaRef)) orgsPorPessoa.set(v.pessoaRef, new Set());
    orgsPorPessoa.get(v.pessoaRef).add(o);
  }
  const tamanhoOrg = new Map();
  for (const orgs of orgsPorPessoa.values()) for (const o of orgs) tamanhoOrg.set(o, (tamanhoOrg.get(o) ?? 0) + 1);

  const inativacoesPropostas = [];
  for (const p of comCpf(anterior.pessoas)) {
    if (cpfsNova.has(p.cpf)) continue;
    for (const o of orgsPorPessoa.get(p.cpf) ?? [null]) {
      inativacoesPropostas.push({ pessoaRef: p.cpf, organizacaoId: o, origem: 'inferido_pela_carga' });
    }
  }

  const porOrg = new Map();
  for (const i of inativacoesPropostas) {
    if (!porOrg.has(i.organizacaoId)) porOrg.set(i.organizacaoId, []);
    porOrg.get(i.organizacaoId).push(i);
  }

  const orgsTravadas = new Set();
  const travadas = [];
  for (const [org, itens] of porOrg) {
    const tamanho = tamanhoOrg.get(org) ?? itens.length;
    const limite = Math.min(limitePercentual * tamanho, limiteAbsoluto);
    if (itens.length > limite) {
      orgsTravadas.add(org);
      travadas.push({ organizacaoId: org, quantidade: itens.length, pessoas: itens.map(i => i.pessoaRef), motivo: `A carga propõe inativar ${itens.length} de ${tamanho} pessoas de ${org}, acima do limite de ${Math.floor(limite)}. Confirmação do RH necessária antes de aplicar.` });
    }
  }

  // A pessoa só é aplicável se NENHUMA organização dela estiver travada.
  const pessoasTravadas = new Set(inativacoesPropostas.filter(i => orgsTravadas.has(i.organizacaoId)).map(i => i.pessoaRef));
  const aplicaveis = inativacoesPropostas.filter(i => !pessoasTravadas.has(i.pessoaRef));
  for (const t of travadas) {
    // Inclui na trava as pessoas que seriam aplicáveis em outra organização mas foram seguradas por esta.
    for (const i of inativacoesPropostas) if (pessoasTravadas.has(i.pessoaRef) && !t.pessoas.includes(i.pessoaRef) && (orgsPorPessoa.get(i.pessoaRef) ?? new Set()).has(t.organizacaoId)) t.pessoas.push(i.pessoaRef);
  }

  return { novos, inativacoesPropostas, travadas, aplicaveis, semIdentidade };
}
