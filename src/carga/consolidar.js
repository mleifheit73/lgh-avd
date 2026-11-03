/**
 * Consolida as duas bases numa lista de pessoas (uma por CPF), vínculos contratuais e pendências.
 * Ver docs/spec/SPEC-00-FUNDACAO.md seções 3.1, 3.2 e 4.3.
 * Regras: CPF é a identidade; sem CPF nunca funde; nome da CLT prevalece e o outro vai para nomesAlternativos;
 * pendências são uma entrada por (pessoa, código); o sistema não escolhe regime, só marca.
 */
export function consolidar(clt, pj, opcoes) {
  const hoje = opcoes?.hoje;
  if (!hoje) throw new Error('consolidar exige opcoes.hoje em YYYY-MM-DD');

  const pessoasPorCpf = new Map();
  const pessoas = [];
  const vinculos = [];
  const pendencias = [];
  const log = [];
  let provisorios = 0;

  const obterPessoa = (cpf, nome, nascimento) => {
    if (cpf && pessoasPorCpf.has(cpf)) {
      const p = pessoasPorCpf.get(cpf);
      if (nome && nome !== p.nome && !p.nomesAlternativos.includes(nome)) p.nomesAlternativos.push(nome);
      return p;
    }
    const p = { cpf: cpf ?? null, nome, nascimento: nascimento ?? null, status: cpf ? 'ativo' : 'pendente', nomesAlternativos: [] };
    if (!cpf) p.idProvisorio = `sem-cpf-${++provisorios}`;
    else pessoasPorCpf.set(cpf, p);
    pessoas.push(p);
    return p;
  };
  const ref = p => p.cpf ?? p.idProvisorio;
  const pendente = (p, codigo, detalhe) => pendencias.push({ pessoaRef: ref(p), codigo, detalhe });

  // CLT primeiro: o nome da folha prevalece.
  for (const r of clt) {
    const p = obterPessoa(r.cpf, r.nome, r.nascimento);
    vinculos.push({ pessoaRef: ref(p), regime: 'CLT', empresa: r.filial, cargo: r.cargo, inicio: r.admissao, filial: r.filial, codigo: r.codigo, chave: r.chave });
    if (!r.cpf) pendente(p, 'sem_cpf', `Registro CLT ${r.chave} sem CPF`);
  }

  // PJ depois.
  for (const r of pj) {
    const jaEraClt = r.cpf && pessoasPorCpf.has(r.cpf);
    const p = obterPessoa(r.cpf, r.nome, r.nascimento);
    const empresas = r.empresas.length ? r.empresas : [null];
    for (const e of empresas) {
      vinculos.push({ pessoaRef: ref(p), regime: 'PJ', empresa: e, cargo: r.cargo, inicio: r.inicio });
    }
    if (jaEraClt) pendente(p, 'tambem_na_base_clt', 'Mesmo CPF nas bases CLT e PJ. O RH decide o regime vigente.');
    if (!r.cpf) pendente(p, 'sem_cpf', 'Registro PJ sem CPF. Sem CPF não há login.');
    if (!r.cargo) pendente(p, 'sem_cargo', 'Registro PJ sem objeto de contrato.');
    if (!r.empresas.length) pendente(p, 'sem_empresa', 'Registro PJ sem contratante.');
    if (r.empresas.length > 1) pendente(p, 'multiplas_empresas', `Contratado por ${r.empresas.length} empresas: ${r.empresas.join('; ')}`);
    if (r.inicio && r.inicio > hoje) pendente(p, 'inicio_futuro', `Início do contrato em ${r.inicio}, posterior a ${hoje}.`);
  }

  log.push({ nivel: 'info', codigo: 'resumo', mensagem: `${pessoas.length} pessoas, ${vinculos.length} vínculos, ${pendencias.length} pendências` });
  return { pessoas, vinculos, pendencias, log };
}
