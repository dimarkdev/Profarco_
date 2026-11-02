(function () {
  const C = window.CONFIG;
  const S = window.Store;
  const $app = document.getElementById('app');
  
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtFecha = (ts) => new Date(ts).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const diaISO = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tipoDe = (id) => C.TIPOS.find((t) => t.id === id || t.nombre === id);
  const criterioDe = (id) => C.CRITERIOS.find((c) => c.id === id) || { id, texto: id };
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
  function lightbox(items, tagsHtml) {
    const el = document.createElement('div');
    el.className = 'lb';
    el.innerHTML = `<div class="lb-head"><span class="t">Toca la imagen para acercar</span><button class="lb-x" data-x aria-label="Cerrar">×</button></div>
      <div class="lb-body">${items.map((i) => `<figure><img src="${esc(i.url)}" alt="">${i.caption ? `<div>${esc(i.caption)}</div>` : ''}${i.tags ? `<div class="lb-tags">${i.tags}</div>` : ''}</figure>`).join('')}</div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) el.remove();
      else if (e.target.tagName === 'IMG') el.classList.toggle('zoom');
    });
    document.body.appendChild(el);
  }

  // ── Estado ──
  const state = {
    planos: [], pdvs: [],
    usuario: guardado('usuario'),          // {ci, nombre}
    pdv: '', hechos: new Set(),            // tipos ya relevados en esta visita
    tipo: null,
    fotos: [],                             // [{blob, url}] tomadas en la camara, sin guardar
    criterios: new Set(),
    filtroPdv: '',
    tab: { desde: '', hasta: '', pdv: '', relevador: '', tipo: '', criterio: '' },
    datos: null,
  };
  // Drive no admite "/" en nombres de carpeta: el receptor guarda "Islas - Exhibidores".
  const mismoTipo = (a, b) => String(a).replace(/[\\/:*?"<>|]/g, '-').trim() === String(b).replace(/[\\/:*?"<>|]/g, '-').trim();
  const planosDe = (pdv, tipo) => {
    const t = tipoDe(tipo).nombre;
    const exactos = state.planos.filter((p) => p.pdv === pdv && mismoTipo(p.tipo, t));
    return exactos.length ? exactos : state.planos.filter((p) => p.pdv === '*' && mismoTipo(p.tipo, t));
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
  // ci → pdv → tipos → (planograma) → camara → criterios → tipos …
  let paso = 'ci';
  const ir = (p) => { paso = p; pintarCampo(); };

  function pintarCampo() {
    if (!state.usuario) paso = 'ci';
    else if (paso === 'ci') paso = 'pdv';
    ({ ci: pasoCI, pdv: pasoPdv, tipos: pasoTipos, criterios: pasoCriterios }[paso] || pasoCI)();
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
        pasoCI({ ci, nombre: await S.login(ci) });
      } catch (e) {
        const h = document.getElementById('hint');   // mensaje corto bajo el campo, sin ventana
        h.textContent = e.message; h.classList.add('err');
        b.disabled = false;
      }
    };
    document.getElementById('seguir').onclick = entrar;
    document.getElementById('ci').onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
  }

  function pasoPdv() {
    const q = state.filtroPdv.toLowerCase();
    const lista = state.pdvs.filter((p) => !q || (p.nombre + ' ' + (p.cadena || '') + ' ' + (p.ciudad || '')).toLowerCase().includes(q));
    $app.innerHTML = `<div class="wrap"><h1>Punto de venta</h1><p class="lead">Hola, ${esc(state.usuario.nombre)}</p>
      <input class="in" id="q" style="margin-top:22px" placeholder="Buscar punto de venta…" value="${esc(state.filtroPdv)}" autocomplete="off">
      <div class="pdv-list">${lista.length ? lista.map((p) => `<button class="pdv-item" data-n="${esc(p.nombre)}">${esc(p.nombre)}<small>${esc([p.cadena, p.ciudad].filter(Boolean).join(' · '))}</small></button>`).join('')
        : '<div class="empty">No hay puntos de venta cargados.<br>Agrégalos en la planilla "Puntos de venta".</div>'}</div>
      <p style="text-align:center;margin-top:24px"><button class="link" id="otro">No soy ${esc(state.usuario.nombre)}</button></p></div>`;
    const q$ = document.getElementById('q');
    q$.oninput = () => { state.filtroPdv = q$.value; const p = q$.selectionStart; pasoPdv(); const n = document.getElementById('q'); n.focus(); n.setSelectionRange(p, p); };
    $app.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => { state.pdv = b.dataset.n; state.hechos = new Set(); ir('tipos'); });
    document.getElementById('otro').onclick = () => { localStorage.removeItem('usuario'); state.usuario = null; ir('ci'); };
  }

  function pasoTipos() {
    $app.innerHTML = `<div class="wrap"><h1>Tipo de Relevamiento</h1><p class="lead">Selecciona la zona a auditar</p>
      <div class="row" style="margin-top:22px"><button class="back" id="atras" aria-label="Volver">${ICON_BACK}</button><div class="sede">${esc(state.pdv)}</div></div>
      <div class="tiles">${C.TIPOS.map((t) => `<button class="tile" data-t="${t.id}" style="background:${t.color}">${state.hechos.has(t.id) ? '<span class="hecho">✓ Relevado</span>' : ''}<img src="${t.img}" alt=""><b>${esc(t.nombre)}</b></button>`).join('')}</div>
      ${state.hechos.size ? '<button class="btn primary block" id="fin" style="margin-top:22px">Finalizar visita</button>' : ''}</div>`;
    document.getElementById('atras').onclick = () => ir('pdv');
    document.getElementById('fin')?.addEventListener('click', () => { state.hechos = new Set(); ir('pdv'); });
    $app.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { state.tipo = tipoDe(b.dataset.t); abrirReferencia(); });
  }

  // Ventana "Planograma de Referencia": hay que verla completa para poder abrir la camara.
  function abrirReferencia() {
    const ps = planosDe(state.pdv, state.tipo.id);
    let i = 0; const vistas = new Set([0]);
    const m = document.createElement('div');
    m.className = 'modal';
    const pintar = () => {
      vistas.add(i);
      const listo = !ps.length || vistas.size === ps.length;
      m.innerHTML = `<div class="modal-card"><button class="x" data-x aria-label="Cerrar">×</button>
        <h2>Planograma de Referencia</h2><div class="sub">${esc(state.tipo.nombre)}</div>
        ${ps.length ? `<div class="ref"><img src="${esc(ps[i].url)}" alt="Planograma">
            ${ps.length > 1 ? '<button class="arrow l" data-n="-1" aria-label="Anterior">‹</button><button class="arrow r" data-n="1" aria-label="Siguiente">›</button>' : ''}</div>
          ${ps.length > 1 ? `<div class="dots">${ps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}`
          : '<div class="empty">Este punto de venta todavía no tiene planograma de referencia para esta zona.</div>'}
        <div class="hint">${listo ? (ps.length ? 'Toca la imagen para acercarla' : '') : `Mira las ${ps.length} imágenes para continuar`}</div>
        <button class="btn teal block" data-go ${listo ? '' : 'disabled'}>Entendido, abrir cámara</button></div>`;
      m.querySelector('[data-x]').onclick = () => m.remove();
      m.querySelector('img')?.addEventListener('click', () => lightbox([{ url: ps[i].url }]));
      m.querySelectorAll('[data-n]').forEach((b) => b.onclick = () => { i = (i + +b.dataset.n + ps.length) % ps.length; pintar(); });
      m.querySelector('[data-go]').onclick = () => { m.remove(); abrirCamara(false); };
    };
    pintar();
    document.body.appendChild(m);
  }

  // Camara propia (getUserMedia); si el navegador no la da, cae al selector de camara del sistema.
  async function abrirCamara(sumar) {
    // sumar = true: viene de "+ Foto" en Cumplimiento; se conservan las fotos ya tomadas.
    const base = sumar ? state.fotos.slice() : [];
    if (!sumar) state.fotos.forEach((f) => URL.revokeObjectURL(f.url));
    state.fotos = base.slice();
    const el = document.createElement('div');
    el.className = 'cam';
    el.innerHTML = `<div class="cam-top"><div class="cam-pill">Tomar foto de: ${esc(state.tipo.nombre)}</div></div>
      <div class="cam-view"><video playsinline muted autoplay></video><div class="cam-grid"><i></i><i></i><i></i><i></i></div><div class="flash"></div>
        <button class="cam-ref" data-ref>${ICON_IMG} Ver referencia</button><div class="cam-msg hide" data-msg></div>
        <div class="cam-bar"><button class="btn" data-cerrar>Cerrar</button><button class="shutter" data-disp aria-label="Tomar foto"></button><button class="btn listo hide" data-listo></button></div></div>
      <input type="file" accept="image/*" capture="environment" class="hide" data-file>`;
    document.body.appendChild(el);
    const video = el.querySelector('video');
    const q = (s) => el.querySelector(s);
    let stream = null;
    const parar = () => stream?.getTracks().forEach((t) => t.stop());
    const salir = () => { parar(); el.remove(); };
    const actualizar = () => { const b = q('[data-listo]'); b.classList.toggle('hide', !state.fotos.length); b.textContent = `Listo · ${state.fotos.length}`; };
    const agregar = (blob) => { state.fotos.push({ blob, url: URL.createObjectURL(blob) }); actualizar(); const f = q('.flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); };

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin getUserMedia');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = stream;
    } catch (e) {
      video.remove();
      const m = q('[data-msg]'); m.classList.remove('hide');
      m.innerHTML = '<div><p>No se pudo abrir la cámara dentro de la app.</p><p class="muted" style="color:rgba(255,255,255,.7)">Usa el botón blanco para tomar la foto con la cámara del teléfono.</p></div>';
    }

    q('[data-disp]').onclick = () => {
      if (!stream || !video.videoWidth) return q('[data-file]').click();
      const cv = document.createElement('canvas');
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      cv.getContext('2d').drawImage(video, 0, 0);
      cv.toBlob((b) => b && agregar(b), 'image/jpeg', C.FOTO_CALIDAD);
    };
    q('[data-file]').onchange = (e) => { for (const f of e.target.files) agregar(f); e.target.value = ''; };
    q('[data-ref]').onclick = () => lightbox(planosDe(state.pdv, state.tipo.id).map((p, k, a) => ({ url: p.url, caption: `Planograma ${k + 1} de ${a.length}` })));
    q('[data-cerrar]').onclick = () => {
      const nuevas = state.fotos.length - base.length;
      if (nuevas && !confirm(`Se descartarán ${nuevas} foto(s) sin guardar. ¿Cerrar?`)) return;
      state.fotos.slice(base.length).forEach((f) => URL.revokeObjectURL(f.url));
      state.fotos = base; salir(); ir(sumar ? 'criterios' : 'tipos');
    };
    q('[data-listo]').onclick = () => { if (!sumar) state.criterios = new Set(); salir(); ir('criterios'); };
    actualizar();
  }

  // Preguntas de cumplimiento (seleccion multiple).
  function pasoCriterios() {
    const sel = state.criterios;
    $app.innerHTML = `<div class="wrap"><h1>Cumplimiento</h1><p class="lead">${esc(state.pdv)} · ${esc(state.tipo.nombre)}</p>
      <div class="thumbs">${state.fotos.map((f, i) => `<div class="foto"><img src="${esc(f.url)}" alt=""><button class="x" data-del="${i}" aria-label="Quitar">×</button></div>`).join('')}</div>
      <div class="preg"><h2>¿Qué observaste?</h2><p class="muted">Puedes marcar más de una opción.</p>
        <div class="opts">${C.CRITERIOS.map((c) => `<button class="opt ${c.tono || ''} ${sel.has(c.id) ? 'on' : ''}" data-c="${c.id}"><span class="box"></span>${esc(c.texto)}</button>`).join('')}</div></div>
      <div class="sticky-bar"><div class="row"><button class="btn" id="mas">+ Foto</button><button class="btn teal block" id="guardar" ${sel.size && state.fotos.length ? '' : 'disabled'}>Guardar relevamiento</button></div></div></div>`;
    $app.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => {
      const c = criterioDe(b.dataset.c);
      if (sel.has(c.id)) sel.delete(c.id);
      else { if (c.grupo) C.CRITERIOS.filter((x) => x.grupo === c.grupo).forEach((x) => sel.delete(x.id)); sel.add(c.id); }
      pasoCriterios();
    });
    $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { state.fotos.splice(+b.dataset.del, 1); if (!state.fotos.length) ir('tipos'); else pasoCriterios(); });
    document.getElementById('mas').onclick = () => abrirCamara(true);
    document.getElementById('guardar').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Guardando…';
      try {
        const n = state.fotos.length;
        await S.guardarFotos({ pdv: state.pdv, tipo: state.tipo.nombre, ci: state.usuario.ci, relevador: state.usuario.nombre, criterios: [...sel] }, state.fotos.map((f) => f.blob));
        state.fotos.forEach((f) => URL.revokeObjectURL(f.url));
        state.fotos = []; state.hechos.add(state.tipo.id);
        toast(S.remoto ? `${n} foto(s) guardadas` : `${n} foto(s) guardadas en este dispositivo (modo prueba)`);
        pintarSync(); ir('tipos');
      } catch (err) { toast('No se pudo guardar: ' + err.message); e.target.disabled = false; e.target.textContent = 'Guardar relevamiento'; }
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
    const cuadros = Array.from({ length: 26 }, () => {
      const t = 14 + Math.random() * 44, rojo = Math.random() < .22, a = (rojo ? .45 + Math.random() * .4 : .2 + Math.random() * .6).toFixed(2);
      return `<i style="left:${(Math.random() * 96).toFixed(1)}%;top:${(Math.random() * 94).toFixed(1)}%;width:${t.toFixed(0)}px;height:${t.toFixed(0)}px;transform:rotate(${(Math.random() * 60 - 30).toFixed(0)}deg);background:${rojo ? `rgba(193,29,42,${a})` : `rgba(60,179,168,${a})`};animation-delay:-${(Math.random() * 9).toFixed(1)}s"></i>`;
    }).join('');
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
        <button type="button" class="pin-olv" id="olv">¿Olvidaste tu clave?</button>
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
    document.getElementById('olv').onclick = () => { document.getElementById('err').textContent = 'Solicita tu clave al equipo de +MARKA.'; };
    document.getElementById('ojo').onclick = () => { const i = document.getElementById('pin'); i.type = i.type === 'password' ? 'text' : 'password'; };
  }

  // ═══════════ TABLERO ═══════════
  async function vistaTablero(pin) {
    if (!state.datos) $app.innerHTML = '<div class="wrap wide"><div class="empty">Cargando fotos…</div></div>';
    try { state.datos = await S.todasLasFotos(pin); } catch (e) {
      if (state.datos) { toast(e.message); return pintarTablero(); }
      $app.innerHTML = `<div class="wrap wide"><div class="empty">No se pudo leer Drive: ${esc(e.message)}</div></div>`; return; }
    pintarTablero();
  }

  function pintarTablero() {
    document.body.classList.add('dash');
    const f = state.tab, todas = state.datos || [];
    const hoy = diaISO(Date.now());
    const opt = (k) => [...new Set(todas.map((x) => x[k]).filter(Boolean))].sort();
    const lista = todas.filter((x) =>
      (!f.desde || diaISO(x.ts) >= f.desde) && (!f.hasta || diaISO(x.ts) <= f.hasta) &&
      (!f.pdv || x.pdv === f.pdv) && (!f.relevador || x.relevador === f.relevador) && (!f.tipo || x.tipo === f.tipo) &&
      (!f.criterio || (x.criterios || []).includes(f.criterio))).sort((a, b) => b.ts - a.ts);

    const INCID = ['faltan_productos', 'mal_ubicado', 'sin_pop', 'sin_precio', 'competencia', 'sin_espacio'];
    const ACCION = ['corregido', 'no_modificar'];
    const GRAVE = ['faltan_productos', 'sin_precio'];   // se pintan en rojo; el resto de incidencias en naranja
    const resDe = (x) => ['cumple', 'parcial', 'no_cumple'].find((id) => (x.criterios || []).includes(id)) || null;
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
    const tags = (x) => (x.criterios || []).map((id) => { const c = criterioDe(id); return `<span class="badge ${c.tono || ''}">${esc(c.texto)}</span>`; }).join('');

    // ── Indicadores ──
    const n = lista.length, c = cnt(lista, 'cumple'), p = cnt(lista, 'parcial'), nc = cnt(lista, 'no_cumple'), sin = n - c - p - nc;
    const conRes = c + p + nc, pctCumple = pct(c, conRes);
    const pdvsAll = [...new Set([...nombresPdv(), ...lista.map((x) => x.pdv)])].sort((a, b) => a.localeCompare(b));
    const kpi = (cls, icono, titulo, valor, extra) => `<div class="k-card"><div class="k-top"><span>${titulo}</span><i class="k-ico ${cls}">${svg(icono, 18)}</i></div><div class="k-row"><div class="k-val">${valor}</div>${extra || ''}</div></div>`;

    // ── Estado por punto de venta ──
    const filasPdv = pdvsAll.map((nombre) => {
      const it = lista.filter((x) => x.pdv === nombre), cc = cnt(it, 'cumple'), pp = cnt(it, 'parcial'), nn = cnt(it, 'no_cumple'), ss = it.length - cc - pp - nn;
      return { nombre, n: it.length, cc, pp, nn, ss, pc: pct(cc, cc + pp + nn) };
    });
    const orden = state.orden || 'mayor';
    filasPdv.sort((a, b) => orden === 'az' ? a.nombre.localeCompare(b.nombre)
      : orden === 'menor' ? (a.pc ?? 999) - (b.pc ?? 999) || a.nombre.localeCompare(b.nombre)
      : (b.pc ?? -1) - (a.pc ?? -1) || a.nombre.localeCompare(b.nombre));
    const tonoPct = (v) => (v === null ? 'mut' : v >= 80 ? 'ok' : v >= 50 ? 'warn' : 'bad');
    const seg = (cls, v, tot) => (v ? `<i class="${cls}" style="width:${(v / tot) * 100}%"></i>` : '');

    // ── Donut, hallazgos y zonas ──
    const a1 = pct(c, n) || 0, a2 = a1 + (pct(p, n) || 0), a3 = a2 + (pct(nc, n) || 0);
    const donut = n ? `conic-gradient(#22a447 0 ${a1}%, #d89b14 ${a1}% ${a2}%, #d64545 ${a2}% ${a3}%, #d5dcda ${a3}% 100%)` : '#e3e9e7';
    const frec = INCID.map((id) => [id, tiene(lista, id)]).sort((a, b) => b[1] - a[1]);
    const maxF = Math.max(1, ...frec.map((r) => r[1]));
    const hallazgos = frec.reduce((a, r) => a + r[1], 0);
    const zonas = C.TIPOS.map((t) => { const it = lista.filter((x) => x.tipo === t.nombre); return { t, n: it.length, pc: pct(cnt(it, 'cumple'), it.filter((x) => resDe(x)).length) }; });

    // ── Evaluación: planograma vs foto auditada ──
    const idx = Math.max(0, lista.findIndex((x) => x.id === state.sel));
    const sel = lista[idx] || null;
    let cmp = '<div class="empty">Aún no hay fotos para comparar con estos filtros.</div>', tituloEval = 'Evaluación de góndola';
    if (sel) {
      const t = tipoDe(sel.tipo), ref = t ? planosDe(sel.pdv, t.id)[0] : null, r = resDe(sel), crit = sel.criterios || [];
      const inc = crit.filter((id) => INCID.includes(id)), acc = crit.filter((id) => ACCION.includes(id));
      tituloEval = `Evaluación de góndola · ${esc(sel.pdv)}`;
      const resChip = r ? `<span class="chip res ${criterioDe(r).tono}">${svg(r === 'cumple' ? 'cumple' : r === 'parcial' ? 'warn' : 'bad', 15)}${esc(criterioDe(r).texto)}</span>` : '<span class="chip gry">Sin resultado registrado</span>';
      const chipInc = (id) => `<span class="chip ${crit.includes(id) ? (GRAVE.includes(id) ? 'red' : 'org') : 'gry'}">${esc(criterioDe(id).texto)}</span>`;
      const chipAcc = (id) => `<span class="chip ${crit.includes(id) ? (id === 'corregido' ? 'grn' : 'org') : 'gry'}">${crit.includes(id) ? '<i class="pt"></i>' : ''}${esc(criterioDe(id).texto)}</span>`;
      const resumen = `${sel.tipo} en ${sel.pdv}: ${r ? criterioDe(r).texto.toLowerCase() : 'sin resultado registrado'}. ` +
        (inc.length ? `Se registraron ${inc.length} incidencia${inc.length > 1 ? 's' : ''}: ${inc.map((id) => criterioDe(id).texto.toLowerCase()).join('; ')}.` : 'No se registraron incidencias.') +
        (acc.length ? ` En la visita: ${acc.map((id) => criterioDe(id).texto.toLowerCase()).join('; ')}.` : '');
      cmp = `<div class="cmp-bar"><label class="cmp-sel"><span>Foto auditada</span><select id="selfoto">${lista.map((x, i) => `<option value="${esc(x.id)}" ${i === idx ? 'selected' : ''}>${esc(x.pdv)} · ${esc(x.tipo)} · ${fmtFecha(x.ts)}</option>`).join('')}</select></label>
          <div class="cmp-nav"><button class="ic-btn" id="prev" ${idx === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button><span>${idx + 1} / ${lista.length}</span><button class="ic-btn" id="next" ${idx === lista.length - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button></div></div>
        <div class="cmp-t"><span>Comparativa visual</span></div>
        <div class="cmp">
          <div class="cmp-c"><div class="cmp-l">Planograma ideal</div><div class="cmp-f">${ref ? `<img src="${esc(ref.url)}" alt="Planograma ideal" data-z="${esc(ref.url)}">` : '<div class="cmp-vacio">Sin planograma de referencia para esta zona</div>'}</div><small>${esc(sel.tipo)} · ${ref && ref.pdv !== '*' ? esc(ref.pdv) : 'Planograma general'}</small></div>
          <div class="cmp-arrow" aria-hidden="true"><span class="line"></span><i>→</i><span class="line"></span></div>
          <div class="cmp-c"><div class="cmp-l">Foto auditada</div><div class="cmp-f"><img src="${esc(sel.url)}" alt="Foto auditada" data-z="${esc(sel.url)}"></div><small>${esc(sel.pdv)} · ${fmtFecha(sel.ts)}</small></div>
        </div>
        <div class="cmp-t"><span>Análisis de cumplimiento</span></div>
        <div class="an">
          <div class="an-a"><div class="an-l">Resultado de visita</div>${resChip}<p class="an-s">Relevó ${esc(sel.relevador)}</p>
            <div class="an-l sp">Acciones y ajustes</div><div class="chips">${ACCION.map(chipAcc).join('')}</div></div>
          <div class="an-b"><div class="an-l">Hallazgos detectados</div><div class="chips">${INCID.map(chipInc).join('')}</div></div>
          <div class="an-c"><div class="an-l">Resumen del relevamiento</div><div class="an-box">${esc(resumen)}</div></div>
        </div>`;
    }

    const select = (k, label, vals) => `<label class="f-sel"><span>${label}</span><select data-f="${k}"><option value="">Todos</option>${vals.map((v) => `<option ${f[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    const per = (id, txt) => `<button class="seg-b ${state.periodo === id ? 'on' : ''}" data-p="${id}">${txt}</button>`;
    const nav = (id, ic, txt) => `<button class="nav-b" data-go="${id}">${svg(ic, 19)}<span>${txt}</span></button>`;

    $app.innerHTML = `<div class="dash-app">
      <aside class="side"><div class="side-brand"><img src="img/logo-masmarka.png" alt="+MARKA"><small>Tablero operativo</small></div>
        <div class="side-sec">Principal</div>${nav('s-resumen', 'grid', 'Resumen')}${nav('s-cmp', 'cmp', 'Evaluación')}${nav('s-pdv', 'pin', 'Puntos de venta')}${nav('s-gal', 'img', 'Galería')}
        <div class="side-pie"><div class="side-user"><i>PF</i><div><b>Profarco S.A.</b><small>Vista de cliente</small></div></div><button class="nav-b" id="salir">${svg('out', 19)}<span>Cerrar sesión</span></button></div></aside>
      <div class="main">
        <header class="bar"><div class="crumb">Profarco <span>/</span> Principal <span>/</span> <b>Auditoría de góndolas</b></div>
          <div class="bar-r"><div class="seg">${per('hoy', 'Hoy')}${per('mes', 'Este mes')}${per('todo', 'Todo')}</div>
            <button class="btn-o" id="csv">${svg('down', 17)}Exportar</button></div></header>
        <div class="content">
          <section id="s-resumen"><h1>Auditoría de góndolas</h1><p class="sub">Evaluación de cumplimiento de planogramas y análisis de puntos de venta.</p>
            <div class="filt">${select('pdv', 'Punto de venta', opt('pdv'))}${select('tipo', 'Zona', C.TIPOS.map((t) => t.nombre))}${select('relevador', 'Relevador', opt('relevador'))}
              <label class="f-sel"><span>Observación</span><select data-f="criterio"><option value="">Todas</option>${C.CRITERIOS.map((cr) => `<option value="${cr.id}" ${f.criterio === cr.id ? 'selected' : ''}>${esc(cr.texto)}</option>`).join('')}</select></label>
              <label class="f-sel"><span>Desde</span><input type="date" data-f="desde" value="${f.desde}"></label><label class="f-sel"><span>Hasta</span><input type="date" data-f="hasta" value="${f.hasta}"></label></div>
            <div class="k-grid">
              ${kpi('az', 'foto', 'Góndolas auditadas', n)}
              ${kpi('ok', 'cumple', 'Cumplimiento general', pctCumple === null ? '–' : pctCumple + '%', pctCumple === null ? '' : `<div class="k-bar"><b class="ok" style="width:${pctCumple}%"></b></div>`)}
              ${kpi('bad', 'warn', 'Quiebres de stock', tiene(lista, 'faltan_productos'))}
              ${kpi('warn', 'warn', 'Material POP faltante', tiene(lista, 'sin_pop'))}
            </div></section>
          <section class="panel" id="s-cmp"><div class="p-head"><i class="k-ico az">${svg('cmp', 18)}</i><div><h2>${tituloEval}</h2></div></div>${cmp}</section>
          <section class="panel" id="s-pdv"><div class="p-head"><i class="k-ico ok">${svg('pin', 18)}</i><div><h2>Estado de góndolas por punto de venta</h2><p>La barra muestra el resultado de las fotos de cada punto de venta.</p></div>
              <div class="seg sm"><button class="seg-b ${orden === 'mayor' ? 'on' : ''}" data-o="mayor">Mayor ↓</button><button class="seg-b ${orden === 'menor' ? 'on' : ''}" data-o="menor">Menor ↑</button><button class="seg-b ${orden === 'az' ? 'on' : ''}" data-o="az">A–Z</button></div></div>
            <div class="leyenda"><span><i class="ok"></i>Cumple</span><span><i class="warn"></i>Parcial</span><span><i class="bad"></i>No cumple</span><span><i class="mut"></i>Sin resultado</span></div>
            ${filasPdv.length ? filasPdv.map((r) => `<div class="pdv-row"><div class="pdv-n"><b>${esc(r.nombre)}</b><small>${r.n ? `${r.n} foto${r.n > 1 ? 's' : ''}` : 'Sin relevar'}</small></div>
              <div class="pdv-bar">${r.n ? seg('ok', r.cc, r.n) + seg('warn', r.pp, r.n) + seg('bad', r.nn, r.n) + seg('mut', r.ss, r.n) : ''}</div>
              <div class="pdv-p ${tonoPct(r.pc)}">${r.pc === null ? '–' : r.pc + '%'}<small>${r.cc} de ${r.cc + r.pp + r.nn}</small></div></div>`).join('') : '<div class="empty">Sin puntos de venta</div>'}</section>
          <div class="trio">
            <section class="panel"><div class="p-head"><div><h2>Resultado general</h2><p>${n} fotos relevadas</p></div></div>
              <div class="donut-w"><div class="donut" style="background:${donut}"><div><b>${pctCumple === null ? '–' : pctCumple + '%'}</b><small>cumple</small></div></div>
                <ul class="d-leg"><li><i class="ok"></i>Cumple<b>${c}</b></li><li><i class="warn"></i>Parcial<b>${p}</b></li><li><i class="bad"></i>No cumple<b>${nc}</b></li><li><i class="mut"></i>Sin resultado<b>${sin}</b></li></ul></div></section>
            <section class="panel"><div class="p-head"><div><h2>Hallazgos más frecuentes</h2><p>Incidencias registradas por los relevadores</p></div></div>
              ${hallazgos ? frec.map(([id, v]) => `<div class="fr-row"><span>${esc(criterioDe(id).texto)}</span><div class="fr-t"><i style="width:${(v / maxF) * 100}%"></i></div><b>${v}</b></div>`).join('') : '<div class="empty">Sin incidencias registradas</div>'}</section>
            <section class="panel"><div class="p-head"><div><h2>Cobertura por zona</h2><p>Fotos y cumplimiento por tipo de relevamiento</p></div></div>
              ${zonas.map((z) => `<div class="zn-row"><span>${esc(z.t.nombre)}</span><b>${z.n}</b><em class="${tonoPct(z.pc)}">${z.pc === null ? '–' : z.pc + '%'}</em></div>`).join('')}</section>
          </div>
          <section class="panel" id="s-gal"><div class="p-head"><i class="k-ico mut">${svg('img', 18)}</i><div><h2>Galería</h2><p>Toca una foto para compararla con su planograma.</p></div></div>
            <div class="galeria">${lista.length ? lista.map((x) => `<button class="g-item ${sel && x.id === sel.id ? 'on' : ''}" data-g="${esc(x.id)}"><img src="${esc(x.thumb || x.url)}" loading="lazy" alt=""><div><b>${esc(x.pdv)}</b><small>${esc(x.tipo)} · ${esc(x.relevador)}</small><small class="num">${fmtFecha(x.ts)}${x.pendiente ? ' · por subir' : ''}</small><div class="tags">${tags(x)}</div></div></button>`).join('') : '<div class="empty">Aún no hay fotos</div>'}</div></section>
        </div></div></div>`;

    $app.querySelectorAll('[data-f]').forEach((el) => el.onchange = () => { f[el.dataset.f] = el.value; if (el.dataset.f === 'desde' || el.dataset.f === 'hasta') state.periodo = ''; pintarTablero(); });
    $app.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
      state.periodo = b.dataset.p;
      f.desde = b.dataset.p === 'hoy' ? hoy : b.dataset.p === 'mes' ? hoy.slice(0, 8) + '01' : '';
      f.hasta = b.dataset.p === 'hoy' ? hoy : '';
      pintarTablero();
    });
    $app.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => { state.orden = b.dataset.o; pintarTablero(); });
    $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $app.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { state.sel = b.dataset.g; pintarTablero(); document.getElementById('s-cmp').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $app.querySelectorAll('[data-z]').forEach((im) => im.onclick = () => lightbox([{ url: im.dataset.z }]));
    const sf = document.getElementById('selfoto'); if (sf) sf.onchange = () => { state.sel = sf.value; pintarTablero(); };
    const ir = (d) => { state.sel = lista[idx + d].id; pintarTablero(); };
    if (document.getElementById('prev')) document.getElementById('prev').onclick = () => ir(-1);
    if (document.getElementById('next')) document.getElementById('next').onclick = () => ir(1);
    document.getElementById('salir').onclick = () => { localStorage.removeItem('pin-tablero'); sessionStorage.removeItem('pin-tablero'); location.reload(); };
    document.getElementById('csv').onclick = () => {
      const filas = [['Fecha', 'Punto de venta', 'Tipo', 'Relevador', 'Observaciones', 'Enlace'],
        ...lista.map((x) => [new Date(x.ts).toISOString(), x.pdv, x.tipo, x.relevador, (x.criterios || []).map((id) => criterioDe(id).texto).join('; '), x.pendiente ? '(por subir)' : x.url])];
      const csv = '﻿' + filas.map((r) => r.map((cc) => `"${String(cc).replace(/"/g, '""')}"`).join(',')).join('\n');
      Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `fotos-gondola-${diaISO(Date.now())}.csv` }).click();
    };
  }

  // ═══════════ PLANOGRAMAS ═══════════
  const admin = { pdv: '*', tipo: C.TIPOS[0].nombre };
  function vistaPlanogramas(pin) {
    const pdvs = nombresPdv();
    const etiqueta = (p) => (p === '*' ? 'General (todos los puntos de venta)' : p);
    const grupos = ['*', ...pdvs].filter((p) => state.planos.some((x) => x.pdv === p));
    $app.innerHTML = `<div class="wrap">
      <h1>Planogramas</h1><p class="lead">Imágenes de referencia que verá el relevador antes de fotografiar.</p>
      <div class="card stack" style="margin-top:16px">
        <label class="field"><span class="label">Punto de venta</span><select class="in" id="pdv"><option value="*" ${admin.pdv === '*' ? 'selected' : ''}>General (todos los puntos de venta)</option>${pdvs.map((p) => `<option ${p === admin.pdv ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Tipo de relevamiento</span><select class="in" id="tipo">${C.TIPOS.map((t) => `<option ${t.nombre === admin.tipo ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>
        <label class="btn teal block" for="subir">Agregar imágenes</label><input type="file" id="subir" accept="image/*" multiple class="hide">
        <p class="muted" style="font-size:13px">Si un punto de venta no tiene planograma propio, se muestra el general de ese tipo.</p>
      </div>
      ${grupos.map((p) => `<div class="card" style="margin-top:14px"><h3>${esc(etiqueta(p))}</h3>${C.TIPOS.map((t) => {
        const ps = state.planos.filter((x) => x.pdv === p && mismoTipo(x.tipo, t.nombre));
        return ps.length ? `<div class="label" style="margin-top:12px">${esc(t.nombre)}</div><div class="plano-grid">${ps.map((x) => `<div class="foto"><img src="${esc(x.url)}" alt="" data-ver="${esc(x.url)}"><button class="x" data-borrar="${esc(x.id)}" aria-label="Borrar">×</button></div>`).join('')}</div>` : '';
      }).join('')}</div>`).join('')}
    </div>`;
    const lee = () => { admin.pdv = document.getElementById('pdv').value; admin.tipo = document.getElementById('tipo').value; };
    document.getElementById('subir').onchange = async (e) => {
      lee();
      try {
        for (const file of e.target.files) await S.agregarPlanograma(admin.pdv, admin.tipo, file, pin);
        state.planos = await S.planogramas(); toast('Planograma guardado'); vistaPlanogramas(pin);
      } catch (err) { toast(err.message); }
    };
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
  async function iniciar() {
    const pagina = document.body.dataset.page;
    try { [state.planos, state.pdvs] = await Promise.all([S.planogramas(), S.puntosDeVenta()]); }
    catch (e) { toast('Sin conexión con Drive: ' + e.message); }
    if (pagina === 'tablero') conPin(vistaTablero, 'tablero');
    else if (pagina === 'admin') conPin(vistaPlanogramas, 'admin');
    else pintarCampo();
    pintarSync();
  }

  document.title = (document.body.dataset.page === 'tablero' ? 'Tablero de góndolas' : document.body.dataset.page === 'admin' ? 'Administración' : 'Relevamiento de góndola') + ` · ${C.CLIENTE}`;
  const $cli = document.getElementById('cliente'); if ($cli) $cli.textContent = C.CLIENTE;
  window.addEventListener('sync', () => { pintarSync(); if (document.body.dataset.page === 'tablero') iniciar(); });
  iniciar();
  S.sincronizar().then(pintarSync);
})();
