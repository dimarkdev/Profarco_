// Capa de datos. Dos modos:
//  - PRUEBA (sin APPS_SCRIPT_URL): planogramas y fotos viven en IndexedDB de este navegador.
//  - DRIVE: planogramas y fotos se leen/escriben en Google Drive via Apps Script.
// Las fotos tomadas siempre pasan primero por IndexedDB (cola) y se suben cuando hay red,
// asi no se pierde nada si el promotor esta sin señal en el local.
(function () {
  const C = window.CONFIG;
  const REMOTO = !!C.APPS_SCRIPT_URL;

  const DB = (() => {
    let p;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open('relevamiento-gondola', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('planos', { keyPath: 'id' });
        r.result.createObjectStore('fotos', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (s, m, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction(s, m);
        const rq = fn(t.objectStore(s));
        t.oncomplete = () => res(rq && rq.result);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      all: (s) => tx(s, 'readonly', (st) => st.getAll()),
      put: (s, v) => tx(s, 'readwrite', (st) => st.put(v)),
      del: (s, k) => tx(s, 'readwrite', (st) => st.delete(k)),
    };
  })();

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const blobToB64 = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

  async function post(payload) {
    // Sin cabecera Content-Type propia: queda text/plain y el navegador no hace preflight CORS.
    const r = await fetch(C.APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ token: C.TOKEN, ...payload }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }

  async function getRemoto() {
    const u = new URL(C.APPS_SCRIPT_URL);
    u.searchParams.set('action', 'list');
    u.searchParams.set('token', C.TOKEN);
    const r = await fetch(u);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }

  // Reduce la foto antes de guardarla/subirla (las del celular pesan 4-8 MB).
  async function comprimir(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, C.FOTO_MAX_PX / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k);
    cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return new Promise((res) => cv.toBlob(res, 'image/jpeg', C.FOTO_CALIDAD));
  }

  const urls = new Map();
  const urlDe = (id, blob) => {
    if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
    return urls.get(id);
  };

  const Store = {
    remoto: REMOTO,
    comprimir,

    // ── Planogramas ── [{id, local, categoria, nombre, url}]
    async planogramas() {
      if (REMOTO) {
        try {
          const j = await getRemoto();
          localStorage.setItem('cache-planos', JSON.stringify(j.planos));
          return j.planos;
        } catch (e) {
          const c = localStorage.getItem('cache-planos'); // sin señal: ultima lista conocida
          if (c) return JSON.parse(c);
          throw e;
        }
      }
      const rows = await DB.all('planos');
      return rows.map((p) => ({ id: p.id, local: p.local, categoria: p.categoria, nombre: p.nombre, url: urlDe(p.id, p.blob) }));
    },
    async agregarPlanograma(local, categoria, file, pin) {
      const blob = await comprimir(file);
      if (REMOTO) {
        return post({ action: 'planograma', pin, local, categoria, nombre: file.name, data: await blobToB64(blob) });
      }
      if (pin !== C.ADMIN_PIN_PRUEBA) throw new Error('PIN incorrecto');
      return DB.put('planos', { id: uid(), local, categoria, nombre: file.name, blob });
    },
    async borrarPlanograma(id, pin) {
      if (REMOTO) return post({ action: 'borrarPlanograma', pin, id });
      if (pin !== C.ADMIN_PIN_PRUEBA) throw new Error('PIN incorrecto');
      return DB.del('planos', id);
    },

    // ── Fotos ──
    async guardarFotos(meta, files) {
      for (const f of files) {
        const blob = await comprimir(f);
        await DB.put('fotos', { id: uid(), ...meta, ts: Date.now(), blob, subida: false });
      }
      return Store.sincronizar();
    },
    // Fotos aun en este dispositivo (pendientes de subir, o todas en modo prueba).
    async fotosLocales() {
      const rows = await DB.all('fotos');
      return rows.map((f) => ({ ...f, url: urlDe(f.id, f.blob), thumb: urlDe(f.id, f.blob) }));
    },
    async pendientes() {
      return REMOTO ? (await DB.all('fotos')).filter((f) => !f.subida).length : 0;
    },
    async borrarFotoLocal(id) { return DB.del('fotos', id); },

    // Sube la cola a Drive; las subidas ok se borran del dispositivo.
    async sincronizar() {
      if (!REMOTO || !navigator.onLine) return { subidas: 0 };
      let subidas = 0;
      for (const f of (await DB.all('fotos')).filter((x) => !x.subida)) {
        try {
          await post({
            action: 'foto', local: f.local, categoria: f.categoria, promotor: f.promotor,
            ts: f.ts, nombre: `${f.ts}_${f.id}.jpg`, data: await blobToB64(f.blob),
          });
          await DB.del('fotos', f.id);
          subidas++;
        } catch (e) { console.warn('No se pudo subir', f.id, e); break; }
      }
      return { subidas };
    },

    // Todas las fotos para el tablero: las de Drive + las que siguen en cola.
    async todasLasFotos() {
      const locales = await Store.fotosLocales();
      if (!REMOTO) return locales;
      const j = await getRemoto();
      return [...j.fotos, ...locales.map((f) => ({ ...f, pendiente: true }))];
    },
  };

  window.Store = Store;
  window.addEventListener('online', () => Store.sincronizar().then(() => window.dispatchEvent(new Event('sync'))));
})();
