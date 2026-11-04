/**
 * Build do artefato (Plano B).
 *  1. copia src/carga/*.js e src/modelo/atuacao.js para app/js/ (sem alteração) e gera app/js/lgh.bundle.js (build-bundle.mjs);
 *  2. gera app/data/base.json (base pública: sem CPF, sem nascimento, sem idade) a partir de out/base.json;
 *  3. extrai app/data/piloto-golden.json do array PESSOAS de prototipo/index.html;
 *  4. monta dist/ como cópia de app/;
 *  5. varre dist/ atrás de dado pessoal. Achou: apaga dist/ e sai com código 4.
 *
 * Sem out/base.json (CI, sem dados reais) os passos 2 e 3 são pulados com aviso; os módulos e o dist/ são montados mesmo assim.
 * Códigos de saída: 0 ok; 4 dado pessoal encontrado em dist/.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gerarBundle } from './build-bundle.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(raiz, ...p);

export const SAL = 'lgh-avd-2026::';

export function hashCpf(cpfDigitos) {
  return crypto.createHash('sha256').update(SAL + cpfDigitos).digest('hex');
}

/** Faixa etária na data de referência. null quando não há nascimento válido. */
export function faixaEtaria(nascimento, referencia = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimento || '');
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let idade = referencia.getUTCFullYear() - ano;
  const antes = referencia.getUTCMonth() + 1 < mes || (referencia.getUTCMonth() + 1 === mes && referencia.getUTCDate() < dia);
  if (antes) idade--;
  if (idade < 0 || idade > 120) return null;
  if (idade <= 24) return 'até 24';
  if (idade <= 34) return '25 a 34';
  if (idade <= 44) return '35 a 44';
  if (idade <= 54) return '45 a 54';
  return '55 ou mais';
}

export function normalizarNome(n) {
  return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Listas explícitas: campo novo na base com CPF só chega à base pública se for incluído aqui de propósito. */
export const CAMPOS_VINCULO = ['regime', 'empresa', 'empresaOriginal', 'cargo', 'inicio', 'filial', 'codigo', 'chave'];
export const CAMPOS_PENDENCIA = ['codigo', 'detalhe'];

/** Textos livres (detalhe das pendências) citam CPF de outras pessoas: troca pelo id público, ou por marcador. */
export function mascarar(s, idPorRef = new Map()) {
  if (typeof s !== 'string') return s;
  return s.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, (c) => {
    const id = idPorRef.get(c) || idPorRef.get(c.replace(/\D/g, ''));
    return id ? `[pessoa ${id}]` : '[CPF omitido]';
  });
}

/** Converte a base com CPF (out/base.json) na base pública. */
export function baseParaPublico(b, referencia = new Date(), commit = 'desconhecido') {
  const idPorRef = new Map();
  let semCpf = 0;
  const pessoas = b.pessoas.map((p) => {
    const digitos = p.cpf ? String(p.cpf).replace(/\D/g, '') : '';
    let id; let cpfHash = null;
    if (digitos) { cpfHash = hashCpf(digitos); id = cpfHash.slice(0, 12); idPorRef.set(p.cpf, id); idPorRef.set(digitos, id); }
    else { id = 'sem-cpf-' + (++semCpf); if (p.idProvisorio) idPorRef.set(p.idProvisorio, id); }
    return {
      id, nome: p.nome, status: p.status, motivoStatus: p.motivoStatus ?? null, cpfHash,
      faixaEtaria: faixaEtaria(p.nascimento, referencia), nomesAlternativos: p.nomesAlternativos || [],
    };
  });
  const converter = (campos) => (item) => {
    const pessoaId = idPorRef.get(item.pessoaRef);
    if (!pessoaId) throw new Error('pessoaRef sem pessoa correspondente na base');
    const saida = { pessoaId };
    for (const k of campos) if (k in item) saida[k] = mascarar(item[k], idPorRef);
    return saida;
  };
  return {
    geradoEm: b.geradoEm || referencia.toISOString(),
    commit,
    pessoas,
    vinculos: b.vinculos.map(converter(CAMPOS_VINCULO)),
    pendencias: (b.pendencias || []).map(converter(CAMPOS_PENDENCIA)),
    equivalenciaEmpresas: b.equivalenciaEmpresas || {},
  };
}

/** Extrai do protótipo o que a Unidade Golden já tinha definido, por nome normalizado. */
export function extrairPilotoGolden(html) {
  const m = /const PESSOAS = (\[.*?\]);\r?\n/s.exec(html);
  if (!m) throw new Error('array PESSOAS não encontrado no protótipo');
  const lista = JSON.parse(m[1]);
  const saida = {};
  for (const p of lista) {
    saida[normalizarNome(p.nome)] = {
      nome: p.nome, setor: p.setor, equipe: p.equipe, lider: !!p.lider,
      avaliadores: [...(p.avaliadores || [])], funcao: p.funcao ?? p.cargo ?? null, situacao: p.situacao ?? 'Ativo',
    };
  }
  return saida;
}

/** Há sequência de 11 dígitos? São retirados antes da busca os identificadores públicos legítimos, que contêm runs de dígitos por acaso:
 *  tokens de 64 hexadecimais (cpfHash), "id"/"pessoaId" de 12 hexadecimais e o marcador "[pessoa <id>]".
 *  Um CPF de 11 dígitos nunca casa com essas exceções. Dígitos colados a letras (ex.: "CPF12345678901x") continuam sendo pegos. */
export function temSequenciaCpf(texto) {
  const limpo = texto
    .replace(/[0-9a-fA-F]{64}/g, '')
    .replace(/("(?:id|pessoaId)"\s*:\s*")[0-9a-f]{12}"/g, '$1"')
    .replace(/\[pessoa [0-9a-f]{12}\]/g, '[pessoa]');
  return /\d{11}/.test(limpo);
}

/** Varre dist/ atrás de CPF (11 dígitos ou formatado) e da chave "nascimento". Devolve a lista de achados. */
export function varrerVazamento(dir) {
  const achados = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { andar(f); continue; }
      const t = fs.readFileSync(f, 'utf8');
      if (temSequenciaCpf(t)) achados.push([f, 'sequência de 11 dígitos']);
      for (const c of t.matchAll(/\d{3}\.\d{3}\.\d{3}-\d{2}/g)) {
        if (c[0] !== '000.000.000-00') { achados.push([f, 'CPF formatado']); break; }
      }
      if (/"nascimento"/.test(t)) achados.push([f, 'chave "nascimento"']);
    }
  };
  if (fs.existsSync(dir)) andar(dir);
  return achados;
}

function copiarArvore(origem, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origem, { withFileTypes: true })) {
    const o = path.join(origem, e.name); const d = path.join(destino, e.name);
    if (e.isDirectory()) copiarArvore(o, d); else fs.copyFileSync(o, d);
  }
}

function principal() {
  // 1. módulos do Plano A, sem alteração, e o bundle do navegador
  gerarBundle();

  fs.mkdirSync(rel('app/data'), { recursive: true });

  // 2. base pública
  if (fs.existsSync(rel('out/base.json'))) {
    let commit = 'desconhecido';
    try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: raiz, encoding: 'utf8' }).trim(); } catch { /* fora do git */ }
    const publica = baseParaPublico(JSON.parse(fs.readFileSync(rel('out/base.json'), 'utf8')), new Date(), commit);
    fs.writeFileSync(rel('app/data/base.json'), JSON.stringify(publica));
    console.log(`app/data/base.json: ${publica.pessoas.length} pessoas, ${publica.vinculos.length} vínculos`);
  } else {
    console.warn('Aviso: out/base.json ausente, app/data/base.json não foi gerado (rode node src/cli/carga.js).');
  }

  // 3. piloto Golden
  if (fs.existsSync(rel('prototipo/index.html'))) {
    const piloto = extrairPilotoGolden(fs.readFileSync(rel('prototipo/index.html'), 'utf8'));
    fs.writeFileSync(rel('app/data/piloto-golden.json'), JSON.stringify(piloto));
    console.log(`app/data/piloto-golden.json: ${Object.keys(piloto).length} pessoas`);
  }

  // 4. dist/ e 5. varredura
  fs.rmSync(rel('dist'), { recursive: true, force: true });
  copiarArvore(rel('app'), rel('dist'));
  const achados = varrerVazamento(rel('dist'));
  if (achados.length) {
    fs.rmSync(rel('dist'), { recursive: true, force: true });
    for (const [f, motivo] of achados) console.error(`VAZAMENTO em ${path.relative(raiz, f)}: ${motivo}`);
    console.error('Build abortado: dist/ removido.');
    process.exit(4);
  }
  console.log('dist/ montado, sem dado pessoal.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
