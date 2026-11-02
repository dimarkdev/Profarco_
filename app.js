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
    const guardada = sessionStorage.getItem(clave);
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
        <p class="pin-tag">${ambito === 'admin' ? 'Administración<br>de planogramas' : 'Tablero de góndolas<br>Profarco'}</p>
        <label class="pin-lab" for="pin">Clave de acceso</label>
        <div class="pin-in">${icoLock}<input id="pin" type="password" autocomplete="off" placeholder="Ingresa tu clave"><button type="button" class="ojo" id="ojo" aria-label="Mostrar u ocultar clave">${icoOjo}</button></div>
        <p class="pin-err" id="err"></p>
        <button class="pin-btn" id="ok">Iniciar sesión <span aria-hidden="true">→</span></button>
      </div><p class="pin-foot">© 2026 +MARKA. Todos los derechos reservados.</p></div>`;
    const entrar = async () => {
      const pin = document.getElementById('pin').value;
      const ok = await valida(pin);
      if (ok) { sessionStorage.setItem(clave, pin); document.body.classList.remove('login-pin'); siguiente(pin); }
      else if (ok === false) document.getElementById('err').textContent = 'Clave incorrecta';
    };
    document.getElementById('ok').onclick = entrar;
    document.getElementById('pin').onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
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
    const f = state.tab, todas = state.datos || [];
    const opt = (k) => [...new Set(todas.map((x) => x[k]).filter(Boolean))].sort();
    const lista = todas.filter((x) =>
      (!f.desde || diaISO(x.ts) >= f.desde) && (!f.hasta || diaISO(x.ts) <= f.hasta) &&
      (!f.pdv || x.pdv === f.pdv) && (!f.relevador || x.relevador === f.relevador) && (!f.tipo || x.tipo === f.tipo) &&
      (!f.criterio || (x.criterios || []).includes(f.criterio))).sort((a, b) => b.ts - a.ts);

    const cuenta = (fn) => { const o = {}; lista.forEach((x) => { const k = fn(x); if (k) o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
    const porPdv = cuenta((x) => x.pdv);
    const critCuenta = C.CRITERIOS.map((c) => [c, lista.filter((x) => (x.criterios || []).includes(c.id)).length]);
    const conResultado = lista.filter((x) => (x.criterios || []).some((id) => criterioDe(id).grupo === 'resultado'));
    const cumplen = lista.filter((x) => (x.criterios || []).includes('cumple')).length;
    const pctCumple = conResultado.length ? Math.round((cumplen / conResultado.length) * 100) : null;
    const pdvs = [...new Set([...nombresPdv(), ...lista.map((x) => x.pdv)])].sort();
    const celda = (p, t) => lista.filter((x) => x.pdv === p && x.tipo === t.nombre).length;
    const maxP = porPdv[0]?.[1] || 1, maxC = Math.max(1, ...critCuenta.map((c) => c[1]));
    const select = (k, label, vals) => `<label class="field"><span class="label">${label}</span><select class="in" data-f="${k}"><option value="">Todos</option>${vals.map((v) => `<option ${f[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    const tags = (x) => (x.criterios || []).map((id) => { const c = criterioDe(id); return `<span class="badge ${c.tono || ''}">${esc(c.texto)}</span>`; }).join('');

    $app.innerHTML = `<div class="wrap wide">
      <div class="row between"><div><h1>Tablero de góndolas</h1><p class="lead">Fotos relevadas por los promotores</p></div><button class="btn sm" id="csv">Exportar CSV</button></div>
      <div class="filters">
        <label class="field"><span class="label">Desde</span><input type="date" class="in" data-f="desde" value="${f.desde}"></label>
        <label class="field"><span class="label">Hasta</span><input type="date" class="in" data-f="hasta" value="${f.hasta}"></label>
        ${select('pdv', 'Punto de venta', opt('pdv'))}${select('relevador', 'Relevador', opt('relevador'))}${select('tipo', 'Tipo', C.TIPOS.map((t) => t.nombre))}
        <label class="field"><span class="label">Observación</span><select class="in" data-f="criterio"><option value="">Todas</option>${C.CRITERIOS.map((c) => `<option value="${c.id}" ${f.criterio === c.id ? 'selected' : ''}>${esc(c.texto)}</option>`).join('')}</select></label>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="v">${lista.length}</div><div class="t">Fotos</div></div>
        <div class="kpi"><div class="v">${pctCumple === null ? '–' : pctCumple + '%'}</div><div class="t">Cumple con el planograma</div></div>
        <div class="kpi"><div class="v">${new Set(lista.map((x) => x.pdv)).size}<span class="muted" style="font-size:1.1rem"> / ${pdvs.length}</span></div><div class="t">Puntos de venta con fotos</div></div>
        <div class="kpi"><div class="v">${new Set(lista.map((x) => x.relevador)).size}</div><div class="t">Relevadores</div></div>
      </div>
      <div class="cols">
        <div class="card"><h3>Observaciones</h3>${critCuenta.map(([c, n]) => `<div class="bar-row"><span class="name" title="${esc(c.texto)}">${esc(c.texto)}</span><div class="track"><i class="${c.tono || ''}" style="width:${(n / maxC) * 100}%"></i></div><span class="num">${n}</span></div>`).join('')}</div>
        <div class="card"><h3>Fotos por punto de venta</h3>${porPdv.length ? porPdv.map(([l, n]) => `<div class="bar-row"><span class="name" title="${esc(l)}">${esc(l)}</span><div class="track"><i style="width:${(n / maxP) * 100}%"></i></div><span class="num">${n}</span></div>`).join('') : '<div class="empty">Sin fotos para estos filtros</div>'}</div>
      </div>
      <div class="card" style="margin-top:14px;overflow-x:auto"><h3>Cobertura por tipo</h3>${pdvs.length ? `<table><tr><th>Punto de venta</th>${C.TIPOS.map((t) => `<th class="c">${esc(t.nombre)}</th>`).join('')}</tr>${pdvs.map((p) => `<tr><td>${esc(p)}</td>${C.TIPOS.map((t) => { const n = celda(p, t); return `<td class="c"><span class="dot ${n ? 'si' : 'no'}">${n || '–'}</span></td>`; }).join('')}</tr>`).join('')}</table>` : '<div class="empty">Sin puntos de venta</div>'}</div>
      <h2 style="margin-top:22px">Galería</h2>
      <div class="galeria">${lista.length ? lista.map((x, i) => `<button class="g-item" data-g="${i}"><img src="${esc(x.thumb || x.url)}" loading="lazy" alt=""><div><b>${esc(x.pdv)}</b><small>${esc(x.tipo)} · ${esc(x.relevador)}</small><small class="num">${fmtFecha(x.ts)}${x.pendiente ? ' · por subir' : ''}</small><div class="tags">${tags(x)}</div></div></button>`).join('') : '<div class="empty">Aún no hay fotos</div>'}</div>
    </div>`;

    $app.querySelectorAll('[data-f]').forEach((el) => el.onchange = () => { f[el.dataset.f] = el.value; pintarTablero(); });
    $app.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => {
      const x = lista[+b.dataset.g], t = tipoDe(x.tipo), ref = t ? planosDe(x.pdv, t.id)[0] : null;
      lightbox([{ url: x.url, caption: `${x.relevador} · ${fmtFecha(x.ts)}`, tags: tags(x) }, ...(ref ? [{ url: ref.url, caption: 'Planograma de referencia' }] : [])]);
    });
    document.getElementById('csv').onclick = () => {
      const filas = [['Fecha', 'Punto de venta', 'Tipo', 'Relevador', 'Observaciones', 'Enlace'],
        ...lista.map((x) => [new Date(x.ts).toISOString(), x.pdv, x.tipo, x.relevador, (x.criterios || []).map((id) => criterioDe(id).texto).join('; '), x.pendiente ? '(por subir)' : x.url])];
      const csv = '﻿' + filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
