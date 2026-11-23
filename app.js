(function () {
  const C = window.CONFIG;
  const S = window.Store;
  const $app = document.getElementById('app');
  
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtFecha = (ts) => new Date(ts).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const diaISO = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tipoDe = (id) => C.TIPOS.find((t) => t.id === id || t.nombre === id) || C.TIPOS.find((t) => claveTipo(t.nombre) === claveTipo(id));   // reconoce nombres viejos ("Bandeja / lateral" = "Lateral")
  // Todos los espacios aparecen para cualquier marca (sin condicionar por marca).
  const tiposDeMarca = () => C.TIPOS;
  // Espacios esperados por punto de venta (planilla "Espacios por punto de venta"). Sin datos del punto: todo vale.
  const claveMarca = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const claveTipo = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map((w) => w.replace(/s$/, '')).join(' ').replace(/^(bandeja|lateral)$/, 'bandeja lateral');
  // Una celda de la hoja puede traer varias marcas ("Bauducco / Kellogg’s", "Halls, Bubbaloo, Trident"): se separan para que cada una quede en verde.
  const separaMarcas = (lista) => lista.flatMap((x) => String(x.m).split(/\s*[\/,]\s*/).filter(Boolean).map((m) => ({ ...x, m })));
  const esperadosDe = (pdv) => { const p = ((state.usuario && state.usuario.pdvs) || []).find((x) => x.nombre === pdv); return p && p.esperados && p.esperados.length ? separaMarcas(p.esperados) : null; };
  const esperado = (pdv, marca, tipo) => { const e = esperadosDe(pdv); return !e || e.some((x) => claveMarca(x.m) === claveMarca(marca) && claveTipo(x.t) === claveTipo(tipo.nombre || tipo)); };
  const marcaDelPunto = (pdv, marca) => { const e = esperadosDe(pdv); return !!e && e.some((x) => claveMarca(x.m) === claveMarca(marca)); };
  // Primero lo que corresponde al punto de venta; el resto (opaco) va despues, sin cambiar su orden.
  const primeroLosDelPunto = (arr, esDelPunto) => arr.map((x, i) => [x, i]).sort((a, b) => (esDelPunto(b[0]) - esDelPunto(a[0])) || (a[1] - b[1])).map((p) => p[0]);
  // "No se encontro el espacio": solo en supermercados y mayoristas; los puntos Biggie no lo muestran.
  const esBiggie = (pdv) => { const p = ((state.usuario && state.usuario.pdvs) || []).find((x) => x.nombre === pdv); return /^\s*biggie/i.test(pdv || '') || /biggie/i.test((p && p.cadena) || ''); };
  const tiposEsperados = (pdv, marca) => C.TIPOS.filter((t) => esperado(pdv, marca, t));
  const criterioDe = (id) => C.CRITERIOS.find((c) => c.id === id) || (/^colab:/.test(id) ? { id, texto: 'Colaboración: ' + id.slice(6), tono: 'ok' } : /^obs:/.test(id) ? { id, texto: 'Observación: ' + id.slice(4), tono: 'warn' } : { id, texto: id });
  const guardado = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
  const ICON_IMG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/></svg>';

  let toastT;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast', textContent: msg }));
    clearTimeout(toastT);
    toastT = setTimeout(() => document.querySelector('.toast')?.remove(), 3200);
  }

  // Lightbox: una o varias imagenes lado a lado. Tocar la imagen acerca/aleja.
  // Giro de fotos (solo en el tablero): se recuerda por foto en este navegador. Las fotos se toman de pie y a veces conviene verlas giradas.
  const rotLeer = (url) => { try { return (JSON.parse(localStorage.getItem('rot-fotos') || '{}')[url] || 0); } catch (e) { return 0; } };
  const rotGuardar = (url, deg) => { try { const m = JSON.parse(localStorage.getItem('rot-fotos') || '{}'); if (deg) m[url] = deg; else delete m[url]; localStorage.setItem('rot-fotos', JSON.stringify(m)); } catch (e) { /* sin almacenamiento */ } };
  // Aplica el giro a una imagen y la achica lo necesario para que siga entrando en su recuadro.
  function rotAplicar(img, deg) {
    if (!deg) { img.style.transform = ''; return; }
    if (deg % 180 === 0) { img.style.transform = `rotate(${deg}deg)`; return; }
    const go = () => {
      const w = img.offsetWidth, h = img.offsetHeight, p = img.parentElement;
      if (!w || !h) return;
      img.style.transform = `rotate(${deg}deg) scale(${Math.min(p.clientWidth / h, p.clientHeight / w).toFixed(3)})`;
    };
    if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
  }
  const BTN_GIRO = (url) => `<span class="rot" data-url="${esc(url)}"><button type="button" data-rot="-90" aria-label="Girar a la izquierda" title="Girar a la izquierda">⟲</button><button type="button" data-rot="90" aria-label="Girar a la derecha" title="Girar a la derecha">⟳</button></span>`;

  // Visor de imagenes: una a la vez, con flechas en pantalla y del teclado (← →); Esc cierra.
  function lightbox(items, tagsHtml, girar, grande, inicio) {   // grande: foto al ~80% de la pantalla, sin zoom (revision rapida antes de guardar)
    const el = document.createElement('div');
    el.className = grande ? 'lb grande' : 'lb';
    let k = Math.max(0, Math.min(items.length - 1, inicio || 0));
    const cerrar = () => { document.removeEventListener('keydown', tecla); el.remove(); };
    const pintar = () => {
      const i = items[k], n = items.length;
      el.innerHTML = `<div class="lb-head"><span class="t">${n > 1 ? `${k + 1} / ${n} · ` : ''}${grande ? 'Toca fuera de la foto para cerrar' : 'Toca la foto para acercar'}${n > 1 ? ' · flechas ← → para cambiar' : ''}</span>${girar && !i.fijo ? BTN_GIRO(i.url) : ''}<button class="lb-x" data-x aria-label="Cerrar">×</button></div>
        <div class="lb-body"><figure><div class="lb-frame ${grande ? '' : 'zm'}"><div class="lb-pan"><img src="${esc(i.url)}" alt=""></div></div>${i.caption ? `<div>${esc(i.caption)}</div>` : ''}${i.tags ? `<div class="lb-tags">${i.tags}</div>` : ''}</figure></div>
        ${n > 1 ? '<button class="lb-n l" data-n="-1" aria-label="Anterior">‹</button><button class="lb-n r" data-n="1" aria-label="Siguiente">›</button>' : ''}`;
      if (girar && !i.fijo) rotAplicar(el.querySelector('img'), rotLeer(i.url));
    };
    const ir = (d) => { if (items.length > 1) { k = (k + d + items.length) % items.length; pintar(); } };
    function tecla(e) { if (e.key === 'ArrowRight') ir(1); else if (e.key === 'ArrowLeft') ir(-1); else if (e.key === 'Escape') cerrar(); }
    // Zoom dentro del recuadro: la foto se amplia sin salirse de el y sigue al dedo / mouse.
    const mover = (e) => {
      const fr = e.target.closest && e.target.closest('.lb-frame.on'); if (!fr) return;
      const r = fr.getBoundingClientRect();
      fr.firstElementChild.style.transformOrigin = `${Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100))}% ${Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100))}%`;
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-rot]');
      if (r) { const url = r.parentElement.dataset.url, d = (((rotLeer(url) + +r.dataset.rot) % 360) + 360) % 360; rotGuardar(url, d); rotAplicar(el.querySelector('img'), d); return; }
      const b = e.target.closest('[data-n]');
      if (b) { ir(+b.dataset.n); return; }
      if (e.target.closest('[data-x]')) { cerrar(); return; }
      const fr = e.target.closest('.lb-frame');
      if (!fr) { if (grande) cerrar(); return; }
      if (fr.classList.contains('zm')) { fr.classList.toggle('on'); mover(e); fr.firstElementChild.style.transform = fr.classList.contains('on') ? 'scale(2.2)' : ''; }
    });
    document.addEventListener('keydown', tecla);
    pintar();
    document.body.appendChild(el);
  }

  // Progreso de la visita (punto de venta, espacios ya relevados y justificaciones): se guarda en el telefono para retomarlo del mismo dia.
  const hoy = () => new Date().toLocaleDateString('sv');
  const guardarVisita = () => { try { if (!state.pdv || !state.usuario) localStorage.removeItem('visita'); else localStorage.setItem('visita', JSON.stringify({ ci: state.usuario.ci, pdv: state.pdv, dia: hoy(), hechos: [...state.hechos], extras: state.extras || {}})); } catch (e) { /* sin almacenamiento: sigue en memoria */ } };
  // Puntos de venta ya visitados (con al menos un relevamiento guardado): se recuerdan en este telefono para marcarlos con un check.
  const claveVis = () => 'visitados:' + (state.usuario ? state.usuario.ci : '');
  const visitados = () => guardado(claveVis()) || {};
  const marcarVisitado = (pdv) => { try { const v = visitados(); v[pdv] = hoy(); localStorage.setItem(claveVis(), JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const retomarVisita = (pdv) => {
    const v = guardado('visita');
    if (!v || !state.usuario || v.ci !== state.usuario.ci || v.dia !== hoy() || (pdv && v.pdv !== pdv)) return false;
    state.pdv = v.pdv; state.hechos = new Set(v.hechos || []); state.extras = v.extras || {}; return true;
  };

  // ── Estado ──
  const state = {
    planos: [], pdvs: [],
    usuario: guardado('usuario'),          // {ci, nombre, pdvs: [los puntos de venta de ese CI]}
    ciudadesAbiertas: new Set(),           // ciudades desplegadas en la lista de puntos de venta
    pdv: '', marca: '', hechos: new Set(),  // 'marca|tipo' ya relevados en esta visita
    tipo: null,
    fotos: [],                             // [{blob, url}] tomadas en la camara, sin guardar
    criterios: new Set(),
    obs: '',                               // comentario opcional cuando la marca no se encontro en el espacio
    filtroPdv: '',
    tab: { desde: '', hasta: '', pdv: '', marca: '', relevador: '', tipo: '', criterio: '', q: '' },
    datos: null,
  };
  // Drive no admite "/" en nombres de carpeta: el receptor guarda "Bandeja - lateral".
  const norm = (s) => String(s ?? '').replace(/[\\/:*?"<>|]/g, '-').trim();
  const mismoTipo = (a, b) => norm(a) === norm(b);
  const mismoEsp = (a, b) => claveTipo(a) === claveTipo(b);
  const planosDe = (pdv, marca, tipo) => {
    const t = tipoDe(tipo).nombre;
    const cand = state.planos.filter((q) => mismoTipo(q.marca, marca) && mismoEsp(q.tipo, t));
    const exactos = cand.filter((q) => q.pdv === pdv);
    return exactos.length ? exactos : cand.filter((q) => q.pdv === '*');
  };
  // Variantes de un planograma segun el nombre del archivo: Cadena_Tipo_Marca[-Marca2][_detalle].ext
  //   "Fini" -> "Solo Fini" · "Bauducco-Fini" -> "Bauducco + Fini" · "Fini_12_ganchos" -> "Fini · 12 ganchos"
  const limpiaMarca = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ’'`]/g, '').toLowerCase();
  const claveM = (x) => limpiaMarca(x).replace(/&/g, '');   // "M&M’s" y "MMs" valen igual
  const marcaBonita = (x) => (C.MARCAS.find((m) => claveM(m) === claveM(x)) || x);
  // El nombre del archivo puede traer las partes en cualquier orden: [Cadena_]Espacio_[detalle_]Marca[_detalle].ext
  //   Se reconoce la marca (o marcas unidas con guion) por la lista de marcas, se descartan la cadena y el espacio, y lo que queda es el detalle.
  //   "Fini" -> "Solo Fini" · "Bauducco-Fini" -> "Bauducco + Fini" · "Exhibidor_Fini_12_ganchos" -> "Fini · 12 ganchos"
  const variantePlano = (p) => {
    const toks = String(p.nombre || '').replace(/\.[A-Za-z0-9]+$/, '').split('_').filter(Boolean);
    const esMarca = (t) => t.split('-').every((x) => C.MARCAS.some((m) => claveM(m) === claveM(x)));
    const esTipo = (t) => /^(placa|laterales?)$/i.test(t) || C.TIPOS.some((x) => claveTipo(x.nombre) === claveTipo(t.replace(/-/g, ' ')));
    const iM = toks.findIndex(esMarca);
    if (iM < 0) return { etiqueta: 'Planograma', orden: 0, marcas: [] };
    const marcas = toks[iM].split('-').map(marcaBonita);
    const det = toks.filter((t, i) => i !== iM && !esTipo(t) && !(i === 0 && toks.length > 2 && esTipo(toks[1]))).join(' ').replace(/-/g, ' ');
    if (marcas.length > 1) return { etiqueta: marcas.join(' + ') + (det ? ' · ' + det : ''), orden: 2, marcas };
    return det ? { etiqueta: marcas[0] + ' · ' + det, orden: 1, marcas } : { etiqueta: 'Solo ' + marcas[0], orden: 0, marcas };
  };
  const variantesDe = (ps) => {
    const g = new Map();
    ps.forEach((p) => { const v = variantePlano(p); if (!g.has(v.etiqueta)) g.set(v.etiqueta, { etiqueta: v.etiqueta, orden: v.orden, marcas: v.marcas, planos: [] }); g.get(v.etiqueta).planos.push(p); });
    return [...g.values()].sort((x, y) => x.orden - y.orden || x.etiqueta.localeCompare(y.etiqueta));
  };
  // Colaboraciones de una marca (planogramas con dos marcas): ["Fini"] para Bauducco. state.colab: '' = solo la marca, 'Fini' = con Fini, '*' = todas.
  const colaboraciones = (marca) => {
    const g = new Map();
    state.planos.filter((q) => mismoTipo(q.marca, marca)).forEach((q) => variantePlano(q).marcas.filter((x) => limpiaMarca(x) !== limpiaMarca(marca)).forEach((x) => g.set(limpiaMarca(x), x)));
    return [...g.values()].sort((a, b) => a.localeCompare(b));
  };
  const segunColab = (vars) => {
    const c = state.colab || '';
    const f = vars.filter((v) => (c === '' ? v.marcas.length <= 1 : c === '*' ? v.marcas.length > 1 : v.marcas.some((x) => limpiaMarca(x) === limpiaMarca(c))));
    return !f.length && c === '' ? vars : f;   // sin planograma de la marca sola, se muestra lo que haya
  };
  const nombresPdv = () => [...new Set([...state.pdvs.map((p) => p.nombre), ...state.planos.map((p) => p.pdv).filter((n) => n !== '*')])].sort((a, b) => a.localeCompare(b));

  async function pintarSync() {
    const el = document.getElementById('sync');
    if (!el) return;
    if (!S.remoto) { el.className = 'sync'; el.textContent = 'Modo prueba'; return; }
    const n = await S.pendientes();
    el.className = 'sync' + (n ? ' pend' : '');
    el.textContent = n ? `${n} foto${n > 1 ? 's' : ''} por subir` : '';
  }

  // ═══════════ CAMPO: pasos ═══════════
  // ci → pdv (los del CI) → marca → tipo de espacio → (planograma de esa marca) → camara → criterios → tipos …
  let paso = 'ci';
  const ir = (p) => { paso = p; pintarCampo(); };

  function pintarCampo() {
    if (!state.usuario) paso = 'ci';
    else if (paso === 'ci') paso = 'pdv';
    ({ ci: pasoCI, pdv: pasoPdv, marca: pasoMarca, colab: pasoColab, tipos: pasoTipos, criterios: pasoCriterios }[paso] || pasoCI)();
  }

  function pasoCI(confirmando) {
    const icoCi = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.5-1.5 4.5-1.5 5 0M14 10h4M14 13h3"/></svg>';
    $app.innerHTML = `<div class="login"><div class="login-card">
      <div class="login-head">
        <span class="por">Auditoría por</span><img class="logo-mm" src="img/logo-masmarka.png" alt="+Marka">
        <h1>Bienvenido</h1><p>Relevamiento de góndola</p></div>
      <div class="login-body">
        <label class="login-lab" for="ci">Número de cédula</label>
        <div class="in-ico">${icoCi}<input class="in ci" id="ci" inputmode="numeric" autocomplete="off" placeholder="Ej: 1234567" ${confirmando ? 'disabled' : ''} value="${esc(confirmando?.ci || '')}"></div>
        ${confirmando ? `<div class="card hola"><div class="muted">Hola,</div><div class="nombre">${esc(confirmando.nombre)}</div><div class="muted">¿Eres tú?</div></div>
          <button class="btn teal block" id="si">Sí, continuar</button><button class="btn block" id="no">No soy yo</button>`
          : `<p class="login-hint" id="hint">Sin contraseña: solo tu número de cédula</p><button class="btn primary block" id="seguir">Ingresar</button>`}
        <div class="login-foot"><img class="logo-pf" src="img/logo-profarco.png" alt="Profarco S.A."></div>
      </div></div></div>`;
    if (confirmando) {
      document.getElementById('si').onclick = () => { state.usuario = confirmando; localStorage.setItem('usuario', JSON.stringify(confirmando)); ir('pdv'); };
      document.getElementById('no').onclick = () => pasoCI();
      return;
    }
    const entrar = async () => {
      const b = document.getElementById('seguir');
      b.disabled = true;
      try {
        const ci = S.soloDigitos(document.getElementById('ci').value);
        const r = await S.login(ci);
        pasoCI({ ci, nombre: r.nombre, pdvs: r.pdvs });
      } catch (e) {
        const h = document.getElementById('hint');   // mensaje corto bajo el campo, sin ventana
        h.textContent = e.message; h.classList.add('err');
        b.disabled = false;
      }
    };
    document.getElementById('seguir').onclick = entrar;
    document.getElementById('ci').onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
  }

  // Mapa de puntos de venta (solo relevadores de Biggie): se abre en otra pestana, asi el relevamiento en curso queda como esta.
  const mapaUrl = () => (C.MAPA_BIGGIE_URL && (state.usuario.pdvs || []).some((p) => /biggie/i.test(p.cadena || ''))) ? C.MAPA_BIGGIE_URL : '';
  function pasoPdv() {
    const q = state.filtroPdv.toLowerCase();
    const vis = visitados();
    const cuando = (d) => d === hoy() ? 'Visitado hoy' : 'Visitado el ' + d.slice(8, 10) + '/' + d.slice(5, 7);
    const lista = (state.usuario.pdvs || []).filter((p) => !q || (p.nombre + ' ' + (p.cadena || '') + ' ' + (p.ciudad || '')).toLowerCase().includes(q));
    // Primero las ciudades; al tocar una se despliegan sus sucursales (con una sola ciudad o al buscar, ya vienen abiertas).
    const SIN = 'Sin ciudad', grupos = new Map();
    lista.forEach((p) => { const c = String(p.ciudad || '').trim() || SIN; if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(p); });
    const ciudades = [...grupos.keys()].sort((a, b) => a === SIN ? 1 : b === SIN ? -1 : a.localeCompare(b, 'es'));
    const abierta = (c) => !!q || ciudades.length === 1 || state.ciudadesAbiertas.has(c);
    const item = (p) => `<button class="pdv-item ${vis[p.nombre] ? 'visitado' : ''}" data-n="${esc(p.nombre)}" data-ci="${esc(String(p.ciudad || '').trim() || SIN)}">${esc(p.nombre)}${p.cadena ? `<small>${esc(p.cadena)}</small>` : ''}${vis[p.nombre] ? `<i class="chk">✓</i><em class="cuando">${cuando(vis[p.nombre])}</em>` : ''}</button>`;
    // Una ciudad queda completa (verde con check) cuando ya se visitaron todas sus sucursales, aunque la busqueda esté filtrando la lista.
    const todasDe = (c) => (state.usuario.pdvs || []).filter((p) => (String(p.ciudad || '').trim() || SIN) === c);
    const ciudadHtml = (c) => { const ps = grupos.get(c), todas = todasDe(c), nv = todas.filter((p) => vis[p.nombre]).length, ab = abierta(c), completa = todas.length > 0 && nv === todas.length;
      return `<div class="ciudad ${ab ? 'abierta' : ''} ${completa ? 'completa' : ''}"><button type="button" class="ciudad-h" data-c="${esc(c)}" aria-expanded="${ab}"><span><b>${esc(c)}</b><small>${completa ? `Completa · ${nv} de ${todas.length} visitados` : `${ps.length} punto${ps.length === 1 ? '' : 's'} de venta${nv ? ` · ${nv} visitado${nv === 1 ? '' : 's'}` : ''}`}</small></span>${completa ? '<i class="chk">✓</i>' : ''}<i class="chev">›</i></button>${ab ? `<div class="pdv-list">${ps.map(item).join('')}</div>` : ''}</div>`; };
    $app.innerHTML = `<div class="wrap"><h1>Punto de venta</h1><p class="lead">Hola, ${esc(state.usuario.nombre)}</p>
      <input class="in" id="q" style="margin-top:22px" placeholder="Buscar punto de venta…" value="${esc(state.filtroPdv)}" autocomplete="off">
      ${mapaUrl() ? `<a class="btn-mapa" href="${esc(mapaUrl())}" target="_blank" rel="noopener noreferrer"><i class="mapa-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z"/><path d="M9 4v13M15 7v13"/></svg></i><span class="mapa-t"><b>Mapa de sucursales</b><small>Mira cuáles quedan cerca y planifica tu ruta</small></span><span class="mapa-go" aria-hidden="true">↗</span></a>` : ''}
      <div class="ciudades">${lista.length ? ciudades.map(ciudadHtml).join('')
        : '<div class="empty">No tienes puntos de venta asignados.<br>Reporta con soporte.</div>'}</div>
      <p style="text-align:center;margin-top:24px"><button class="link" id="otro">No soy ${esc(state.usuario.nombre)}</button></p></div>`;
    const q$ = document.getElementById('q');
    q$.oninput = () => { state.filtroPdv = q$.value; const p = q$.selectionStart; pasoPdv(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(p, p); };
    $app.querySelectorAll('.ciudad-h').forEach((b) => b.onclick = () => { const c = b.dataset.c; if (state.ciudadesAbiertas.has(c)) state.ciudadesAbiertas.delete(c); else state.ciudadesAbiertas.add(c); pasoPdv(); });
    $app.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => { state.ciudadesAbiertas.add(b.dataset.ci); state.pdv = b.dataset.n; if (!retomarVisita(state.pdv)) { state.hechos = new Set(); state.extras = {}; } state.marca = ''; guardarVisita(); ir('marca'); });
    document.getElementById('otro').onclick = () => { localStorage.removeItem('usuario'); state.usuario = null; ir('ci'); };
  }

  // Al finalizar la visita se cierra el recorrido sin pedir motivos: el tablero muestra lo relevado y los espacios adicionales encontrados.
  function finalizarVisita() {
    state.hechos = new Set(); state.extras = {}; state.marca = '';
    try { localStorage.removeItem('visita'); } catch (e) { /* igual */ }
    ir('pdv');
  }

  function pasoMarca() {
    const nHechos = (m) => [...state.hechos].filter((h) => h.startsWith(m + '|')).length;
    const hecha = (m) => nHechos(m) > 0;
    // Check de la marca: "Relevado" si ya se hicieron todos los espacios contemplados; "1 de 2" si faltan.
    const checkMarca = (m) => { const n = nHechos(m), tot = esperadosDe(state.pdv) ? tiposDeMarca(m).filter((t) => esperado(state.pdv, m, t)).length : 0; return n ? `<span class="hecho-m">✓ ${tot && n < tot ? `${n} de ${tot}` : 'Relevado'}</span>` : ''; };
    $app.innerHTML = `<div class="wrap"><h1>Marca</h1><p class="lead">¿Qué marca vas a relevar?</p>
      <div class="row" style="margin-top:22px"><button class="back" id="atras" aria-label="Volver">${ICON_BACK}</button><div class="sede">${esc(state.pdv)}</div></div>
      <div class="marcas">${primeroLosDelPunto(C.MARCAS, (m) => marcaDelPunto(state.pdv, m) || !esperadosDe(state.pdv)).map((m) => `<button class="marca-b ${hecha(m) ? 'hecha' : ''} ${marcaDelPunto(state.pdv, m) ? 'asignada' : ''}" data-m="${esc(m)}">${esc(m)}${checkMarca(m)}</button>`).join('')}</div>
      ${esperadosDe(state.pdv) ? '<p class="leyenda"><i class="pto"></i><span>Marca contemplada en este punto de venta</span></p>' : ''}
      ${state.hechos.size ? '<button class="btn primary block" id="fin" style="margin-top:22px">Finalizar visita</button>' : ''}</div>`;
    document.getElementById('atras').onclick = () => ir('pdv');
    document.getElementById('fin')?.addEventListener('click', finalizarVisita);
    $app.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { state.marca = b.dataset.m; state.colab = ''; state.hayColab = colaboraciones(state.marca).length > 0; ir(state.hayColab ? 'colab' : 'tipos'); });
  }

  // Marcas que tienen planogramas en colaboracion con otra: se elige "solo la marca" o "la marca + la otra" antes de los espacios.
  function pasoColab() {
    const m = state.marca, cs = colaboraciones(m);
    const ops = [{ v: '', t: 'Solo ' + m, d: 'Espacios propios de la marca' }, ...cs.map((c) => ({ v: c, t: m + ' + ' + c, d: 'Colaboración entre las dos marcas' })), ...(cs.length > 1 ? [{ v: '*', t: 'Todas las colaboraciones', d: 'Con cualquier otra marca' }] : [])];
    $app.innerHTML = `<div class="wrap"><h1>${esc(m)}</h1><p class="lead">¿Qué vas a relevar?</p>
      <div class="row" style="margin-top:22px"><button class="back" id="atras" aria-label="Volver">${ICON_BACK}</button><div class="sede">${esc(state.pdv)}</div></div>
      <div class="marcas">${ops.map((o, k) => `<button class="marca-b colab" data-c="${k}">${esc(o.t)}<small>${esc(o.d)}</small></button>`).join('')}</div></div>`;
    document.getElementById('atras').onclick = () => ir('marca');
    $app.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { state.colab = ops[+b.dataset.c].v; ir('tipos'); });
  }

  function pasoTipos() {
    const ico = '<svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>';
    $app.innerHTML = `<div class="wrap"><h1>Tipo de espacio</h1><p class="lead">Selecciona el espacio a auditar</p>
      <div class="row" style="margin-top:22px"><button class="back" id="atras" aria-label="Volver">${ICON_BACK}</button><div class="sede">${esc(state.pdv)}</div></div>
      <div class="sede-sub"><span>${esc(state.marca)}${state.colab === '*' ? ' + colaboraciones' : state.colab ? ' + ' + esc(state.colab) : ''}</span></div>
      <div class="tiles">${primeroLosDelPunto(tiposDeMarca(state.marca), (t) => esperado(state.pdv, state.marca, t)).map((t) => `<button class="tile ${t.img ? '' : 'sin-img'} ${esperado(state.pdv, state.marca, t) ? (esperadosDe(state.pdv) ? 'esp' : '') : 'fuera'}" data-t="${t.id}" style="background:${t.color}">${state.hechos.has(state.marca + '|' + t.id) ? `<span class="hecho">✓ Relevado</span>${esperado(state.pdv, state.marca, t) ? '' : '<span class="adic">Adicional</span>'}` : ''}${t.img ? `<img src="${t.img}" alt="">` : `<span class="tile-ico">${ico}</span>`}<b>${esc(t.nombre)}</b></button>`).join('')}</div>
      ${esperadosDe(state.pdv) ? '<p class="leyenda"><i class="pto"></i><span>Espacio contemplado en el acuerdo · los demás también se pueden relevar y quedan como adicionales</span></p>' : ''}
      ${state.hechos.size ? '<button class="btn primary block" id="fin" style="margin-top:22px">Finalizar visita</button>' : ''}</div>`;
    document.getElementById('atras').onclick = () => ir(state.hayColab ? 'colab' : 'marca');
    precargarPlanos();
    document.getElementById('fin')?.addEventListener('click', finalizarVisita);
    $app.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
      const t = tipoDe(b.dataset.t);
      if (esperado(state.pdv, state.marca, t) || (state.extras || {})[state.marca + '|' + t.id]) { state.tipo = t; abrirReferencia(); } else confirmarExtra(t);
    });
  }

  // Espacio que no figura en la lista del punto de venta: se puede agregar justificando el motivo.
  function confirmarExtra(t) {
    if (document.querySelector('.modal')) return;
    let texto = '';
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="modal-card"><button class="x" data-x aria-label="Cerrar">×</button>
      <h2>Este espacio no forma parte de la lista</h2>
      <div class="sub"><b>${esc(state.marca)}</b> · ${esc(t.nombre)} no figura entre los espacios de ${esc(state.pdv)}. Puede relevarlo igual.</div>
      <textarea class="in" id="xtxt" rows="3" placeholder="Motivo (opcional)" style="margin-top:12px;width:100%"></textarea>
      <div class="row" style="margin-top:14px;gap:10px"><button class="btn" data-no>Cancelar</button><button class="btn teal" data-ok>Relevar igual</button></div></div>`;
    const ok = m.querySelector('[data-ok]');
    m.querySelector('#xtxt').oninput = (e) => { texto = e.target.value; };
    m.querySelector('[data-x]').onclick = m.querySelector('[data-no]').onclick = () => m.remove();
    ok.onclick = () => { state.extras = state.extras || {}; state.extras[state.marca + '|' + t.id] = texto.trim() || '(sin motivo indicado)'; guardarVisita(); state.tipo = t; m.remove(); abrirReferencia(); };
    document.body.appendChild(m);
  }

  // Ventana de confirmacion al abandonar un relevamiento en curso (fotos y respuestas sin guardar).
  function confirmarAbandono(alAbandonar) {
    if (document.querySelector('.modal-abandono')) return;
    const m = document.createElement('div'); m.className = 'modal modal-abandono';
    m.innerHTML = `<div class="modal-card"><button class="x" data-x aria-label="Cerrar">×</button>
      <h2>¿Está seguro que desea abandonar el relevamiento?</h2>
      <div class="sub">Se perderán las fotos y respuestas que todavía no guardó.</div>
      <div class="row" style="margin-top:14px;gap:10px"><button class="btn" data-si>Abandonar</button><button class="btn teal" data-no>Seguir relevando</button></div></div>`;
    m.querySelector('[data-x]').onclick = m.querySelector('[data-no]').onclick = () => m.remove();
    m.querySelector('[data-si]').onclick = () => { m.remove(); alAbandonar(); };
    document.body.appendChild(m);
  }
  function descartarRelevamiento() { state.fotos.forEach((f) => URL.revokeObjectURL(f.url)); state.fotos = []; ir('tipos'); }

  // Al elegir la marca se bajan por adelantado los planogramas de los espacios que corresponden: al abrir la ventana ya estan.
  function precargarPlanos() {
    if (!esperadosDe(state.pdv)) return;
    tiposEsperados(state.pdv, state.marca).slice(0, 4).forEach((t) => planosDe(state.pdv, state.marca, t.id).slice(0, 2).forEach((p) => { const im = new Image(); im.src = p.url; }));
  }

  // Ventana "Planograma de Referencia": hay que verla completa para poder abrir la camara.
  async function abrirReferencia() {
    if (state.abriendoRef) return;   // evita abrir dos ventanas con toques repetidos
    state.abriendoRef = true;
    if (!state.planosListo && !state.planos.length) { toast('Cargando planogramas…'); await state.planosP; }
    const vars = segunColab(variantesDe(planosDe(state.pdv, state.marca, state.tipo.id)));
    let vi = 0, ps = vars.length ? vars[0].planos : [];
    let i = 0; let vistas = new Set([0]);
    const m = document.createElement('div');
    m.className = 'modal';
    const cerrarRef = () => { m.remove(); state.abriendoRef = false; };
    const pintar = () => {
      vistas.add(i);
      const listo = !ps.length || vistas.size === ps.length;
      m.innerHTML = `<div class="modal-card"><button class="x" data-x aria-label="Cerrar">×</button>
        <h2>Planograma de Referencia</h2><div class="sub">${esc(state.marca)} · ${esc(state.tipo.nombre)}</div>
        ${vars.length > 1 ? `<div class="vars" role="group" aria-label="Variante del planograma">${vars.map((v, k) => `<button type="button" class="var-b ${k === vi ? 'on' : ''}" data-v="${k}">${esc(v.etiqueta)}</button>`).join('')}</div>` : ''}
        ${ps.length ? `<div class="ref"><img src="${esc(ps[i].url)}" alt="Planograma">
            ${ps.length > 1 ? '<button class="arrow l" data-n="-1" aria-label="Anterior">‹</button><button class="arrow r" data-n="1" aria-label="Siguiente">›</button>' : ''}</div>
          ${ps.length > 1 ? `<div class="dots">${ps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}`
          : `<div class="empty">Todavía no hay planograma de referencia de ${state.colab ? 'esta colaboración' : 'esta marca'} para este espacio.</div>`}
        <div class="hint">${listo ? (ps.length ? 'Toca la imagen para acercarla' : '') : `Mira las ${ps.length} imágenes para continuar`}</div>
        <button class="btn teal block" data-go ${listo ? '' : 'disabled'}>Entendido, abrir cámara</button></div>`;
      m.querySelector('[data-x]').onclick = () => cerrarRef();
      m.querySelector('.ref img')?.addEventListener('click', () => lightbox([{ url: ps[i].url }]));
      m.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => { i = (i + +b.dataset.n + ps.length) % ps.length; pintar(); });
      m.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { vi = +b.dataset.v; ps = vars[vi].planos; i = 0; vistas = new Set([0]); pintar(); });
      m.querySelector('[data-go]').onclick = () => { state.variante = vars[vi] && vars[vi].marcas.length > 1 ? vars[vi].etiqueta : ''; cerrarRef(); abrirCamara(false); };
    };
    pintar();
    document.body.appendChild(m);
  }

  // Camara propia (getUserMedia); si el navegador no la da, cae al selector de camara del sistema.
  async function abrirCamara(sumar) {
    if (document.querySelector('.cam')) return;
    // sumar = true: viene de "+ Foto" en Cumplimiento; se conservan las fotos ya tomadas.
    const base = sumar ? state.fotos.slice() : [];
    if (!sumar) state.fotos.forEach((f) => URL.revokeObjectURL(f.url));
    state.fotos = base.slice();
    const el = document.createElement('div');
    el.className = 'cam';
    el.innerHTML = `<div class="cam-top"><div class="cam-pill">Tomar foto de: ${esc(state.marca)} · ${esc(state.tipo.nombre)}</div></div>
      <div class="cam-view"><video playsinline muted autoplay></video><div class="cam-grid"><i></i><i></i><i></i><i></i></div><div class="flash"></div>
        <button class="cam-ref" data-ref>${ICON_IMG} Ver referencia</button><div class="cam-count" data-count></div><div class="cam-msg hide" data-msg></div>
        <div class="cam-zoom hide" data-zoom><button type="button" data-zm aria-label="Alejar">−</button><input type="range" min="1" max="4" step="0.1" value="1" data-zr aria-label="Zoom"><button type="button" data-zp aria-label="Acercar">+</button><span data-zv>1×</span></div>
        <div class="cam-bar"><button class="btn" data-cerrar>Cerrar</button><button class="shutter" data-disp aria-label="Tomar foto"></button><button class="btn listo hide" data-listo></button></div></div>
      <input type="file" accept="image/*" capture="environment" class="hide" data-file>`;
    document.body.appendChild(el);
    const video = el.querySelector('video');
    const q = (s) => el.querySelector(s);
    let stream = null;
    const parar = () => stream?.getTracks().forEach((t) => t.stop());
    const salir = () => { parar(); el.remove(); };
    const actualizar = () => { const n = state.fotos.length, falta = C.MIN_FOTOS - n; q('[data-count]').textContent = `Fotos ${n}/${C.MAX_FOTOS} · ${falta > 0 ? `faltan ${falta} obligatoria${falta > 1 ? 's' : ''}` : n < C.MAX_FOTOS ? `${C.MAX_FOTOS - n} adicional${C.MAX_FOTOS - n > 1 ? 'es' : ''} opcional${C.MAX_FOTOS - n > 1 ? 'es' : ''}` : 'completo'}`; const b = q('[data-listo]'); b.classList.toggle('hide', !n); b.disabled = falta > 0; b.textContent = falta > 0 ? `Faltan ${falta}` : `Listo · ${n}/${C.MAX_FOTOS}`; q('[data-disp]').classList.toggle('lleno', state.fotos.length >= C.MAX_FOTOS); };
    const agregar = (blob) => { if (state.fotos.length >= C.MAX_FOTOS) { toast(`Máximo ${C.MAX_FOTOS} fotos por relevamiento`); return; } state.fotos.push({ blob, url: URL.createObjectURL(blob) }); actualizar(); toast(`Foto ${state.fotos.length}/${C.MAX_FOTOS} tomada`); const f = q('.flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };

    // Zoom: con el zoom real de la camara si el telefono lo da; si no, zoom digital (recorte al centro).
    let zoom = 1, hw = null;
    const setZoom = (z) => {
      const r = q('[data-zr]'); z = Math.min(+r.max, Math.max(+r.min, z)); zoom = z; r.value = z;
      q('[data-zv]').textContent = z.toFixed(1).replace(/\.0$/, '') + '×';
      if (hw) stream.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {});
      else video.style.transform = z > 1 ? `scale(${z})` : '';
    };
    const iniciarZoom = () => {
      const r = q('[data-zr]'), cap = (stream.getVideoTracks()[0].getCapabilities && stream.getVideoTracks()[0].getCapabilities()) || {};
      if (cap.zoom && cap.zoom.max > cap.zoom.min) { hw = true; r.min = cap.zoom.min; r.max = Math.min(cap.zoom.max, 6); r.step = cap.zoom.step || 0.1; r.value = cap.zoom.min; zoom = cap.zoom.min; }
      q('[data-zoom]').classList.remove('hide');
      r.oninput = () => setZoom(+r.value);
      q('[data-zm]').onclick = () => setZoom(zoom - 0.5);
      q('[data-zp]').onclick = () => setZoom(zoom + 0.5);
      // Pellizco con dos dedos sobre la imagen.
      const dedos = new Map(); let d0 = 0, z0 = 1;
      const dist = () => { const [a, b] = [...dedos.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      const vista = q('.cam-view');
      vista.addEventListener('pointerdown', (e) => { dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (dedos.size === 2) { d0 = dist(); z0 = zoom; } });
      vista.addEventListener('pointermove', (e) => { if (!dedos.has(e.pointerId)) return; dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (dedos.size === 2 && d0) setZoom(z0 * dist() / d0); });
      const suelta = (e) => { dedos.delete(e.pointerId); d0 = 0; };
      vista.addEventListener('pointerup', suelta); vista.addEventListener('pointercancel', suelta);
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin getUserMedia');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = stream;
      iniciarZoom();
    } catch (e) {
      video.remove();
      const m = q('[data-msg]'); m.classList.remove('hide');
      m.innerHTML = '<div><p>No se pudo abrir la cámara dentro de la app.</p><p class="muted" style="color:rgba(255,255,255,.7)">Usa el botón blanco para tomar la foto con la cámara del teléfono.</p></div>';
    }

    q('[data-disp]').onclick = () => {
      if (!stream || !video.videoWidth) return q('[data-file]').click();
      const cv = document.createElement('canvas');
      const vw = video.videoWidth, vh = video.videoHeight, k = hw ? 1 : zoom;   // zoom digital: se recorta el centro
      const sw = vw / k, sh = vh / k, e = Math.min(1, C.FOTO_MAX_PX / Math.max(sw, sh));
      cv.width = Math.round(sw * e); cv.height = Math.round(sh * e);
      cv.getContext('2d').drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, cv.width, cv.height);
      cv.toBlob((b) => { if (b) { b.comprimida = true; agregar(b); } }, 'image/jpeg', C.FOTO_CALIDAD);
    };
    q('[data-file]').onchange = (e) => { for (const f of e.target.files) agregar(f); e.target.value = ''; };
    q('[data-ref]').onclick = () => lightbox(planosDe(state.pdv, state.marca, state.tipo.id).map((p, k, a) => ({ url: p.url, caption: `Planograma ${k + 1} de ${a.length}` })));
    const cerrarCam = () => {
      state.fotos.slice(base.length).forEach((f) => URL.revokeObjectURL(f.url));
      state.fotos = base; salir(); ir(sumar ? 'criterios' : 'tipos');
    };
    q('[data-cerrar]').onclick = () => { if (state.fotos.length - base.length) confirmarAbandono(cerrarCam); else cerrarCam(); };
    q('[data-listo]').onclick = () => { if (state.fotos.length < C.MIN_FOTOS) return; if (!sumar) { state.criterios = new Set(); state.obs = ''; } salir(); ir('criterios'); };
    actualizar();
  }

  // Preguntas del relevamiento: una opcion por pregunta; "Qué ocupa el espacio" solo aparece si la marca no está.
  function pasoCriterios() {
    const sel = state.criterios;
    C.PREGUNTAS.filter((q) => q.si && !sel.has(q.si)).forEach((q) => q.opciones.forEach((o) => sel.delete(o.id)));   // si ya no aplica, se descarta
    // Algunas respuestas dejan sin sentido otras preguntas (p. ej. "Material sin producto": no hay abastecimiento ni visibilidad que valorar).
    const omitidas = new Set(C.PREGUNTAS.flatMap((q) => q.opciones.filter((o) => sel.has(o.id) && o.omite).flatMap((o) => o.omite)));
    C.PREGUNTAS.filter((q) => omitidas.has(q.id)).forEach((q) => q.opciones.forEach((o) => sel.delete(o.id)));
    const visibles = C.PREGUNTAS.filter((q) => (!q.si || sel.has(q.si)) && !omitidas.has(q.id));
    let nro = 0;
    const falta = () => sel.has('presente_no') && !String(state.obs || '').trim();   // si la marca no está, la observación es obligatoria
    const completo = visibles.every((q) => q.opciones.some((o) => sel.has(o.id))) && !falta();
    $app.innerHTML = `<div class="wrap"><h1>Relevamiento</h1><p class="lead">${esc(state.pdv)} · ${esc(state.marca)} · ${esc(state.tipo.nombre)}</p>
      <div class="row" style="margin-top:14px"><button class="back" id="abandonar" aria-label="Abandonar relevamiento">${ICON_BACK}</button></div>
      <div class="thumbs">${state.fotos.map((f, i) => `<div class="foto"><img src="${esc(f.url)}" alt="Ver foto" data-ver="${i}"><button class="x" data-del="${i}" aria-label="Quitar">×</button></div>`).join('')}</div>
      ${visibles.map((q) => `<div class="preg"><h2>${q.numero ? ++nro + '. ' : ''}${esc(q.titulo)}</h2>${q.nota ? `<p class="muted">${esc(q.nota)}</p>` : ''}
        <div class="opts">${q.opciones.map((o) => `<button class="opt radio ${sel.has(o.id) ? 'on' : ''}" data-c="${o.id}"><span class="box"></span>${esc(o.texto)}</button>`).join('')}</div></div>${q.id === 'ocupa' ? `<div class="preg"><h2>Observación obligatoria</h2><p class="muted">¿Por qué no se encontró? ¿Hay otro mueble de la marca o de otra? ¿Sin ningún producto en su lugar?</p><textarea id="obs" class="obs" rows="3" maxlength="300" placeholder="Ej.: el exhibidor se retiró del local">${esc(state.obs)}</textarea></div>` : ''}`).join('')}
      <div class="sticky-bar"><div class="row"><button class="btn" id="mas" ${state.fotos.length >= C.MAX_FOTOS ? 'disabled' : ''}>+ Foto</button><button class="btn teal block" id="guardar" ${completo && state.fotos.length >= C.MIN_FOTOS ? '' : 'disabled'}>Guardar relevamiento</button></div>${state.fotos.length < C.MIN_FOTOS ? `<p class="muted" style="text-align:center;margin:8px 0 0">Faltan ${C.MIN_FOTOS - state.fotos.length} foto(s) obligatoria(s)</p>` : ''}</div></div>`;
    document.getElementById('abandonar').onclick = () => confirmarAbandono(descartarRelevamiento);
    const cajaObs = document.getElementById('obs'); if (cajaObs) cajaObs.oninput = () => { state.obs = cajaObs.value; const g = document.getElementById('guardar'); if (g) g.disabled = !(visibles.every((q) => q.opciones.some((o) => sel.has(o.id))) && !falta() && state.fotos.length >= C.MIN_FOTOS); };   // sin volver a pintar: no pierde el cursor
    $app.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => {
      const c = criterioDe(b.dataset.c);
      C.CRITERIOS.filter((x) => x.grupo === c.grupo).forEach((x) => sel.delete(x.id));   // una sola opcion por pregunta
      sel.add(c.id);
      pasoCriterios();
    });
    // Tocar una miniatura la abre en grande (visor con zoom) para revisar la foto antes de guardar; empieza en la tocada y las demas quedan con las flechas.
    $app.querySelectorAll('[data-ver]').forEach((im) => im.onclick = () => { const i = +im.dataset.ver; lightbox([...state.fotos.slice(i), ...state.fotos.slice(0, i)].map((f) => ({ url: f.url })), '', false, true); });
    $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { state.fotos.splice(+b.dataset.del, 1); if (!state.fotos.length) ir('tipos'); else pasoCriterios(); });
    document.getElementById('mas').onclick = () => abrirCamara(true);
    document.getElementById('guardar').onclick = async (e) => {
      if (state.guardando) return;   // un solo envio a la vez: evita registros dobles por toques repetidos
      state.guardando = true;
      e.target.disabled = true; e.target.textContent = 'Guardando…';
      try {
        const n = state.fotos.length, ids = [...sel];
        const obs = sel.has('presente_no') ? String(state.obs || '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '';   // solo si la marca no esta; sin "|" porque separa los criterios
        await S.guardarFotos({ pdv: state.pdv, marca: state.marca, tipo: state.tipo.nombre, ci: state.usuario.ci, relevador: state.usuario.nombre, criterios: [...ids, C.resultado(ids), ...(state.variante ? ['colab:' + state.variante] : []), ...(obs ? ['obs:' + obs] : [])] }, state.fotos.map((f) => f.blob));
        const just = (state.extras || {})[state.marca + '|' + state.tipo.id];
        if (just) {
          await S.guardarNota({ pdv: state.pdv, marca: state.marca, tipo: 'Adicional: ' + state.tipo.nombre, ci: state.usuario.ci, relevador: state.usuario.nombre, texto: just });
        }
        state.fotos.forEach((f) => URL.revokeObjectURL(f.url));
        state.fotos = []; state.hechos.add(state.marca + '|' + state.tipo.id); guardarVisita(); marcarVisitado(state.pdv);
        toast(!S.remoto ? `${n} foto(s) guardadas en este dispositivo (modo prueba)` : navigator.onLine ? 'Relevamiento guardado. Se está subiendo en segundo plano.' : `Guardado en el teléfono: ${n} foto(s) se subirán cuando haya señal`);
        pintarSync(); state.guardando = false; ir('tipos');
      } catch (err) { state.guardando = false; toast('No se pudo guardar: ' + err.message); e.target.disabled = false; e.target.textContent = 'Guardar relevamiento'; }
    };
  }

  // ═══════════ Administracion: acceso con PIN ═══════════
  async function conPin(siguiente, ambito) {
    const clave = 'pin-' + ambito;
    const valida = async (p) => { try { return await S.verificarPin(p, ambito); } catch (e) { toast(e.message); return null; } };  // null: bloqueado por intentos
    const guardada = localStorage.getItem(clave) || sessionStorage.getItem(clave);   // 'Recordarme en este dispositivo' usa localStorage
    if (guardada) {
      const v = await valida(guardada);
      if (v || (v === null && state.datos)) return siguiente(guardada);   // bloqueado con el tablero ya abierto: se conserva lo que se ve
    }
    // Ingreso: tarjeta clara sobre fondo con cuadros flotantes
    // Tres capas: al fondo cuadros grandes y borrosos (hacia el centro), en medio translucidos y adelante opacos (algunos rojos con cruz).
    const R = (a, b) => a + Math.random() * (b - a);
    const COL = { teal: '60,179,168', red: '193,29,42', gris: '110,118,120', menta: '150,214,205' };
    const pick = (pesos) => { let r = Math.random() * pesos.reduce((a, p) => a + p[1], 0); for (const [c, w] of pesos) { if ((r -= w) < 0) return c; } return pesos[0][0]; };
    const cuadro = (capa) => {
      const fondo = capa === 'fondo', medio = capa === 'medio';
      const t = fondo ? R(70, 150) : medio ? R(22, 60) : R(12, 40);
      const a = fondo ? R(.16, .34) : medio ? R(.2, .42) : R(.8, .95);
      const c = pick(fondo ? [['teal', 4], ['menta', 3], ['red', 2], ['gris', 2]] : medio ? [['teal', 4], ['menta', 3], ['red', 1]] : [['teal', 5], ['red', 3], ['gris', 1]]);
      const cen = (m) => 50 + (R(-1, 1) + R(-1, 1)) / 2 * m;   // se agrupan hacia el centro pero con dispersion
      const x = fondo ? cen(46) : R(0, 96), y = fondo ? cen(42) : R(0, 94);
      const cruz = !fondo && !medio && c === 'red' && t > 18 && Math.random() < .5;
      return `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${t.toFixed(0)}px;height:${t.toFixed(0)}px;--r:${R(-30, 30).toFixed(0)}deg;--dx:${R(-40, 40).toFixed(0)}px;--dy:${R(-50, 50).toFixed(0)}px;--g:${R(-25, 25).toFixed(0)}deg;background:rgba(${COL[c]},${a.toFixed(2)});${fondo ? `filter:blur(${R(5, 10).toFixed(0)}px);` : ''}animation-duration:${R(5, 10).toFixed(1)}s;animation-delay:-${R(0, 9).toFixed(1)}s">${cruz ? '<b></b>' : ''}</i>`;
    };
    const cuadros = [...Array(14).fill('fondo'), ...Array(16).fill('medio'), ...Array(26).fill('frente')].map(cuadro).join('');
    const icoLock = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/></svg>';
    const icoOjo = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    document.body.classList.add('login-pin');
    $app.innerHTML = `<div class="pin-bg" aria-hidden="true">${cuadros}</div>
      <div class="pin-wrap"><div class="pin-card">
        <img class="pin-logo" src="img/logo-masmarka.png" alt="+MARKA">
        <p class="pin-tag">${ambito === 'admin' ? 'Administración<br>de planogramas' : 'Plataforma de ejecución<br>en punto de venta'}</p>
        <label class="pin-lab" for="pin">Clave de acceso</label>
        <div class="pin-in">${icoLock}<input id="pin" type="password" autocomplete="off" placeholder="Ingresa tu clave"><button type="button" class="ojo" id="ojo" aria-label="Mostrar u ocultar clave">${icoOjo}</button></div>
        <label class="pin-rec"><input type="checkbox" id="rec" checked> Recordarme en este dispositivo</label>
        <p class="pin-err" id="err"></p>
        <button class="pin-btn" id="ok">Iniciar sesión <span aria-hidden="true">→</span></button>
      </div><p class="pin-foot">© 2026 +MARKA. Todos los derechos reservados.</p></div>`;
    const entrar = async () => {
      const pin = document.getElementById('pin').value;
      const ok = await valida(pin);
      if (ok) {
        const rec = document.getElementById('rec').checked;
        (rec ? localStorage : sessionStorage).setItem(clave, pin);
        (rec ? sessionStorage : localStorage).removeItem(clave);
        document.body.classList.remove('login-pin'); siguiente(pin);
      }
      else if (ok === false) document.getElementById('err').textContent = 'Clave incorrecta';
    };
    document.getElementById('ok').onclick = entrar;
    document.getElementById('pin').onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
    document.getElementById('ojo').onclick = () => { const i = document.getElementById('pin'); i.type = i.type === 'password' ? 'text' : 'password'; };
  }

  // Cargador +MARKA: un cubo salta de simbolo en simbolo e ilumina cada letra.
  function cargador(texto) {
    return `<div class="ld"><div class="ld-w" role="status" aria-label="${esc(texto)}"><div class="ld-cx"><div class="ld-cy"><i></i></div></div>${['+', 'M', 'A', 'R', 'K', 'A'].map((g, i) => `<span style="--i:${i}">${g}</span>`).join('')}</div><p>${esc(texto)}</p></div>`;
  }

  // ═══════════ TABLERO ═══════════
  async function vistaTablero(pin) {
    if (!state.datos) $app.innerHTML = cargador('Cargando, aguarde un momento...');
    try { state.datos = await S.todasLasFotos(pin); } catch (e) {
      if (state.datos) { toast(e.message); return pintarTablero(); }
      $app.innerHTML = `<div class="wrap wide"><div class="empty">No se pudo leer Drive: ${esc(e.message)}</div></div>`; return; }
    pintarTablero();
  }

  // Historial del tablero: cada cambio de pestaña se guarda para poder volver y avanzar (flechas y boton atras del navegador).
  const hist = { n: 0, max: 0 };
  const instantanea = () => ({ n: hist.n, vista: state.vista || 'resumen', det: state.det || '', tipo: state.tab.tipo || '' });
  function navegar(cambio) {
    if (!history.state || history.state.tablero === undefined) history.replaceState({ tablero: instantanea() }, '');
    cambio();
    hist.n += 1; hist.max = hist.n;
    history.pushState({ tablero: instantanea() }, '');
    pintarTablero(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', (e) => {
    const t = e.state && e.state.tablero;
    if (!t || document.body.dataset.page !== 'tablero') return;
    hist.n = t.n; state.vista = t.vista; state.det = t.det; state.tab.tipo = t.tipo;
    pintarTablero(); window.scrollTo(0, 0);
  });

  function pintarTablero() {
    document.body.classList.add('dash');
    const f = state.tab, todas = state.datos || [];
    const hoy = diaISO(Date.now());
    const opt = (k) => [...new Set(todas.map((x) => x[k]).filter(Boolean))].sort();
    // Buscador de texto libre: cada palabra debe aparecer en el punto de venta, cadena, marca, espacio, fecha o respuestas.
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const palabras = norm(f.q).split(/\s+/).filter(Boolean);
    const cadenaDe = {}; state.pdvs.forEach((p) => { cadenaDe[p.nombre] = p.cadena || ''; });
    const pajar = (x) => norm([x.pdv, cadenaDe[x.pdv], x.marca, x.tipo, fmtFecha(x.ts), diaISO(x.ts), ...(x.criterios || []).map((id) => criterioDe(id).texto)].join(' '));
    const coincide = (x) => !palabras.length || ((s) => palabras.every((w) => s.includes(w)))(pajar(x));
    const coincidePdv = (nombre) => !palabras.length || ((s) => palabras.every((w) => s.includes(w)))(norm(nombre + ' ' + (cadenaDe[nombre] || '')));
    const enfoque = document.activeElement && document.activeElement.id === 'bq' ? document.activeElement.selectionStart : -1;
    const base = todas.filter((x) =>
      coincide(x) &&
      (!f.desde || diaISO(x.ts) >= f.desde) && (!f.hasta || diaISO(x.ts) <= f.hasta) &&
      (!f.marca || x.marca === f.marca) && (!f.relevador || x.relevador === f.relevador) && (!f.tipo || x.tipo === f.tipo) &&
      (!f.criterio || (x.criterios || []).includes(f.criterio))).sort((a, b) => b.ts - a.ts);
    const lista = base.filter((x) => !f.pdv || x.pdv === f.pdv);
    const vista = state.vista || 'resumen';

    const agrupar = (arr) => {
    const visitas = [];
    [...arr].sort((a, b) => a.ts - b.ts).forEach((x) => {
      const v = visitas.find((q) => q.pdv === x.pdv && q.marca === x.marca && q.tipo === x.tipo && q.relevador === x.relevador && x.ts - q.fin <= 20 * 60 * 1000);
      if (v) { v.fotos.push(x); v.fin = x.ts; v.criterios = [...new Set([...v.criterios, ...(x.criterios || [])])]; }
      else visitas.push({ id: x.id, pdv: x.pdv, marca: x.marca, tipo: x.tipo, relevador: x.relevador, ts: x.ts, fin: x.ts, fotos: [x], criterios: [...(x.criterios || [])] });
    });
    visitas.sort((a, b) => b.ts - a.ts);
    return visitas;
    };
    const V = agrupar(lista);

    const INCID = C.CRITERIOS.filter((x) => !x.derivado && (x.tono === 'bad' || x.tono === 'warn')).map((x) => x.id);   // respuestas que cuentan como hallazgo
    // Solo hay dos resultados: Cumple / No cumple (un 'parcial' de registros viejos cuenta como No cumple).
    const resDe = (x) => { const r = ['cumple', 'no_cumple', 'parcial'].find((id) => (x.criterios || []).includes(id)); return r === 'parcial' ? 'no_cumple' : r || null; };
    const cnt = (arr, id) => arr.filter((x) => resDe(x) === id).length;
    const tiene = (arr, id) => arr.filter((x) => (x.criterios || []).includes(id)).length;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
    const ico = (n) => ({
      foto: '<path d="M7 4.5h8l3 3V19a1 1 0 01-1 1H7a1 1 0 01-1-1V5.5a1 1 0 011-1z"/><path d="M9 11h6M9 14h6M9 17h4"/>',
      ok: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 4.9-5.2"/>',
      warn: '<path d="M12 4.5l8.5 14.5h-17z"/><path d="M12 10v4M12 16.5v.1"/>',
      bad: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
      cumple: '<path d="M5 13l4 4L19 7"/>',
      flag: '<path d="M6 20V5m0 0h10l-1.8 3.2L16 11.5H6"/>',
      pin: '<path d="M12 20s6-5.6 6-10.2A6 6 0 006 9.8C6 14.4 12 20 12 20z"/><circle cx="12" cy="9.8" r="2.2"/>',
      cmp: '<path d="M5 19V9m5 10V5m5 14v-7m5 7V8"/>',
      grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
      img: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19 17"/>',
      down: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19.5h14"/>',
      out: '<path d="M10 5H6.5A1.5 1.5 0 005 6.5v11A1.5 1.5 0 006.5 19H10M15 8l4 4-4 4M19 12H9"/>',
    }[n] || '');
    const svg = (n, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ico(n)}</svg>`;
    // Halls siempre va con Trident: todo lo relevado en Halls cuenta en la colaboración "Trident + Halls" (usa el nombre del planograma si existe).
    const etiqHallsTrident = (() => { const p = state.planos.map(variantePlano).find((vp) => ['halls', 'trident'].every((m) => vp.marcas.some((x) => limpiaMarca(x) === m))); return p ? p.etiqueta.replace(/ · .*/, '') : 'Trident + Halls'; })();
    const colDe = (v) => { const c = (v.criterios || []).find((id) => /^colab:/.test(id)); return c ? c.slice(6) : (limpiaMarca(v.marca) === 'halls' ? etiqHallsTrident : ''); };
    const obsDe = (v) => { const c = (v.criterios || []).find((id) => /^obs:/.test(id)); return c ? c.slice(4) : ''; };
    const tags = (x) => (x.criterios || []).filter((id) => !/^obs:/.test(id)).map((id) => { const c = criterioDe(id); return `<span class="badge ${c.tono || ''}">${esc(c.texto)}</span>`; }).join('');

    // ── Indicadores ──
    const n = V.length, c = cnt(V, 'cumple'), p = cnt(V, 'parcial'), nc = cnt(V, 'no_cumple'), sin = n - c - p - nc;
    const conRes = c + p + nc, pctCumple = pct(c, conRes);
    const pdvsAll = [...new Set([...nombresPdv(), ...base.map((x) => x.pdv)])].sort((a, b) => a.localeCompare(b));
    const pdvsVista = (f.pdv ? pdvsAll.filter((q) => q === f.pdv) : pdvsAll).filter((q) => !palabras.length || coincidePdv(q) || base.some((x) => x.pdv === q));
    const relevados = pdvsVista.filter((q) => V.some((v) => v.pdv === q)).length;
    const pctRuta = pct(relevados, pdvsVista.length);
    const kpi = (cls, icono, titulo, valor, extra, ir) => `<${ir ? `button type="button" class="k-card k-link" data-v="${ir}" title="Ver ${titulo.toLowerCase()}"` : 'div class="k-card"'}><div class="k-top"><span>${titulo}</span><i class="k-ico ${cls}">${svg(icono, 18)}</i></div><div class="k-row"><div class="k-val">${valor}</div>${extra || ''}</div></${ir ? 'button' : 'div'}>`;

    // ── Estado por punto de venta ──
    const filasPdv = pdvsVista.map((nombre) => {
      const it = V.filter((x) => x.pdv === nombre), cc = cnt(it, 'cumple'), pp = cnt(it, 'parcial'), nn = cnt(it, 'no_cumple'), ss = it.length - cc - pp - nn;
      return { nombre, n: it.length, cc, pp, nn, ss, pc: pct(cc, cc + pp + nn) };
    });
    const orden = state.orden || 'mayor';
    filasPdv.sort((a, b) => orden === 'az' ? a.nombre.localeCompare(b.nombre)
      : orden === 'menor' ? (a.pc ?? 999) - (b.pc ?? 999) || a.nombre.localeCompare(b.nombre)
      : (b.pc ?? -1) - (a.pc ?? -1) || a.nombre.localeCompare(b.nombre));
    const tonoPct = (v) => (v === null ? 'mut' : v >= 80 ? 'ok' : v >= 50 ? 'warn' : 'bad');
    // Estado por cadena: agrupa los puntos de venta por su cadena.
    const cadDe = {}; state.pdvs.forEach((p) => { cadDe[p.nombre] = p.cadena || 'Sin cadena'; });
    const cadenas = {};
    filasPdv.forEach((r) => { const k = cadDe[r.nombre] || 'Sin cadena'; (cadenas[k] = cadenas[k] || []).push(r); });
    const filasCad = Object.keys(cadenas).map((k) => {
      const rs = cadenas[k], cc = rs.reduce((s, r) => s + r.cc, 0), tot = rs.reduce((s, r) => s + r.cc + r.pp + r.nn, 0);
      return { nombre: k, pdvs: rs, total: rs.length, rel: rs.filter((r) => r.n).length, n: rs.reduce((s, r) => s + r.n, 0), cc, tot, pc: pct(cc, tot) };
    }).sort((a, b) => b.rel / b.total - a.rel / a.total || b.total - a.total || a.nombre.localeCompare(b.nombre));
    const cadSel = filasCad.find((x) => x.nombre === state.cadena) || null;
    const seg = (cls, v, tot) => (v ? `<i class="${cls}" style="width:${(v / tot) * 100}%"></i>` : '');

    // ── Donut, hallazgos y zonas ──
    const a1 = pct(c, n) || 0, a2 = a1 + (pct(p, n) || 0), a3 = a2 + (pct(nc, n) || 0);
    const donut = n ? `conic-gradient(#22a447 0 ${a1}%, #d89b14 ${a1}% ${a2}%, #d64545 ${a2}% ${a3}%, #d5dcda ${a3}% 100%)` : '#e3e9e7';
    const frec = INCID.map((id) => [id, tiene(V, id)]).filter((r) => r[1]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const algun = (arr, ids) => arr.filter((x) => (x.criterios || []).some((id) => ids.includes(id))).length;
    const maxF = Math.max(1, ...frec.map((r) => r[1]));
    const hallazgos = frec.length;
    // Respuestas favorables (tono ok) y no favorables (warn/bad), con los puntos de venta donde se dieron.
    const porTono = (esFav) => C.CRITERIOS.filter((x) => !x.derivado && (x.tono === 'ok') === esFav).map((x) => {
      const it = V.filter((v) => (v.criterios || []).includes(x.id));
      return { txt: x.etiqueta || x.texto, n: it.length, pdvs: [...new Set(it.map((v) => v.pdv))].sort((p, q) => p.localeCompare(q)) };
    }).filter((r) => r.n).sort((p, q) => q.n - p.n);
    const favs = porTono(true), nofavs = porTono(false);
    const marcasR = C.MARCAS.map((m) => { const it = V.filter((x) => x.marca === m); return { m, n: it.length, pc: pct(cnt(it, 'cumple'), it.filter((x) => resDe(x)).length) }; }).filter((z) => z.n).sort((a, b) => b.n - a.n);

    // ── Evaluación: planograma vs foto auditada ──
    // Al abrir (sin elegir una foto) se muestra primero una góndola ideal: todo favorable y con planograma de referencia; si no hay, una que cumple, y si no, la primera.
    const todoFav = (v) => !C.PREGUNTAS.some((q) => { const o = q.opciones.find((x) => (v.criterios || []).includes(x.id)); return o && o.tono !== 'ok'; });
    const conRef = (v) => { const t = tipoDe(v.tipo); return !!(t && planosDe(v.pdv, v.marca, t.id).length); };
    const elegida = V.findIndex((v) => v.fotos.some((x) => x.id === state.sel));
    const idx = elegida >= 0 ? elegida : Math.max(0, [(v) => resDe(v) === 'cumple' && todoFav(v) && conRef(v), (v) => resDe(v) === 'cumple' && conRef(v), (v) => conRef(v)].reduce((r, fn) => (r >= 0 ? r : V.findIndex(fn)), -1));
    const sel = V[idx] || null;
    let cmp = '<div class="empty">Aún no hay fotos para comparar con estos filtros.</div>', tituloEval = 'Evaluación de góndola';
    const carData = {};
    if (sel) {
      const t = tipoDe(sel.tipo), refs = t ? planosDe(sel.pdv, sel.marca, t.id) : [], r = resDe(sel), crit = sel.criterios || [];
      const ini = Math.max(0, sel.fotos.findIndex((x) => x.id === state.sel));
      carData.ref = refs.map((q) => q.url); carData.foto = sel.fotos.map((x) => x.url);
      const resp = C.PREGUNTAS.map((q) => { const o = q.opciones.find((x) => crit.includes(x.id)); return o ? { q, o } : null; }).filter(Boolean);
      const neg = resp.filter((r) => r.o.tono !== 'ok');
      tituloEval = `Evaluación de góndola · ${esc(sel.pdv)}${sel.marca ? ' · ' + esc(sel.marca) : ''}`;
      const resChip = r ? `<span class="chip res ${criterioDe(r).tono}">${svg(r === 'cumple' ? 'cumple' : r === 'parcial' ? 'warn' : 'bad', 15)}${esc(criterioDe(r).texto)}</span>` : '<span class="chip gry">Sin resultado registrado</span>';
      const chipResp = (r) => `<span class="chip ${r.o.tono === 'bad' ? 'red' : r.o.tono === 'warn' ? 'org' : 'grn'}"><b>${esc(r.q.corto)}:</b> ${esc(r.o.texto)}</span>`;
      const resumen = `${sel.marca ? sel.marca + ' · ' : ''}${sel.tipo} en ${sel.pdv}: ${r ? criterioDe(r).texto.toLowerCase() : 'sin resultado registrado'}. ` +
        (neg.length ? `Observaciones: ${neg.map((x) => x.q.corto.toLowerCase() + ' (' + x.o.texto.toLowerCase() + ')').join('; ')}.` : 'Todas las respuestas fueron favorables.') + (obsDe(sel) ? ` Observación del relevador: ${obsDe(sel)}` : '');
      // Si hay mas de una imagen, al pasar el mouse aparece un degradado suave en los costados para cambiar de imagen.
      const carro = (key, urls, alt, vacio, i0, girar) => (urls.length
        ? `<div class="cmp-f car" data-car="${key}"><img src="${esc(urls[i0])}" alt="${alt}" data-z="${esc(urls[i0])}">${girar ? BTN_GIRO(urls[i0]) : ''}${urls.length > 1
          ? `<button class="car-e l" data-d="-1" aria-label="Anterior">‹</button><button class="car-e r" data-d="1" aria-label="Siguiente">›</button><div class="car-d">${urls.map((_, k) => `<i class="${k === i0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>`
        : `<div class="cmp-f"><div class="cmp-vacio">${vacio}</div></div>`);
      const nF = sel.fotos.length;
      cmp = `<div class="cmp-bar"><label class="cmp-sel"><span>Góndola auditada</span><select id="selfoto">${V.map((v, i) => `<option value="${esc(v.id)}" ${i === idx ? 'selected' : ''}>${esc(v.pdv)} · ${esc(v.marca || '')} · ${esc(v.tipo)} · ${fmtFecha(v.ts)}${v.fotos.length > 1 ? ` · ${v.fotos.length} fotos` : ''}</option>`).join('')}</select></label>
          <div class="cmp-nav"><button class="ic-btn" id="prev" ${idx === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button><span>${idx + 1} / ${V.length}</span><button class="ic-btn" id="next" ${idx === V.length - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button></div></div>
        <div class="cmp-t"><span>Comparativa visual</span></div>
        <div class="cmp">
          <div class="cmp-c"><div class="cmp-l">Planograma ideal</div>${carro('ref', carData.ref, 'Planograma ideal', 'Sin planograma de referencia para esta zona', 0)}<small>${esc(sel.marca || '')} · ${esc(sel.tipo)} · ${!refs.length ? 'Sin planograma cargado' : refs[0].pdv !== '*' ? esc(refs[0].pdv) : 'Planograma general'}${refs.length > 1 ? ` · ${refs.length} imágenes` : ''}</small></div>
          <div class="cmp-arrow" aria-hidden="true"><span class="line"></span><i>→</i><span class="line"></span></div>
          <div class="cmp-c"><div class="cmp-l">Foto auditada</div>${carro('foto', carData.foto, 'Foto auditada', 'Sin imagen', ini, true)}<small>${esc(sel.pdv)} · ${fmtFecha(sel.ts)}${nF > 1 ? ` · ${nF} fotos` : ''}</small></div>
        </div>
        <div class="cmp-t"><span>Análisis de cumplimiento</span></div>
        <div class="an">
          <div class="an-a"><div class="an-l">Resultado de visita</div>${resChip}${colDe(sel) ? `<span class="chip gry">Colaboración: ${esc(colDe(sel))}</span>` : ''}</div>
          <div class="an-b"><div class="an-l">Hallazgos detectados</div><div class="chips">${resp.map(chipResp).join('')}</div></div>
          <div class="an-c"><div class="an-l">Resumen del relevamiento</div><div class="an-box">${esc(resumen)}</div></div>
        </div>`;
    }

    const select = (k, label, vals) => `<label class="f-sel"><span>${label}</span><select data-f="${k}"><option value="">Todos</option>${vals.map((v) => `<option ${f[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    const per = (id, txt) => `<button class="seg-b ${state.periodo === id ? 'on' : ''}" data-p="${id}">${txt}</button>`;
    const nav = (id, ic, txt) => `<button class="nav-b ${vista === id ? 'on' : ''}" data-v="${id}">${svg(ic, 19)}<span>${txt}</span></button>`;
    const buscador = `<label class="f-sel f-q"><span>Buscar</span><input type="search" id="bq" placeholder="Punto de venta, cadena, marca, espacio, fecha…" value="${esc(f.q)}" autocomplete="off"></label>`;
    const filtros = `<div class="filt">${buscador}${select('pdv', 'Punto de venta', opt('pdv'))}${select('marca', 'Marca', opt('marca'))}${select('tipo', 'Tipo de espacio', C.TIPOS.map((t) => t.nombre))}
              <label class="f-sel"><span>Respuesta</span><select data-f="criterio"><option value="">Todas</option>${C.CRITERIOS.filter((cr) => !cr.derivado).map((cr) => `<option value="${cr.id}" ${f.criterio === cr.id ? 'selected' : ''}>${esc(cr.etiqueta || cr.texto)}</option>`).join('')}</select></label>
              <label class="f-sel"><span>Desde</span><input type="date" data-f="desde" value="${f.desde}"></label><label class="f-sel"><span>Hasta</span><input type="date" data-f="hasta" value="${f.hasta}"></label></div>`;

    // ── Visitas incompletas: motivo por el que no se relevaron todos los espacios ──
    const notas = (S.notas || []).filter((x) => (!f.desde || diaISO(x.ts) >= f.desde) && (!f.hasta || diaISO(x.ts) <= f.hasta) && (!f.pdv || x.pdv === f.pdv) && (!f.marca || x.marca === f.marca)).sort((a, b) => b.ts - a.ts);
    const panelNotas = (lista, tit, sub, vacio, pref) => `<section class="panel"><div class="p-head"><i class="k-ico warn">${svg('warn', 18)}</i><div><h2>${tit}</h2><p>${sub}</p></div></div>
            ${lista.length ? lista.map((x) => `<div class="vis"><div class="vis-h"><div><b>${esc(x.pdv)} · ${esc(x.marca || '')}</b><small>${fmtFecha(x.ts)}</small></div><span class="chip org">${esc(String(x.tipo || '').replace(pref, ''))}</span></div><div class="an-l" style="margin-top:8px">Justificación</div><div class="an-box" style="min-height:0">${esc(x.texto)}</div></div>`).join('') : `<div class="empty">${vacio}</div>`}</section>`;
    const notasAdic = notas.filter((x) => /^Adicional:/.test(x.tipo || ''));
    // Solo se muestra lo que hoy configura el formulario: los espacios adicionales (fuera de la lista contemplada). Las notas "Sin relevar" antiguas ya no se muestran.
    // El panel "Espacios fuera de la lista" ya no se muestra al cliente. El registro sigue guardando cada caso (nota "Adicional: ...") como identificador.
    const secNotas = '';

    // ── Panel lateral de una cadena: avance, indicadores y puntos de venta (sin relevar / relevados) ──
    const iniciales = (nombre) => String(nombre).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const drawerCadena = (cd) => {
      const a = pct(cd.rel, cd.total) || 0, sinR = cd.pdvs.filter((r) => !r.n), conR = cd.pdvs.filter((r) => r.n);
      const orden2 = (arr) => [...arr].sort((u, v) => u.nombre.localeCompare(v.nombre));
      const fila = (r) => `<div class="dr-r" data-det="${esc(r.nombre)}" data-n="${esc(norm(r.nombre))}"><i class="dr-av ${r.n ? (r.pc === 100 ? 'ok' : r.pc === null ? 'mut' : 'bad') : 'mut'}">${esc(iniciales(r.nombre))}</i><div><b>${esc(r.nombre)}</b><small>${r.n ? `${r.n} góndola${r.n > 1 ? 's' : ''} auditada${r.n > 1 ? 's' : ''} · cumplen ${r.cc} de ${r.cc + r.pp + r.nn}` : 'Sin relevar'}</small></div></div>`;
      const grupo = (tit, cls, ic, arr) => `<div class="dr-g"><div class="dr-gh"><i class="k-ico ${cls}">${svg(ic, 16)}</i><b>${tit}</b><span class="dr-n ${cls}">${arr.length}</span></div>${arr.length ? orden2(arr).map(fila).join('') : '<p class="dr-vacio">Ninguno.</p>'}</div>`;
      const per2 = f.desde || f.hasta ? 'Período filtrado' : 'Todo el período';
      return `<div class="dr-bg" data-cad=""></div><aside class="dr" role="dialog" aria-label="Puntos de venta de ${esc(cd.nombre)}">
        <div class="dr-h"><div><small class="dr-eye">Estado por cadena</small><h2>${esc(cd.nombre)}</h2><p>${per2}</p></div><button type="button" class="dr-x" data-cad="" aria-label="Cerrar">×</button></div>
        <div class="dr-big"><b class="${a >= 80 ? 'ok' : a >= 40 ? 'warn' : 'bad'}">${a}%</b><div><span>${cd.rel} de ${cd.total} puntos de venta relevados</span><div class="cr-bar"><i style="width:${a}%"></i></div></div></div>
        <div class="dr-k"><div><b>${cd.total}</b><span>Puntos de venta</span></div><div><b class="ok">${cd.rel}</b><span>Relevados</span></div><div><b class="az">${cd.cc}</b><span>Góndolas que cumplen</span></div><div><b class="bad">${cd.tot - cd.cc}</b><span>No cumplen</span></div></div>
        <div class="dr-s"><input type="search" id="dq" placeholder="Buscar punto de venta…" autocomplete="off"></div>
        <div class="dr-b">${grupo('Sin relevar', 'bad', 'warn', sinR)}${grupo('Relevados', 'ok', 'ok', conR)}</div></aside>`;
    };

    // ── Resumen: indicadores y estado por punto de venta (con filtro) ──
    const secResumen = `<section><h1>Resumen</h1><p class="sub">Avance del relevamiento y resultados del período.</p><div class="filt">${buscador}</div>
            <div class="k-grid k4">
              ${kpi('az', 'pin', 'Total de puntos de venta', pdvsVista.length, '', 'det')}
              ${kpi('ok', 'pin', 'Puntos de venta relevados', `${relevados} <small>de ${pdvsVista.length}</small>`, `<div class="k-bar"><b class="ok" style="width:${pctRuta || 0}%"></b></div>`, 'det')}
              ${kpi('az', 'foto', 'Espacios relevados', n, '', 'esp')}
              ${kpi('warn', 'cumple', 'Cumplimiento', pctCumple === null ? '–' : pctCumple + '%', `<div class="k-bar"><b class="ok" style="width:${pctCumple || 0}%"></b></div>`, 'eval')}
            </div><div class="k-nota">Avance: ${pctRuta === null ? '–' : pctRuta + '%'} de los puntos de venta ya relevados (${relevados} de ${pdvsVista.length}). Cumplimiento: ${conRes ? `${c} de ${conRes} góndolas auditadas cumplen` : 'aún no hay góndolas auditadas'}; los puntos de venta sin relevar no entran en este porcentaje.${notasAdic.length ? ` Espacios encontrados fuera de lo contemplado en los acuerdos: ${notasAdic.length}.` : ''}</div></section>
          <section class="panel" id="s-mar"><div class="p-head"><i class="k-ico warn">${svg('foto', 18)}</i><div><h2>Marcas con más relevamientos</h2><p>Cantidad de góndolas relevadas por marca en el período.</p></div></div>
            ${marcasR.length ? marcasR.map((z) => `<div class="mr-row"><span>${esc(z.m)}</span><div class="mr-t"><i style="width:${(z.n / marcasR[0].n) * 100}%"></i></div><b>${z.n}</b></div>`).join('') : '<div class="empty">Sin relevamientos</div>'}</section>
          <section class="panel" id="s-cad"><div class="p-head"><i class="k-ico az">${svg('grid', 18)}</i><div><h2>Estado por cadena</h2><p>Avance de relevamiento de cada cadena. Toca "Ver puntos de venta" para abrir su detalle.</p></div></div>
            <div class="cr-list">${filasCad.length ? filasCad.map((x) => { const a = pct(x.rel, x.total) || 0; return `<div class="cr"><div class="cr-n"><b>${esc(x.nombre)}</b><button type="button" class="cr-ver" data-cad="${esc(x.nombre)}">Ver puntos de venta →</button></div>
              <div class="cr-m"><div class="cr-bar"><i style="width:${a}%"></i></div><div class="cr-leg"><span><i class="ok"></i><b>${x.rel}</b> relevados</span><span><i class="pend"></i><b>${x.total - x.rel}</b> sin relevar</span><span class="mut">· total ${x.total}</span><span class="cr-p">${a}%</span></div></div></div>`; }).join('') : '<div class="empty">Sin cadenas</div>'}</div></section>
          ${secNotas}${cadSel ? drawerCadena(cadSel) : ''}`;

    // ── Espacios no encontrados y adicionales: por punto de venta y marca, "no se encontró el contemplado" junto a "sí se encontró este otro" ──
    const notasEsp = notas.filter((x) => /^(No encontrado|Adicional):/.test(x.tipo || '') && (!f.tipo || String(x.tipo).replace(/^[^:]+:\s*/, '') === f.tipo));
    const gruposEsp = {};
    // Relevamientos donde la marca no se encontró en el espacio (respuesta "No, no se encontró"): también cuentan, en cualquier cadena (Biggie incluida).
    const qOcupa = C.PREGUNTAS.find((q) => q.id === 'ocupa');
    V.filter((v) => (v.criterios || []).includes('presente_no') && !notasEsp.some((x) => /^No encontrado:/.test(x.tipo) && x.pdv === v.pdv && x.marca === v.marca && String(x.tipo).replace(/^[^:]+:\s*/, '') === v.tipo)).forEach((v) => {
      const oc = qOcupa && qOcupa.opciones.find((o) => (v.criterios || []).includes(o.id));
      notasEsp.push({ pdv: v.pdv, marca: v.marca, ts: v.ts, tipo: 'No encontrado: ' + v.tipo, texto: obsDe(v), ocupa: oc ? oc.texto : '' });
    });
    notasEsp.forEach((x) => { const kk = [x.pdv, x.marca || '', diaISO(x.ts)].join('|'); (gruposEsp[kk] = gruposEsp[kk] || { pdv: x.pdv, marca: x.marca || '', ts: x.ts, no: [], ad: [] })[/^No encontrado:/.test(x.tipo) ? 'no' : 'ad'].push(x); });
    const listaEsp = Object.values(gruposEsp).sort((a, b) => b.ts - a.ts);
    const nom = (x) => esc(String(x.tipo || '').replace(/^[^:]+:\s*/, ''));
    const panelEsp = `<section class="panel" id="s-noenc"><div class="p-head"><i class="k-ico warn">${svg('warn', 18)}</i><div><h2>Espacios no encontrados y adicionales</h2><p>A la izquierda, el espacio acordado que no se encontró en el local. A la derecha, el espacio que sí se encontró en su lugar.</p></div></div>
      ${listaEsp.length ? listaEsp.map((g) => `<div class="vis"><div class="vis-h"><div><b>${esc(g.pdv)} · ${esc(g.marca)}</b><small>${fmtFecha(g.ts)}</small></div></div>
        ${Array.from({ length: Math.max(g.no.length, g.ad.length) }, (_, i) => { const n1 = g.no[i], a1 = g.ad[i];
          return `<div class="esp2"><div class="esp2-b rojo"><small>Espacio contemplado</small>${n1 ? `<div class="esp2-t"><span class="chip res bad">No se encontró</span> <b>${nom(n1)}</b></div>${n1.ocupa ? `<div class="muted">Ocupa el espacio: ${esc(n1.ocupa)}</div>` : ''}${n1.texto && n1.texto !== '(sin observación)' ? `<div class="muted">Observación: ${esc(n1.texto)}</div>` : ''}` : '<div class="muted">No se indicó qué espacio contemplado faltaba.</div>'}</div>
            <div class="esp2-f" aria-hidden="true">→</div>
            <div class="esp2-b verde"><small>Espacio encontrado en su lugar</small>${a1 ? `<div class="esp2-t"><span class="chip res ok">Sí se encontró</span> <b>${nom(a1)}</b></div><div class="muted">${a1.texto && a1.texto !== '(sin motivo indicado)' ? 'Justificación: ' + esc(a1.texto) : 'Sin justificación'}</div>` : '<div class="muted">No se relevó otro espacio en su lugar.</div>'}</div></div>`; }).join('')}</div>`).join('') : '<div class="empty">No hay espacios no encontrados ni adicionales con estos filtros.</div>'}</section>`;

    // ── Evaluación: análisis de góndolas + comparativa planograma vs foto ──
    const secEval = `<section><h1>Evaluación</h1><p class="sub">Análisis de góndolas y comparativa del planograma ideal con lo auditado.</p>${filtros}</section>
          <section class="panel" id="s-cmp"><div class="p-head"><i class="k-ico az">${svg('cmp', 18)}</i><div><h2>${tituloEval}</h2><p>Planograma ideal frente a cumplimiento en la foto auditada.</p></div></div>${cmp}</section>
          ${panelEsp}
          <section class="panel" id="s-ana"><div class="p-head"><i class="k-ico warn">${svg('flag', 18)}</i><div><h2>Análisis de góndolas</h2><p>${n} góndola${n === 1 ? '' : 's'} auditada${n === 1 ? '' : 's'} con los filtros elegidos</p></div></div>
            <div class="fn-res"><span class="chip res ok">Cumple · ${c}</span><span class="chip res bad">No cumple · ${nc}</span>${sin ? `<span class="chip gry">Sin resultado · ${sin}</span>` : ''}<span class="fn-pct">${pctCumple === null ? '–' : pctCumple + '%'} cumple</span>${marcasR.map((z) => `<span class="fn-m">${esc(z.m)} <em class="${tonoPct(z.pc)}">${z.pc === null ? '–' : z.pc + '%'}</em></span>`).join('')}</div>
            <div class="an2">${C.PREGUNTAS.map((q) => {
              const ops = q.opciones.map((o) => { const it = V.filter((v) => (v.criterios || []).includes(o.id)); return { o, n: it.length, pdvs: [...new Set(it.map((v) => v.pdv))].sort((u, w) => u.localeCompare(w)) }; });
              const tot = ops.reduce((t, r) => t + r.n, 0); if (!tot) return '';
              const col = { ok: '#22a447', warn: '#d89b14', bad: '#d64545' };
              return `<div class="an2-c"><h3>${esc(q.corto)}</h3><small class="an2-q">${esc(q.titulo || '')}</small>
                <div class="an2-bar">${ops.filter((r) => r.n).map((r) => `<i style="width:${(r.n / tot) * 100}%;background:${col[r.o.tono] || '#9aa8a5'}" title="${esc(r.o.texto)}: ${r.n}"></i>`).join('')}</div>
                ${ops.filter((r) => r.n).map((r) => `<div class="an2-r"><span class="an2-d" style="background:${col[r.o.tono] || '#9aa8a5'}"></span><span class="an2-t">${esc(r.o.texto)}</span><b>${r.n}</b><em>${Math.round((r.n / tot) * 100)}%</em>
                  ${r.o.tono !== 'ok' ? `<details class="an2-p"><summary>Ver puntos de venta (${r.pdvs.length})</summary><div>${r.pdvs.map((x) => `<span>${esc(x)}</span>`).join('')}</div></details>` : ''}</div>`).join('')}</div>`;
            }).join('') || '<div class="empty">Sin respuestas</div>'}</div></section>`;

    // ── Detalle de punto de venta: resultados, fotos y evidencias ──
    const pdvsDet = pdvsAll.filter((q) => !palabras.length || coincidePdv(q) || base.some((x) => x.pdv === q));
    const detNombre = state.det && pdvsDet.includes(state.det) ? state.det : (pdvsDet.find((q) => base.some((x) => x.pdv === q)) || pdvsDet[0] || '');
    const detFotos = base.filter((x) => x.pdv === detNombre);
    const VD = agrupar(detFotos);
    const dc = cnt(VD, 'cumple'), dp = cnt(VD, 'parcial'), dn = cnt(VD, 'no_cumple'), dpc = pct(dc, dc + dp + dn);
    const visitaHtml = (v) => {
      const r = resDe(v), crit = v.criterios || [];
      const resp = C.PREGUNTAS.map((q) => { const o = q.opciones.find((x) => crit.includes(x.id)); return o ? { q, o } : null; }).filter(Boolean);
      return `<div class="vis"><div class="vis-h"><div><b>${esc(v.marca || '')} · ${esc(v.tipo)}</b><small>${fmtFecha(v.ts)}</small></div>${r ? `<span class="chip res ${criterioDe(r).tono}">${esc(criterioDe(r).texto)}</span>` : '<span class="chip gry">Sin resultado</span>'}</div>
        <div class="chips">${resp.map((q) => `<span class="chip ${q.o.tono === 'bad' ? 'red' : q.o.tono === 'warn' ? 'org' : 'grn'}"><b>${esc(q.q.corto)}:</b> ${esc(q.o.texto)}</span>`).join('')}</div>${obsDe(v) ? `<p class="muted" style="margin:8px 0 0"><b>Observación:</b> ${esc(obsDe(v))}</p>` : ''}</div>`;
    };
    const secDet = `<section><h1>Detalle de punto de venta</h1><p class="sub">Resultados, fotos y evidencias de cada visita.</p>
            <div class="filt">${buscador}<label class="f-sel"><span>Punto de venta</span><select id="detsel">${pdvsDet.map((q) => `<option ${q === detNombre ? 'selected' : ''}>${esc(q)}</option>`).join('')}</select></label></div>
            <div class="k-grid k4">
              ${kpi('az', 'foto', 'Relevamientos', VD.length)}
              ${kpi('ok', 'cumple', 'Cumplimiento', dpc === null ? '–' : dpc + '%', dpc === null ? '' : `<div class="k-bar"><b class="ok" style="width:${dpc}%"></b></div>`)}
              ${kpi('bad', 'warn', 'No cumple', dn)}
            </div></section>
          <section class="panel"><div class="p-head"><i class="k-ico ok">${svg('cmp', 18)}</i><div><h2>Relevamientos · ${esc(detNombre)}</h2></div></div>
            ${VD.length ? VD.map(visitaHtml).join('') : '<div class="empty">Este punto de venta todavía no tiene relevamientos.</div>'}</section>
          <section class="panel" id="s-gal"><div class="p-head"><i class="k-ico mut">${svg('img', 18)}</i><div><h2>Fotos y evidencias</h2><p>${VD.length} relevamiento${VD.length === 1 ? '' : 's'} · ${detFotos.length} foto${detFotos.length === 1 ? '' : 's'}. Toca uno para verlo en grande junto a su planograma.</p></div></div>
            <div class="galeria">${VD.length ? VD.map((x) => `<button class="g-item" data-g="${esc(x.id)}">${x.fotos.length > 1 ? `<span class="n-fotos">${x.fotos.length} fotos</span>` : ''}<img src="${esc(x.fotos[0].thumb || x.fotos[0].url)}" loading="lazy" alt=""><div><b>${esc(x.marca || '')} · ${esc(x.tipo)}</b><small class="num">${fmtFecha(x.ts)}${x.fotos.some((p) => p.pendiente) ? ' · por subir' : ''}</small><div class="tags">${tags(x)}</div></div></button>`).join('') : '<div class="empty">Aún no hay fotos</div>'}</div></section>`;

    // ── Evidencias: fotos por local, marca y espacio ──
    const filtrosEv = `<div class="filt">${buscador}${select('pdv', 'Punto de venta', opt('pdv'))}${select('marca', 'Marca', opt('marca'))}${select('tipo', 'Tipo de espacio', C.TIPOS.map((t) => t.nombre))}
              <label class="f-sel"><span>Desde</span><input type="date" data-f="desde" value="${f.desde}"></label><label class="f-sel"><span>Hasta</span><input type="date" data-f="hasta" value="${f.hasta}"></label></div>`;
    const secEv = `<section><h1>Evidencias</h1><p class="sub">Fotos relevadas. Filtrá por local, marca y espacio.</p>${filtrosEv}</section>
          <section class="panel" id="s-gal"><div class="p-head"><i class="k-ico mut">${svg('img', 18)}</i><div><h2>Fotos</h2><p>${V.length} relevamiento${V.length === 1 ? '' : 's'} · ${lista.length} foto${lista.length === 1 ? '' : 's'}. Toca uno para verlo junto a su planograma.</p></div></div>
            <div class="galeria">${V.length ? V.map((x) => `<button class="g-item" data-g="${esc(x.id)}">${x.fotos.length > 1 ? `<span class="n-fotos">${x.fotos.length} fotos</span>` : ''}<img src="${esc(x.fotos[0].thumb || x.fotos[0].url)}" loading="lazy" alt=""><div><b>${esc(x.pdv)}</b><small>${esc(x.marca || '')} · ${esc(x.tipo)}</small><small class="num">${fmtFecha(x.ts)}${x.fotos.some((p) => p.pendiente) ? ' · por subir' : ''}</small><div class="tags">${tags(x)}</div></div></button>`).join('') : '<div class="empty">No hay fotos con estos filtros</div>'}</div></section>`;

    // ── Espacios: resultado por tipo de espacio ──
    const espDe = C.TIPOS.map((t) => { const it = V.filter((v) => mismoEsp(v.tipo, t.nombre)); const rc = it.filter((v) => resDe(v)).length;
      return { t, n: it.length, pc: pct(cnt(it, 'cumple'), rc), marcas: C.MARCAS.map((m) => [m, it.filter((v) => v.marca === m).length]).filter((q) => q[1]) }; });
    const secEsp = `<section><h1>Espacios</h1><p class="sub">Cumplimiento por tipo de espacio y marcas relevadas en cada uno.</p>
            <div class="filt">${buscador}${select('pdv', 'Punto de venta', opt('pdv'))}${select('marca', 'Marca', opt('marca'))}</div></section>
          <section class="panel"><div class="esp-g">${espDe.map((e) => `<div class="esp ${e.n ? '' : 'vacio'}"><div class="esp-h"><b>${esc(e.t.nombre)}</b><em class="${tonoPct(e.pc)}">${e.pc === null ? '–' : e.pc + '%'}</em></div>
              <small>${e.n} relevamiento${e.n === 1 ? '' : 's'}</small><div class="k-bar"><b class="ok" style="width:${e.pc || 0}%"></b></div>
              <div class="chips">${e.marcas.length ? e.marcas.map(([m, k]) => `<span class="chip gry">${esc(m)} · ${k}</span>`).join('') : '<span class="mut-t">Sin relevar</span>'}</div>
              ${e.n ? `<button class="btn-o" data-esp="${esc(e.t.nombre)}">Ver evidencias</button>` : ''}</div>`).join('')}</div></section>`;

    // ── Colaboraciones: espacios que comparten dos o mas marcas (planograma ideal y relevamientos hechos con esa variante) ──
    const colPlanos = new Map();
    state.planos.forEach((p) => { const vp = variantePlano(p); if (vp.marcas.length < 2) return;
      if (!colPlanos.has(vp.etiqueta)) colPlanos.set(vp.etiqueta, { tipos: new Set(), planos: [] });
      const g = colPlanos.get(vp.etiqueta); g.tipos.add(p.tipo); if (!g.planos.some((q) => q.nombre === p.nombre)) g.planos.push(p); });
    const colV = V.filter((v) => colDe(v));
    const colGrupos = [...new Set([...colPlanos.keys(), ...colV.map(colDe)])].sort((a, b) => a.localeCompare(b)).map((e) => {
      const it = colV.filter((v) => colDe(v) === e);
      return { e, it, pc: pct(cnt(it, 'cumple'), it.filter((v) => resDe(v)).length), g: colPlanos.get(e) };
    });
    const colPc = pct(cnt(colV, 'cumple'), colV.filter((v) => resDe(v)).length);
    const panelCol = (x) => `<section class="panel"><div class="p-head"><i class="k-ico az">${svg('cmp', 18)}</i><div><h2>${esc(x.e)}</h2><p>${x.it.length} relevamiento${x.it.length === 1 ? '' : 's'}${x.pc === null ? '' : ' · ' + x.pc + '% cumple'}${x.g ? ' · ' + [...x.g.tipos].map(esc).join(', ') : ''}</p></div></div>
        ${x.g ? `<div class="col-pl">${x.g.planos.map((p) => `<button type="button" class="col-img" data-colimg="${esc(p.url)}"><img src="${esc(p.url)}" alt="Planograma ideal ${esc(x.e)}" loading="lazy"><small>Planograma ideal</small></button>`).join('')}</div>` : ''}
        ${x.it.length ? x.it.map((v) => `<div class="pdv-row ir" data-g="${esc(v.id)}"><div class="pdv-n"><b>${esc(v.pdv)}</b><small>${esc(v.marca || '')} · ${esc(v.tipo)} · ${fmtFecha(v.ts)}</small></div><div class="pdv-p ${resDe(v) === 'cumple' ? 'ok' : resDe(v) ? 'bad' : 'mut'}">${resDe(v) ? esc(criterioDe(resDe(v)).texto) : '–'}</div></div>`).join('') : '<div class="empty">Todavía no hay relevamientos de esta colaboración.</div>'}</section>`;
    const secCol = `<section><h1>Colaboraciones</h1><p class="sub">Espacios que comparten dos o más marcas (por ejemplo Bauducco + Fini): planograma ideal y relevamientos hechos con esa colaboración.</p>
            <div class="filt">${buscador}${select('pdv', 'Punto de venta', opt('pdv'))}${select('marca', 'Marca', opt('marca'))}</div>
            <div class="k-grid k4">${kpi('az', 'cmp', 'Colaboraciones', colGrupos.length)}${kpi('ok', 'foto', 'Relevamientos', colV.length)}${kpi('ok', 'cumple', 'Cumplimiento', colPc === null ? '–' : colPc + '%', colPc === null ? '' : `<div class="k-bar"><b class="ok" style="width:${colPc}%"></b></div>`)}</div></section>
          ${colGrupos.length ? colGrupos.map(panelCol).join('') : '<section class="panel"><div class="empty">Todavía no hay planogramas de colaboración cargados.</div></section>'}`;

    $app.innerHTML = `<div class="dash-app">
      <aside class="side"><div class="side-brand"><img src="img/logo-masmarka.png" alt="+MARKA"><small>Tablero operativo</small></div>
        <div class="side-sec">Principal</div>${nav('resumen', 'grid', 'Resumen')}${nav('eval', 'cmp', 'Evaluación')}${nav('esp', 'grid', 'Espacios')}${nav('col', 'cmp', 'Colaboraciones')}${nav('ev', 'img', 'Evidencias')}${nav('det', 'pin', 'Detalle de punto de venta')}
        <div class="side-pie"><div class="side-user"><i class="pf"><img src="img/icono-profarco.png" alt="Profarco"></i><div><b>Profarco S.A.</b><small>Vista de cliente</small></div></div><button class="nav-b" id="salir">${svg('out', 19)}<span>Cerrar sesión</span></button></div></aside>
      <div class="main">
        <header class="bar"><div class="bar-l"><button class="h-b" id="h-atras" aria-label="Volver" title="Volver" ${hist.n > 0 ? '' : 'disabled'}>←</button><button class="h-b" id="h-adel" aria-label="Avanzar" title="Avanzar" ${hist.n < hist.max ? '' : 'disabled'}>→</button><div class="crumb">Profarco <span>/</span> Principal <span>/</span> <b>${vista === 'eval' ? 'Evaluación' : vista === 'esp' ? 'Espacios' : vista === 'ev' ? 'Evidencias' : vista === 'det' ? 'Detalle de punto de venta' : 'Resumen'}</b></div></div>
          <div class="bar-r"><div class="seg">${per('hoy', 'Hoy')}${per('mes', 'Este mes')}${per('todo', 'Todo')}</div>
</div></header>
        <div class="content">${vista === 'eval' ? secEval : vista === 'esp' ? secEsp : vista === 'col' ? secCol : vista === 'ev' ? secEv : vista === 'det' ? secDet : secResumen}</div></div></div>`;

    $app.querySelectorAll('[data-f]').forEach((el) => el.onchange = () => { f[el.dataset.f] = el.value; if (el.dataset.f === 'desde' || el.dataset.f === 'hasta') state.periodo = ''; pintarTablero(); });
    $app.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
      state.periodo = b.dataset.p;
      f.desde = b.dataset.p === 'hoy' ? hoy : b.dataset.p === 'mes' ? hoy.slice(0, 8) + '01' : '';
      f.hasta = b.dataset.p === 'hoy' ? hoy : '';
      pintarTablero();
    });
    $app.querySelectorAll('[data-cad]').forEach((b) => b.onclick = () => { state.cadena = b.dataset.cad && state.cadena !== b.dataset.cad ? b.dataset.cad : ''; pintarTablero(); });
    const dq = document.getElementById('dq');
    if (dq) dq.oninput = () => { const w = norm(dq.value).split(/\s+/).filter(Boolean); $app.querySelectorAll('.dr-r').forEach((r) => { r.hidden = !w.every((x) => r.dataset.n.includes(x)); }); };
    if (!window.__escCad) { window.__escCad = true; document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.cadena) { state.cadena = ''; pintarTablero(); } }); }
    $app.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => { state.orden = b.dataset.o; pintarTablero(); });
    document.getElementById('h-atras').onclick = () => history.back();
    document.getElementById('h-adel').onclick = () => history.forward();
    $app.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { if ((state.vista || 'resumen') !== b.dataset.v) navegar(() => { state.vista = b.dataset.v; }); });
    $app.querySelectorAll('[data-det]').forEach((b) => b.onclick = () => navegar(() => { state.det = b.dataset.det; state.vista = 'det'; state.cadena = ''; }));
    $app.querySelectorAll('[data-esp]').forEach((b) => b.onclick = () => navegar(() => { f.tipo = b.dataset.esp; state.vista = 'ev'; }));
    const ds = document.getElementById('detsel'); if (ds) ds.onchange = () => { state.det = ds.value; pintarTablero(); };
    $app.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => {
      const x = agrupar(todas).find((v) => v.fotos.some((p) => p.id === b.dataset.g)); if (!x) return;
      const refs = tipoDe(x.tipo) ? planosDe(x.pdv, x.marca, tipoDe(x.tipo).id) : [];
      lightbox([...(refs[0] ? [{ url: refs[0].url, caption: 'Planograma ideal', fijo: true }] : []), ...x.fotos.map((p, i) => ({ url: p.url, caption: `Foto auditada${x.fotos.length > 1 ? ` ${i + 1} de ${x.fotos.length}` : ''} · ${fmtFecha(p.ts)}`, tags: i === 0 ? tags(x) : '' }))], '', true);
    });
    $app.querySelectorAll('[data-colimg]').forEach((b) => b.onclick = () => lightbox([{ url: b.dataset.colimg, fijo: true }]));
    // Tocar una imagen de la comparativa abre el visor con todas las del mismo lado (flechas en pantalla y del teclado).
    $app.querySelectorAll('[data-z]').forEach((im) => im.onclick = () => {
      const box = im.closest('.cmp-f'), key = box.dataset.car, urls = (carData && carData[key]) || [im.dataset.z], fijo = !box.querySelector('.rot');
      lightbox(urls.map((u, n) => ({ url: u, fijo, caption: (key === 'ref' ? 'Planograma ideal' : 'Foto auditada') + (urls.length > 1 ? ` ${n + 1} de ${urls.length}` : '') })), '', true, false, Math.max(0, urls.indexOf(im.dataset.z)));
    });
    // Giro en la comparativa (el cliente gira cada foto a su conveniencia; se recuerda en este navegador).
    $app.querySelectorAll('.cmp-f').forEach((b) => { const im = b.querySelector('img'); if (im && b.querySelector('.rot')) rotAplicar(im, rotLeer(im.dataset.z)); });
    $app.querySelectorAll('.cmp-f [data-rot]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const im = b.closest('.cmp-f').querySelector('img'), url = im.dataset.z;
      const d = (((rotLeer(url) + +b.dataset.rot) % 360) + 360) % 360; rotGuardar(url, d); rotAplicar(im, d);
    });
    // Buscador de texto: se vuelve a pintar al escribir y se conserva el cursor.
    const bq = document.getElementById('bq');
    if (bq) {
      bq.oninput = () => { f.q = bq.value; pintarTablero(); };
      if (enfoque >= 0) { bq.focus(); bq.setSelectionRange(enfoque, enfoque); }
    }
    const sf = document.getElementById('selfoto'); if (sf) sf.onchange = () => { state.sel = sf.value; pintarTablero(); };
    const ir = (d) => { state.sel = V[idx + d].id; pintarTablero(); };
    $app.querySelectorAll('[data-car]').forEach((box) => {
      const urls = carData[box.dataset.car]; let i = box.dataset.car === 'foto' ? Math.max(0, sel.fotos.findIndex((x) => x.id === state.sel)) : 0;
      box.querySelectorAll('[data-d]').forEach((bt) => bt.onclick = (e) => {
        e.stopPropagation();
        i = (i + +bt.dataset.d + urls.length) % urls.length;
        const im = box.querySelector('img'); im.src = urls[i]; im.dataset.z = urls[i];
        const rb = box.querySelector('.rot'); if (rb) rb.dataset.url = urls[i];
        if (rb) rotAplicar(im, rotLeer(urls[i]));
        box.querySelectorAll('.car-d i').forEach((d, k) => d.classList.toggle('on', k === i));
      });
    });
    if (document.getElementById('prev')) document.getElementById('prev').onclick = () => ir(-1);
    if (document.getElementById('next')) document.getElementById('next').onclick = () => ir(1);
    document.getElementById('salir').onclick = () => { localStorage.removeItem('pin-tablero'); sessionStorage.removeItem('pin-tablero'); location.reload(); };
  }

  // ═══════════ PLANOGRAMAS ═══════════
  const admin = { pdv: '*', marca: C.MARCAS[0], tipo: C.TIPOS[0].nombre };
  function vistaPlanogramas(pin) {
    const pdvs = nombresPdv();
    const etiqueta = (q) => (q === '*' ? 'General (todos los puntos de venta)' : q);
    const grupos = ['*', ...pdvs].filter((q) => state.planos.some((x) => x.pdv === q));
    $app.innerHTML = `<div class="wrap">
      <h1>Planogramas</h1><p class="lead">Imágenes de referencia por marca y tipo de espacio que verá el relevador antes de fotografiar.</p>
      <div class="card stack" style="margin-top:16px">
        <label class="field"><span class="label">Punto de venta</span><select class="in" id="pdv"><option value="*" ${admin.pdv === '*' ? 'selected' : ''}>General (todos los puntos de venta)</option>${pdvs.map((q) => `<option ${q === admin.pdv ? 'selected' : ''}>${esc(q)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Marca</span><select class="in" id="marca">${C.MARCAS.map((m) => `<option ${m === admin.marca ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Tipo de espacio</span><select class="in" id="tipo">${tiposDeMarca(admin.marca).map((t) => `<option ${t.nombre === admin.tipo ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>
        <label class="btn teal block" for="subir">Agregar imágenes</label><input type="file" id="subir" accept="image/*" multiple class="hide">
        <p class="muted" style="font-size:13px">Si un punto de venta no tiene planograma propio para esa marca y espacio, se muestra el general.</p>
        <button class="btn sm" id="refrescar" type="button">Actualizar datos de relevadores y puntos de venta</button>
        <p class="muted" style="font-size:12px">Los cambios en las planillas se ven en la app en unos 10 minutos. Este botón los aplica ya.</p>
      </div>
      ${grupos.map((q) => `<div class="card" style="margin-top:14px"><h3>${esc(etiqueta(q))}</h3>${C.MARCAS.map((m) => {
        const tipos = C.TIPOS.map((t) => [t, state.planos.filter((x) => x.pdv === q && mismoTipo(x.marca, m) && mismoEsp(x.tipo, t.nombre))]).filter((r) => r[1].length);
        return tipos.length ? `<div class="label" style="margin-top:14px;color:var(--ink)">${esc(m)}</div>${tipos.map(([t, ps]) => `<div class="label" style="margin-top:8px">${esc(t.nombre)}</div><div class="plano-grid">${ps.map((x) => `<div class="foto"><img src="${esc(x.url)}" alt="" data-ver="${esc(x.url)}"><button class="x" data-borrar="${esc(x.id)}" aria-label="Borrar">×</button></div>`).join('')}</div>`).join('')}` : '';
      }).join('')}</div>`).join('')}
    </div>`;
    const lee = () => { admin.pdv = document.getElementById('pdv').value; admin.marca = document.getElementById('marca').value; admin.tipo = document.getElementById('tipo').value; };
    document.getElementById('marca').onchange = () => { lee(); const t = tiposDeMarca(admin.marca); if (!t.some((x) => x.nombre === admin.tipo)) admin.tipo = t[0].nombre; vistaPlanogramas(pin); };
    document.getElementById('subir').onchange = async (e) => {
      lee();
      try {
        for (const file of e.target.files) await S.agregarPlanograma(admin.pdv, admin.marca, admin.tipo, file, pin);
        state.planos = await S.planogramas(); toast('Planograma guardado'); vistaPlanogramas(pin);
      } catch (err) { toast(err.message); }
    };
    document.getElementById('refrescar').onclick = async () => { try { await S.limpiarCache(pin); toast('Datos actualizados'); } catch (err) { toast(err.message); } };
    $app.querySelectorAll('[data-borrar]').forEach((b) => b.onclick = async () => {
      if (!confirm('¿Borrar esta imagen del planograma?')) return;
      try { await S.borrarPlanograma(b.dataset.borrar, pin); state.planos = await S.planogramas(); vistaPlanogramas(pin); } catch (err) { toast(err.message); }
    });
    $app.querySelectorAll('[data-ver]').forEach((i) => i.onclick = () => lightbox([{ url: i.dataset.ver }]));
  }

  // ═══════════ Arranque: cada pagina HTML es una app aparte ═══════════
  //  index.html (data-page="campo")    relevadores
  //  tablero.html (data-page="tablero") cliente, solo lectura, con clave
  //  admin.html (data-page="admin")    planogramas, solo nosotros
  // Al abrir, el relevador recibe de nuevo sus puntos de venta (por si cambiaron sus asignaciones).
  async function refrescarUsuario() {
    if (!state.usuario || !navigator.onLine || !S.remoto) return;
    try {
      const r = await S.login(state.usuario.ci);
      state.usuario = { ci: state.usuario.ci, nombre: r.nombre, pdvs: r.pdvs };
      localStorage.setItem('usuario', JSON.stringify(state.usuario));
      if (paso === 'pdv') pintarCampo();
    } catch (e) {
      if (/no encontrada/i.test(e.message)) { localStorage.removeItem('usuario'); state.usuario = null; pintarCampo(); }
    }
  }
  async function iniciar() {
    const pagina = document.body.dataset.page;
    // La lista de planogramas tarda: se muestra la ultima conocida de inmediato y se actualiza por detras (la pantalla no la espera).
    const previa = S.remoto ? guardado('cache-planos') : null;
    if (previa) state.planos = previa;
    state.planosListo = false;
    state.planosP = S.planogramas().then((x) => { state.planos = x; state.planosListo = true; })
      .catch((e) => { state.planosListo = true; if (!previa) toast('Sin conexión con Drive: ' + e.message); });
    const conPdvs = (vista) => async (pin) => {
      if (pagina === 'tablero' && !state.datos) $app.innerHTML = cargador('Cargando, aguarde un momento...');
      try { state.pdvs = await S.puntosDeVenta(pin); } catch (e) { state.pdvs = []; }
      await state.planosP; vista(pin);
    };
    if (pagina === 'tablero') conPin(conPdvs(vistaTablero), 'tablero');
    else if (pagina === 'admin') conPin(conPdvs(vistaPlanogramas), 'admin');
    else { if (state.usuario && retomarVisita()) paso = 'marca'; pintarCampo(); refrescarUsuario(); }
    pintarSync();
  }

  document.title = (document.body.dataset.page === 'tablero' ? 'Tablero de góndolas' : document.body.dataset.page === 'admin' ? 'Administración' : 'Relevamiento de góndola') + ` · ${C.CLIENTE}`;
  const $cli = document.getElementById('cliente'); if ($cli) $cli.textContent = C.CLIENTE;
  window.addEventListener('sync', () => { pintarSync(); if (document.body.dataset.page === 'tablero') iniciar(); });

  // Campo: aviso antes de salir con fotos sin guardar y boton "atras" del telefono que retrocede un paso dentro de la app.
  if (document.body.dataset.page === 'campo') {
    window.addEventListener('beforeunload', (e) => { if (state.fotos.length || document.querySelector('.cam')) { e.preventDefault(); e.returnValue = ''; } });
    // El Chrome del telefono salta las entradas de historial creadas sin tocar la pantalla: por eso la primera se crea con el primer toque.
    history.replaceState({ campo: 0 }, '');
    let armado = false;
    document.addEventListener('click', () => { if (!armado) { armado = true; history.pushState({ campo: 1 }, ''); } }, true);
    // Atras del telefono en la lista de puntos de venta: antes de salir de la app se pregunta.
    function confirmarSalida() {
      if (document.querySelector('.modal-salir')) return;
      const m = document.createElement('div'); m.className = 'modal modal-salir';
      m.innerHTML = `<div class="modal-card"><button class="x" data-x aria-label="Cerrar">×</button>
        <h2>¿Seguro que quieres salir?</h2>
        <div class="sub">Tu sesión y lo ya relevado quedan guardados.</div>
        <div class="row" style="margin-top:14px;gap:10px"><button class="btn" data-si>Salir</button><button class="btn teal" data-no>Quedarme</button></div></div>`;
      const quedarme = () => { m.remove(); history.pushState({ campo: 1 }, ''); };
      m.querySelector('[data-x]').onclick = m.querySelector('[data-no]').onclick = quedarme;
      m.querySelector('[data-si]').onclick = () => { window.removeEventListener('popstate', alAtras); m.remove(); history.back(); };
      document.body.appendChild(m);
    }
    function alAtras() {
      const cam = document.querySelector('.cam'), modal = document.querySelector('.modal');
      if (cam) cam.querySelector('[data-cerrar]').click();   // pide confirmacion si hay fotos
      else if (modal) { if (modal.classList.contains('modal-salir')) { modal.remove(); history.pushState({ campo: 1 }, ''); return; } modal.querySelector('[data-x]')?.click(); }
      else if (paso === 'criterios') confirmarAbandono(descartarRelevamiento);
      else if (paso === 'tipos') ir(state.hayColab ? 'colab' : 'marca');
      else if (paso === 'colab') ir('marca');
      else if (paso === 'marca') ir('pdv');
      else if (state.usuario) { confirmarSalida(); return; }   // en la lista de puntos de venta: pregunta antes de salir
      else { history.back(); return; }   // en el ingreso (CI) se sale de verdad
      history.pushState({ campo: 1 }, '');
    }
    window.addEventListener('popstate', alAtras);
  }

  iniciar();
  S.sincronizar().then(pintarSync);
})();
