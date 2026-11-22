/* avisos.js — avisos con voz de monitorista + efecto de radio. Maximo 2 veces por evento.
   Uso:   Avisos.cond('tanque', pct <= 25);      // llamalo en cada actualizacion de telemetria
   - Al activarse la condicion dice el aviso 1 (voz/<hombre|mujer>/a_<clave>_1.mp3); si sigue activa pasados 45 s dice el 2.
   - Despues se calla hasta que la condicion se apague (20 s seguidos; velocidad: 90 s) y vuelva a activarse. Velocidad: tras el aviso 2, si sigue o vuelve a pasarse, dice a_velocidad_fin una vez.
   Claves: tanque, velocidad, inclinacion, freno          Avisos.decir('a_tanque_1') reproduce un clip suelto.
   CONFIANZA: con las horas de manejo (window.horasDeUso, la cuenta index.html) se van mezclando los avisos cortos
   c_<clave>.mp3 en lugar de a_<clave>.mp3: antes de 'confianzaDesde' h nunca, despues de 'confianzaHasta' h siempre,
   y en medio cada vez mas seguido. Si falta el c_*.mp3 suena el a_*.mp3 de siempre. */
(function () {
  let DIR = 'voz/mujer/'; const cfg = {
    separa: 45000,                 // ms minimos entre el aviso 1 y el 2 (y antes del aviso final)
    max: 2,                        // avisos normales por evento
    rearma: 20000,                 // ms seguidos con la condicion apagada para poder repetir (general)
    rearmaClave: { velocidad: 90000 },   // velocidad: 90 s seguidos bajo el limite (ajusta entre 60000 y 120000)
    final: { velocidad: true },    // claves con frase de cierre: voz/<voz>/a_<clave>_fin.mp3, una sola vez tras los 2 avisos
    confianzaDesde: 3,             // horas de manejo con el GPS a partir de las que empiezan a salir los avisos de confianza
    confianzaHasta: 8,             // horas a partir de las que ya solo salen los de confianza
    // Sonido al empezar (como al apretar el boton del radio). Se escuchan todos en probar_avisos.html:
    //   'tono'     pitido limpio (el original)          'chirrido' estatica corta + chirrido que sube
    //   'click'    solo click + estatica corta           'kshh'     estatica larga que se abre y se cierra
    //   'pip'      dos pitidos cortos agudos             'boop'     un tono grave corto + estatica suave
    inicioTipo: 'pip',             // elegido por el usuario (2026-11-19)
    inicioVol: 0.4,                // volumen de la estatica del inicio (0 a 1)
    estatica: 0.035,               // estatica de fondo mientras habla (0 = sin estatica)
    // Sonido al terminar la frase (como al soltar el boton del radio)
    cierreBip: true,               // "bip" de fin de transmision (dos tonos cortos); false = sin bip
    cierreRuido: 0.35,             // segundos de la rafaga de estatica final ("kshh"); 0 = sin rafaga
    cierreVol: 0.45                // volumen de la rafaga (0 a 1)
  };
  function confianza() {           // 0 = monitorista nuevo, 1 = ya te conoce
    let h = 0; try { h = typeof window.horasDeUso === 'function' ? window.horasDeUso() : 0; } catch (e) {}
    const a = cfg.confianzaDesde, b = cfg.confianzaHasta;
    return h <= a ? 0 : (h >= b ? 1 : (h - a) / (b - a));
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, hablando = false; const cola = [], estado = {}, cache = {};
  function ac() { if (!ctx && AC) { try { ctx = new AC(); } catch (e) {} } return ctx; }
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, () => { const c = ac(); if (c && c.state === 'suspended') c.resume(); }, { passive: true }));

  function carga(k) {
    const ck = DIR + k; if (!cache[ck]) cache[ck] = fetch(DIR + k + '.mp3').then(r => { if (!r.ok) throw new Error('404'); return r.arrayBuffer(); })
      .then(b => new Promise((ok, no) => ac().decodeAudioData(b, ok, no)));
    return cache[ck];
  }
  function curva(k) { const n = 256, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
  function ruido(c, dur) { const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; }
  function filtro(c, tipo, f, q) { const x = c.createBiquadFilter(); x.type = tipo; x.frequency.value = f; if (q) x.Q.value = q; return x; }

  // sonido al apretar el boton del radio (cfg.inicioTipo); devuelve cuando termina
  function estat(c, m, t, d, v, f, q, ataque) {                       // rafaga de estatica filtrada con envolvente
    const r = c.createBufferSource(), g = c.createGain(), fl = filtro(c, 'bandpass', f || 1700, q || 0.45); r.buffer = ruido(c, d + 0.01);
    v = Math.max(0.002, v);
    if (ataque) { g.gain.setValueAtTime(0.002, t); g.gain.exponentialRampToValueAtTime(v, t + ataque); }
    else { g.gain.setValueAtTime(v * 1.6, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); }   // el "click" del boton
    g.gain.setValueAtTime(v, t + Math.max(ataque || 0.012, d * 0.6)); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    r.connect(fl); fl.connect(g); g.connect(m); r.start(t); r.stop(t + d + 0.01);
  }
  function tono(c, m, t, d, f1, f2, v, tipo) {
    const o = c.createOscillator(), g = c.createGain(); o.type = tipo || 'sine';
    o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.linearRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.setValueAtTime(v, t + d - 0.01); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); g.connect(m); o.start(t); o.stop(t + d + 0.01);
  }
  function inicio(c, m, t0) {
    const v = cfg.inicioVol;
    switch (cfg.inicioTipo) {
      case 'tono': tono(c, m, t0, 0.1, 1700, 0, 0.25); return t0 + 0.22;
      case 'click': estat(c, m, t0, 0.12, v); return t0 + 0.14;
      case 'kshh': estat(c, m, t0, 0.32, v, 1500, 0.4, 0.06); return t0 + 0.34;
      case 'pip': estat(c, m, t0, 0.03, v); tono(c, m, t0 + 0.03, 0.045, 1900, 0, 0.12); tono(c, m, t0 + 0.11, 0.045, 1900, 0, 0.12); return t0 + 0.2;
      case 'boop': estat(c, m, t0, 0.1, v * 0.6); tono(c, m, t0 + 0.06, 0.12, 760, 0, 0.18); return t0 + 0.22;
      default: estat(c, m, t0, 0.16, v); tono(c, m, t0 + 0.12, 0.065, 900, 1500, 0.07, 'square'); return t0 + 0.22;   // 'chirrido'
    }
  }

  // voz + efecto de radio: pitido de "pulsar para hablar", voz filtrada y saturada, estatica suave y rafaga al soltar
  function radio(buf) {
    return new Promise(fin => {
      const c = ac(), t0 = c.currentTime + 0.05, dur = buf.duration;
      const m = c.createGain(); m.gain.value = 0.9; m.connect(c.destination);
      const tv = inicio(c, m, t0) + 0.06, te = tv + dur + 0.05;          // sonido de inicio y despues la voz
      const s = c.createBufferSource(), ws = c.createWaveShaper(), vg = c.createGain(); s.buffer = buf; ws.curve = curva(6); vg.gain.value = 1.15;
      const hp = filtro(c, 'highpass', 450), lp = filtro(c, 'lowpass', 3200);
      s.connect(hp); hp.connect(lp); lp.connect(ws); ws.connect(vg); vg.connect(m); s.start(tv);
      const n = c.createBufferSource(), ng = c.createGain(); n.buffer = ruido(c, dur + 0.5); ng.gain.value = Math.max(0, cfg.estatica);
      const nf = filtro(c, 'bandpass', 2200, 0.6); n.connect(nf); nf.connect(ng); ng.connect(m); n.start(tv - 0.02); n.stop(te);
      let tr = te;                                                     // al terminar: bip de fin de transmision + rafaga de estatica
      if (cfg.cierreBip) [[1300, 0], [950, 0.07]].forEach(([f, d]) => {
        const b = c.createOscillator(), bg = c.createGain(); b.type = 'square'; b.frequency.value = f;
        bg.gain.setValueAtTime(0, te + d); bg.gain.linearRampToValueAtTime(0.09, te + d + 0.005); bg.gain.setValueAtTime(0.09, te + d + 0.06); bg.gain.linearRampToValueAtTime(0, te + d + 0.065);
        b.connect(bg); bg.connect(m); b.start(te + d); b.stop(te + d + 0.07); tr = te + 0.15;
      });
      const rd = Math.max(0, cfg.cierreRuido);
      if (rd > 0) {
        const r = c.createBufferSource(), rg = c.createGain(), rf = filtro(c, 'bandpass', 1900, 0.5); r.buffer = ruido(c, rd);
        const rv = Math.max(0.002, cfg.cierreVol); rg.gain.setValueAtTime(rv, tr); rg.gain.setValueAtTime(rv, tr + rd * 0.3); rg.gain.exponentialRampToValueAtTime(0.001, tr + rd);
        r.connect(rf); rf.connect(rg); rg.connect(m); r.start(tr); r.stop(tr + rd);
      }
      const extra = (tr - te) + rd;                                    // lo que dura el cierre despues de la voz
      s.onended = () => setTimeout(fin, 250 + extra * 1000); setTimeout(fin, (dur + 1.5 + extra) * 1000);   // red de seguridad
    });
  }
  function plano(k) { return new Promise(fin => { try { const a = new Audio(DIR + k + '.mp3'); a.onended = () => fin(true); a.onerror = () => fin(false); a.play().catch(() => fin(false)); } catch (e) { fin(false); } }); }   // true = sono

  function sigue() {
    const k = cola.shift(); if (!k) { hablando = false; return; }
    hablando = true;
    try { if (typeof vozAudio !== 'undefined') vozAudio.pause(); } catch (e) {}   // el aviso tiene prioridad sobre la voz del GPS
    let p; const c = ac();
    const kc = (k.slice(0, 2) === 'a_' && Math.random() < confianza()) ? 'c' + k.slice(1) : null;   // version de confianza
    if (c) {
      if (c.state === 'suspended') c.resume();
      const normal = () => carga(k).then(radio).catch(() => { delete cache[DIR + k]; return plano(k); });
      p = kc ? carga(kc).then(radio, () => { delete cache[DIR + kc]; return normal(); }) : normal();
    } else p = kc ? plano(kc).then(ok => ok ? null : plano(k)) : plano(k);
    p.then(sigue, sigue);
  }
  function decir(k) { try { if (typeof vozMuda !== 'undefined' && vozMuda) return; } catch (e) {} cola.push(k); if (!hablando) sigue(); }

  function cond(clave, activo, rearmaMs) {
    const e = estado[clave] || (estado[clave] = { n: 0, t: 0, on: false, off: 0 }), ahora = Date.now();
    if (!activo) { if (e.on && !e.off) e.off = ahora; if (e.off && ahora - e.off >= (rearmaMs || cfg.rearmaClave[clave] || cfg.rearma)) { e.on = false; e.n = 0; e.off = 0; e.fin = false; } return; }
    e.off = 0;
    if (!e.on) { e.on = true; e.n = 1; e.fin = false; e.t = ahora; decir('a_' + clave + '_1'); return; }
    if (e.n < cfg.max && ahora - e.t >= cfg.separa) { e.n++; e.t = ahora; decir('a_' + clave + '_' + e.n); return; }
    // ya sonaron los 2 avisos y la condicion sigue o volvio: frase de cierre una sola vez; despues, silencio hasta que pase el rearme
    if (e.n >= cfg.max && !e.fin && cfg.final[clave] && ahora - e.t >= cfg.separa) { e.fin = true; e.t = ahora; decir('a_' + clave + '_fin'); }
  }
  function setDir(d) { DIR = d.slice(-1) === '/' ? d : d + '/'; }   // carpeta de la voz elegida: 'voz/hombre/' o 'voz/mujer/'
  window.Avisos = { cond, decir, cfg, setDir, confianza, get hablando() { return hablando; } };
})();