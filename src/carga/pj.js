/**
 * Parser da planilha de controle de PJ do RH, a partir das linhas já extraídas
 * pelo conversor (src/cli/converter-pj.js). Colunas por índice:
 * 0 sequencial, 1 nome, 2 objeto do contrato (cargo), 3 contratante, 4 CPF, 5 nascimento, 6 início.
 */
import { cpfLimpo, dataISO, chaveEmpresa, separarEmpresas } from './normalizar.js';

const colapsar = s => String(s ?? '').replace(/\s+/g, ' ').trim();

export function parsePJ(linhas) {
  const registros = [];
  const log = [];
  const equivalencia = {};

  linhas.forEach((l, idx) => {
    const nome = colapsar(l[1]);
    const contratante = colapsar(l[3]);
    const numeroLinha = idx + 1;

    if (contratante.toUpperCase().startsWith('CONTRATANTE')) {
      log.push({ nivel: 'aviso', codigo: 'cabecalho_repetido', mensagem: `Linha ${numeroLinha} é cabeçalho repetido no meio dos dados e foi descartada`, linha: numeroLinha });
      return;
    }
    if (!nome) {
      log.push({ nivel: 'info', codigo: 'linha_vazia', mensagem: `Linha ${numeroLinha} sem nome foi ignorada`, linha: numeroLinha });
      return;
    }

    const grafiasOriginais = contratante
      ? contratante.split(/,| e (?=[A-ZÀ-Ü])/).map(colapsar).filter(Boolean)
      : [];
    const empresas = separarEmpresas(contratante);
    for (const g of grafiasOriginais) {
      const k = chaveEmpresa(g);
      if (!k) continue;
      equivalencia[k] ??= [];
      if (!equivalencia[k].includes(g)) equivalencia[k].push(g);
    }

    registros.push({
      nome,
      cargo: colapsar(l[2]) || null,
      cpf: cpfLimpo(l[4]),
      nascimento: dataISO(l[5]),
      inicio: dataISO(l[6]),
      empresas,
      grafiasOriginais,
    });
  });

  return { registros, log, equivalencia };
}
