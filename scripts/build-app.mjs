/**
 * Build do artefato (Plano B).
 *  1. copia src/carga/*.js e src/modelo/atuacao.js para <app>/js/ (sem alteração) e gera <app>/js/lgh.bundle.js (build-bundle.mjs);
 *  2. gera <app>/data/base.json (base pública: sem CPF, sem hash de CPF, sem nascimento, sem idade) a partir de out/base.json;
 *  3. extrai <app>/data/piloto-golden.json do array PESSOAS de prototipo/index.html;
 *  4. monta <dist>/ como cópia de <app>/;
 *  5. varre <dist>/ atrás de dado pessoal. Achou: apaga <dist>/ e sai com código 4.
 *
 * Id público da pessoa (C1, revisão final do Plano B): os 12 primeiros hexadecimais de HMAC-SHA256(segredo, dígitos do CPF).
 * O segredo fica em data/segredo-ids.txt (hexadecimal, fora do git, junto dos outros arquivos de data/). Sem o arquivo, o build
 * cria um segredo novo e avisa: perder o arquivo muda todos os ids, e a montagem salva no banco deixa de casar com a base.
 * O hash de CPF NÃO vai para a base pública: com sal conhecido, o espaço de CPFs (cerca de 10^9) se percorre por força bruta.
 * Pessoa sem CPF recebe sem-cpf-N.
 *
 * Diretórios (padrão entre parênteses), para os testes nunca tocarem app/ nem dist/ reais:
 *   LGH_BUILD_APP (app/), LGH_BUILD_DIST (dist/), LGH_SEGREDO_IDS (data/segredo-ids.txt).
 *
 * Sem out/base.json (CI, sem dados reais) os passos 2 e 3 são pulados com aviso; os módulos e o dist/ são montados mesmo assim.
 * Códigos de saída: 0 ok; 4 dado pessoal encontrado em dist/; 5 segredo dos ids ilegível.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gerarBundle } from './build-bundle.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(raiz, ...p);

/** Id público: 12 primeiros hexadecimais de HMAC-SHA256(segredo, dígitos do CPF). segredo: hexadecimal de 64 caracteres. */
export function idPublico(segredoHex, cpfDigitos) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(segredoHex || ''))) throw new Error('segredo dos ids inválido: esperava 64 hexadecimais');
  return crypto.createHmac('sha256', Buffer.from(segredoHex, 'hex')).update(String(cpfDigitos)).digest('hex').slice(0, 12);
}

/**
 * Lê o segredo dos ids; sem o arquivo, cria um novo (crypto.randomBytes(32)) e avisa no stderr.
 * Devolve { segredo, criado }. Lança se o arquivo existe e não tem 64 hexadecimais.
 */
export function lerOuCriarSegredo(caminho) {
  if (fs.existsSync(caminho)) {
    const segredo = fs.readFileSync(caminho, 'utf8').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(segredo)) throw new Error(`${caminho} não contém 64 hexadecimais`);
    return { segredo, criado: false };
  }
  const segredo = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, segredo + '\n', { mode: 0o600 });
  console.error(`AVISO: ${caminho} não existia e foi criado com um segredo novo para os ids públicos das pessoas.\n` +
    '  Guarde este arquivo junto com data/ (fora do git, como os outros dados reais). Se ele se perder, todos os ids mudam\n' +
    '  e a montagem salva no banco do artefato deixa de casar com a base.');
  return { segredo, criado: true };
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

/** Converte a base com CPF (out/base.json) na base pública. segredo: hexadecimal de 64 caracteres (ver idPublico). */
export function baseParaPublico(b, referencia = new Date(), commit = 'desconhecido', segredo) {
  const idPorRef = new Map();
  let semCpf = 0;
  const vistos = new Set();
  const pessoas = b.pessoas.map((p) => {
    const digitos = p.cpf ? String(p.cpf).replace(/\D/g, '') : '';
    let id;
    if (digitos) {
      id = idPublico(segredo, digitos);
      if (vistos.has(id) && idPorRef.get(digitos) !== id) throw new Error('dois CPFs diferentes com o mesmo id público');
      vistos.add(id); idPorRef.set(p.cpf, id); idPorRef.set(digitos, id);
    }
    else { id = 'sem-cpf-' + (++semCpf); if (p.idProvisorio) idPorRef.set(p.idProvisorio, id); }
    return {
      id, nome: p.nome, status: p.status, motivoStatus: p.motivoStatus ?? null,
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
 *  tokens de 64 hexadecimais (a varredura acusa esses tokens à parte, ver varrerVazamento), "id"/"pessoaId" de 12 hexadecimais e
 *  o marcador "[pessoa <id>]". Um CPF de 11 dígitos nunca casa com essas exceções. Dígitos colados a letras
 *  (ex.: "CPF12345678901x") continuam sendo pegos. */
export function temSequenciaCpf(texto) {
  const limpo = texto
    .replace(/[0-9a-fA-F]{64}/g, '')
    .replace(/("(?:id|pessoaId)"\s*:\s*")[0-9a-f]{12}"/g, '$1"')
    .replace(/\[pessoa [0-9a-f]{12}\]/g, '[pessoa]');
  return /\d{11}/.test(limpo);
}

/** Linha da constante USUARIOS da v34 no index.html: a única que pode ter hash de CPF (login, fora do escopo do Plano B). */
const RE_USUARIOS = /^const USUARIOS = \[.*\];\r?$/m;

/** Token de 64 hexadecimais (formato de hash SHA-256) fora da exceção documentada: só a constante USUARIOS do index.html. */
export function temHash64(texto, arquivo) {
  const t = path.basename(arquivo || '') === 'index.html' ? texto.replace(RE_USUARIOS, '') : texto;
  return /[0-9a-fA-F]{64}/.test(t);
}

/** Varre dist/ atrás de CPF (11 dígitos ou formatado), de hash de 64 hexadecimais e da chave "nascimento". Devolve a lista de achados. */
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
      if (temHash64(t, f)) achados.push([f, 'token de 64 hexadecimais (hash)']);
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
  const dirApp = path.resolve(process.env.LGH_BUILD_APP || rel('app'));
  const dirDist = path.resolve(process.env.LGH_BUILD_DIST || rel('dist'));
  const caminhoSegredo = path.resolve(process.env.LGH_SEGREDO_IDS || rel('data/segredo-ids.txt'));
  const mostrar = (f) => path.relative(raiz, f) || f;

  // 1. módulos do Plano A, sem alteração, e o bundle do navegador
  gerarBundle(dirApp);

  fs.mkdirSync(path.join(dirApp, 'data'), { recursive: true });

  let commit = 'desconhecido';
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: raiz, encoding: 'utf8' }).trim(); } catch { /* fora do git */ }

  // 2. base pública
  if (fs.existsSync(rel('out/base.json'))) {
    let segredo;
    try { ({ segredo } = lerOuCriarSegredo(caminhoSegredo)); }
    catch (e) { console.error(`Build abortado: ${e.message}.`); process.exit(5); }
    const publica = baseParaPublico(JSON.parse(fs.readFileSync(rel('out/base.json'), 'utf8')), new Date(), commit, segredo);
    fs.writeFileSync(path.join(dirApp, 'data/base.json'), JSON.stringify(publica));
    console.log(`${mostrar(path.join(dirApp, 'data/base.json'))}: ${publica.pessoas.length} pessoas, ${publica.vinculos.length} vínculos`);
  } else {
    console.warn('Aviso: out/base.json ausente, data/base.json não foi gerado (rode node src/cli/carga.js).');
  }

  // 3. piloto Golden
  if (fs.existsSync(rel('prototipo/index.html'))) {
    const piloto = extrairPilotoGolden(fs.readFileSync(rel('prototipo/index.html'), 'utf8'));
    fs.writeFileSync(path.join(dirApp, 'data/piloto-golden.json'), JSON.stringify(piloto));
    console.log(`${mostrar(path.join(dirApp, 'data/piloto-golden.json'))}: ${Object.keys(piloto).length} pessoas`);
  }

  // 4. dist/ e 5. varredura
  fs.rmSync(dirDist, { recursive: true, force: true });
  copiarArvore(dirApp, dirDist);
  // 4b. selo de versão (bloco-versao): número de app/versao.json, commit curto e data do build
  {
    const arqVersao = path.join(dirApp, 'versao.json');
    const numero = fs.existsSync(arqVersao) ? JSON.parse(fs.readFileSync(arqVersao, 'utf8')).numero : null;
    const idx = path.join(dirDist, 'index.html');
    if (fs.existsSync(idx) && numero != null) {
      const html = fs.readFileSync(idx, 'utf8')
        .replace("'__VERSAO_NUMERO__'", JSON.stringify(String(numero)))
        .replace("'__VERSAO_COMMIT__'", JSON.stringify(String(commit || 'sem-git').slice(0, 7)))
        .replace("'__VERSAO_DATA__'", JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')));
      fs.writeFileSync(idx, html);
      console.log(`selo de versão: v${numero} · ${String(commit || 'sem-git').slice(0, 7)}`);
    }
  }
  const achados = varrerVazamento(dirDist);
  if (achados.length) {
    fs.rmSync(dirDist, { recursive: true, force: true });
    for (const [f, motivo] of achados) console.error(`VAZAMENTO em ${mostrar(f)}: ${motivo}`);
    console.error(`Build abortado: ${mostrar(dirDist)} removido.`);
    process.exit(4);
  }
  console.log(`${mostrar(dirDist)} montado, sem dado pessoal.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
