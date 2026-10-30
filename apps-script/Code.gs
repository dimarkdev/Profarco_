// Receptor de fotos y planogramas en Google Drive.
// Estructura creada en tu Drive:  Relevamiento de gondola / Planogramas|Fotos / <local> / <gondola> / archivos
// Propiedades del script (Configuracion del proyecto > Propiedades): TOKEN y ADMIN_PIN.

const RAIZ = 'Relevamiento de gondola';

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function limpio_(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '-').trim().slice(0, 80) || 'sin-nombre'; }
function sub_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}
function raiz_() { return sub_(DriveApp.getRootFolder(), RAIZ); }

function doGet(e) {
  try {
    if (!prop_('TOKEN') || e.parameter.token !== prop_('TOKEN')) return json_({ ok: false, error: 'Token incorrecto' });
    if (e.parameter.action === 'list') return json_({ ok: true, planos: listar_('Planogramas'), fotos: listar_('Fotos') });
    return json_({ ok: false, error: 'Accion desconocida' });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (!prop_('TOKEN') || b.token !== prop_('TOKEN')) return json_({ ok: false, error: 'Token incorrecto' });

    if (b.action === 'foto') {
      const f = guardar_('Fotos', b, { promotor: b.promotor, ts: b.ts });
      return json_({ ok: true, id: f.getId() });
    }
    // Cambios de planograma: solo con el PIN de administrador.
    if (b.action === 'planograma' || b.action === 'borrarPlanograma') {
      if (!prop_('ADMIN_PIN') || String(b.pin) !== prop_('ADMIN_PIN')) return json_({ ok: false, error: 'PIN incorrecto' });
      if (b.action === 'planograma') return json_({ ok: true, id: guardar_('Planogramas', b, {}).getId() });
      DriveApp.getFileById(b.id).setTrashed(true);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'Accion desconocida' });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function guardar_(tipo, b, extra) {
  const carpeta = sub_(sub_(sub_(raiz_(), tipo), limpio_(b.local)), limpio_(b.categoria));
  const blob = Utilities.newBlob(Utilities.base64Decode(b.data), 'image/jpeg', limpio_(b.nombre || (Date.now() + '.jpg')));
  const file = carpeta.createFile(blob);
  file.setDescription(JSON.stringify(extra));
  // El tablero muestra las imagenes por enlace: cualquiera con el enlace puede verlas.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function listar_(tipo) {
  const out = [];
  const locales = sub_(raiz_(), tipo).getFolders();
  while (locales.hasNext()) {
    const l = locales.next();
    const cats = l.getFolders();
    while (cats.hasNext()) {
      const c = cats.next();
      const files = c.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        let meta = {};
        try { meta = JSON.parse(f.getDescription() || '{}'); } catch (e) {}
        const id = f.getId();
        out.push({
          id: id, local: l.getName(), categoria: c.getName(), nombre: f.getName(),
          promotor: meta.promotor || '', ts: meta.ts || f.getDateCreated().getTime(),
          url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600',
          thumb: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w400',
        });
      }
    }
  }
  return out;
}
