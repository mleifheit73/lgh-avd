import { organizacoesDe } from '../../app/js/modelo/organizacao.js';
import { atuacoesIniciais, idAtuacao } from '../../app/js/modelo/bootstrap.js';
import { criarAtuacao } from '../../app/js/modelo/atuacao.js';

/**
 * Estado em memória como o app monta no boot: organizações, atuações iniciais e as atuações extras que o RH definiria
 * (por exemplo a estrutura corporativa, que a carga nunca infere).
 * Extra sem id recebe o id estável `${organizacaoId}|${pessoaRef}|${n}`.
 */
export function montarEstado(base, piloto = {}, extras = [], fusoes) {
  const organizacoes = organizacoesDe(base, fusoes);
  const { atuacoes, semOrganizacao, log } = atuacoesIniciais(base, organizacoes, piloto);
  for (const e of extras) {
    const n = atuacoes.filter(a => a.organizacaoId === e.organizacaoId && a.pessoaRef === e.pessoaRef).length + 1;
    const id = e.id ?? idAtuacao(e.organizacaoId, e.pessoaRef, n);
    atuacoes.push({ origem: 'definido', metodoInferencia: null, confirmadaPor: null, podeLiderar: false, ...e, ...criarAtuacao({ ...e, id }) });
  }
  return { base, organizacoes, atuacoes, semOrganizacao, log, pessoasPorId: new Map(base.pessoas.map(p => [p.id, p])) };
}
