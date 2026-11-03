import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCLT } from '../src/carga/clt.js';
import { parsePJ } from '../src/carga/pj.js';
import { consolidar } from '../src/carga/consolidar.js';

const lerData = n => fs.readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8');
const cltReal = () => ['R1', 'R2', 'R3'].flatMap(r => parseCLT(lerData(`clt/${r}.csv`), r).registros);
const pjReal = () => parsePJ(JSON.parse(lerData('pj/pj-2026.json')).linhas).registros;
const HOJE = { hoje: '2026-11-03' };

test('consolidar funde os 10 CPFs presentes nas duas bases em uma pessoa cada', () => {
  const { pessoas, vinculos, pendencias } = consolidar(cltReal(), pjReal(), HOJE);
  const dup = pendencias.filter(p => p.codigo === 'tambem_na_base_clt');
  assert.equal(dup.length, 10);
  for (const p of dup) {
    assert.equal(pessoas.filter(x => x.cpf === p.pessoaRef).length, 1);
    const v = vinculos.filter(x => x.pessoaRef === p.pessoaRef);
    assert.ok(v.some(x => x.regime === 'CLT') && v.some(x => x.regime === 'PJ'));
  }
});

test('consolidar: contagem de pendências bate com o levantamento', () => {
  const { pendencias } = consolidar(cltReal(), pjReal(), HOJE);
  const c = cod => pendencias.filter(p => p.codigo === cod).length;
  assert.equal(c('multiplas_empresas'), 12);
  assert.equal(c('sem_cpf'), 6);
  assert.equal(c('sem_cargo'), 7);
  assert.equal(c('sem_empresa'), 5);
  assert.equal(c('inicio_futuro'), 4);
  assert.equal(pendencias.length, 44);
});

test('consolidar: total de pessoas = CLT + PJ - duplicados', () => {
  const clt = cltReal();
  const { pessoas, vinculos } = consolidar(clt, pjReal(), HOJE);
  const pessoasClt = new Set(clt.map(r => r.cpf)).size;   // 1606: duas pessoas têm vínculo CLT em dois CNPJs (spec 4.2)
  assert.equal(pessoasClt, 1606);
  assert.equal(pessoas.length, pessoasClt + 226 - 10);   // 1822
  assert.equal(vinculos.filter(v => v.regime === 'CLT').length, 1608);
  const esperadoPJ = pjReal().reduce((s, r) => s + Math.max(1, r.empresas.length), 0);   // um vínculo por (pessoa, empresa); sem empresa conta um
  assert.equal(vinculos.filter(v => v.regime === 'PJ').length, esperadoPJ);
});

test('consolidar: vínculos PJ = um por (pessoa, empresa); pessoa sem empresa gera um vínculo sem empresa', () => {
  const { vinculos } = consolidar([], pjReal(), HOJE);
  const pj = vinculos.filter(v => v.regime === 'PJ');
  const porPessoa = {};
  pj.forEach(v => { porPessoa[v.pessoaRef] = (porPessoa[v.pessoaRef] || 0) + 1; });
  assert.equal(Object.keys(porPessoa).length, 226);
  assert.equal(Object.values(porPessoa).filter(n => n > 1).length, 12);
  assert.equal(pj.filter(v => v.empresa === null).length, 5);
});

test('consolidar normaliza CPF e prefere o nome da base CLT, guardando o outro', () => {
  const clt = [{ regional: 'R1', filial: 'X', codigo: '1', chave: 'X|1', nome: 'ADELIA GOMES MENESES', rg: null, cargoCod: '1', cargo: 'A', cpf: '00000000006', nascimento: '1986-08-15', admissao: '2020-01-01' }];
  const pj  = [{ nome: 'Adélia Gomes Meneses', cargo: 'B', cpf: '00000000006', nascimento: '1986-08-15', inicio: '2026-09-28', empresas: ['E'], grafiasOriginais: ['E'] }];
  const { pessoas, vinculos } = consolidar(clt, pj, HOJE);
  assert.equal(pessoas.length, 1);
  assert.equal(pessoas[0].nome, 'ADELIA GOMES MENESES');
  assert.deepEqual(pessoas[0].nomesAlternativos, ['Adélia Gomes Meneses']);
  assert.equal(vinculos.length, 2);
});

test('consolidar: pessoa sem CPF recebe idProvisorio e nunca é fundida', () => {
  const pj = [
    { nome: 'SEM CPF UM', cargo: null, cpf: null, nascimento: null, inicio: '2026-11-13', empresas: [], grafiasOriginais: [] },
    { nome: 'SEM CPF UM', cargo: null, cpf: null, nascimento: null, inicio: '2026-11-13', empresas: [], grafiasOriginais: [] },
  ];
  const { pessoas } = consolidar([], pj, HOJE);
  assert.equal(pessoas.length, 2);
  assert.equal(pessoas[0].cpf, null);
  assert.match(pessoas[0].idProvisorio, /^sem-cpf-\d+$/);
  assert.notEqual(pessoas[0].idProvisorio, pessoas[1].idProvisorio);
  assert.equal(pessoas[0].status, 'pendente');
});
