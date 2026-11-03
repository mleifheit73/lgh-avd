/**
 * Consolida as duas bases numa lista de pessoas (uma por CPF), vínculos contratuais e pendências.
 * Ver docs/spec/SPEC-00-FUNDACAO.md seções 3.1, 3.2 e 4.3.
 * Regras: CPF é a identidade; sem CPF nunca funde, mas recebe pendência se o nome bater com alguém com CPF;
 * nome da CLT prevalece e o outro vai para nomesAlternativos; pendências são uma entrada por (pessoa, código);
 * o sistema não escolhe regime, só marca; data ausente é pendência, nunca silêncio; contratação futura é status pendente.
 * Empresa do vínculo é sempre a chave normalizada (comparável entre CLT e PJ) com a grafia original ao lado.
 */
import { chaveEmpresa } from './normalizar.js';

const nomeChave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

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
    const p = { cpf: cpf ?? null, nome, nascimento: nascimento ?? null, status: cpf ? 'ativo' : 'pendente', motivoStatus: cpf ? null : 'sem_cpf', nomesAlternativos: [] };
    if (!cpf) p.idProvisorio = `sem-cpf-${++provisorios}`;
    else pessoasPorCpf.set(cpf, p);
    pessoas.push(p);
    return p;
  };
  const ref = p => p.cpf ?? p.idProvisorio;
  const pendente = (p, codigo, detalhe) => pendencias.push({ pessoaRef: ref(p), codigo, detalhe });
  const marcarPendente = (p, motivo) => { if (p.status === 'ativo') { p.status = 'pendente'; p.motivoStatus = motivo; } };

  // CLT primeiro: o nome da folha prevalece.
  const cpfsClt = new Set();
  for (const r of clt) {
    const p = obterPessoa(r.cpf, r.nome, r.nascimento);
    if (r.cpf) cpfsClt.add(r.cpf);
    vinculos.push({ pessoaRef: ref(p), regime: 'CLT', empresa: chaveEmpresa(r.filial), empresaOriginal: r.filial, cargo: r.cargo, inicio: r.admissao, filial: r.filial, codigo: r.codigo, chave: r.chave });
    if (!r.cpf) pendente(p, 'sem_cpf', `Registro CLT ${r.chave} sem CPF`);
    if (!r.nascimento) pendente(p, 'sem_nascimento', `Registro CLT ${r.chave} sem data de nascimento válida`);
    if (!r.admissao) pendente(p, 'sem_inicio', `Registro CLT ${r.chave} sem data de admissão válida`);
  }

  // PJ depois.
  const cpfsPjVistos = new Set();
  for (const r of pj) {
    const jaEraClt = r.cpf && cpfsClt.has(r.cpf);
    const repetidoNaPj = r.cpf && cpfsPjVistos.has(r.cpf);
    if (r.cpf) cpfsPjVistos.add(r.cpf);
    const p = obterPessoa(r.cpf, r.nome, r.nascimento);

    // Um vínculo por empresa distinta; grafia original é a primeira que mapeia para a chave.
    const originalDe = {};
    for (const g of r.grafiasOriginais ?? []) { const k = chaveEmpresa(g); if (k && !(k in originalDe)) originalDe[k] = g; }
    const empresas = r.empresas.length ? r.empresas : [null];
    for (const e of empresas) {
      vinculos.push({ pessoaRef: ref(p), regime: 'PJ', empresa: e, empresaOriginal: e ? (originalDe[e] ?? e) : null, cargo: r.cargo, inicio: r.inicio });
    }

    if (jaEraClt) pendente(p, 'tambem_na_base_clt', 'Mesmo CPF nas bases CLT e PJ. O RH decide o regime vigente.');
    if (repetidoNaPj) pendente(p, 'cpf_repetido_na_pj', 'CPF aparece em mais de uma linha da planilha PJ.');
    if (!r.cpf) pendente(p, 'sem_cpf', 'Registro PJ sem CPF. Sem CPF não há login.');
    if (!r.cargo) pendente(p, 'sem_cargo', 'Registro PJ sem objeto de contrato.');
    if (!r.empresas.length) pendente(p, 'sem_empresa', 'Registro PJ sem contratante.');
    if (r.empresas.length > 1) pendente(p, 'multiplas_empresas', `Contratado por ${r.empresas.length} empresas: ${r.empresas.join('; ')}`);
    if (!r.nascimento) pendente(p, 'sem_nascimento', 'Registro PJ sem data de nascimento válida.');
    if (!r.inicio) pendente(p, 'sem_inicio', 'Registro PJ sem data de início válida.');
    if (r.inicio && r.inicio > hoje) { pendente(p, 'inicio_futuro', `Início do contrato em ${r.inicio}, posterior a ${hoje}.`); marcarPendente(p, 'inicio_futuro'); }
  }

  // Possível duplicado: pessoa sem CPF cujo nome bate com pessoa com CPF.
  const porNome = new Map();
  for (const p of pessoas) if (p.cpf) {
    for (const n of [p.nome, ...p.nomesAlternativos]) { const k = nomeChave(n); if (k && !porNome.has(k)) porNome.set(k, p); }
  }
  for (const p of pessoas) if (!p.cpf) {
    const igual = porNome.get(nomeChave(p.nome));
    if (igual) pendente(p, 'possivel_duplicado', `Nome igual ao de ${igual.nome} (CPF ${igual.cpf}). Pode ser a mesma pessoa sem CPF na planilha PJ.`);
  }

  log.push({ nivel: 'info', codigo: 'resumo', mensagem: `${pessoas.length} pessoas, ${vinculos.length} vínculos, ${pendencias.length} pendências` });
  return { pessoas, vinculos, pendencias, log };
}
