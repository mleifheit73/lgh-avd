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

/** Aceita DD/MM/YYYY e YYYY-MM-DD (com ou sem hora); devolve YYYY-MM-DD ou null. Valida o calendário. */
export function dataISO(texto) {
  if (texto == null) return null;
  const t = String(texto).trim();
  let a, m, d;
  let r = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (r) { d = +r[1]; m = +r[2]; a = +r[3]; }
  else {
    r = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!r) return null;
    a = +r[1]; m = +r[2]; d = +r[3];
  }
  if (m < 1 || m > 12 || d < 1) return null;
  const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();   // dia 0 do mês seguinte = último dia do mês
  if (d > diasNoMes) return null;
  const p = n => String(n).padStart(2, '0');
  return `${a}-${p(m)}-${p(d)}`;
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
