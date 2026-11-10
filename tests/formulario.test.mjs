// Pruebas automaticas del formulario (index.html) y un recorrido del tablero (tablero.html).
// Usan Chrome real, camara simulada y un Apps Script simulado: NO tocan Drive ni los datos reales.
//   Ejecutar:  cd tests && npm install && npm test
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.error('No encuentro Chrome ni Edge. Define CHROME_PATH.'); process.exit(2); }

// ───────── servidor estatico del sitio ─────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const servidor = http.createServer((req, res) => {
  const ruta = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
  if (!ruta.startsWith(RAIZ) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(ruta)] || 'application/octet-stream' });
  fs.createReadStream(ruta).pipe(res);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

// ───────── datos simulados ─────────
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDVS = [
  { nombre: 'PDV Uno', cadena: 'BIGGIE', ciudad: 'ASUNCIÓN', esperados: [{ m: 'Bauducco', t: 'Exhibidor', n: 1 }, { m: 'Bauducco', t: 'Puntera', n: 1 }, { m: 'Halls', t: 'Exhibidor', n: 1 }] },
  { nombre: 'PDV Dos', cadena: 'REAL', ciudad: 'LUQUE' },
];
const PLANOS = [
  { id: 'p1', pdv: '*', marca: 'Bauducco', tipo: 'Exhibidor', nombre: 'a.jpg', url: PX },
  { id: 'p2', pdv: '*', marca: 'Bauducco', tipo: 'Exhibidor', nombre: 'b.jpg', url: PX },
  { id: 'p3', pdv: '*', marca: 'Bauducco', tipo: 'Puntera', nombre: 'c.jpg', url: PX },
];
const OK_TODO = ['presente_si', 'abast_completo', 'visib_total', 'estado_bueno'];

function crearSrv(o = {}) { return { posts: [], retardo: 0, falla1: false, yaFallo: false, planos: PLANOS, pdvs: PDVS, fotos: [], notas: [], ...o }; }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(fn, ms = 6000, msg = 'condicion') {
  const fin = Date.now() + ms; let ult;
  while (Date.now() < fin) { try { ult = await fn(); if (ult) return ult; } catch (e) { ult = e; } await dormir(60); }
  throw new Error('Tiempo agotado esperando: ' + msg + (ult instanceof Error ? ' (' + ult.message + ')' : ''));
}

// ───────── navegador ─────────
const navegador = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

async function nuevo(opts = {}) {
  const ancho = opts.ancho || 420;
  const srv = crearSrv(opts.srv);
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 860 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('dialog', (d) => d.accept());
  const json = (route, o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  await page.route('https://script.google.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, { ok: true, planos: srv.planos });
    const b = JSON.parse(req.postData() || '{}'); srv.posts.push(b);
    if (srv.retardo) await dormir(srv.retardo);
    if (b.action === 'login') { return b.ci === '1111111' ? json(route, { ok: true, nombre: 'Tester', pdvs: srv.pdvs }) : json(route, { ok: false, error: 'CI no registrado' }); }
    if (srv.falla1 && !srv.yaFallo && b.action === 'foto') { srv.yaFallo = true; return json(route, { ok: false, error: 'Error del servidor' }); }
    if (b.action === 'foto') return json(route, { ok: true, id: 'f' + srv.posts.length });
    if (b.action === 'nota') return json(route, { ok: true });
    if (b.action === 'pin') return json(route, { ok: b.pin === '0000' || b.pin === 'x' ? true : false, error: 'Clave incorrecta' });
    if (b.action === 'pdvs') return json(route, { ok: true, pdvs: srv.pdvs });
    if (b.action === 'fotos') return json(route, { ok: true, fotos: srv.fotos, notas: srv.notas });
    return json(route, { ok: true });
  });
  return { page, srv, ctx, errores, cerrar: () => ctx.close() };
}

// ───────── acciones del formulario ─────────
async function entrar(page, ci = '1111111') {
  await page.goto(BASE + '/index.html');
  await page.fill('#ci', ci); await page.click('#seguir');
  await page.click('#si'); await page.waitForSelector('.pdv-item');
}
async function irA(page, pdv, marca, tipoId) {
  await page.click(`.pdv-item[data-n="${pdv}"]`);
  await page.click(`.marca-b[data-m="${marca}"]`);
  if (tipoId) await page.click(`.tile[data-t="${tipoId}"]`);
}
async function pasarReferencia(page) {
  await page.waitForSelector('.modal [data-go]');
  while (await page.$('.modal [data-go][disabled]')) await page.click('.modal .arrow.r');
  await page.click('.modal [data-go]');
  await page.waitForSelector('.cam video');
  await esperar(() => page.evaluate(() => document.querySelector('.cam video')?.videoWidth > 0), 8000, 'video de la camara');
}
async function disparar(page, n = 1) {
  for (let i = 0; i < n; i++) { const antes = await page.textContent('[data-count]'); await page.click('[data-disp]'); await esperar(async () => (await page.textContent('[data-count]')) !== antes || (await page.$('.toast'))); await dormir(120); }
}
async function responder(page, ids) { for (const id of ids) await page.click(`[data-c="${id}"]`); }
async function relevar(page, { tipoId, ids = OK_TODO, fotos = 2 } = {}) {
  await page.click(`.tile[data-t="${tipoId}"]`);
  await pasarReferencia(page);
  await disparar(page, fotos);
  await page.click('[data-listo]');
  await responder(page, ids);
}
const posts = (srv, accion) => srv.posts.filter((p) => p.action === accion);
const texto = (page, sel) => page.textContent(sel);
const clases = (page, sel) => page.$$eval(sel, (els) => els.map((e) => ({ t: e.textContent.trim(), c: e.className, d: e.dataset.m || e.dataset.t || '' })));

// ───────── marco de pruebas ─────────
const casos = []; const test = (nombre, fn) => casos.push({ nombre, fn });
const grupo = (nombre) => casos.push({ grupo: nombre });

grupo('Ingreso y puntos de venta');
test('CI no registrado muestra el mensaje y no avanza', async () => {
  const t = await nuevo(); try {
    await t.page.goto(BASE + '/index.html'); await t.page.fill('#ci', '9999999'); await t.page.click('#seguir');
    await esperar(async () => /Cédula no encontrada/.test(await texto(t.page, '#hint')), 5000, 'mensaje de error');
    assert.equal(await t.page.$('#si'), null);
  } finally { await t.cerrar(); }
});
test('CI valido pide confirmar el nombre; "No soy yo" vuelve al ingreso', async () => {
  const t = await nuevo(); try {
    await t.page.goto(BASE + '/index.html'); await t.page.fill('#ci', '1111111'); await t.page.click('#seguir');
    await t.page.waitForSelector('.hola');
    assert.match(await texto(t.page, '.hola'), /Tester/);
    await t.page.click('#no'); await t.page.waitForSelector('#seguir');
  } finally { await t.cerrar(); }
});
test('Muestra solo los puntos de venta del relevador y se pueden buscar', async () => {
  const t = await nuevo(); try {
    await entrar(t.page);
    assert.equal((await t.page.$$('.pdv-item')).length, 2);
    await t.page.fill('#q', 'dos');
    await esperar(async () => (await t.page.$$('.pdv-item')).length === 1, 3000, 'filtro');
    assert.equal(await t.page.getAttribute('.pdv-item', 'data-n'), 'PDV Dos');
  } finally { await t.cerrar(); }
});
test('La sesion se conserva al recargar la pagina', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await t.page.reload();
    await t.page.waitForSelector('.pdv-item', { timeout: 8000 });
  } finally { await t.cerrar(); }
});

grupo('Marcas y espacios segun la lista del punto de venta');
test('Marcas del punto: en verde y primero; las demas despues', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await t.page.click('.pdv-item[data-n="PDV Uno"]'); await t.page.waitForSelector('.marca-b');
    const m = await clases(t.page, '.marca-b');
    assert.deepEqual(m.slice(0, 2).map((x) => x.d).sort(), ['Bauducco', 'Halls']);
    assert.ok(m.slice(0, 2).every((x) => /asignada/.test(x.c)), 'las dos primeras estan en verde');
    assert.equal(m.filter((x) => /asignada/.test(x.c)).length, 2);
    assert.equal(m.length, 18, 'son 18 marcas');
    assert.ok(m.some((x) => x.d === 'Multimarcas'));
  } finally { await t.cerrar(); }
});
test('Punto sin lista: ninguna marca ni espacio queda opaco o pintado', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await t.page.click('.pdv-item[data-n="PDV Dos"]'); await t.page.waitForSelector('.marca-b');
    assert.equal((await t.page.$$('.marca-b.asignada')).length, 0);
    await t.page.click('.marca-b[data-m="Bauducco"]'); await t.page.waitForSelector('.tile');
    assert.equal((await t.page.$$('.tile.fuera')).length, 0);
    assert.equal((await t.page.$$('.tile')).length, 12);
  } finally { await t.cerrar(); }
});
test('Espacios: los del punto primero, el resto opaco con la etiqueta', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Bauducco'); await t.page.waitForSelector('.tile');
    const ti = await clases(t.page, '.tile');
    assert.equal(ti.length, 12);
    assert.deepEqual(ti.slice(0, 2).map((x) => x.d).sort(), ['exhibidor', 'puntera']);
    assert.equal(ti.filter((x) => /fuera/.test(x.c)).length, 10);
    assert.ok(ti.slice(0, 2).every((x) => !/fuera/.test(x.c)));
    // Halls solo tiene Exhibidor
    await t.page.click('#atras'); await t.page.click('.marca-b[data-m="Halls"]'); await t.page.waitForSelector('.tile');
    const h = await clases(t.page, '.tile');
    assert.equal(h[0].d, 'exhibidor'); assert.equal(h.filter((x) => !/fuera/.test(x.c)).length, 1);
    // Una marca que el punto no tiene: todo opaco
    await t.page.click('#atras'); await t.page.click('.marca-b[data-m="Fini"]'); await t.page.waitForSelector('.tile');
    assert.equal((await t.page.$$('.tile.fuera')).length, 12);
  } finally { await t.cerrar(); }
});
test('Espacio fuera de la lista: exige justificar (minimo 5 letras) y se puede cancelar', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Bauducco', 'isla');
    await t.page.waitForSelector('.modal');
    assert.match(await texto(t.page, '.modal h2'), /no forma parte de la lista/);
    assert.ok(await t.page.isDisabled('[data-ok]'));
    await t.page.fill('#xtxt', 'abc'); assert.ok(await t.page.isDisabled('[data-ok]'));
    await t.page.click('[data-no]'); assert.equal(await t.page.$('.modal'), null);
    await t.page.click('.tile[data-t="isla"]'); await t.page.fill('#xtxt', 'Hay una isla nueva'); assert.ok(!(await t.page.isDisabled('[data-ok]')));
    await t.page.click('[data-ok]'); await t.page.waitForSelector('.modal [data-go]');
    assert.match(await texto(t.page, '.modal h2'), /Planograma de Referencia/);
  } finally { await t.cerrar(); }
});
test('Doble toque en un espacio abre una sola ventana', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Bauducco');
    await t.page.dblclick('.tile[data-t="exhibidor"]');
    await t.page.waitForSelector('.modal'); await dormir(400);
    assert.equal((await t.page.$$('.modal')).length, 1);
  } finally { await t.cerrar(); }
});
test('Doble toque en un espacio fuera de la lista abre una sola ventana', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Bauducco');
    await t.page.dblclick('.tile[data-t="isla"]'); await t.page.waitForSelector('.modal'); await dormir(300);
    assert.equal((await t.page.$$('.modal')).length, 1);
  } finally { await t.cerrar(); }
});

grupo('Planograma de referencia');
test('Con varias imagenes hay que verlas todas antes de abrir la camara', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Bauducco', 'exhibidor');
    await t.page.waitForSelector('.modal [data-go]');
    assert.ok(await t.page.isDisabled('[data-go]'));
    assert.match(await texto(t.page, '.modal .hint'), /Mira las 2 imágenes/);
    await t.page.click('.modal .arrow.r'); assert.ok(!(await t.page.isDisabled('[data-go]')));
  } finally { await t.cerrar(); }
});
test('Sin planograma muestra el aviso y deja continuar', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor');
    await t.page.waitForSelector('.modal');
    assert.match(await texto(t.page, '.modal'), /Todavía no hay planograma/);
    assert.ok(!(await t.page.isDisabled('[data-go]')));
  } finally { await t.cerrar(); }
});

grupo('Camara');
test('Contador de fotos visible y actualizado en cada toma; maximo 2', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor'); await pasarReferencia(t.page);
    assert.equal(await texto(t.page, '[data-count]'), 'Fotos 0/2');
    await t.page.click('[data-disp]'); await esperar(async () => (await texto(t.page, '[data-count]')) === 'Fotos 1/2', 4000, '1/2');
    assert.match(await texto(t.page, '.toast'), /Foto 1\/2 tomada/);
    assert.match(await texto(t.page, '[data-listo]'), /Listo · 1\/2/);
    await dormir(200); await t.page.click('[data-disp]'); await esperar(async () => (await texto(t.page, '[data-count]')) === 'Fotos 2/2', 4000, '2/2');
    await dormir(200); await t.page.click('[data-disp]');
    await esperar(async () => /Máximo 2 fotos/.test(await texto(t.page, '.toast')), 3000, 'aviso de maximo');
    assert.equal(await texto(t.page, '[data-count]'), 'Fotos 2/2');
  } finally { await t.cerrar(); }
});
test('Zoom: control visible, botones y deslizador cambian el valor', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor'); await pasarReferencia(t.page);
    await t.page.waitForSelector('[data-zoom]:not(.hide)');
    const v0 = await texto(t.page, '[data-zv]');
    await t.page.click('[data-zp]'); const v1 = await texto(t.page, '[data-zv]'); assert.notEqual(v1, v0);
    await t.page.click('[data-zm]'); assert.equal(await texto(t.page, '[data-zv]'), v0);
    await t.page.$eval('[data-zr]', (r) => { r.value = 3; r.dispatchEvent(new Event('input')); });
    assert.match(await texto(t.page, '[data-zv]'), /^3/);
    await disparar(t.page, 1); assert.equal(await texto(t.page, '[data-count]'), 'Fotos 1/2');   // se puede fotografiar con zoom
  } finally { await t.cerrar(); }
});
test('Doble toque en "Entendido, abrir camara" abre una sola camara', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor');
    await t.page.waitForSelector('.modal [data-go]'); await t.page.dblclick('.modal [data-go]');
    await t.page.waitForSelector('.cam'); await dormir(400);
    assert.equal((await t.page.$$('.cam')).length, 1);
  } finally { await t.cerrar(); }
});
test('Cerrar la camara con fotos pide confirmacion y descarta', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor'); await pasarReferencia(t.page);
    await disparar(t.page, 1); await t.page.click('[data-cerrar]');
    await t.page.waitForSelector('.tile'); assert.equal(await t.page.$('.cam'), null);
    assert.equal(await t.page.$('.tile .hecho'), null);
  } finally { await t.cerrar(); }
});

grupo('Preguntas y resultado');
test('"Que ocupa el espacio" aparece solo si la marca no esta; Guardar exige todo respondido', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor'); await pasarReferencia(t.page); await disparar(t.page, 1); await t.page.click('[data-listo]');
    assert.ok(await t.page.isDisabled('#guardar'));
    await t.page.click('[data-c="presente_si"]'); assert.equal(await t.page.$('[data-c="ocupa_vacio"]'), null);
    await t.page.click('[data-c="presente_no"]'); await t.page.waitForSelector('[data-c="ocupa_vacio"]');
    assert.equal((await t.page.$$('[data-c^="ocupa_"]')).length, 5);
    await responder(t.page, ['ocupa_vacio', 'abast_sin', 'visib_obstruido', 'estado_roto']); assert.ok(!(await t.page.isDisabled('#guardar')));
    await t.page.click('[data-c="presente_si"]'); assert.equal(await t.page.$('[data-c="ocupa_vacio"]'), null);   // al volver a Si se descarta
    await responder(t.page, ['abast_completo', 'visib_total', 'estado_bueno']); assert.ok(!(await t.page.isDisabled('#guardar')));
  } finally { await t.cerrar(); }
});
test('Una sola opcion por pregunta', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor'); await pasarReferencia(t.page); await disparar(t.page, 1); await t.page.click('[data-listo]');
    await t.page.click('[data-c="abast_completo"]'); await t.page.click('[data-c="abast_bajo"]');
    assert.equal((await t.page.$$('[data-c^="abast_"].on')).length, 1);
    assert.ok(await t.page.$('[data-c="abast_bajo"].on'));
  } finally { await t.cerrar(); }
});
test('Quitar fotos: con una menos se puede seguir; sin fotos vuelve a los espacios', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls', 'exhibidor'); await pasarReferencia(t.page); await disparar(t.page, 2); await t.page.click('[data-listo]');
    assert.equal((await t.page.$$('.thumbs .foto')).length, 2);
    await t.page.click('[data-del="0"]'); assert.equal((await t.page.$$('.thumbs .foto')).length, 1);
    await t.page.click('[data-del="0"]'); await t.page.waitForSelector('.tile');
  } finally { await t.cerrar(); }
});

grupo('Guardado y envio');
test('Guarda 2 fotos con sus respuestas y marca el espacio como relevado', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls');
    await relevar(t.page, { tipoId: 'exhibidor' }); await t.page.click('#guardar');
    await t.page.waitForSelector('.tile .hecho');
    await esperar(() => posts(t.srv, 'foto').length === 2, 6000, '2 fotos subidas');
    const f = posts(t.srv, 'foto');
    for (const p of f) {
      assert.equal(p.pdv, 'PDV Uno'); assert.equal(p.marca, 'Halls'); assert.equal(p.tipo, 'Exhibidor'); assert.equal(p.ci, '1111111'); assert.equal(p.relevador, 'Tester');
      assert.ok(p.cid && p.cid.length > 5, 'trae clave anti-duplicados'); assert.ok(p.data && p.data.length > 1000, 'trae la imagen');
      assert.ok(p.criterios.includes('cumple') && OK_TODO.every((c) => p.criterios.includes(c)));
    }
    assert.notEqual(f[0].cid, f[1].cid, 'cada foto tiene su propia clave');
  } finally { await t.cerrar(); }
});
test('Resultado "No cumple" cuando alguna respuesta no es favorable', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls');
    await relevar(t.page, { tipoId: 'exhibidor', ids: ['presente_no', 'ocupa_propia', 'abast_bajo', 'visib_parcial', 'estado_sucio'], fotos: 1 }); await t.page.click('#guardar');
    await esperar(() => posts(t.srv, 'foto').length === 1, 6000, 'foto subida');
    const c = posts(t.srv, 'foto')[0].criterios; assert.ok(c.includes('no_cumple') && !c.includes('cumple'));
  } finally { await t.cerrar(); }
});
test('La foto de la camara sale ya reducida (no mas de 1600 px)', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls'); await relevar(t.page, { tipoId: 'exhibidor', fotos: 1 }); await t.page.click('#guardar');
    await esperar(() => posts(t.srv, 'foto').length === 1, 6000, 'foto subida');
    const dim = await t.page.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/jpeg;base64,' + b64; await im.decode(); return [im.width, im.height]; }, posts(t.srv, 'foto')[0].data);
    assert.ok(Math.max(...dim) <= 1600, 'dimensiones ' + dim);
  } finally { await t.cerrar(); }
});
test('RAPIDEZ: con el servidor lento (4 s) la pantalla avanza igual al instante', async () => {
  const t = await nuevo({ srv: { retardo: 4000 } }); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls'); await relevar(t.page, { tipoId: 'exhibidor' });
    const t0 = Date.now(); await t.page.click('#guardar'); await t.page.waitForSelector('.tile .hecho', { timeout: 3000 });
    const ms = Date.now() - t0; assert.ok(ms < 2000, `tardo ${ms} ms en volver a los espacios`);
  } finally { await t.cerrar(); }
});
test('DOBLE ENVIO: tocar "Guardar" muchas veces seguidas sube cada foto una sola vez', async () => {
  const t = await nuevo({ srv: { retardo: 1500 } }); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls'); await relevar(t.page, { tipoId: 'exhibidor' });
    await t.page.evaluate(() => { const b = document.getElementById('guardar'); for (let i = 0; i < 8; i++) b.click(); });
    await t.page.waitForSelector('.tile .hecho');
    await esperar(() => posts(t.srv, 'foto').length >= 2, 9000, 'subida');
    await dormir(2500);
    assert.equal(posts(t.srv, 'foto').length, 2, 'se enviaron ' + posts(t.srv, 'foto').length + ' fotos');
    assert.equal(new Set(posts(t.srv, 'foto').map((p) => p.cid)).size, 2);
  } finally { await t.cerrar(); }
});
test('REINTENTO: si el servidor falla una vez, el reintento usa la misma clave (no duplica)', async () => {
  const t = await nuevo({ srv: { falla1: true } }); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls'); await relevar(t.page, { tipoId: 'exhibidor', fotos: 1 }); await t.page.click('#guardar');
    await esperar(() => posts(t.srv, 'foto').length === 2, 8000, 'intento + reintento');
    const [a, b] = posts(t.srv, 'foto'); assert.equal(a.cid, b.cid);
    await dormir(800); assert.equal(posts(t.srv, 'foto').length, 2, 'no se reenvia otra vez');
  } finally { await t.cerrar(); }
});
test('SIN SENAL: guarda en el telefono y sube solo al volver la conexion, sin duplicar', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls'); await relevar(t.page, { tipoId: 'exhibidor' });
    await t.ctx.setOffline(true); await t.page.click('#guardar'); await t.page.waitForSelector('.tile .hecho');
    assert.match(await texto(t.page, '.toast'), /cuando haya señal/);
    await dormir(500); assert.equal(posts(t.srv, 'foto').length, 0);
    await esperar(async () => /2 fotos por subir/.test(await texto(t.page, '#sync')), 3000, 'indicador de pendientes');
    await t.ctx.setOffline(false);
    await esperar(() => posts(t.srv, 'foto').length === 2, 10000, 'subida al volver la senal');
    await esperar(async () => (await texto(t.page, '#sync')).trim() === '', 5000, 'cola vacia');
    await dormir(800); assert.equal(posts(t.srv, 'foto').length, 2);
  } finally { await t.cerrar(); }
});

grupo('Finalizar visita y justificaciones');
test('Finalizar con espacios esperados sin relevar pide justificacion y la envia', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Bauducco');
    await relevar(t.page, { tipoId: 'exhibidor', fotos: 1 }); await t.page.click('#guardar'); await t.page.waitForSelector('.tile .hecho');
    await t.page.click('#fin'); await t.page.waitForSelector('.modal');
    assert.match(await texto(t.page, '.modal h2'), /no se encontró el espacio/);
    assert.match(await texto(t.page, '.modal .sub'), /Bauducco.*Puntera/);
    assert.ok(await t.page.isDisabled('[data-ok]'));
    await t.page.fill('#mtxt', 'abcd'); assert.ok(await t.page.isDisabled('[data-ok]'));
    await t.page.fill('#mtxt', 'No hay puntera en el local'); await t.page.click('[data-ok]');
    await t.page.waitForSelector('.pdv-item');
    await esperar(() => posts(t.srv, 'nota').length === 1, 6000, 'nota enviada');
    const n = posts(t.srv, 'nota')[0]; assert.equal(n.tipo, 'Sin relevar: Puntera'); assert.equal(n.texto, 'No hay puntera en el local'); assert.equal(n.marca, 'Bauducco'); assert.ok(n.cid);
  } finally { await t.cerrar(); }
});
test('Finalizar con todo lo esperado relevado no pide justificacion', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Halls'); await relevar(t.page, { tipoId: 'exhibidor', fotos: 1 }); await t.page.click('#guardar'); await t.page.waitForSelector('.tile .hecho');
    await t.page.click('#fin'); await t.page.waitForSelector('.pdv-item'); assert.equal(await t.page.$('.modal'), null);
    assert.equal(posts(t.srv, 'nota').length, 0);
  } finally { await t.cerrar(); }
});
test('Espacio fuera de la lista: se relevan las fotos y se envia la justificacion como "Adicional"', async () => {
  const t = await nuevo(); try {
    await entrar(t.page); await irA(t.page, 'PDV Uno', 'Bauducco', 'isla');
    await t.page.fill('#xtxt', 'Hay una isla que no figuraba'); await t.page.click('[data-ok]');
    await pasarReferencia(t.page); await disparar(t.page, 1); await t.page.click('[data-listo]'); await responder(t.page, OK_TODO); await t.page.click('#guardar');
    await esperar(() => posts(t.srv, 'foto').length === 1 && posts(t.srv, 'nota').length === 1, 8000, 'foto y nota');
    const n = posts(t.srv, 'nota')[0]; assert.equal(n.tipo, 'Adicional: Isla'); assert.equal(n.texto, 'Hay una isla que no figuraba');
    assert.equal(posts(t.srv, 'foto')[0].tipo, 'Isla');
  } finally { await t.cerrar(); }
});

grupo('Tablero del cliente (recorrido basico)');
const ts0 = Date.parse('2026-11-10T15:06:00');
const FOTOS_TAB = [
  { id: 'a1', ts: ts0, pdv: 'PDV Uno', marca: 'Bauducco', tipo: 'Puntera', relevador: 'Secreto', criterios: ['presente_si', 'abast_completo', 'visib_total', 'estado_bueno', 'cumple'], url: PX, thumb: PX },
  { id: 'a2', ts: ts0 + 2000, pdv: 'PDV Uno', marca: 'Bauducco', tipo: 'Puntera', relevador: 'Secreto', criterios: ['presente_si', 'abast_completo', 'visib_total', 'estado_bueno', 'cumple'], url: PX, thumb: PX },
  { id: 'b1', ts: ts0 + 60000, pdv: 'PDV Dos', marca: 'Halls', tipo: 'Exhibidor', relevador: 'Secreto', criterios: ['presente_no', 'ocupa_vacio', 'abast_sin', 'visib_obstruido', 'estado_roto', 'no_cumple'], url: PX, thumb: PX },
];
const NOTAS_TAB = [
  { ts: ts0 + 1000, relevador: 'Secreto', pdv: 'PDV Uno', marca: 'Bauducco', tipo: 'Sin relevar: Exhibidor', texto: 'Motivo uno de prueba' },
  { ts: ts0 + 3000, relevador: 'Secreto', pdv: 'PDV Uno', marca: 'Bauducco', tipo: 'Adicional: Isla', texto: 'Isla adicional de prueba' },
];
async function tablero(t) {
  await t.page.goto(BASE + '/tablero.html');
  await t.page.waitForSelector('#pin'); await t.page.fill('#pin', '0000'); await t.page.click('#ok');
  await t.page.waitForSelector('.side', { timeout: 10000 });
}
test('Tablero: ingreso con clave, resumen con indicadores y sin nombres de relevador', async () => {
  const t = await nuevo({ srv: { fotos: FOTOS_TAB, notas: NOTAS_TAB } }); try {
    await tablero(t);
    const cuerpo = await texto(t.page, 'body');
    for (const s of ['Total de puntos de venta', 'Puntos de venta relevados', 'Espacios relevados', 'Respuestas favorables', 'Marcas con más relevamientos', 'Estado por cadena', 'Espacios no encontrados', 'Espacios fuera de la lista']) assert.ok(cuerpo.includes(s), 'falta: ' + s);
    assert.ok(!cuerpo.includes('Secreto'), 'no debe verse el nombre del relevador');
    assert.ok(!/Exportar/.test(cuerpo), 'no hay boton de exportar');
    assert.ok(!/Cumplimiento de rutas/.test(cuerpo));
    assert.match(cuerpo, /Motivo uno de prueba/); assert.match(cuerpo, /Isla adicional de prueba/);
  } finally { await t.cerrar(); }
});
test('Tablero: las 2 fotos de un relevamiento forman una sola tarjeta con etiqueta "2 fotos"', async () => {
  const t = await nuevo({ srv: { fotos: FOTOS_TAB, notas: NOTAS_TAB } }); try {
    await tablero(t); await t.page.click('.nav-b[data-v="ev"]');
    await t.page.waitForSelector('.g-item');
    assert.equal((await t.page.$$('.g-item')).length, 2, 'son 2 relevamientos (3 fotos)');
    assert.equal((await t.page.$$('.g-item .n-fotos')).length, 1);
    assert.match(await texto(t.page, '.n-fotos'), /2 fotos/);
  } finally { await t.cerrar(); }
});
test('Tablero: tarjetas del resumen llevan a Espacios, Detalle y Evaluacion; flechas vuelven y avanzan', async () => {
  const t = await nuevo({ srv: { fotos: FOTOS_TAB, notas: NOTAS_TAB } }); try {
    await tablero(t);
    await t.page.click('button.k-link[data-v="esp"]'); await esperar(async () => /Espacios/.test(await texto(t.page, '.crumb b')), 3000, 'vista Espacios');
    await t.page.click('#h-atras'); await esperar(async () => /Resumen/.test(await texto(t.page, '.crumb b')), 3000, 'volver a Resumen');
    await t.page.click('#h-adel'); await esperar(async () => /Espacios/.test(await texto(t.page, '.crumb b')), 3000, 'avanzar');
    await t.page.click('.nav-b[data-v="resumen"]'); await t.page.click('button.k-link[data-v="eval"]');
    await esperar(async () => /Evaluación/.test(await texto(t.page, '.crumb b')), 3000, 'vista Evaluacion');
    const cuerpo = await texto(t.page, 'body'); assert.ok(cuerpo.includes('Favorable') && cuerpo.includes('No favorable'));
    await t.page.click('.nav-b[data-v="resumen"]'); await t.page.click('button.k-link[data-v="det"]');
    await esperar(async () => /Detalle/.test(await texto(t.page, '.crumb b')), 3000, 'vista Detalle');
  } finally { await t.cerrar(); }
});
test('Tablero: el menu lateral conserva su estilo (regresion de la clase nav-b)', async () => {
  const t = await nuevo({ ancho: 1280, srv: { fotos: FOTOS_TAB } }); try {
    await tablero(t);
    const caja = await t.page.$eval('.side .nav-b[data-v="eval"]', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, fondo: getComputedStyle(e).backgroundColor }; });
    assert.ok(caja.w > 150 && caja.h < 60, `boton del menu de ${caja.w}x${caja.h}`);
    assert.notEqual(caja.fondo, 'rgb(255, 255, 255)', 'el boton del menu no debe ser blanco');
  } finally { await t.cerrar(); }
});

// ───────── ejecucion ─────────
let ok = 0, fallos = [];
console.log(`\nSitio de prueba: ${BASE}\nNavegador: ${CHROME}\n`);
for (const c of casos) {
  if (c.grupo) { console.log('\n■ ' + c.grupo); continue; }
  const t0 = Date.now();
  try { await c.fn(); ok++; console.log(`  ✓ ${c.nombre}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { fallos.push({ nombre: c.nombre, e }); console.log(`  ✗ ${c.nombre}\n      ${String(e.message || e).split('\n').slice(0, 4).join('\n      ')}`); }
}
await navegador.close(); servidor.close();
console.log(`\nResultado: ${ok} de ${ok + fallos.length} pruebas correctas.`);
if (fallos.length) { console.log('Fallaron:\n' + fallos.map((f) => ' - ' + f.nombre).join('\n')); process.exit(1); }
