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
  assert.equal(c('sem_nascimento'), 20);     // 19 vazios na PJ + 1 inválido (O2/04/1974)
  assert.equal(c('sem_inicio'), 4);
  assert.equal(c('possivel_duplicado'), 1);  // Tiago Boemeke: CLT com CPF, PJ sem CPF
  assert.equal(c('cpf_repetido_na_pj'), 0);
  assert.equal(pendencias.length, 69);
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

// Correções da revisão final
const vazio = { grafiasOriginais: [], empresas: [], cargo: 'c', nascimento: '1990-01-01', inicio: '2020-01-01' };

test('I4: pessoa sem CPF com o mesmo nome de uma pessoa com CPF recebe pendência possivel_duplicado', () => {
  const clt = [{ regional: 'R1', filial: 'X', codigo: '1', chave: 'X|1', nome: 'TIAGO BOEMEKE DE OLIVEIRA', rg: null, cargoCod: '1', cargo: 'A', cpf: '11111111111', nascimento: '1990-01-01', admissao: '2020-01-01' }];
  const pj = [{ ...vazio, nome: 'Tiago Boemeke de Oliveira', cpf: null, empresas: ['E'], grafiasOriginais: ['E'] }];
  const { pessoas, pendencias } = consolidar(clt, pj, HOJE);
  assert.equal(pessoas.length, 2);   // sem CPF nunca funde
  const p = pendencias.find(x => x.codigo === 'possivel_duplicado');
  assert.ok(p);
  assert.match(p.pessoaRef, /^sem-cpf-/);
  assert.match(p.detalhe, /11111111111/);
});

test('I5: CPF repetido dentro da PJ gera cpf_repetido_na_pj, e não tambem_na_base_clt', () => {
  const pj = [{ ...vazio, nome: 'A', cpf: '22222222222', empresas: ['E'], grafiasOriginais: ['E'] },
              { ...vazio, nome: 'A', cpf: '22222222222', empresas: ['F'], grafiasOriginais: ['F'] }];
  const { pessoas, pendencias } = consolidar([], pj, HOJE);
  assert.equal(pessoas.length, 1);
  assert.equal(pendencias.filter(x => x.codigo === 'tambem_na_base_clt').length, 0);
  assert.equal(pendencias.filter(x => x.codigo === 'cpf_repetido_na_pj').length, 1);
});

test('I6: data ausente ou inválida gera pendência, nunca some em silêncio', () => {
  const pj = [{ ...vazio, nome: 'SEM NASC', cpf: '33333333333', nascimento: null, inicio: '2020-01-01', empresas: ['E'], grafiasOriginais: ['E'] },
              { ...vazio, nome: 'SEM INICIO', cpf: '44444444444', nascimento: '1990-01-01', inicio: null, empresas: ['E'], grafiasOriginais: ['E'] }];
  const { pendencias } = consolidar([], pj, HOJE);
  assert.equal(pendencias.filter(x => x.codigo === 'sem_nascimento').length, 1);
  assert.equal(pendencias.filter(x => x.codigo === 'sem_inicio').length, 1);
});

test('I7: contratação futura fica com status pendente, como o spec 4.3 manda', () => {
  const pj = [{ ...vazio, nome: 'FUTURA', cpf: '55555555555', inicio: '2027-01-15', empresas: ['E'], grafiasOriginais: ['E'] }];
  const { pessoas } = consolidar([], pj, HOJE);
  assert.equal(pessoas[0].status, 'pendente');
  assert.equal(pessoas[0].motivoStatus, 'inicio_futuro');
});

test('I8: empresa do vínculo é a chave normalizada nas duas bases, com a grafia original ao lado', () => {
  const clt = [{ regional: 'R1', filial: 'LAGHETTO HOTÉIS LTDA FILIAL 21 - SÃO PAULO', codigo: '1', chave: 'k', nome: 'N', rg: null, cargoCod: '1', cargo: 'A', cpf: '66666666666', nascimento: '1990-01-01', admissao: '2020-01-01' }];
  const pj = [{ ...vazio, nome: 'M', cpf: '77777777777', empresas: ['LAGHETTO HOTEIS FILIAL 21 SAO PAULO'], grafiasOriginais: ['LAGHETTO HOTEIS LTDA FILIAL 21 - SÃO PAULO'] }];
  const { vinculos } = consolidar(clt, pj, HOJE);
  assert.equal(vinculos[0].empresa, 'LAGHETTO HOTEIS FILIAL 21 SAO PAULO');
  assert.equal(vinculos[0].empresaOriginal, 'LAGHETTO HOTÉIS LTDA FILIAL 21 - SÃO PAULO');
  assert.equal(vinculos[1].empresa, vinculos[0].empresa);   // CLT e PJ casam pela chave
  assert.equal(vinculos[1].empresaOriginal, 'LAGHETTO HOTEIS LTDA FILIAL 21 - SÃO PAULO');
});
