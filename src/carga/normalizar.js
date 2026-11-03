/**
 * Normalizadores puros. Nenhuma função lê disco nem toca tela.
 * Ver docs/spec/SPEC-00-FUNDACAO.md, seções 4.2 e 4.3.
 */

function semAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Chave única de empresa: maiúsculas, sem acento, sem sufixo societário, só [A-Z0-9& ]. */
export function chaveEmpresa(texto) {
  let k = semAcento(String(texto ?? '')).toUpperCase();
  k = k.replace(/\b(LTDA|S\s*\.?\s*A\s*\.?|EIRELI|ME)\b/g, ' ');
  k = k.replace(/[^A-Z0-9& ]/g, ' ');
  return k.replace(/\s+/g, ' ').trim();
}

/** Só dígitos; null se não tiver exatamente 11. */
export function cpfLimpo(texto) {
  if (texto == null) return null;
  const d = String(texto).replace(/\D/g, '');
  return d.length === 11 ? d : null;
}

/** Aceita DD/MM/YYYY e YYYY-MM-DD (com ou sem hora); devolve YYYY-MM-DD ou null. */
export function dataISO(texto) {
  if (texto == null) return null;
  const t = String(texto).trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Quebra uma célula com várias empresas (vírgula ou " e " antes de maiúscula) em chaves únicas. */
export function separarEmpresas(texto) {
  const partes = String(texto ?? '').split(/,| e (?=[A-ZÀ-Ü])/);
  const saida = [];
  for (const p of partes) {
    const k = chaveEmpresa(p);
    if (k && !saida.includes(k)) saida.push(k);
  }
  return saida;
}
