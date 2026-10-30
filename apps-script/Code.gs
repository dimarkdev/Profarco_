// Receptor de Relevamiento de gondola (Profarco) sobre Google Drive.
//
// Carpeta PROFARCO en Drive:
//   01_Planogramas/<punto de venta o _General>/<tipo>/imagenes
//   02_Fotos/<punto de venta>/<tipo>/<aaaa-mm-dd>/fotos
//   03_Maestros/  planillas: "Relevadores" (CI, Nombre completo, Activo)
//                            "Puntos de venta" (Punto de venta, Cadena, Ciudad, Activo)
//                            "Registro de fotos" (una fila por foto; de aqui lee el tablero)
//
// Propiedades del script (Configuracion del proyecto): TOKEN, ADMIN_PIN (planogramas) y TABLERO_PIN (clave del cliente).

const CARPETA_PLANOS = '1eVOIQCaFp_pclQhK_msayqAiID3HSaTN';   // 01_Planogramas
const CARPETA_FOTOS = '1HbGfm3pnI7FJy_7_6HIIfiBXAX04mKw0';    // 02_Fotos
const CARPETA_MAESTROS = '16BqmTmpCSVN6TBfX7EMLB1l0CJc-3nh2'; // 03_Maestros
const ENCABEZADO_REGISTRO = ['Fecha y hora', 'Timestamp', 'CI', 'Relevador', 'Punto de venta', 'Tipo de relevamiento', 'Cumplimiento', 'Observaciones', 'ID foto', 'Criterios (ids)'];
const RESULTADOS = { cumple: 'Cumple', parcial: 'Cumple parcialmente', no_cumple: 'No cumple' };
const TEXTOS = {
  faltan_productos: 'Faltan productos / quiebre de stock', mal_ubicado: 'Producto mal ubicado', sin_pop: 'Falta material POP o carteleria',
  sin_precio: 'Precios sin etiquetar o desactualizados', competencia: 'La competencia ocupa el espacio', sin_espacio: 'No hay espacio asignado',
  corregido: 'Se corrigio durante la visita', no_modificar: 'No se pudo realizar modificaciones',
};

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function limpio_(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '-').trim().slice(0, 80) || 'sin-nombre'; }
function digitos_(s) { return String(s || '').replace(/\D/g, ''); }
function sub_(padre, nombre) { const it = padre.getFoldersByName(nombre); return it.hasNext() ? it.next() : padre.createFolder(nombre); }
function tokenOk_(t) { return !!prop_('TOKEN') && t === prop_('TOKEN'); }
function pinOk_(p) { return !!prop_('ADMIN_PIN') && String(p) === prop_('ADMIN_PIN'); }
function tableroOk_(p) { return pinOk_(p) || (!!prop_('TABLERO_PIN') && String(p) === prop_('TABLERO_PIN')); }
function activo_(v) { return ['no', 'n', '0', 'false', 'inactivo'].indexOf(String(v).trim().toLowerCase()) < 0; }

// Filas de una planilla de Maestros (sin el encabezado).
function filas_(nombre) {
  const it = DriveApp.getFolderById(CARPETA_MAESTROS).getFilesByName(nombre);
  if (!it.hasNext()) throw new Error('Falta la planilla "' + nombre + '" en 03_Maestros');
  const v = SpreadsheetApp.open(it.next()).getSheets()[0].getDataRange().getValues();
  return v.slice(1).filter(function (r) { return String(r[0]).trim() !== ''; });
}

function doGet(e) {
  try {
    if (!tokenOk_(e.parameter.token)) return json_({ ok: false, error: 'Token incorrecto' });
    if (e.parameter.action === 'pdvs') {
      const pdvs = filas_('Puntos de venta').filter(function (r) { return activo_(r[3]); })
        .map(function (r) { return { nombre: String(r[0]).trim(), cadena: String(r[1] || ''), ciudad: String(r[2] || '') }; });
      return json_({ ok: true, pdvs: pdvs });
    }
    if (e.parameter.action === 'planos') return json_({ ok: true, planos: listarPlanos_() });
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
      return r && ci ? json_({ ok: true, nombre: String(r[1]).trim() }) : json_({ ok: false, error: 'CI no registrado. Consulta con tu supervisor.' });
    }
    if (b.action === 'foto') return json_({ ok: true, id: guardarFoto_(b) });

    // Tablero del cliente: acepta la clave del tablero o la de administracion.
    if (b.action === 'pin' && b.ambito !== 'admin') return tableroOk_(b.pin) ? json_({ ok: true }) : json_({ ok: false, error: 'Clave incorrecta' });
    if (b.action === 'fotos') return tableroOk_(b.pin) ? json_({ ok: true, fotos: listarFotos_() }) : json_({ ok: false, error: 'Clave incorrecta' });

    // Lo siguiente (planogramas) es solo de administracion.
    if (!pinOk_(b.pin)) return json_({ ok: false, error: 'PIN incorrecto' });
    if (b.action === 'pin') return json_({ ok: true });
    if (b.action === 'planograma') {
      const carpeta = sub_(sub_(DriveApp.getFolderById(CARPETA_PLANOS), b.pdv === '*' ? '_General' : limpio_(b.pdv)), limpio_(b.tipo));
      const f = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), 'image/jpeg', limpio_(b.nombre)));
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return json_({ ok: true, id: f.getId() });
    }
    if (b.action === 'borrarPlanograma') { DriveApp.getFileById(b.id).setTrashed(true); return json_({ ok: true }); }
    return json_({ ok: false, error: 'Accion desconocida' });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function guardarFoto_(b) {
  const fecha = Utilities.formatDate(new Date(b.ts), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const carpeta = sub_(sub_(sub_(DriveApp.getFolderById(CARPETA_FOTOS), limpio_(b.pdv)), limpio_(b.tipo)), fecha);
  const nombre = limpio_(digitos_(b.ci) + '_' + (b.nombre || b.ts + '.jpg'));
  const f = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), 'image/jpeg', nombre));
  // El tablero muestra las imagenes por enlace: cualquiera con el enlace puede verlas.
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const crit = (b.criterios || []);
  const res = crit.filter(function (c) { return RESULTADOS[c]; }).map(function (c) { return RESULTADOS[c]; }).join('; ');
  const obs = crit.filter(function (c) { return !RESULTADOS[c]; }).map(function (c) { return TEXTOS[c] || c; }).join('; ');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const it = DriveApp.getFolderById(CARPETA_MAESTROS).getFilesByName('Registro de fotos');
    if (!it.hasNext()) throw new Error('Falta la planilla "Registro de fotos" en 03_Maestros');
    const hoja = SpreadsheetApp.open(it.next()).getSheets()[0];
    if (hoja.getLastRow() < 1 || hoja.getLastColumn() < ENCABEZADO_REGISTRO.length) hoja.getRange(1, 1, 1, ENCABEZADO_REGISTRO.length).setValues([ENCABEZADO_REGISTRO]);
    hoja.appendRow([Utilities.formatDate(new Date(b.ts), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), b.ts, "'" + digitos_(b.ci), b.relevador, b.pdv, b.tipo, res, obs, f.getId(), crit.join('|')]);
  } finally { lock.releaseLock(); }
  return f.getId();
}

function listarFotos_() {
  const it = DriveApp.getFolderById(CARPETA_MAESTROS).getFilesByName('Registro de fotos');
  if (!it.hasNext()) return [];
  const v = SpreadsheetApp.open(it.next()).getSheets()[0].getDataRange().getValues().slice(1);
  return v.filter(function (r) { return r[8]; }).map(function (r) {
    return {
      id: r[8], ts: Number(r[1]), relevador: r[3], pdv: r[4], tipo: r[5],
      criterios: String(r[9] || '').split('|').filter(String),
      url: 'https://drive.google.com/thumbnail?id=' + r[8] + '&sz=w1600',
      thumb: 'https://drive.google.com/thumbnail?id=' + r[8] + '&sz=w400',
    };
  });
}

function listarPlanos_() {
  const out = [];
  const pdvs = DriveApp.getFolderById(CARPETA_PLANOS).getFolders();
  while (pdvs.hasNext()) {
    const p = pdvs.next(), tipos = p.getFolders();
    while (tipos.hasNext()) {
      const t = tipos.next(), files = t.getFiles();
      while (files.hasNext()) {
        const f = files.next(), id = f.getId();
        out.push({ id: id, pdv: p.getName() === '_General' ? '*' : p.getName(), tipo: t.getName(), nombre: f.getName(), url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200' });
      }
    }
  }
  return out;
}
