// Ruteo A* para ATS sobre grafo dirigido (grafo.bin). Funciona en navegador y en Node.
// Coordenadas = las mismas de la telemetria (x, z del juego). Longitudes en metros.
(function (root) {
  function cargarGrafoBuffer(buf) {
    const h = new DataView(buf);
    const N = h.getUint32(4, true), E = h.getUint32(8, true);
    let o = 12;
    const xs = new Float32Array(buf, o, N); o += 4 * N;
    const zs = new Float32Array(buf, o, N); o += 4 * N;
    const off = new Uint32Array(buf, o, N + 1); o += 4 * (N + 1);
    const tg = new Uint32Array(buf, o, E); o += 4 * E;
    const ln = new Float32Array(buf, o, E); o += 4 * E;
    // marca por arista: 1 = carretera/prefab oculto (el mapa no lo dibuja); formato nuevo, opcional
    const fl = (buf.byteLength >= o + E) ? new Uint8Array(buf, o, E) : null;
    // clase por arista (opcional, formato nuevo, va despues de fl): 0 sin clase (giros de prefab), 1 local, 2 dividida, 3 autopista, 4 no transitable
    const cl = (buf.byteLength >= o + 2 * E) ? new Uint8Array(buf, o + E, E) : null;
    // giros prohibidos (opcional, convertir_grafo.py --sin-rebotes): 'GIRO' | M | pares (llega, sale)
    let np = null, op = o + 2 * E; op += (4 - op % 4) % 4;
    if (cl && buf.byteLength >= op + 8 && new DataView(buf).getUint32(op, true) === 0x4F524947) {
      const M = h.getUint32(op + 4, true), pr = new Uint32Array(buf, op + 8, 2 * M);
      // agrupados por arista que llega: npOff[e]..npOff[e+1] en npSal
      const npOff = new Uint32Array(E + 1), npSal = new Uint32Array(M);
      for (let i = 0; i < M; i++) npOff[pr[2 * i] + 1]++;
      for (let i = 0; i < E; i++) npOff[i + 1] += npOff[i];
      const pos = npOff.slice(0, E);
      for (let i = 0; i < M; i++) npSal[pos[pr[2 * i]]++] = pr[2 * i + 1];
      np = { off: npOff, sal: npSal, g: new Float64Array(E), prev: new Int32Array(E), marca: new Uint32Array(E), vez: 0 };
    }
    // rejilla para buscar el vertice mas cercano
    const C = 500, minX = Math.min(...xs.subarray(0, 1000)), cells = new Map();
    for (let i = 0; i < N; i++) {
      const k = Math.floor(xs[i] / C) * 100000 + Math.floor(zs[i] / C);
      let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i);
    }
    return { N, E, xs, zs, off, tg, ln, fl, cl, np, cells, C };
  }
  async function cargarGrafo(url) {
    const r = await fetch(url); return cargarGrafoBuffer(await r.arrayBuffer());
  }
  // vertice mas cercano con salida y entrada (evita callejones); radio maximo en metros
  function masCercano(G, x, z, maxR) {
    maxR = maxR || 300; const C = G.C, cx = Math.floor(x / C), cz = Math.floor(z / C);
    let best = -1, bd = 1e18; const R = Math.ceil(maxR / C);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const a = G.cells.get((cx + dx) * 100000 + (cz + dz)); if (!a) continue;
      for (const i of a) {
        if (G.off[i + 1] === G.off[i]) continue; // sin salida
        const d = Math.hypot(G.xs[i] - x, G.zs[i] - z);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return bd <= maxR ? best : -1;
  }
  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) { k[0] = lk; v[0] = lv; let i = 0, n = k.length;
      for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && k[l] < k[m]) m = l; if (r < n && k[r] < k[m]) m = r; if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; } }
    return top;
  };
  Heap.prototype.size = function () { return this.k.length; };
  // devuelve { dist (m), ruta: [indices de vertices] } o null
  // penOculta: multiplicador de costo para tramos ocultos (1 = tratarlos igual que los visibles)
  // mult (opcional): Float32Array por arista (>= 1) que multiplica su costo; sirve para buscar rutas alternativas
  // evitar (opcional, > 1): multiplicador de costo para las autopistas (clase 3); se ignora si el grafo no trae clases
  function ruta(G, s, t, penOculta, mult, evitar) {
    const pen = penOculta === undefined ? 4 : penOculta;
    const evi = (evitar > 1 && G.cl) ? evitar : 1;
    if (s < 0 || t < 0) return null;
    if (G.np) {   // con giros prohibidos; si asi no hay ruta (tramo atrapado por un giro mal exportado), se calcula como antes
      const r = rutaTramos(G, s, t, pen, mult, evi); if (r) return r;
    }
    const g = new Map([[s, 0]]), prev = new Map(), done = new Set(), H = new Heap();
    const h = u => Math.hypot(G.xs[u] - G.xs[t], G.zs[u] - G.zs[t]);
    H.push(h(s), s);
    while (H.size()) {
      const u = H.pop(); if (done.has(u)) continue;
      if (u === t) { const path = [t]; let c = t; while (prev.has(c)) { c = prev.get(c); path.push(c); }
        return { dist: g.get(t), ruta: path.reverse() }; }   // dist incluye la penalizacion; la distancia real se calcula aparte
      done.add(u); const gu = g.get(u);
      for (let e = G.off[u]; e < G.off[u + 1]; e++) {
        const w = G.tg[e], nd = gu + G.ln[e] * ((G.fl && G.fl[e]) ? pen : 1) * (mult ? mult[e] : 1) * ((evi > 1 && G.cl[e] === 3) ? evi : 1);
        if (nd < (g.has(w) ? g.get(w) : 1e18)) { g.set(w, nd); prev.set(w, u); H.push(nd + h(w), w); }
      }
    }
    return null;
  }
  // Igual que ruta() pero recordando por que tramo se llego a cada nodo, para saltarse los giros
  // prohibidos de G.np (vueltas en U al salir de una pieza y volver a entrar). Estado = arista.
  function rutaTramos(G, s, t, pen, mult, evi) {
    if (s === t) return { dist: 0, ruta: [s] };
    const costo = e => G.ln[e] * ((G.fl && G.fl[e]) ? pen : 1) * (mult ? mult[e] : 1) * ((evi > 1 && G.cl[e] === 3) ? evi : 1);
    const h = u => Math.hypot(G.xs[u] - G.xs[t], G.zs[u] - G.zs[t]);
    // arreglos reutilizables: marca[e] = vez (visto en esta busqueda), +1 si ya quedo cerrado
    const NP = G.np, g = NP.g, prev = NP.prev, marca = NP.marca, H = new Heap();
    if (NP.vez > 4000000000) { marca.fill(0); NP.vez = 0; }
    const vez = (NP.vez += 2), cerrado = vez + 1;
    for (let e = G.off[s]; e < G.off[s + 1]; e++) {
      const nd = costo(e); if (marca[e] !== vez || nd < g[e]) { marca[e] = vez; g[e] = nd; prev[e] = -1; H.push(nd + h(G.tg[e]), e); }
    }
    while (H.size()) {
      const e = H.pop(); if (marca[e] === cerrado) continue;
      const v = G.tg[e];
      if (v === t) { const path = [t]; let c = prev[e]; while (c >= 0) { path.push(G.tg[c]); c = prev[c]; } path.push(s);
        return { dist: g[e], ruta: path.reverse() }; }
      marca[e] = cerrado; const ge = g[e], p0 = NP.off[e], p1 = NP.off[e + 1];
      for (let e2 = G.off[v]; e2 < G.off[v + 1]; e2++) {
        let no = false; for (let q = p0; q < p1; q++) if (NP.sal[q] === e2) { no = true; break; }
        if (no || marca[e2] === cerrado) continue;
        const nd = ge + costo(e2);
        if (marca[e2] !== vez || nd < g[e2]) { marca[e2] = vez; g[e2] = nd; prev[e2] = e; H.push(nd + h(G.tg[e2]), e2); }
      }
    }
    return null;
  }
  const API = { cargarGrafo, cargarGrafoBuffer, masCercano, ruta };
  if (typeof module !== 'undefined') module.exports = API; else root.RutaATS = API;
})(this);
