import test from 'node:test';
import assert from 'node:assert/strict';
import { chaveEmpresa, cpfLimpo, dataISO, separarEmpresas } from '../src/carga/normalizar.js';

test('chaveEmpresa colapsa as 4 grafias da LSH', () => {
  const g = ['LSH BARRA EMPREENDIMENTOS IMOBILIARIOS S.A', 'LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS S.A',
             'LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS S.A.', 'LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS SA'];
  assert.equal(new Set(g.map(chaveEmpresa)).size, 1);
  assert.equal(chaveEmpresa(g[0]), 'LSH BARRA EMPREENDIMENTOS IMOBILIARIOS');
});

test('chaveEmpresa trata acento e LTDA', () => {
  assert.equal(chaveEmpresa('LAGHETTO HOTÉIS LTDA'), chaveEmpresa('LAGHETTO HOTEIS LTDA'));
  assert.equal(chaveEmpresa('LAGHETTO HOTÉIS LTDA FILIAL 21 - SÃO PAULO'), 'LAGHETTO HOTEIS FILIAL 21 SAO PAULO');
});

test('cpfLimpo aceita com e sem máscara, rejeita incompleto', () => {
  assert.equal(cpfLimpo('000.000.000-06'), '00000000006');
  assert.equal(cpfLimpo('00000000006'), '00000000006');
  assert.equal(cpfLimpo('1234'), null);
  assert.equal(cpfLimpo(null), null);
});

test('dataISO aceita os dois formatos', () => {
  assert.equal(dataISO('13/10/1994'), '1994-10-13');
  assert.equal(dataISO('2026-09-28 00:00:00'), '2026-09-28');
  assert.equal(dataISO(''), null);
});

test('separarEmpresas quebra a célula tripla da Gerente Fiscal', () => {
  const r = separarEmpresas('LSH BARRA EMPREENDIMENTOS IMOBILIÁRIOS SA, SIENA ADMINISTRAÇÃO E PARTICIPAÇÕES LTDA e LAGHETTO HOTEIS LTDA');
  assert.deepEqual(r, ['LSH BARRA EMPREENDIMENTOS IMOBILIARIOS', 'SIENA ADMINISTRACAO E PARTICIPACOES', 'LAGHETTO HOTEIS']);
});
