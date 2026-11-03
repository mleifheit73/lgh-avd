/**
 * Parser da base CLT exportada do Domínio (CSV com ';', BOM, células espalhadas).
 * Documentação de origem: claude/dados/carga-das-bases.md no Projeto.
 *
 * Regras:
 *  - A linha de filial é reconhecida pela ESTRUTURA (traz "Página:"), não pelo nome. Razão social nova não quebra.
 *  - O cargo (^\d+\s*-\s*[letra]) é a âncora da linha de pessoa. Antes: nome e RG. Depois: CPF e duas datas.
 *    Exigir letra após o hífen evita que RG como 4031324-7 seja confundido com cargo.
 *  - Nenhuma linha com conteúdo é descartada em silêncio: toda linha vai para um registro, uma estrutura conhecida, ou o log.
 *  - "Total de empregados: N" de cada filial é conferido contra a contagem. Divergência é erro no log.
 */
import { cpfLimpo, dataISO } from './normalizar.js';

const DATA = /^\d{2}\/\d{2}\/\d{4}$/;
const CARGO = /^\d+\s*-\s*[A-ZÀ-Üa-zà-ü(]/;
const ESTRUTURAIS = [
  /^C[oó]digo$/i,                       // cabeçalho de colunas
  /^RELA[CÇ][AÃ]O DE EMPREGADOS/i,
  /^Horas:$/i,
  /^Emiss[aã]o:$/i,
  /^P[aá]gina:$/i,
  /^Sistema licenciado para/i,          // rodapé do Domínio
];

const colapsar = s => s.replace(/\s+/g, ' ').trim();

export function parseCLT(csvTexto, regional) {
  const texto = csvTexto.replace(/^﻿/, '');
  const registros = [];
  const log = [];
  let filial = null;
  let contagemFilial = 0;

  const fecharFilial = (esperado, numeroLinha) => {
    if (filial == null) return;
    if (esperado === contagemFilial) {
      log.push({ nivel: 'info', codigo: 'total_conferido', mensagem: `${filial}: ${contagemFilial} pessoas, conferido com o total do export`, linha: numeroLinha });
    } else {
      log.push({ nivel: 'erro', codigo: 'total_divergente', mensagem: `${filial}: o export esperava ${esperado} pessoas e o parser encontrou ${contagemFilial}`, linha: numeroLinha });
    }
  };

  texto.split(/\r?\n/).forEach((linha, idx) => {
    const numeroLinha = idx + 1;
    const cells = linha.split(';').map(c => c.trim());
    const nonempty = cells.filter(Boolean);
    if (!nonempty.length) return;

    // Linha de filial: primeira célula vazia e "Página:" em alguma célula da linha.
    if (!cells[0] && nonempty.some(c => /^P[aá]gina:$/i.test(c))) {
      const nome = colapsar(nonempty[0]);
      if (nome !== filial) { filial = nome; contagemFilial = 0; }   // filial com várias páginas repete o cabeçalho: não zerar
      return;
    }
    // Total da filial: confere e fecha.
    const iTotal = nonempty.findIndex(c => /^Total de empregados:?$/i.test(c));
    if (iTotal !== -1) {
      const n = parseInt(nonempty[iTotal + 1] ?? '', 10);
      fecharFilial(Number.isNaN(n) ? -1 : n, numeroLinha);
      return;
    }
    // Outras linhas estruturais conhecidas.
    if (ESTRUTURAIS.some(re => re.test(nonempty[0]))) return;

    // Linha de pessoa.
    if (/^\d+$/.test(cells[0])) {
      const vals = cells.slice(1).filter(Boolean);
      const ci = vals.findIndex(v => CARGO.test(v));
      if (ci === -1) {
        log.push({ nivel: 'aviso', codigo: 'linha_sem_cargo', mensagem: `Linha ${numeroLinha} com código ${cells[0]} não tem cargo reconhecível e foi ignorada`, linha: numeroLinha });
        return;
      }
      const antes = vals.slice(0, ci);
      const depois = vals.slice(ci + 1);
      const [cargoCod, ...resto] = vals[ci].split('-');
      const datas = depois.filter(v => DATA.test(v));
      const naoData = depois.filter(v => !DATA.test(v));
      const codigo = cells[0];
      registros.push({
        regional, filial, codigo,
        nome: antes[0] ? colapsar(antes[0]) : null,
        rg: antes[1] ?? null,
        cargoCod: cargoCod.trim(),
        cargo: colapsar(resto.join('-')),
        cpf: cpfLimpo(naoData[0] ?? null),
        nascimento: dataISO(datas[0] ?? null),
        admissao: dataISO(datas[1] ?? null),
        chave: `${filial}|${codigo}`,
      });
      contagemFilial++;
      return;
    }

    // Tudo o mais tem conteúdo e não foi reconhecido: vai para o log.
    log.push({ nivel: 'aviso', codigo: 'linha_nao_reconhecida', mensagem: `Linha ${numeroLinha} não foi reconhecida e foi ignorada: ${nonempty.slice(0, 3).join(' | ').slice(0, 80)}`, linha: numeroLinha });
  });

  return { registros, log };
}
