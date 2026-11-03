/**
 * Converte a planilha de controle de PJ do RH em JSON de linhas.
 * Uso: node src/cli/converter-pj.js <arquivo.xlsx> [saida.json]
 * Única dependência de produção: xlsx. É o único módulo que lê a planilha.
 * Saída: { fonte, aba, geradoEm, linhas: string[][] } com todas as linhas após o cabeçalho verdadeiro.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const [entrada, saida = 'data/pj/pj-2026.json'] = process.argv.slice(2);
if (!entrada) { console.error('Uso: node src/cli/converter-pj.js <arquivo.xlsx> [saida.json]'); process.exit(1); }

const wb = XLSX.readFile(entrada, { cellDates: true });
const aba = wb.SheetNames.includes('PJs') ? 'PJs' : wb.SheetNames[0];
const matriz = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: '' });

const fmt = v => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
};
// O cabeçalho verdadeiro é a primeira linha cuja coluna 3 é "CONTRATANTE ATUAL".
// Tudo antes dele (título, linhas vazias) é descartado aqui; cabeçalhos REPETIDOS no meio
// dos dados ficam para o parsePJ tratar e registrar no log.
const iCab = matriz.findIndex(r => String(r[3] ?? '').trim().toUpperCase() === 'CONTRATANTE ATUAL');
if (iCab === -1) { console.error('Cabeçalho "CONTRATANTE ATUAL" não encontrado na aba ' + aba); process.exit(2); }
const linhas = matriz.slice(iCab + 1).map(r => r.map(fmt));

fs.mkdirSync(saida.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(saida, JSON.stringify({ fonte: entrada.split('/').pop(), aba, geradoEm: new Date().toISOString().slice(0, 10), linhas }, null, 1));
console.log(`${linhas.length} linhas gravadas em ${saida} (aba ${aba})`);
