/** Nome normalizado: sem acento, maiúsculas, espaços colapsados. Mesma regra do scripts/build-app.mjs, que gera as chaves do piloto. */
export function normalizarNome(n) {
  return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
