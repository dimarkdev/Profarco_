(function () {
  const C = window.CONFIG;
  const S = window.Store;
  const $app = document.getElementById('app');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtFecha = (ts) => new Date(ts).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const diaISO = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

  let toastT;
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
    document.body.appendChild(el);
    clearTimeout(toastT);
    toastT = setTimeout(() => el.remove(), 3200);
  }

  // ── Lightbox: una imagen, o dos lado a lado (foto vs planograma) ──
  function lightbox(items) {
    const el = document.createElement('div');
    el.className = 'lb';
    el.innerHTML = `<div class="lb-head"><span class="t">Toca la imagen para acercar</span><button class="btn sm" data-x>Cerrar</button></div>
      <div class="lb-body">${items.map((i) => `<figure><img src="${esc(i.url)}" alt="">${i.caption ? `<div>${esc(i.caption)}</div>` : ''}</figure>`).join('')}</div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) el.remove();
      else if (e.target.tagName === 'IMG') el.classList.toggle('zoom');
    });
    document.body.appendChild(el);
  }

  // ── Estado ──
  const state = {
    planos: [],
    paso: 1,                      // 1 datos · 2 planograma · 3 fotos
    promotor: localStorage.getItem('promotor') || '',
    local: '', categoria: C.CATEGORIAS[0],
    idx: 0, vistas: new Set(), entendido: false,
    nuevas: [],                   // [{file, url}] fotos tomadas, aun sin guardar
    tab: { desde: '', hasta: '', local: '', promotor: '', categoria: '' },
    fotos: null,
  };
  const planosDe = (local, cat) => state.planos.filter((p) => p.local === local && p.categoria === cat);
  const locales = () => [...new Set([...C.LOCALES, ...state.planos.map((p) => p.local)])].sort((a, b) => a.localeCompare(b));

  // ── Estado de sincronizacion en la cabecera ──
  async function pintarSync() {
    const el = document.getElementById('sync');
    if (!el) return;
    if (!S.remoto) { el.className = 'sync prueba'; el.textContent = 'Modo prueba'; return; }
    const n = await S.pendientes();
    el.className = 'sync' + (n ? ' pend' : '');
    el.textContent = n ? `${n} foto${n > 1 ? 's' : ''} por subir` : 'Todo en Drive';
  }

  // ═══════════ CAMPO ═══════════
  function vistaCampo() {
    const barra = (i) => `<div class="steps">${[1, 2, 3].map((n) => `<i class="${n <= i ? 'on' : ''}"></i>`).join('')}</div>`;

    if (state.paso === 1) {
      const ls = locales();
      $app.innerHTML = `<div class="wrap">
        <h1>Relevamiento de góndola</h1><p class="lead">Elige el local y la góndola. Antes de fotografiar verás el planograma de referencia.</p>
        ${barra(1)}
        <div class="stack">
          <label class="field"><span class="label">Promotor</span><input class="in" id="promotor" value="${esc(state.promotor)}" placeholder="Tu nombre" autocomplete="name"></label>
          <label class="field"><span class="label">Local</span>
            ${ls.length ? `<select class="in" id="local"><option value="">Elegir local…</option>${ls.map((l) => `<option ${l === state.local ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
              : `<input class="in" id="local" value="${esc(state.local)}" placeholder="Nombre del local">`}
          </label>
          <div><span class="label">Góndola</span><div class="chips" style="margin-top:8px">${C.CATEGORIAS.map((c) => `<button class="chip ${c === state.categoria ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
        </div></div>
        <div class="sticky-bar"><div><button class="btn primary block" id="seguir">Ver planograma de referencia</button></div></div>`;
      $app.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { state.categoria = b.dataset.cat; vistaCampo(); });
      document.getElementById('seguir').onclick = () => {
        state.promotor = document.getElementById('promotor').value.trim();
        state.local = document.getElementById('local').value.trim();
        if (!state.promotor || !state.local) return toast('Completa tu nombre y el local');
        localStorage.setItem('promotor', state.promotor);
        state.idx = 0; state.vistas = new Set(); state.entendido = false;
        state.paso = 2; vistaCampo();
      };
      return;
    }

    if (state.paso === 2) {
      const ps = planosDe(state.local, state.categoria);
      if (!ps.length) {
        $app.innerHTML = `<div class="wrap">${barra(2)}<div class="card empty"><h3>Sin planograma cargado</h3>
          <p style="margin-top:6px">${esc(state.local)} · ${esc(state.categoria)} todavía no tiene imagen de referencia. Puedes continuar y avisar al supervisor.</p></div></div>
          <div class="sticky-bar"><div><button class="btn" id="atras">Atrás</button><button class="btn primary block" id="sigue">Continuar a las fotos</button></div></div>`;
        document.getElementById('atras').onclick = () => { state.paso = 1; vistaCampo(); };
        document.getElementById('sigue').onclick = () => { state.paso = 3; vistaCampo(); };
        return;
      }
      state.vistas.add(state.idx);
      const todas = state.vistas.size === ps.length;
      $app.innerHTML = `<div class="wrap">
        <h1>Así debe verse</h1><p class="lead">${esc(state.local)} · ${esc(state.categoria)}</p>
        ${barra(2)}
        <div class="visor"><img src="${esc(ps[state.idx].url)}" alt="Planograma ${state.idx + 1}" data-zoom>
          ${ps.length > 1 ? `<button class="arrow l" data-nav="-1" aria-label="Anterior">‹</button><button class="arrow r" data-nav="1" aria-label="Siguiente">›</button>` : ''}
          <span class="count num">${state.idx + 1} / ${ps.length}</span></div>
        ${ps.length > 1 ? `<div class="thumbs">${ps.map((p, i) => `<button class="${i === state.idx ? 'cur' : ''} ${state.vistas.has(i) ? 'seen' : ''}" data-i="${i}"><img src="${esc(p.url)}" alt=""></button>`).join('')}</div>` : ''}
        <p class="muted" style="margin:10px 0">Toca la imagen para acercarla y revisar el detalle.</p>
        <label class="check ${todas ? '' : 'off'}"><input type="checkbox" id="ok" ${state.entendido ? 'checked' : ''} ${todas ? '' : 'disabled'}>
          <span>${todas ? 'Revisé el ejemplo y sé cómo debe quedar la góndola.' : `Mira las ${ps.length} imágenes para poder continuar.`}</span></label>
      </div>
      <div class="sticky-bar"><div><button class="btn" id="atras">Atrás</button><button class="btn accent block" id="cerrar" ${state.entendido && todas ? '' : 'disabled'}>Cerrar y tomar fotos</button></div></div>`;
      $app.querySelector('[data-zoom]').onclick = () => lightbox([{ url: ps[state.idx].url, caption: `Planograma ${state.idx + 1} de ${ps.length}` }]);
      $app.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => { state.idx = (state.idx + +b.dataset.nav + ps.length) % ps.length; vistaCampo(); });
      $app.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { state.idx = +b.dataset.i; vistaCampo(); });
      const ok = document.getElementById('ok');
      ok.onchange = () => { state.entendido = ok.checked; document.getElementById('cerrar').disabled = !ok.checked; };
      document.getElementById('atras').onclick = () => { state.paso = 1; vistaCampo(); };
      document.getElementById('cerrar').onclick = () => { state.paso = 3; vistaCampo(); };
      return;
    }

    // paso 3: fotos
    const ps = planosDe(state.local, state.categoria);
    $app.innerHTML = `<div class="wrap">
      <h1>Fotos de la góndola</h1><p class="lead">${esc(state.local)} · ${esc(state.categoria)}</p>
      ${barra(3)}
      ${ps.length ? `<div class="card ref-mini" style="margin-bottom:14px"><img src="${esc(ps[0].url)}" alt="" data-ref><div><h3>Planograma de referencia</h3><button class="btn sm" id="verref" style="margin-top:6px">Ver de nuevo</button></div></div>` : ''}
      <div class="grid-fotos">
        <label class="cam-btn" for="cam">${ICON_CAM}<span>Tomar foto</span></label>
        ${state.nuevas.map((f, i) => `<div class="foto"><img src="${esc(f.url)}" alt="Foto ${i + 1}"><button class="x" data-del="${i}" aria-label="Quitar">×</button></div>`).join('')}
      </div>
      <input type="file" id="cam" accept="image/*" capture="environment" class="hide">
      <p class="muted" style="margin-top:12px">Toma al menos una foto de frente a toda la góndola. Puedes agregar más de cerca.</p>
    </div>
    <div class="sticky-bar"><div><button class="btn" id="atras">Atrás</button><button class="btn primary block" id="guardar" ${state.nuevas.length ? '' : 'disabled'}>Guardar ${state.nuevas.length || ''} foto${state.nuevas.length === 1 ? '' : 's'}</button></div></div>`;
    const abrirRef = () => lightbox(ps.map((p, i) => ({ url: p.url, caption: `Planograma ${i + 1} de ${ps.length}` })));
    $app.querySelector('[data-ref]')?.addEventListener('click', abrirRef);
    document.getElementById('verref')?.addEventListener('click', abrirRef);
    document.getElementById('cam').onchange = (e) => {
      for (const file of e.target.files) state.nuevas.push({ file, url: URL.createObjectURL(file) });
      vistaCampo();
    };
    $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { state.nuevas.splice(+b.dataset.del, 1); vistaCampo(); });
    document.getElementById('atras').onclick = () => { state.paso = ps.length ? 2 : 1; vistaCampo(); };
    document.getElementById('guardar').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Guardando…';
      try {
        const n = state.nuevas.length;
        await S.guardarFotos({ local: state.local, categoria: state.categoria, promotor: state.promotor }, state.nuevas.map((f) => f.file));
        state.nuevas.forEach((f) => URL.revokeObjectURL(f.url));
        state.nuevas = []; state.paso = 1;
        toast(S.remoto ? `${n} foto(s) guardadas` : `${n} foto(s) guardadas en este dispositivo (modo prueba)`);
        pintarSync(); vistaCampo();
      } catch (err) { toast('No se pudo guardar: ' + err.message); e.target.disabled = false; }
    };
  }

  // ═══════════ TABLERO ═══════════
  async function vistaTablero() {
    $app.innerHTML = '<div class="wrap wide"><div class="empty">Cargando fotos…</div></div>';
    try { state.fotos = await S.todasLasFotos(); } catch (e) { $app.innerHTML = `<div class="wrap wide"><div class="empty">No se pudo leer Drive: ${esc(e.message)}</div></div>`; return; }
    pintarTablero();
  }

  function pintarTablero() {
    const f = state.tab;
    const todas = state.fotos || [];
    const opt = (k) => [...new Set(todas.map((x) => x[k]).filter(Boolean))].sort();
    const lista = todas.filter((x) =>
      (!f.desde || diaISO(x.ts) >= f.desde) && (!f.hasta || diaISO(x.ts) <= f.hasta) &&
      (!f.local || x.local === f.local) && (!f.promotor || x.promotor === f.promotor) && (!f.categoria || x.categoria === f.categoria))
      .sort((a, b) => b.ts - a.ts);

    const porLocal = {};
    lista.forEach((x) => { porLocal[x.local] = (porLocal[x.local] || 0) + 1; });
    const ranking = Object.entries(porLocal).sort((a, b) => b[1] - a[1]);
    const max = ranking[0]?.[1] || 1;
    const locs = [...new Set([...locales(), ...lista.map((x) => x.local)])].sort();
    const cats = C.CATEGORIAS;
    const celda = (l, c) => lista.filter((x) => x.local === l && x.categoria === c).length;
    const cubiertos = locs.filter((l) => lista.some((x) => x.local === l)).length;
    const select = (k, label, vals) => `<label class="field"><span class="label">${label}</span><select class="in" data-f="${k}"><option value="">Todos</option>${vals.map((v) => `<option ${f[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;

    $app.innerHTML = `<div class="wrap wide">
      <div class="row between"><div><h1>Tablero de góndolas</h1><p class="lead">Fotos relevadas por los promotores</p></div>
        <button class="btn sm" id="csv">Exportar CSV</button></div>
      <div class="filters">
        <label class="field"><span class="label">Desde</span><input type="date" class="in" data-f="desde" value="${f.desde}"></label>
        <label class="field"><span class="label">Hasta</span><input type="date" class="in" data-f="hasta" value="${f.hasta}"></label>
        ${select('local', 'Local', opt('local'))}${select('promotor', 'Promotor', opt('promotor'))}${select('categoria', 'Góndola', opt('categoria'))}
      </div>
      <div class="kpis">
        <div class="kpi"><div class="v">${lista.length}</div><div class="t">Fotos</div></div>
        <div class="kpi"><div class="v">${cubiertos}<span class="muted" style="font-size:1.1rem"> / ${locs.length}</span></div><div class="t">Locales con fotos</div></div>
        <div class="kpi"><div class="v">${new Set(lista.map((x) => x.promotor)).size}</div><div class="t">Promotores</div></div>
        <div class="kpi"><div class="v">${lista.filter((x) => x.pendiente).length}</div><div class="t">Por subir a Drive</div></div>
      </div>
      <div class="cols">
        <div class="card"><h3>Fotos por local</h3>${ranking.length ? ranking.map(([l, n]) => `<div class="bar-row"><span class="name" title="${esc(l)}">${esc(l)}</span><div class="track"><i style="width:${(n / max) * 100}%"></i></div><span class="num">${n}</span></div>`).join('') : '<div class="empty">Sin fotos para estos filtros</div>'}</div>
        <div class="card" style="overflow-x:auto"><h3>Cobertura por góndola</h3>${locs.length ? `<table><tr><th>Local</th>${cats.map((c) => `<th class="c">${esc(c)}</th>`).join('')}</tr>${locs.map((l) => `<tr><td>${esc(l)}</td>${cats.map((c) => { const n = celda(l, c); return `<td class="c"><span class="dot ${n ? 'si' : 'no'}">${n || '–'}</span></td>`; }).join('')}</tr>`).join('')}</table>` : '<div class="empty">Sin locales</div>'}</div>
      </div>
      <h2 style="margin-top:22px">Galería</h2>
      <div class="galeria">${lista.length ? lista.map((x, i) => `<button class="g-item" data-g="${i}"><img src="${esc(x.thumb || x.url)}" loading="lazy" alt=""><div><b>${esc(x.local)}</b><small>${esc(x.categoria)} · ${esc(x.promotor)}</small><small class="num">${fmtFecha(x.ts)}${x.pendiente ? ' · por subir' : ''}</small></div></button>`).join('') : '<div class="empty">Aún no hay fotos</div>'}</div>
    </div>`;

    $app.querySelectorAll('[data-f]').forEach((el) => el.onchange = () => { f[el.dataset.f] = el.value; pintarTablero(); });
    $app.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => {
      const x = lista[+b.dataset.g];
      const ref = planosDe(x.local, x.categoria)[0];
      lightbox([{ url: x.url, caption: `Foto · ${x.promotor} · ${fmtFecha(x.ts)}` }, ...(ref ? [{ url: ref.url, caption: 'Planograma de referencia' }] : [])]);
    });
    document.getElementById('csv').onclick = () => {
      const filas = [['Fecha', 'Local', 'Gondola', 'Promotor', 'Enlace'], ...lista.map((x) => [new Date(x.ts).toISOString(), x.local, x.categoria, x.promotor, x.pendiente ? '(por subir)' : x.url])];
      const csv = '﻿' + filas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `fotos-gondola-${diaISO(Date.now())}.csv` });
      a.click();
    };
  }

  // ═══════════ PLANOGRAMAS (administrador) ═══════════
  const admin = { local: '', categoria: C.CATEGORIAS[0], pin: '' };
  function vistaPlanogramas() {
    const ls = locales();
    $app.innerHTML = `<div class="wrap">
      <h1>Planogramas</h1><p class="lead">Imágenes de referencia que verá el promotor antes de fotografiar.</p>
      <div class="card stack" style="margin-top:16px">
        <label class="field"><span class="label">PIN de administrador</span><input class="in" id="pin" type="password" inputmode="numeric" value="${esc(admin.pin)}"></label>
        <label class="field"><span class="label">Local</span><input class="in" id="local" list="ls" value="${esc(admin.local)}" placeholder="Nombre del local"><datalist id="ls">${ls.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></label>
        <label class="field"><span class="label">Góndola</span><select class="in" id="cat">${C.CATEGORIAS.map((c) => `<option ${c === admin.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="btn accent block" for="subir">Agregar imágenes del planograma</label>
        <input type="file" id="subir" accept="image/*" multiple class="hide">
      </div>
      ${locales().map((l) => {
        const del = state.planos.filter((p) => p.local === l);
        if (!del.length) return '';
        return `<div class="card" style="margin-top:14px"><h3>${esc(l)}</h3>${C.CATEGORIAS.map((c) => {
          const ps = del.filter((p) => p.categoria === c);
          return ps.length ? `<div class="label" style="margin-top:12px">${esc(c)}</div><div class="plano-grid">${ps.map((p) => `<div class="foto"><img src="${esc(p.url)}" alt="" data-ver="${esc(p.id)}"><button class="x" data-borrar="${esc(p.id)}" aria-label="Borrar">×</button></div>`).join('')}</div>` : '';
        }).join('')}</div>`;
      }).join('')}
    </div>`;
    const lee = () => { admin.pin = document.getElementById('pin').value; admin.local = document.getElementById('local').value.trim(); admin.categoria = document.getElementById('cat').value; };
    document.getElementById('subir').onchange = async (e) => {
      lee();
      if (!admin.local) { toast('Escribe el nombre del local'); return; }
      try {
        for (const file of e.target.files) await S.agregarPlanograma(admin.local, admin.categoria, file, admin.pin);
        state.planos = await S.planogramas();
        toast('Planograma guardado'); vistaPlanogramas();
      } catch (err) { toast(err.message); }
    };
    $app.querySelectorAll('[data-borrar]').forEach((b) => b.onclick = async () => {
      lee();
      if (!confirm('¿Borrar esta imagen del planograma?')) return;
      try { await S.borrarPlanograma(b.dataset.borrar, admin.pin); state.planos = await S.planogramas(); vistaPlanogramas(); } catch (err) { toast(err.message); }
    });
    $app.querySelectorAll('[data-ver]').forEach((i) => i.onclick = () => lightbox([{ url: i.src }]));
  }

  // ═══════════ Router ═══════════
  async function ruta() {
    const r = (location.hash.replace('#/', '') || 'campo');
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === r));
    try { state.planos = await S.planogramas(); } catch (e) { state.planos = []; toast('Sin conexión con Drive: ' + e.message); }
    if (r === 'tablero') vistaTablero();
    else if (r === 'planogramas') vistaPlanogramas();
    else vistaCampo();
    pintarSync();
  }

  document.title = `Relevamiento de góndola · ${C.CLIENTE}`;
  document.getElementById('cliente').textContent = C.CLIENTE;
  window.addEventListener('hashchange', ruta);
  window.addEventListener('sync', () => { pintarSync(); if (location.hash === '#/tablero') vistaTablero(); });
  ruta();
  S.sincronizar().then(pintarSync);
})();
