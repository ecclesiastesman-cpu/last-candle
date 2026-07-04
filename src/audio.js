// Процедурный звук (WebAudio): тёмный дрон-эмбиент + синтезированные SFX.
// Ассет audio_all из манифеста; настроение — по формуле стиля (гнетущее, редкие сполохи).
import { bus } from './core.js';

export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.droneNodes = [];
    this.bossMode = false;
  }
  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = .5;
      this.master.connect(this.ctx.destination);
      this.startDrone();
      this.wire();
      return true;
    } catch { return false; }
  }
  resume() { this.ctx?.resume?.(); }
  setEnabled(v) { this.enabled = v; if (this.master) this.master.gain.value = v ? .5 : 0; }

  // --- дрон-эмбиент: два расстроенных низких осциллятора + фильтрованный шум + редкие "скрипы"
  startDrone() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = .05; g.connect(this.master);
    for (const [f, type] of [[55, 'sawtooth'], [55.7, 'sawtooth'], [110.3, 'triangle']]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = .32;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      o.connect(og); og.connect(lp); lp.connect(g); o.start();
      this.droneNodes.push(o);
    }
    // шум-ветер
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * .35;
    const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 300; nf.Q.value = .6;
    const ng = c.createGain(); ng.gain.value = .04;
    noise.connect(nf); nf.connect(ng); ng.connect(this.master); noise.start();
    const lfo = c.createOscillator(); lfo.frequency.value = .07;
    const lg = c.createGain(); lg.gain.value = 120;
    lfo.connect(lg); lg.connect(nf.frequency); lfo.start();
    // редкие жуткие интервалы
    this.creakTimer = setInterval(() => { if (this.enabled && Math.random() < .5) this.creak(); }, 9000);
    this.droneGain = g;
  }
  creak() {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    const base = 160 + Math.random() * 200;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (0.5 + Math.random() * .3), t + 2.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + .8); g.gain.linearRampToValueAtTime(0, t + 2.6);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 2.7);
  }
  setBoss(v) {
    this.bossMode = v;
    if (this.droneGain) this.droneGain.gain.linearRampToValueAtTime(v ? .11 : .05, this.ctx.currentTime + 1);
  }

  // --- SFX синтез ---
  blip({ freq = 440, freq2, dur = .12, type = 'square', vol = .18, noise = 0, slide }) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    if (noise) {
      const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * 4;
      const g = c.createGain(); g.gain.setValueAtTime(vol * noise, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    }
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur * (slide || 1));
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
  }
  wire() {
    bus.on('attack', () => this.blip({ freq: 190, freq2: 90, dur: .1, type: 'sawtooth', vol: .1, noise: .8 }));
    bus.on('hit', (m, d, o) => this.blip({ freq: o?.crit ? 320 : 200, freq2: 60, dur: .09, type: 'square', vol: .09, noise: 1.1 }));
    bus.on('mobDied', () => this.blip({ freq: 130, freq2: 35, dur: .3, type: 'sawtooth', vol: .13, noise: 1.2 }));
    bus.on('heroHurt', () => this.blip({ freq: 100, freq2: 55, dur: .18, type: 'square', vol: .16, noise: .9 }));
    bus.on('skill', sk => {
      const e = sk.elem;
      if (e === 'fire') this.blip({ freq: 90, freq2: 320, dur: .25, type: 'sawtooth', vol: .12, noise: 1.4 });
      else if (e === 'cold') this.blip({ freq: 900, freq2: 300, dur: .22, type: 'sine', vol: .12 });
      else if (e === 'light') this.blip({ freq: 1400, freq2: 200, dur: .12, type: 'sawtooth', vol: .1, noise: .6 });
      else this.blip({ freq: 250, freq2: 120, dur: .16, type: 'triangle', vol: .12 });
    });
    bus.on('pickupGold', () => this.blip({ freq: 1100, freq2: 1600, dur: .08, type: 'sine', vol: .1 }));
    bus.on('pickupItem', r => this.blip({ freq: r === 'unique' || r === 'set' ? 500 : 700, freq2: 1300, dur: .2, type: 'triangle', vol: .14 }));
    bus.on('potion', () => this.blip({ freq: 300, freq2: 700, dur: .25, type: 'sine', vol: .14 }));
    bus.on('levelUp', () => { this.blip({ freq: 420, freq2: 840, dur: .5, type: 'triangle', vol: .2 }); setTimeout(() => this.blip({ freq: 630, freq2: 1260, dur: .5, type: 'triangle', vol: .16 }), 120); });
    bus.on('heroDied', () => { this.blip({ freq: 220, freq2: 40, dur: 1.4, type: 'sawtooth', vol: .22, slide: 1 }); this.setBoss(false); });
    bus.on('portal', () => this.blip({ freq: 200, freq2: 900, dur: .6, type: 'sine', vol: .14 }));
    bus.on('bossRage', () => this.blip({ freq: 70, freq2: 45, dur: .9, type: 'sawtooth', vol: .25, noise: 1.6 }));
    bus.on('bossDied', () => { this.setBoss(false); this.blip({ freq: 500, freq2: 1000, dur: .8, type: 'triangle', vol: .2 }); });
    bus.on('bossStart', () => this.setBoss(true));
    bus.on('mobCast', () => this.blip({ freq: 600, freq2: 250, dur: .15, type: 'sine', vol: .07 }));
    bus.on('openChest', () => this.blip({ freq: 240, freq2: 480, dur: .3, type: 'triangle', vol: .13 }));
  }
}
