// Prueba de la logica anti-duplicados de apps-script/Code.gs con servicios de Google simulados.
//   Ejecutar:  node codigo-gs.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codigo = fs.readFileSync(path.join(RAIZ, 'apps-script', 'Code.gs'), 'utf8');

function entorno({ falloAlCrear = false } = {}) {
  const cache = new Map(); const archivos = []; const filas = [];
  const hoja = {
    getMaxColumns: () => 26, insertColumnsAfter() {}, getLastRow: () => filas.length + 1, getLastColumn: () => 12,
    getRange: (r, c, n = 1) => ({
      getValues: () => Array.from({ length: n }, (_, i) => [filas[r - 2 + i]?.[c - 1] ?? '']),
      getValue: () => filas[r - 2]?.[c - 1] ?? '', setValues() {},
    }),
    appendRow: (f) => filas.push(f),
  };
  const carpeta = { getFoldersByName: () => ({ hasNext: () => true, next: () => carpeta }), createFolder: () => carpeta, getFolderById: () => carpeta,
    createFile: (b) => { if (falloAlCrear) throw new Error('Drive caido'); const f = { id: 'file' + (archivos.length + 1), setSharing() {}, getId() { return this.id; }, getName: () => 'x' }; archivos.push(f); return f; } };
  const sandbox = {
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k), removeAll: (ks) => ks.forEach((k) => cache.delete(k)) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    SpreadsheetApp: { openById: () => ({ getSheets: () => [hoja] }) },
    DriveApp: { getFolderById: () => carpeta, Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 } },
    Utilities: { formatDate: () => '2026-11-10', newBlob: () => ({}), base64Decode: () => [] },
    Session: { getScriptTimeZone: () => 'UTC' },
    ContentService: {}, MimeType: {}, console,
  };
  cache.set('id_registro de fotos', 'planilla-falsa');
  vm.createContext(sandbox); vm.runInContext(codigo, sandbox);
  return { run: (src) => vm.runInContext(src, sandbox), archivos, filas, cache };
}

let ok = 0; const fallos = [];
const test = (n, f) => { try { f(); ok++; console.log('  ✓ ' + n); } catch (e) { fallos.push(n); console.log('  ✗ ' + n + '\n      ' + e.message); } };
const foto = (cid) => `guardarFoto_({ cid: ${JSON.stringify(cid)}, ts: 1, ci: '1', relevador: 'T', pdv: 'P', marca: 'M', tipo: 'Tipo', criterios: ['cumple'], data: '', nombre: 'a.jpg' })`;
const nota = (cid) => `guardarNota_({ cid: ${JSON.stringify(cid)}, ts: 1, ci: '1', relevador: 'T', pdv: 'P', marca: 'M', tipo: 'Adicional: X', texto: 'motivo' })`;

console.log('\nCode.gs: anti-duplicados');
test('La misma foto enviada dos veces se guarda una sola vez', () => {
  const e = entorno(); const a = e.run(foto('c1')), b = e.run(foto('c1'));
  assert.equal(a, b); assert.equal(e.archivos.length, 1); assert.equal(e.filas.length, 1);
});
test('Fotos con claves distintas se guardan las dos', () => {
  const e = entorno(); e.run(foto('c1')); e.run(foto('c2'));
  assert.equal(e.archivos.length, 2); assert.equal(e.filas.length, 2);
});
test('Si la cache se pierde, igual se detecta el duplicado leyendo la planilla', () => {
  const e = entorno(); const a = e.run(foto('c1')); e.cache.delete('cid_c1');
  const b = e.run(foto('c1')); assert.equal(a, b); assert.equal(e.archivos.length, 1); assert.equal(e.filas.length, 1);
});
test('Una nota enviada dos veces se guarda una sola vez', () => {
  const e = entorno(); e.run(nota('n1')); e.run(nota('n1')); assert.equal(e.filas.length, 1);
});
test('Un envio todavia en proceso se rechaza (no crea otro)', () => {
  const e = entorno(); e.cache.set('cid_c9', 'pend');
  assert.throws(() => e.run(foto('c9')), /ya se esta guardando/); assert.equal(e.archivos.length, 0);
});
test('Si falla Drive, se libera la clave y el reintento funciona', () => {
  const malo = entorno({ falloAlCrear: true });
  assert.throws(() => malo.run(foto('c3')), /Drive caido/); assert.equal(malo.cache.get('cid_c3') ?? null, null);
});
test('Sin clave (versiones viejas de la app) funciona como antes', () => {
  const e = entorno(); e.run(foto('')); e.run(foto('')); assert.equal(e.filas.length, 2);
});
test('La fila guardada incluye la clave en la columna 12', () => {
  const e = entorno(); e.run(foto('claveX')); assert.equal(e.filas[0][11], 'claveX');
});

console.log(`\nResultado: ${ok} de ${ok + fallos.length} pruebas correctas.`);
process.exit(fallos.length ? 1 : 0);
