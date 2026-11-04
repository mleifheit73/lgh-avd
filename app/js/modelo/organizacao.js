/**
 * Organizações iniciais e inferência de organização para PJ (Plano B, tarefa 2).
 * Puro: não toca tela. Roda igual em Node e no navegador.
 * P8 continua aberta: tudo aqui é sugestão da carga até o RH confirmar.
 */
import { chaveEmpresa } from '../carga/normalizar.js';

export const ID_CORPORATIVO = 'LAGHETTO CORPORATIVO';

/** Filiais que o piloto de outubro já tratava como um hotel só. */
export const FUSOES = [
  { id: 'HOTEL LAGHETTO GOLDEN', nome: 'Hotel Laghetto Golden', filiais: ['LAGHETTO FL 18 A&B GOLDEN', 'LAGHETTO RESORT GOLDEN'] },
];

/** Tabela versionada (equivalencia-organizacoes.json). No navegador sem acesso ao arquivo cai para []; quem chama pode passar a tabela. */
function carregarEquivalencias() {
  try {
    const caminho = new URL('./equivalencia-organizacoes.json', import.meta.url);
    if (caminho.protocol !== 'file:') return [];
    const fs = globalThis.process?.getBuiltinModule?.('node:fs');
    if (!fs) return [];
    const lista = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}
export const EQUIVALENCIAS = carregarEquivalencias();

const TIPOS = ['unidade', 'area', 'empresa', 'corporativa'];

export function criarOrganizacao({ id, nome, tipo, regional = null, situacao = 'ativa', origem = 'sugerida_pela_carga', filiais } = {}) {
  for (const [k, v] of Object.entries({ id, nome, tipo })) {
    if (v == null || v === '') throw new Error(`criarOrganizacao: campo obrigatório ausente: ${k}`);
  }
  if (!TIPOS.includes(tipo)) throw new Error(`criarOrganizacao: tipo inválido: ${tipo}`);
  const lista = filiais ?? (tipo === 'corporativa' ? [] : [id]);
  return { id, nome, tipo, regional, situacao, origem, filiais: [...lista] };
}

/** Uma organização por filial CLT distinta (fusões viram uma só) mais a corporativa, sempre, vazia (D20). Ordenado por id. */
export function organizacoesDe(base, fusoes = FUSOES) {
  const regionalPorFilial = new Map();   // chave da filial -> { nome, regional }
  for (const v of base.vinculos) {
    if (v.regime !== 'CLT' || !v.filial) continue;
    const k = chaveEmpresa(v.filial);
    if (!k) continue;
    const atual = regionalPorFilial.get(k);
    if (!atual) regionalPorFilial.set(k, { nome: v.filial, regional: v.regional ?? null });
    else if (atual.regional == null && v.regional != null) atual.regional = v.regional;
  }
  const saida = [];
  const fundidas = new Set();
  for (const f of fusoes) {
    const chaves = f.filiais.map(chaveEmpresa);
    const presentes = chaves.filter(k => regionalPorFilial.has(k));
    if (presentes.length === 0) continue;   // fusão sem nenhuma filial na base não cria organização vazia
    chaves.forEach(k => fundidas.add(k));
    const regional = presentes.map(k => regionalPorFilial.get(k).regional).find(r => r != null) ?? null;
    saida.push(criarOrganizacao({ id: f.id, nome: f.nome, tipo: 'unidade', regional, filiais: f.filiais }));
  }
  for (const [k, { nome, regional }] of regionalPorFilial) {
    if (fundidas.has(k)) continue;
    saida.push(criarOrganizacao({ id: k, nome, tipo: 'unidade', regional, filiais: [k] }));
  }
  saida.push(criarOrganizacao({ id: ID_CORPORATIVO, nome: 'Laghetto Corporativo', tipo: 'corporativa', origem: 'definida', filiais: [] }));
  return saida.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const RE_FILIAL = /\b(?:FL|FILIAL|FLIAL)\s*0*(\d+)\b/g;
const numerosDe = texto => new Set([...String(texto).matchAll(RE_FILIAL)].map(m => m[1]));
const MIN_PREFIXO = 20;   // o Domínio trunca a razão social; prefixo curto demais casaria empresas diferentes

/**
 * Qual organização uma empresa PJ (já normalizada) sugere. Ordem: nome, prefixo, número da filial, tabela.
 * Passo ambíguo (duas organizações diferentes casam) não decide: segue para o próximo. Nada casa: null.
 */
export function inferirOrganizacao(empresaNormalizada, organizacoes, equivalencias = EQUIVALENCIAS) {
  const emp = chaveEmpresa(empresaNormalizada);
  if (!emp) return null;
  const candidatas = organizacoes.filter(o => o.tipo !== 'corporativa');
  const nomesDe = o => [o.id, ...(o.filiais ?? []).map(chaveEmpresa)].filter(Boolean);
  const unico = lista => (new Set(lista).size === 1 ? lista[0] : null);

  const porNome = unico(candidatas.filter(o => nomesDe(o).includes(emp)).map(o => o.id));
  if (porNome) return { organizacaoId: porNome, metodo: 'nome' };

  const porPrefixo = unico(candidatas.filter(o => nomesDe(o).some(n => {
    const [curto, longo] = n.length <= emp.length ? [n, emp] : [emp, n];
    return curto.length >= MIN_PREFIXO && longo.startsWith(curto);
  })).map(o => o.id));
  if (porPrefixo) return { organizacaoId: porPrefixo, metodo: 'prefixo' };

  const numerosEmp = numerosDe(emp);
  if (numerosEmp.size > 0) {
    const porNumero = unico(candidatas.filter(o => nomesDe(o).some(n => [...numerosDe(n)].some(x => numerosEmp.has(x)))).map(o => o.id));
    if (porNumero) return { organizacaoId: porNumero, metodo: 'numero' };
  }

  const linha = equivalencias.find(e => chaveEmpresa(e.empresa) === emp);
  if (linha && candidatas.some(o => o.id === linha.organizacaoId)) return { organizacaoId: linha.organizacaoId, metodo: 'tabela' };
  return null;
}
