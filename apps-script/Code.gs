// Receptor de Relevamiento de gondola (Profarco) sobre Google Drive.
//
// Carpeta PROFARCO en Drive:
//   01_Planogramas/<punto de venta o _General>/<marca>/<tipo de espacio>/imagenes
//   02_Fotos/<punto de venta>/<marca>/<tipo de espacio>/<aaaa-mm-dd>/fotos
//   03_Maestros/  planillas: "Relevadores" (CI, Nombre completo, Activo)
//                            "Puntos de venta" (Punto de venta, Cadena, Ciudad, Activo, CI supervisor)
//                            "Registro de fotos" (una fila por foto; de aqui lee el tablero)
//
// Propiedades del script (Configuracion del proyecto): TOKEN, ADMIN_PIN (planogramas) y TABLERO_PIN (clave del cliente).

// Carpeta raiz del proyecto en Drive ("Relevamiento Profarco 2026"). Las subcarpetas se buscan por nombre dentro de ella.
const CARPETA_RAIZ = '11-xkZ9cOnK5dv0DSWYy9KEPK95wjq9Q1';
const PLANOS = '01_Planogramas', FOTOS = '02_Fotos', MAESTROS = '03_Maestros';
function carpeta_(nombre) {
  const it = DriveApp.getFolderById(CARPETA_RAIZ).getFoldersByName(nombre);
  if (!it.hasNext()) throw new Error('Falta la carpeta "' + nombre + '" dentro de la carpeta raiz');
  return it.next();
}
// Busca una planilla de Google por nombre: primero en 03_Maestros, luego en la raiz y en sus otras subcarpetas.
// Si no la encuentra, el error dice que archivos ve el script, para saber donde esta el problema.
function planilla_(nombre) {
  const candidatas = [carpeta_(MAESTROS), DriveApp.getFolderById(CARPETA_RAIZ)];
  const subs = DriveApp.getFolderById(CARPETA_RAIZ).getFolders();
  while (subs.hasNext()) { const c = subs.next(); if ([PLANOS, FOTOS, MAESTROS].indexOf(c.getName()) < 0) candidatas.push(c); }
  const vistos = [];
  for (let i = 0; i < candidatas.length; i++) {
    const it = candidatas[i].getFiles();
    while (it.hasNext()) {
      const f = it.next(), n = f.getName();
      vistos.push(candidatas[i].getName() + '/' + n + (f.getMimeType() === MimeType.GOOGLE_SHEETS ? '' : ' [no es planilla de Google]'));
      if (n.trim().toLowerCase() === nombre.toLowerCase() && f.getMimeType() === MimeType.GOOGLE_SHEETS) return f;
    }
  }
  throw new Error('Falta la planilla "' + nombre + '". Archivos vistos: ' + (vistos.slice(0, 20).join(' | ') || 'ninguno'));
}
// ── Cache: abrir carpetas y planillas de Drive tarda segundos, asi que se guardan resultados en memoria temporal. ──
// Las planillas Relevadores / Puntos de venta se releen cada 10 min (o al pulsar "Actualizar datos" en admin);
// la lista de planogramas se mantiene al dia sola al subir o borrar; las fotos del tablero se releen cada 2 min.
const CACHE_PLANILLAS = 600, CACHE_PLANOS = 21600, CACHE_FOTOS = 120;
function cacheGet_(k) { try { const v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cachePut_(k, v, seg) { try { const s = JSON.stringify(v); if (s.length < 90000) CacheService.getScriptCache().put(k, s, seg); } catch (e) {} }
function cacheDel_(claves) { try { CacheService.getScriptCache().removeAll(claves); } catch (e) {} }
function planillaId_(nombre) {   // el id de cada planilla no cambia: evita recorrer carpetas en cada llamada
  const k = 'id_' + nombre.toLowerCase(), c = CacheService.getScriptCache().get(k);
  if (c) return c;
  const id = planilla_(nombre).getId();
  CacheService.getScriptCache().put(k, id, CACHE_PLANOS);
  return id;
}
const ENCABEZADO_REGISTRO = ['Fecha y hora', 'Timestamp', 'CI', 'Relevador', 'Punto de venta', 'Marca', 'Tipo de espacio', 'Cumplimiento', 'Observaciones', 'ID foto', 'Criterios (ids)', 'Clave de envio'];
const RESULTADOS = { cumple: 'Cumple', parcial: 'Cumple parcialmente', no_cumple: 'No cumple' };
const TEXTOS = {
  presente_si: 'Marca contratada: si esta', presente_no: 'Marca contratada: no esta',
  ocupa_profarco: 'Ocupa: otra marca de Profarco', ocupa_otra: 'Ocupa: otra marca (no Profarco)', ocupa_propia: 'Ocupa: marca propia o del supermercado',
  ocupa_material: 'Ocupa: material sin producto', ocupa_vacio: 'Ocupa: vacio',
  abast_completo: 'Abastecimiento: completo (mas del 80%)', abast_parcial: 'Abastecimiento: parcial (50 a 80%)', abast_bajo: 'Abastecimiento: bajo (menos del 50%)', abast_sin: 'Abastecimiento: sin producto',
  visib_total: 'Visibilidad: totalmente visible', visib_parcial: 'Visibilidad: parcialmente obstruido', visib_obstruido: 'Visibilidad: obstruido',
  estado_bueno: 'Mueble: bueno', estado_sucio: 'Mueble: sucio', estado_roto: 'Mueble: deteriorado o roto', estado_sin: 'Mueble: sin material',
};

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function limpio_(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '-').trim().slice(0, 80) || 'sin-nombre'; }
function digitos_(s) { return String(s || '').replace(/\D/g, ''); }
function sub_(padre, nombre) { const it = padre.getFoldersByName(nombre); return it.hasNext() ? it.next() : padre.createFolder(nombre); }
function tokenOk_(t) { return !!prop_('TOKEN') && t === prop_('TOKEN'); }
function pinOk_(p) { return !!prop_('ADMIN_PIN') && String(p) === prop_('ADMIN_PIN'); }
function tableroOk_(p) { return pinOk_(p) || (!!prop_('TABLERO_PIN') && String(p) === prop_('TABLERO_PIN')); }
// Limite de intentos: tras MAX_FALLOS claves incorrectas se bloquean las claves (tablero y admin) por BLOQUEO_SEG segundos.
const MAX_FALLOS = 5;
const BLOQUEO_SEG = 600;
function bloqueado_() { return Number(CacheService.getScriptCache().get('fallos_clave') || 0) >= MAX_FALLOS; }
function chequeo_(ok) {
  if (!ok) { const c = CacheService.getScriptCache(); c.put('fallos_clave', String(Number(c.get('fallos_clave') || 0) + 1), BLOQUEO_SEG); }
  return ok;
}
// La columna "CI supervisor" de Puntos de venta puede traer una o varias cedulas (separadas por coma, punto y coma o espacio).
function asignado_(celda, ci) { return String(celda || '').split(/[^0-9]+/).filter(String).indexOf(ci) >= 0; }
function pdvObj_(r) { return { nombre: String(r[0]).trim(), cadena: String(r[1] || ''), ciudad: String(r[2] || '') }; }
// Planilla opcional "Espacios por punto de venta" (Punto de venta, Marca, Tipo de espacio, Cantidad). Sin planilla: no se condiciona nada.
function esperados_() {
  try {
    const m = {};
    filas_('Espacios por punto de venta').forEach(function (r) {
      const p = String(r[0]).trim(); if (!p || !String(r[1]).trim() || !String(r[2]).trim()) return;
      (m[p] = m[p] || []).push({ m: String(r[1]).trim(), t: String(r[2]).trim(), n: Number(r[3]) || 1 });
    });
    return m;
  } catch (err) { return {}; }
}
function activo_(v) { return ['no', 'n', '0', 'false', 'inactivo'].indexOf(String(v).trim().toLowerCase()) < 0; }

// Filas de una planilla de Maestros (sin el encabezado).
function filas_(nombre) {
  const k = 'filas_' + nombre.toLowerCase(), c = cacheGet_(k);
  if (c) return c;
  const v = SpreadsheetApp.openById(planillaId_(nombre)).getSheets()[0].getDataRange().getValues();
  const filas = v.slice(1).filter(function (r) { return String(r[0]).trim() !== ''; });
  cachePut_(k, filas, CACHE_PLANILLAS);
  return filas;
}
function planos_() {
  let p = cacheGet_('planos');
  if (!p) { p = listarPlanos_(); cachePut_('planos', p, CACHE_PLANOS); }
  return p;
}

function doGet(e) {
  try {
    if (!tokenOk_(e.parameter.token)) return json_({ ok: false, error: 'Token incorrecto' });
    if (e.parameter.action === 'planos') return json_({ ok: true, planos: planos_() });
    return json_({ ok: false, error: 'Accion desconocida' });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (!tokenOk_(b.token)) return json_({ ok: false, error: 'Token incorrecto' });

    if (b.action === 'login') {   // devuelve solo el nombre de ese CI; la lista nunca sale completa
      const ci = digitos_(b.ci);
      const r = filas_('Relevadores').filter(function (x) { return digitos_(x[0]) === ci && activo_(x[2]); })[0];
      if (!r || !ci) return json_({ ok: false, error: 'CI no registrado' });
      const esp = esperados_();
      const pdvs = filas_('Puntos de venta').filter(function (x) { return activo_(x[3]) && asignado_(x[4], ci); }).map(function (x) { const o = pdvObj_(x); if (esp[o.nombre]) o.esperados = esp[o.nombre]; return o; });
      return json_({ ok: true, nombre: String(r[1]).trim(), pdvs: pdvs });
    }
    if (b.action === 'foto') return json_({ ok: true, id: guardarFoto_(b) });
    if (b.action === 'nota') { guardarNota_(b); return json_({ ok: true }); }

    if (bloqueado_()) return json_({ ok: false, error: 'Demasiados intentos. Espera unos minutos.' });

    // Tablero del cliente: acepta la clave del tablero o la de administracion.
    if (b.action === 'pdvs') return chequeo_(tableroOk_(b.pin)) ? json_({ ok: true, pdvs: filas_('Puntos de venta').filter(function (x) { return activo_(x[3]); }).map(pdvObj_) }) : json_({ ok: false, error: 'Clave incorrecta' });
    if (b.action === 'pin' && b.ambito !== 'admin') return chequeo_(tableroOk_(b.pin)) ? json_({ ok: true }) : json_({ ok: false, error: 'Clave incorrecta' });
    if (b.action === 'fotos') return chequeo_(tableroOk_(b.pin)) ? json_({ ok: true, fotos: listarFotos_().fotos, notas: listarFotos_().notas }) : json_({ ok: false, error: 'Clave incorrecta' });

    // Lo siguiente (planogramas) es solo de administracion.
    if (!chequeo_(pinOk_(b.pin))) return json_({ ok: false, error: 'PIN incorrecto' });
    if (b.action === 'pin') return json_({ ok: true });
    if (b.action === 'limpiarCache') { cacheDel_(['filas_relevadores', 'filas_puntos de venta', 'fotos', 'planos', 'id_relevadores', 'id_puntos de venta', 'id_registro de fotos']); return json_({ ok: true }); }
    if (b.action === 'planograma') {
      const carpeta = sub_(sub_(sub_(carpeta_(PLANOS), b.pdv === '*' ? '_General' : limpio_(b.pdv)), limpio_(b.marca)), limpio_(b.tipo));
      const f = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), 'image/jpeg', limpio_(b.nombre)));
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const lista = cacheGet_('planos');   // se agrega a la lista guardada, sin volver a recorrer Drive
      if (lista) { lista.push({ id: f.getId(), pdv: b.pdv === '*' ? '*' : limpio_(b.pdv), marca: limpio_(b.marca), tipo: limpio_(b.tipo), nombre: f.getName(), url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1200' }); cachePut_('planos', lista, CACHE_PLANOS); }
      return json_({ ok: true, id: f.getId() });
    }
    if (b.action === 'borrarPlanograma') {
      DriveApp.getFileById(b.id).setTrashed(true);
      const lista = cacheGet_('planos');
      if (lista) cachePut_('planos', lista.filter(function (x) { return x.id !== b.id; }), CACHE_PLANOS);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'Accion desconocida' });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

// Anti-duplicados: cada foto o nota trae una clave unica (cid). Si el mismo envio llega dos veces
// (doble toque, reintento por mala senal), la segunda vez no crea nada y devuelve lo ya guardado.
function reservar_(cid) {
  if (!cid) return null;
  const c = CacheService.getScriptCache(), lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const v = c.get('cid_' + cid);
    if (v === 'pend') return 'ocupado';
    if (v) return { id: v };
    const hoja = SpreadsheetApp.openById(planillaId_('Registro de fotos')).getSheets()[0];
    if (hoja.getMaxColumns() < 12) hoja.insertColumnsAfter(hoja.getMaxColumns(), 12 - hoja.getMaxColumns());
    const n = hoja.getLastRow() - 1;
    if (n > 0) {
      const col = hoja.getRange(2, 12, n, 1).getValues();
      for (let i = col.length - 1; i >= 0; i--) {
        if (String(col[i][0]) === cid) { const id = String(hoja.getRange(i + 2, 10).getValue() || 'nota'); c.put('cid_' + cid, id, 21600); return { id: id }; }
      }
    }
    c.put('cid_' + cid, 'pend', 180);
    return null;
  } finally { lock.releaseLock(); }
}
function liberar_(cid) { if (cid) try { CacheService.getScriptCache().remove('cid_' + cid); } catch (e) {} }
function marcar_(cid, id) { if (cid) try { CacheService.getScriptCache().put('cid_' + cid, String(id || 'nota'), 21600); } catch (e) {} }
function guardarFoto_(b) {
  const prev = reservar_(b.cid);
  if (prev === 'ocupado') throw new Error('Esta foto ya se esta guardando');
  if (prev) return prev.id;
  try { const id = crearFoto_(b); marcar_(b.cid, id); return id; } catch (e) { liberar_(b.cid); throw e; }
}
function guardarNota_(b) {
  const prev = reservar_(b.cid);
  if (prev === 'ocupado') throw new Error('Esta justificacion ya se esta guardando');
  if (prev) return;
  try { crearNota_(b); marcar_(b.cid, 'nota'); } catch (e) { liberar_(b.cid); throw e; }
}
function crearFoto_(b) {
  const fecha = Utilities.formatDate(new Date(b.ts), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const carpeta = sub_(sub_(sub_(sub_(carpeta_(FOTOS), limpio_(b.pdv)), limpio_(b.marca)), limpio_(b.tipo)), fecha);
  const nombre = limpio_(digitos_(b.ci) + '_' + (b.nombre || b.ts + '.jpg'));
  const f = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), 'image/jpeg', nombre));
  // El tablero muestra las imagenes por enlace: cualquiera con el enlace puede verlas.
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const crit = (b.criterios || []);
  const res = crit.filter(function (c) { return RESULTADOS[c]; }).map(function (c) { return RESULTADOS[c]; }).join('; ');
  const obs = crit.filter(function (c) { return !RESULTADOS[c]; }).map(function (c) { return TEXTOS[c] || c; }).join('; ');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const hoja = SpreadsheetApp.openById(planillaId_('Registro de fotos')).getSheets()[0];
    if (hoja.getLastRow() < 1 || hoja.getLastColumn() < ENCABEZADO_REGISTRO.length) hoja.getRange(1, 1, 1, ENCABEZADO_REGISTRO.length).setValues([ENCABEZADO_REGISTRO]);
    hoja.appendRow([Utilities.formatDate(new Date(b.ts), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), b.ts, "'" + digitos_(b.ci), b.relevador, b.pdv, b.marca || '', b.tipo, res, obs, f.getId(), crit.join('|'), b.cid || '']);
  } finally { lock.releaseLock(); }
  cacheDel_(['fotos']);
  return f.getId();
}

// Justificacion de espacios no relevados: una fila en "Registro de fotos" sin ID de foto y con 'justif' en Criterios.
function crearNota_(b) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const hoja = SpreadsheetApp.openById(planillaId_('Registro de fotos')).getSheets()[0];
    if (hoja.getLastRow() < 1 || hoja.getLastColumn() < ENCABEZADO_REGISTRO.length) hoja.getRange(1, 1, 1, ENCABEZADO_REGISTRO.length).setValues([ENCABEZADO_REGISTRO]);
    hoja.appendRow([Utilities.formatDate(new Date(b.ts), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), b.ts, "'" + digitos_(b.ci), b.relevador, b.pdv, b.marca || '', b.tipo, 'Espacios sin relevar', String(b.texto || ''), '', 'justif', b.cid || '']);
  } finally { lock.releaseLock(); }
  cacheDel_(['fotos']);
}

function listarFotos_() {
  const c = cacheGet_('fotos');
  if (c) return c;
  let id; try { id = planillaId_('Registro de fotos'); } catch (e) { return { fotos: [], notas: [] }; }
  const v = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getValues().slice(1);
  const notas = v.filter(function (r) { return !r[9] && r[10] === 'justif'; }).map(function (r) {
    return { ts: Number(r[1]), relevador: r[3], pdv: r[4], marca: r[5], tipo: r[6], texto: String(r[8] || '') };
  });
  const fotos = v.filter(function (r) { return r[9]; }).map(function (r) {
    return {
      id: r[9], ts: Number(r[1]), relevador: r[3], pdv: r[4], marca: r[5], tipo: r[6],
      criterios: String(r[10] || '').split('|').filter(String),
      url: 'https://drive.google.com/thumbnail?id=' + r[9] + '&sz=w1600',
      thumb: 'https://drive.google.com/thumbnail?id=' + r[9] + '&sz=w400',
    };
  });
  const out = { fotos: fotos, notas: notas };
  cachePut_('fotos', out, CACHE_FOTOS);
  return out;
}

function listarPlanos_() {   // 01_Planogramas/<punto de venta|_General>/<marca>/<tipo de espacio>/imagenes
  const out = [];
  const pdvs = carpeta_(PLANOS).getFolders();
  while (pdvs.hasNext()) {
    const p = pdvs.next(), marcas = p.getFolders();
    while (marcas.hasNext()) {
      const m = marcas.next(), tipos = m.getFolders();
      while (tipos.hasNext()) {
        const t = tipos.next(), files = t.getFiles();
        while (files.hasNext()) {
          const f = files.next(), id = f.getId();
          out.push({ id: id, pdv: p.getName() === '_General' ? '*' : p.getName(), marca: m.getName(), tipo: t.getName(), nombre: f.getName(), url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200' });
        }
      }
    }
  }
  return out;
}
