/**
 * Parser da base CLT exportada do Domínio (CSV com ';', BOM, células espalhadas).
 * Porta do script documentado em claude/dados/carga-das-bases.md.
 * Regra central: o cargo (^\d+\s*-\s*\S) é a única âncora confiável.
 * Antes dele vêm nome e RG; depois vêm CPF e duas datas. Nunca posição fixa.
 */
import { cpfLimpo, dataISO } from './normalizar.js';

const DATA = /^\d{2}\/\d{2}\/\d{4}$/;
const CARGO = /^\d+\s*-\s*[A-ZÀ-Üa-zà-ü(]/;   // letra depois do hífen: RG como 4031324-7 não é cargo
const EMPRESA = /^(LAGHETTO|SIENA|HOTEL|CHATEAU|SPIEKER|BRANO|CONDOMINIO|RLC|JCC|LSH)/;

function semAcentoMaiusculo(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
const colapsar = s => s.replace(/\s+/g, ' ').trim();

export function parseCLT(csvTexto, regional) {
  const texto = csvTexto.replace(/^﻿/, '');
  const registros = [];
  const log = [];
  let filial = null;

  texto.split(/\r?\n/).forEach((linha, idx) => {
    const cells = linha.split(';').map(c => c.trim());
    const nonempty = cells.filter(Boolean);
    if (!nonempty.length) return;

    const ehFilial = !cells[0] && !/^\d/.test(nonempty[0]) && EMPRESA.test(semAcentoMaiusculo(nonempty[0]));
    if (ehFilial) { filial = colapsar(nonempty[0]); return; }
    if (!/^\d+$/.test(cells[0])) return;

    const vals = cells.slice(1).filter(Boolean);
    const ci = vals.findIndex(v => CARGO.test(v));
    if (ci === -1) {
      log.push({ nivel: 'aviso', codigo: 'linha_sem_cargo', mensagem: `Linha ${idx + 1} com código ${cells[0]} não tem cargo reconhecível e foi ignorada`, linha: idx + 1 });
      return;
    }
    const antes = vals.slice(0, ci);
    const depois = vals.slice(ci + 1);
    const [cargoCod, ...resto] = vals[ci].split('-');
    const datas = depois.filter(v => DATA.test(v));
    const naoData = depois.filter(v => !DATA.test(v));
    const codigo = cells[0];

    registros.push({
      regional,
      filial,
      codigo,
      nome: antes[0] ? colapsar(antes[0]) : null,
      rg: antes[1] ?? null,
      cargoCod: cargoCod.trim(),
      cargo: colapsar(resto.join('-')),
      cpf: cpfLimpo(naoData[0] ?? null),
      nascimento: dataISO(datas[0] ?? null),
      admissao: dataISO(datas[1] ?? null),
      chave: `${filial}|${codigo}`,
    });
  });

  return { registros, log };
}
