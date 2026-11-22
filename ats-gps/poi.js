/* poi.js — Buscar gasolinera / taller / descanso, "Añadir parada" y rutas alternativas.
   BUSCAR: elige categoria -> vista plana en la misma pantalla (sin agrandar el panel) con un punto por lugar.
           Con ruta: los cercanos a ella, con km hasta ahi y "+N min" del desvio. Sin ruta: los 25 mas cercanos.
           Tocar un punto/tarjeta -> "Añadir parada" (con ruta: sale -> parada -> destino original) o "Ir ahi" (sin ruta).
   ALTERNATIVAS: boton de ruta (flechas) -> la principal se queda; las otras en azul palido con "N min mas lento"; tocar una la activa.
   "Centrar" quita todo y vuelve a la vista 3D siguiendo al camion.
   CIUDADES: caja "Buscar ciudad" arriba de las categorias. Sugiere mientras escribes (empiezan con esas letras; luego las que
           tienen una palabra que empieza asi). Si no hay ninguna, propone la mas parecida: "¿Quisiste decir Chicago?".
           Necesita Cities.json junto a index.html (TsMap: Export as Web Tile Map -> "Generate City List").
   Necesita poi.json y la version de ruta.js con el parametro mult. Lo abren los botones de index.html (PoiATS.abrir / PoiATS.alternativas). */
(function () {
  'use strict';
  const CATS = [
    { k: 'gas',      t: 'Gasolinera', c: '#f5a623', e: '⛽' },
    { k: 'taller',   t: 'Taller',     c: '#4da3ff', e: '🔧' },
    { k: 'descanso', t: 'Descanso',   c: '#3ddc84', e: '🛏️' }
  ];
  const N_FREE = 25;       // sin ruta: cuantos puntos se dibujan
  const R_RUTA = 300;      // "cerca de la ruta": metros del mapa (con escala ~20 son unos 6 km mostrados). Maximo 300
  const FACTOR = 1.4;      // desvio estimado = 2 x distancia a la ruta x FACTOR (las carreteras no son rectas)
  const N_ALT = 2;         // cuantas rutas alternativas se buscan
  const K_ALT = 3;         // cuanto se encarecen los tramos ya usados para forzar otra ruta
  const MAX_IGUAL = 0.8;   // si una alternativa comparte mas de esto con la principal, no cuenta como alternativa
  const COLOR_ALT = '#9cc4e8';
  let POI = null, cat = null, capa = null, capaT = null, capaAlt = null, paradaMk = null, token = 0, itemsAct = [];

  function masCercanos(k, x, z, n) {
    const r = ((POI && POI[k]) || []).map(p => ({ p: p, d: Math.hypot(p[0] - x, p[1] - z) }));
    r.sort((a, b) => a.d - b.d);
    return r.slice(0, n);
  }
  // puntos de la categoria k a menos de rMax (<=300) de algun vertice de la ruta desde 'desde'; i = vertice mas cercano
  function cercaDeRuta(k, xs, zs, path, desde, rMax) {
    const C = 300, cel = new Map();
    for (let i = desde; i < path.length; i++) {
      const v = path[i], key = Math.floor(xs[v] / C) * 100000 + Math.floor(zs[v] / C);
      let a = cel.get(key); if (!a) cel.set(key, a = []); a.push(i);
    }
    const out = [];
    for (const p of (POI && POI[k]) || []) {
      const cx = Math.floor(p[0] / C), cz = Math.floor(p[1] / C); let bi = -1, bd = rMax;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const a = cel.get((cx + dx) * 100000 + (cz + dz)); if (!a) continue;
        for (const i of a) { const v = path[i], d = Math.hypot(xs[v] - p[0], zs[v] - p[1]); if (d < bd) { bd = d; bi = i; } }
      }
      if (bi >= 0) out.push({ p: p, d: bd, i: bi });
    }
    return out;
  }

  // ---------- interfaz ----------
  const css = 'color:var(--text,#fff);border:0;font:inherit;font-size:16px;background:#2c3042;border-radius:12px;';
  const pn = document.createElement('div');
  pn.id = 'pPanel'; pn.className = 'hud';
  pn.style.cssText = 'display:none;z-index:2000;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));width:min(calc(96vw / var(--hz,1)),440px);max-height:calc(62vh / var(--hz,1));overflow:auto;';
  const cab = document.createElement('div');
  cab.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  const atras = document.createElement('button');
  atras.textContent = '←'; atras.setAttribute('aria-label', 'Volver a las categorías');
  atras.style.cssText = css + 'padding:8px 14px;min-height:44px;display:none;';
  const titulo = document.createElement('div');
  titulo.style.cssText = 'flex:1;font-weight:600;font-size:17px;';
  const cerrar = document.createElement('button');
  cerrar.textContent = '✕'; cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.style.cssText = css + 'padding:8px 14px;min-height:44px;';
  cab.appendChild(atras); cab.appendChild(titulo); cab.appendChild(cerrar);
  const cuerpo = document.createElement('div');
  pn.appendChild(cab); pn.appendChild(cuerpo);
  document.body.appendChild(pn);

  const pills = document.createElement('div');
  pills.id = 'pPills';
  pills.style.cssText = 'display:none;position:absolute;z-index:1900;left:12px;right:calc(70px / var(--hz,1));bottom:calc(104px + env(safe-area-inset-bottom,0px));justify-content:space-between;gap:10px;';
  const pcss = 'color:#fff;border:0;background:#000;font:600 16px system-ui,sans-serif;border-radius:26px;padding:0 18px;min-height:46px;box-shadow:0 2px 8px rgba(0,0,0,.45);';
  const bCentrar = document.createElement('button'); bCentrar.textContent = '➤ Centrar'; bCentrar.style.cssText = pcss;
  const bBorrar = document.createElement('button'); bBorrar.textContent = 'Borrar result.'; bBorrar.style.cssText = pcss;
  pills.appendChild(bCentrar); pills.appendChild(bBorrar);
  document.body.appendChild(pills);

  const pausa = () => new Promise(q => setTimeout(q, 30));
  function conRuta() { return (typeof G !== 'undefined' && G && typeof rutaActual !== 'undefined' && rutaActual && rutaActual.path && rutaActual.restE) ? rutaActual : null; }
  function cargaPoi() {
    if (POI) return Promise.resolve();
    return fetch('poi.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => { POI = j; })
      .catch(() => { msg('No se pudo cargar poi.json (¿está junto a index.html?)', 6000); });
  }
  function infoCat() { return CATS.find(c => c.k === cat); }
  function aviso(t) { const r = $('rutaInfo'); if (t) { r.textContent = t; r.classList.add('show'); } else if (/^Buscando/.test(r.textContent)) r.classList.remove('show'); }
  function quita(l) { if (l) map.removeLayer(l); return null; }
  function limpia() { capa = quita(capa); capaT = quita(capaT); capaAlt = quita(capaAlt); itemsAct = []; }

  // vista plana en la MISMA pantalla (sin agrandar el panel) encuadrando todos los puntos
  function vistaPlana(pts, tras) {
    follow = false; $('bFollow').classList.remove('active');
    if (vista3d) set3D(false, ZOOM_PLANO);
    const fit = () => { try { map.invalidateSize({ animate: false }); map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: false }); if (tras) tras(); } catch (e) {} };
    fit(); setTimeout(fit, 400);                       // la segunda vez, ya con el mapa en 2D del todo
  }

  // ---------- buscar ----------
  function categorias() {
    CATS.forEach(c => {
      const b = document.createElement('button');
      b.textContent = c.e + '  ' + c.t;
      b.style.cssText = css + 'display:block;width:100%;text-align:left;padding:14px;margin-top:8px;min-height:56px;font-size:18px;border-left:6px solid ' + c.c + ';';
      b.onclick = () => { cat = c.k; cargaPoi().then(muestra); };
      cuerpo.appendChild(b);
    });
  }
  function pinta() { cuerpo.textContent = ''; titulo.textContent = 'Buscar'; atras.style.display = 'none'; cajaCiudad(); categorias(); }

  // ---------- ciudades ----------
  const MAX_LISTA = 40;    // cuantas ciudades se listan como maximo mientras escribes
  let CIUD = null, ciudProm = null;
  const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const EDOS = { aguasca: 'Aguascalientes', bajacalifo: 'Baja California', bajacalisu: 'Baja California Sur', chihuah: 'Chihuahua',   // el juego corta
    coahuil: 'Coahuila', nvoleon: 'Nuevo León', sanluis: 'San Luis Potosí', tamaulip: 'Tamaulipas' };                               // algunos nombres
  const bonito = t => EDOS[t] || String(t || '').split('_').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
  function cargaCiudades() {
    if (CIUD) return Promise.resolve(CIUD);
    if (ciudProm) return ciudProm;
    ciudProm = fetch('Cities.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(arr => {
      const vistos = {}, L = [];
      (arr || []).forEach(c => {
        if (!c || !c.Name || typeof c.X !== 'number' || typeof c.Y !== 'number') return;
        const k = norm(c.Name) + '|' + (c.Country || ''); if (vistos[k]) return; vistos[k] = 1;
        const nom = [c.Name]; if (c.LocalizedNames) for (const l in c.LocalizedNames) if (c.LocalizedNames[l]) nom.push(c.LocalizedNames[l]);
        const n = nom.map(norm).filter((v, i, a) => v && a.indexOf(v) === i);
        L.push({ t: c.Name, edo: bonito(c.Country), x: c.X, z: c.Y, n: n, w: n.map(v => v.split(/[ \-]+/)) });
      });
      L.sort((a, b) => a.t.localeCompare(b.t, 'es'));
      return CIUD = L;
    }).catch(() => { ciudProm = null; return null; });
    return ciudProm;
  }
  function lev(a, b) {                     // letras de diferencia (cambiar, poner, quitar o voltear dos letras)
    const m = a.length, n = b.length, d = [];
    for (let i = 0; i <= m; i++) { d[i] = [i]; }
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function buscaCiudades(q) {
    q = norm(q).replace(/^cd\.? ?/, 'ciudad '); const ini = [], pal = []; let sug = [];   // "Cd. Juarez" = Ciudad Juarez
    if (!q || !CIUD) return { ini: ini, pal: pal, sug: sug };
    CIUD.forEach(c => {
      if (c.n.some(v => v.indexOf(q) === 0)) ini.push(c);
      else if (c.w.some(ws => ws.some(w => w.indexOf(q) === 0))) pal.push(c);
    });
    if (!ini.length && !pal.length && q.length >= 3) {          // nada empieza asi: la mas parecida
      const tol = Math.max(1, Math.floor(q.length / 3));
      sug = CIUD.map(c => {
        let full = 99, pre = 99;
        c.n.forEach(v => { full = Math.min(full, lev(q, v)); pre = Math.min(pre, lev(q, v.slice(0, q.length))); });
        return { c: c, d: Math.min(full, pre), f: full };
      }).filter(o => o.d <= tol).sort((a, b) => a.d - b.d || a.f - b.f).slice(0, 3).map(o => o.c);
    }
    return { ini: ini, pal: pal, sug: sug };
  }
  function irCiudad(c) {
    if (typeof G === 'undefined' || !G) { msg('Todavía se está cargando el mapa de rutas.', 3000); return; }
    let best = -1, bd = Infinity;                               // punto de carretera mas cercano al centro de la ciudad
    for (let i = 0; i < G.N; i++) {
      if (G.off[i + 1] === G.off[i] || (G.visIn && !G.visIn[i])) continue;
      const d = Math.hypot(G.xs[i] - c.x, G.zs[i] - c.z); if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { msg('No encontré carreteras cerca de ' + c.t + '.', 4000); return; }
    pn.style.display = 'none';
    if (!last) { map.setView(gameToLatLng(c.x, c.z), 5); msg('Entra a una partida para calcular la ruta a ' + c.t + '.', 4000); return; }
    elige([G.xs[best], G.zs[best]], false);
    msg('Ruta a ' + c.t, 3000);
  }
  function cajaCiudad() {
    const inp = document.createElement('input');
    inp.type = 'search'; inp.placeholder = 'Buscar ciudad…'; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('autocorrect', 'off'); inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('aria-label', 'Buscar ciudad');
    inp.style.cssText = css + 'display:block;width:100%;box-sizing:border-box;padding:12px 14px;min-height:52px;font-size:18px;outline:none;background:#1f2333;border:2px solid #3a4160;';
    const res = document.createElement('div');
    cuerpo.appendChild(inp); cuerpo.appendChild(res);
    const fila = (txt, fn, extra) => {
      const b = document.createElement(fn ? 'button' : 'div'); b.textContent = txt;
      b.style.cssText = (fn ? css + 'display:block;width:100%;text-align:left;padding:12px 14px;margin-top:6px;min-height:50px;font-size:17px;' : 'padding:10px 4px;opacity:.8;font-size:15px;') + (extra || '');
      if (fn) b.onclick = fn; res.appendChild(b); return b;
    };
    const pintaRes = () => {
      res.textContent = '';
      if (!norm(inp.value)) return;
      if (!CIUD) {
        fila('Cargando ciudades…');
        cargaCiudades().then(ok => { if (ok) pintaRes(); else { res.textContent = ''; fila('Falta Cities.json junto a index.html. Se saca con TsMap: Export as Web Tile Map → "Generate City List".'); } });
        return;
      }
      const r = buscaCiudades(inp.value), lista = r.ini.concat(r.pal);
      lista.slice(0, MAX_LISTA).forEach(c => fila(c.t + (c.edo ? '  ·  ' + c.edo : ''), () => irCiudad(c)));
      if (lista.length > MAX_LISTA) fila('…y ' + (lista.length - MAX_LISTA) + ' más. Escribe otra letra.');
      if (!lista.length && r.sug.length) r.sug.forEach((c, i) => fila(i === 0 ? '¿Quisiste decir ' + c.t + '?' : c.t + (c.edo ? '  ·  ' + c.edo : ''),
        () => irCiudad(c), i === 0 ? 'background:#1a73e8;font-weight:600;' : ''));
      if (!lista.length && !r.sug.length) fila('No encontré ninguna ciudad así.');
    };
    inp.addEventListener('input', pintaRes);
    inp.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter') return;
      const r = buscaCiudades(inp.value), c = r.ini[0] || r.pal[0] || r.sug[0];
      if (c) { inp.blur(); irCiudad(c); }
    });
    cargaCiudades();
  }

  // tarjetas (km y +min) solo para los mejores que no se tapen entre si ni se salgan de la pantalla
  function tarjetas() {
    capaT = quita(capaT); const info = infoCat(); if (!info || !itemsAct.length) return;
    capaT = L.layerGroup().addTo(map);
    const sz = map.getSize(), maxN = sz.x * sz.y > 400000 ? 8 : 5, usados = []; let n = 0;
    itemsAct.forEach(it => {
      if (n >= maxN) return;
      const pt = map.latLngToContainerPoint(it.ll), r = { x0: pt.x - 50, x1: pt.x + 50, y0: pt.y - 62, y1: pt.y - 6 };
      if (r.x0 < 0 || r.x1 > sz.x || r.y0 < 0 || r.y1 > sz.y) return;
      if (usados.some(u => !(r.x1 < u.x0 || r.x0 > u.x1 || r.y1 < u.y0 || r.y0 > u.y1))) return;
      usados.push(r); n++;
      const html = '<div style="position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - 12px));white-space:nowrap;background:#1d3557;color:#fff;border-radius:8px;padding:3px 8px;font:600 14px/1.2 system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.45)">'
        + fmtDist(it.km) + (it.min ? '<br><span style="color:#ffb74d">+' + it.min + ' min</span>' : '') + '</div>';
      L.marker(it.ll, { icon: L.divIcon({ className: '', iconSize: [0, 0], html: html }), zIndexOffset: 500 }).addTo(capaT).on('click', () => detalle(it));
    });
  }

  function muestra() {
    limpia(); pn.style.display = 'none';
    const info = infoCat(); if (!info) return;
    if (!last) { msg('Entra a una partida para buscar cerca de ti.', 3000); pn.style.display = 'block'; return; }
    if (!POI) return;
    const esc = escalaEn(last.x, last.z), R = conRuta();
    let items;
    if (R) {
      const a0 = Math.max(0, avance), prom = (typeof PROM_KMH === 'number' ? PROM_KMH : 55) / 3.6;
      items = cercaDeRuta(cat, G.xs, G.zs, R.path, a0, R_RUTA).map(r => ({ p: r.p,
        km: Math.max(0, R.restE[a0] - R.restE[r.i]), min: Math.max(1, Math.round(2 * r.d * FACTOR * esc / prom / 60)) }));
      items.sort((a, b) => a.min - b.min || a.km - b.km);
    } else {
      items = masCercanos(cat, last.x, last.z, N_FREE).map(r => ({ p: r.p, km: r.d * esc, min: null }));
    }
    if (!items.length) { msg('No hay ' + info.t.toLowerCase() + 's cerca de la ruta.', 4000); pn.style.display = 'block'; return; }
    capa = L.layerGroup().addTo(map);
    const pts = [gameToLatLng(last.x, last.z)];
    items.forEach(it => {
      it.ll = gameToLatLng(it.p[0], it.p[1]); pts.push(it.ll);
      L.circleMarker(it.ll, { radius: 8, color: '#111', weight: 2, fillColor: info.c, fillOpacity: 1 }).addTo(capa).on('click', () => detalle(it));
    });
    itemsAct = items;
    bBorrar.style.display = ''; pills.style.display = 'flex';
    vistaPlana(pts, tarjetas);
  }

  function detalle(it) {
    const info = infoCat(); if (!info) return;
    const comoParada = !!(conRuta() && destino);
    pn.style.display = 'block'; cuerpo.textContent = ''; atras.style.display = 'none';
    titulo.textContent = info.e + ' ' + info.t + ' · ' + fmtDist(it.km) + (it.min ? ' · +' + it.min + ' min' : '');
    const ir = document.createElement('button');
    ir.textContent = comoParada ? 'Añadir parada' : 'Ir ahí';
    ir.style.cssText = css + 'display:block;width:100%;padding:14px;min-height:52px;font-size:18px;background:#1a73e8;';
    ir.onclick = () => elige(it.p, comoParada);
    cuerpo.appendChild(ir);
  }

  function marcaParada(p) {
    paradaMk = quita(paradaMk);
    paradaMk = L.circleMarker(gameToLatLng(p[0], p[1]), { radius: 9, color: '#111', weight: 3, fillColor: '#f5a623', fillOpacity: 1, interactive: false }).addTo(map);
  }
  function elige(p, comoParada) {
    if (!last) { msg('Entra a una partida para calcular la ruta.', 3000); return; }
    borrar();
    if (comoParada && destino) {              // la ruta ya sincronizada se conserva: sale -> parada -> destino original
      window.paradaGps = { x: p[0], z: p[1] }; marcaParada(p); calcular('parada'); return;
    }
    destino = { x: p[0], z: p[1] }; destDeJuego = false; destEsp = false; espAvisa();
    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.circleMarker(gameToLatLng(p[0], p[1]), { radius: 9, color: '#1a1a1a', weight: 3, fillColor: '#ff4d4d', fillOpacity: 1, interactive: false }).addTo(map);
    calcular('nuevo');
  }

  // ---------- rutas alternativas ----------
  async function alternativas() {
    if (capaAlt) { borrar(); return; }              // segundo toque: vuelve a como estaba
    const R = conRuta();
    if (!R) { msg('Primero pon un destino para ver rutas alternativas.', 3500); return; }
    if (window.paradaGps) { msg('Con una parada activa no hay rutas alternativas.', 4000); return; }
    if (typeof RutaATS === 'undefined') return;
    const mi = ++token; pn.style.display = 'none'; limpia(); aviso('Buscando rutas alternativas…');
    await pausa();
    const a0 = Math.max(0, avance), path = R.path, s = path[a0], t = path[path.length - 1], N = G.N;
    const mult = new Float32Array(G.E).fill(1), principal = new Set(), clave = (u, w) => u * N + w;
    const marcar = (p, desde, set) => {
      for (let i = desde; i + 1 < p.length; i++) {
        const u = p[i], w = p[i + 1]; let best = -1, bl = Infinity;
        for (let e = G.off[u]; e < G.off[u + 1]; e++) if (G.tg[e] === w && G.ln[e] < bl) { bl = G.ln[e]; best = e; }
        if (best >= 0) { mult[best] = K_ALT; if (set) set.add(clave(u, w)); }
      }
    };
    marcar(path, a0, principal);
    const alts = [];
    for (let k = 0; k < N_ALT + 2 && alts.length < N_ALT; k++) {
      await pausa(); if (mi !== token) return;
      const rr = RutaATS.ruta(G, s, t, typeof PEN_SEC === 'number' ? PEN_SEC : 1, mult);
      if (!rr) break;
      let comp = 0; for (let i = 0; i + 1 < rr.ruta.length; i++) if (principal.has(clave(rr.ruta[i], rr.ruta[i + 1]))) comp++;
      marcar(rr.ruta, 0, null);                      // la siguiente busqueda tambien evita esta
      if (comp / Math.max(1, rr.ruta.length - 1) > MAX_IGUAL) continue;     // casi igual a la principal: no sirve
      alts.push(rr);
    }
    if (mi !== token) return;
    aviso('');
    if (!alts.length) { msg('No encontré otra ruta distinta para este destino.', 4000); return; }
    const prom = (typeof PROM_KMH === 'number' ? PROM_KMH : 55) / 3.6, minPpal = R.restE[a0] / prom / 60, enPpal = new Set(path.slice(a0));
    capaAlt = L.layerGroup().addTo(map); const pts = [];
    alts.forEach(rr => {
      const da = distAristas(rr.ruta), geo = construirGeo(rr.ruta), dif = Math.round(da.restE[0] / prom / 60 - minPpal);
      const fuera = []; rr.ruta.forEach((v, i) => { if (!enPpal.has(v)) fuera.push(i); });
      const ix = fuera.length ? fuera[fuera.length >> 1] : rr.ruta.length >> 1, ll = geo.flat[geo.idx[ix]] || geo.flat[geo.flat.length >> 1];
      L.polyline(geo.flat, { color: COLOR_ALT, weight: anchoRutaPx(), opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: true, className: 'ruta-alt' }).addTo(capaAlt).on('click', () => aplica(rr, da, geo));
      const txt = dif >= 1 ? dif + ' min más lento' : 'Mismo tiempo';
      const html = '<div style="position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;background:#1d5fa8;color:#fff;border:2px solid #cfe3f7;border-radius:10px;padding:4px 10px;font:600 15px system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.45)">' + txt + '</div>';
      L.marker(ll, { icon: L.divIcon({ className: '', iconSize: [0, 0], html: html }), zIndexOffset: 600 }).addTo(capaAlt).on('click', () => aplica(rr, da, geo));
      for (let i = 0; i < geo.flat.length; i += 12) pts.push(geo.flat[i]);
    });
    if (rutaLine && rutaLine.bringToFront) rutaLine.bringToFront();             // la principal se queda arriba y brillante
    if (R.pts) for (let i = R.idx[a0]; i < R.pts.length; i += 12) pts.push(R.pts[i]);
    pts.push(gameToLatLng(last.x, last.z));
    bBorrar.style.display = 'none'; pills.style.display = 'flex';
    vistaPlana(pts);
  }
  function aplica(rr, da, geo) {                    // la alternativa elegida pasa a ser la ruta activa
    borrar();
    rutaActual = { path: rr.ruta, rest: da.rest, restE: da.restE, ocultos: da.ocultos }; avance = 0; ultimoCalc = Date.now();
    rutaActual.pts = geo.flat; rutaActual.idx = geo.idx; rutaActual.fx = geo.fx; rutaActual.fz = geo.fz; lastRecorte = null; escPrev = null; escAccG = escAccM = 0;
    if (rutaLine) map.removeLayer(rutaLine);
    rutaLine = L.polyline(geo.flat, { ...ESTILO_RUTA, weight: anchoRutaPx() }).addTo(map);
    if (rutaHead) map.removeLayer(rutaHead);
    rutaHead = L.polyline([], { ...ESTILO_RUTA, weight: anchoRutaPx() }).addTo(map); lineDesde = -1;
    actualizarRuta(); msg('Ruta cambiada.', 2500);
  }

  // ---------- salir ----------
  function borrar() {                               // "Centrar": quita todas las opciones y vuelve a 3D siguiendo al camion
    token++; limpia(); aviso('');
    pills.style.display = 'none'; pn.style.display = 'none';
    if (last && !vista3d) set3D(true);
    follow = true; $('bFollow').classList.add('active');
  }
  function abrir() { cat = null; pn.style.display = 'block'; pinta(); cargaPoi(); }
  bCentrar.onclick = borrar;
  bBorrar.onclick = () => { capa = quita(capa); capaT = quita(capaT); itemsAct = []; pills.style.display = 'none'; pn.style.display = 'none'; };   // solo quita los puntos
  cerrar.onclick = () => { pn.style.display = 'none'; };
  atras.onclick = () => { cat = null; pinta(); };

  // el boton de ruta (flechas) ahora muestra las alternativas; lo demas queda como estaba
  const gA = $('gAereo'), viejoA = gA && gA.onclick;
  if (gA) gA.onclick = function (ev) {
    if (!ev || estilo === 'wazaaa' || (estilo === 'pineaple' && EMB)) return viejoA && viejoA.apply(this, arguments);   // llamadas del codigo y botones "mapa" siguen igual
    alternativas();
  };
  const wb = $('wrAereoB'); if (wb) wb.onclick = () => { const p = $('wzRuta'); if (p) p.hidden = true; alternativas(); };

  window.PoiATS = { masCercanos: masCercanos, cercaDeRuta: cercaDeRuta, abrir: abrir, alternativas: alternativas, borrar: borrar,
    limpiaParada: function () { paradaMk = quita(paradaMk); }, setPoi: function (j) { POI = j; },
    abrirCat: function (k) { if (!last) { abrir(); msg('Entra a una partida para buscar cerca de ti.', 3000); return; } cat = k; cargaPoi().then(muestra); },   // chips de la vista sin destino
    cargar: cargaPoi,   // para los avisos de ultima gasolinera / descanso (index.html)
    elegir: function (p) { elige(p, !!(conRuta() && destino)); },
    irCiudad: function (c) { irCiudad(c); },
    ciudades: function () { return cargaCiudades(); },   // lista de ciudades (para decir "cerca de …" en la barra de busqueda)   // la barra "Buscar aquí" de index.html pone la ruta a la ciudad elegida
    buscaCiudades: function (q) { return cargaCiudades().then(() => buscaCiudades(q)); } };   // pone la ruta a ese punto como parada (o como destino si no hay ruta)   // setPoi solo para pruebas
})();
