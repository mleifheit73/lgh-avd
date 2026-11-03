/**
 * Carga de ponta a ponta: lê os 3 CSVs da base CLT e o JSON da base PJ, consolida e grava out/base.json.
 * É o único módulo, além dos testes, que toca disco. Toda a regra está em src/carga e src/modelo.
 *
 * Uso: node src/cli/carga.js <R1.csv> <R2.csv> <R3.csv> <pj.json> [saida.json]
 *
 * ATENÇÃO: a saída contém CPF em texto aberto e fica em out/, que é ignorado pelo git e nunca é publicado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseCLT } from '../carga/clt.js';
import { parsePJ } from '../carga/pj.js';
import { consolidar } from '../carga/consolidar.js';

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error('Uso: node src/cli/carga.js <R1.csv> <R2.csv> <R3.csv> <pj.json> [saida.json]');
  process.exit(1);
}
const [r1, r2, r3, pjPath, saida = 'out/base.json'] = args;
const hoje = new Date().toISOString().slice(0, 10);

const log = [];
const clt = [];
for (const [arquivo, regional] of [[r1, 'R1'], [r2, 'R2'], [r3, 'R3']]) {
  const r = parseCLT(fs.readFileSync(arquivo, 'utf8'), regional);
  clt.push(...r.registros);
  log.push(...r.log.map(l => ({ ...l, fonte: path.basename(arquivo) })));
}
const pj = parsePJ(JSON.parse(fs.readFileSync(pjPath, 'utf8')).linhas);
log.push(...pj.log.map(l => ({ ...l, fonte: path.basename(pjPath) })));

const c = consolidar(clt, pj.registros, { hoje });
log.push(...c.log);

const base = {
  geradoEm: new Date().toISOString(),
  fontes: { clt: [r1, r2, r3].map(p => path.basename(p)), pj: path.basename(pjPath) },
  pessoas: c.pessoas,
  vinculos: c.vinculos,
  pendencias: c.pendencias,
  equivalenciaEmpresas: pj.equivalencia,
  log,
};
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify(base, null, 1));

// Resumo
const porCodigo = {};
for (const p of c.pendencias) porCodigo[p.codigo] = (porCodigo[p.codigo] ?? 0) + 1;
const grafiasMultiplas = Object.entries(pj.equivalencia).filter(([, g]) => g.length > 1);
const filiais = new Set(clt.map(x => x.filial)).size;
const cpfsClt = new Set(clt.map(x => x.cpf)).size;

console.log(`Carga concluída em ${saida}`);
console.log(`  CLT: ${clt.length} registros, ${cpfsClt} pessoas, ${filiais} filiais`);
console.log(`  PJ:  ${pj.registros.length} registros válidos, ${Object.keys(pj.equivalencia).length} empresas`);
console.log(`  Consolidado: ${c.pessoas.length} pessoas, ${c.vinculos.length} vínculos, ${c.pendencias.length} pendências`);
console.log('  Pendências por código:');
for (const [k, v] of Object.entries(porCodigo).sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);
console.log(`  Empresas com mais de uma grafia: ${grafiasMultiplas.length}`);
for (const [k, g] of grafiasMultiplas) console.log(`    ${k}  <-  ${g.join(' | ')}`);
console.log(`  Log: ${log.filter(l => l.nivel === 'erro').length} erros, ${log.filter(l => l.nivel === 'aviso').length} avisos, ${log.filter(l => l.nivel === 'info').length} informações`);
