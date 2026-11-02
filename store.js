// Capa de datos. Dos modos:
//  - PRUEBA (sin APPS_SCRIPT_URL): todo vive en este navegador (IndexedDB / localStorage).
//  - DRIVE: planogramas, fotos, relevadores y puntos de venta viven en Google Drive via Apps Script.
// Las fotos siempre pasan primero por IndexedDB (cola) y se suben cuando hay red,
// asi no se pierde nada si el relevador esta sin señal en el local.
(function () {
  const C = window.CONFIG;
  const REMOTO = !!C.APPS_SCRIPT_URL;
  const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

  const DB = (() => {
    let p;
    const open = () => p || (p = new Promise((res, rej) => {
      const r = indexedDB.open('relevamiento-gondola', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('planos')) d.createObjectStore('planos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('fotos')) d.createObjectStore('fotos', { keyPath: 'id' });
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
  async function get(action) {
    const u = new URL(C.APPS_SCRIPT_URL);
    u.searchParams.set('action', action);
    u.searchParams.set('token', C.TOKEN);
    const j = await (await fetch(u)).json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }

  // Reduce la foto (las del celular pesan 4-8 MB).
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
  const urlDe = (id, blob) => { if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob)); return urls.get(id); };

  // Datos de ejemplo del modo prueba (en Drive salen de las planillas "Relevadores" y "Puntos de venta").
  const PRUEBA = {
    relevadores: [{ ci: '1234567', nombre: 'Relevador de Prueba' }],
    pdvs: [{ nombre: 'Supermercado X', cadena: 'Prueba', ciudad: 'Asunción' }, { nombre: 'Supermercado Y', cadena: 'Prueba', ciudad: 'Luque' }],
  };

  const Store = {
    remoto: REMOTO,
    comprimir,
    soloDigitos,

    // ── Relevadores y puntos de venta ──
    async login(ci) {
      ci = soloDigitos(ci);
      if (!ci) throw new Error('Escribe tu número de CI');
      const NO_ENCONTRADA = 'Cédula no encontrada, verifique o reporte con soporte';
      if (REMOTO) {
        try { return (await post({ action: 'login', ci })).nombre; }
        catch (e) { throw new Error(/no registrado/i.test(e.message) ? NO_ENCONTRADA : e.message); }
      }
      const r = PRUEBA.relevadores.find((x) => x.ci === ci);
      if (!r) throw new Error(NO_ENCONTRADA);
      return r.nombre;
    },
    async puntosDeVenta() {
      if (!REMOTO) return PRUEBA.pdvs;
      try {
        const j = await get('pdvs');
        localStorage.setItem('cache-pdvs', JSON.stringify(j.pdvs));
        return j.pdvs;
      } catch (e) {
        const c = localStorage.getItem('cache-pdvs'); // sin señal: ultima lista conocida
        if (c) return JSON.parse(c);
        throw e;
      }
    },
    // ambito 'tablero' (clave del cliente) o 'admin' (planogramas, solo nosotros).
    async verificarPin(pin, ambito) {
      if (REMOTO) { try { await post({ action: 'pin', pin, ambito }); return true; } catch (e) { return false; } }
      return pin === (ambito === 'admin' ? C.ADMIN_PIN_PRUEBA : C.TABLERO_PIN_PRUEBA) || pin === C.ADMIN_PIN_PRUEBA;
    },

    // ── Planogramas ── [{id, pdv, tipo, nombre, url}]   (pdv '*' = general, vale para todos los puntos de venta)
    async planogramas() {
      if (REMOTO) {
        try {
          const j = await get('planos');
          localStorage.setItem('cache-planos', JSON.stringify(j.planos));
          return j.planos;
        } catch (e) {
          const c = localStorage.getItem('cache-planos');
          if (c) return JSON.parse(c);
          throw e;
        }
      }
      return (await DB.all('planos')).map((p) => ({ id: p.id, pdv: p.pdv, tipo: p.tipo, nombre: p.nombre, url: urlDe(p.id, p.blob) }));
    },
    async agregarPlanograma(pdv, tipo, file, pin) {
      const blob = await comprimir(file);
      if (REMOTO) return post({ action: 'planograma', pin, pdv, tipo, nombre: file.name, data: await blobToB64(blob) });
      if (pin !== C.ADMIN_PIN_PRUEBA) throw new Error('PIN incorrecto');
      return DB.put('planos', { id: uid(), pdv, tipo, nombre: file.name, blob });
    },
    async borrarPlanograma(id, pin) {
      if (REMOTO) return post({ action: 'borrarPlanograma', pin, id });
      if (pin !== C.ADMIN_PIN_PRUEBA) throw new Error('PIN incorrecto');
      return DB.del('planos', id);
    },

    // ── Fotos ──  meta: {pdv, tipo, ci, relevador, criterios: [ids]}
    async guardarFotos(meta, blobs) {
      for (const b of blobs) {
        await DB.put('fotos', { id: uid(), ...meta, ts: Date.now(), blob: await comprimir(b), subida: false });
      }
      return Store.sincronizar();
    },
    async fotosLocales() {
      return (await DB.all('fotos')).map((f) => ({ ...f, url: urlDe(f.id, f.blob), thumb: urlDe(f.id, f.blob) }));
    },
    async pendientes() { return REMOTO ? (await DB.all('fotos')).filter((f) => !f.subida).length : 0; },

    // Sube la cola a Drive; las subidas ok se borran del dispositivo.
    async sincronizar() {
      if (!REMOTO || !navigator.onLine) return { subidas: 0 };
      let subidas = 0;
      for (const f of (await DB.all('fotos')).filter((x) => !x.subida)) {
        try {
          await post({
            action: 'foto', pdv: f.pdv, tipo: f.tipo, ci: f.ci, relevador: f.relevador,
            criterios: f.criterios, ts: f.ts, nombre: `${f.ts}_${f.id}.jpg`, data: await blobToB64(f.blob),
          });
          await DB.del('fotos', f.id);
          subidas++;
        } catch (e) { console.warn('No se pudo subir', f.id, e); break; }
      }
      return { subidas };
    },

    // Todas las fotos para el tablero: las de Drive (requiere la clave) + las que siguen en cola.
    async todasLasFotos(pin) {
      const locales = await Store.fotosLocales();
      if (!REMOTO) return locales;
      const j = await post({ action: 'fotos', pin });
      return [...j.fotos, ...locales.map((f) => ({ ...f, pendiente: true }))];
    },
  };

  window.Store = Store;
  window.addEventListener('online', () => Store.sincronizar().then(() => window.dispatchEvent(new Event('sync'))));
})();
