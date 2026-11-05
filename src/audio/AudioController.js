import gsap from 'gsap';
import { track, frame } from '../experience/ExperienceController.js';
import { band, smoothstep } from '../animation/Interpolation.js';

// All sound is synthesised live: nothing is sampled, so there's nothing to license. Every gain is a function of
// the same channels that drive the picture, so scrubbing backwards plays the launch in reverse order of intensity.
class AudioController {
  constructor() { this.ctx = null; this.enabled = false; this.nodes = null; this.tick = this.tick.bind(this); }

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -14; limiter.ratio.value = 6;
    master.connect(limiter).connect(ctx.destination);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    { const d = noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5 + w * 0.05; } }
    const noise = (type, freq, q, gain = 0) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.loopStart = Math.random() * 2;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(f).connect(g).connect(master); s.start();
      return { f, g };
    };
    const pad = (freqs, type = 'sine') => {
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
      f.connect(g).connect(master);
      const oscs = freqs.map((fr, i) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = (i % 2 ? 1 : -1) * 6; const og = ctx.createGain(); og.gain.value = 1 / freqs.length; o.connect(og).connect(f); o.start(); return o; });
      return { g, f, oscs };
    };
    this.nodes = {
      master,
      rumble: noise('lowpass', 90, 0.4),
      roar: noise('bandpass', 260, 0.5),
      crackle: noise('highpass', 900, 0.3),
      wind: noise('bandpass', 600, 0.8),
      space: noise('lowpass', 180, 0.2),
      groundPad: pad([55, 82.4, 110]),
      orbitPad: pad([110, 164.8, 246.9, 329.6]),
      moonPad: pad([73.4, 110, 146.8]),
      deepPad: pad([49, 98, 146.8, 185]),
      nebulaPad: pad([196, 293.7, 440, 587.3]),
      arrivalPad: pad([65.4, 130.8, 196, 261.6, 392]),
      lfo: ctx.createOscillator(),
    };
    this.ctx = ctx;
    gsap.ticker.add(this.tick);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on && !this.ctx) this.build();
    if (!this.ctx) return;
    if (on) this.ctx.resume();
    this.nodes.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.35);
  }

  tick() {
    if (!this.ctx || !this.enabled) return;
    const n = this.nodes, t = this.ctx.currentTime, p = frame.p, k = 0.18;
    const set = (g, v) => g.setTargetAtTime(v, t, k);
    const air = 1 - smoothstep(30, 90, frame.altitude); // sound needs air
    const thrust = track.thrust;
    set(n.rumble.g.gain, thrust * air * 0.95 + track.glow * 0.1 * air);
    set(n.roar.g.gain, thrust * air * 0.32);
    set(n.crackle.g.gain, thrust * air * 0.05 * (0.6 + 0.4 * Math.sin(t * 19)));
    set(n.wind.g.gain, track.dust * air * 0.14);
    n.wind.f.frequency.setTargetAtTime(300 + frame.altitude * 18, t, 0.3);
    set(n.space.g.gain, smoothstep(0.34, 0.4, p) * 0.05);
    set(n.groundPad.g.gain, band(p, -0.1, 0, 0.14, 0.2) * 0.24);
    set(n.orbitPad.g.gain, band(p, 0.355, 0.42, 0.5, 0.55) * 0.12);
    set(n.moonPad.g.gain, band(p, 0.52, 0.57, 0.615, 0.65) * 0.16);
    set(n.deepPad.g.gain, band(p, 0.63, 0.69, 0.77, 0.81) * 0.18);
    set(n.nebulaPad.g.gain, track.nebula * 0.075);
    set(n.arrivalPad.g.gain, band(p, 0.86, 0.93, 0.965, 0.99) * (0.08 + track.portal * 0.14));
    n.arrivalPad.f.frequency.setTargetAtTime(380 + track.portal * 2200, t, 0.4);
  }

  dispose() { gsap.ticker.remove(this.tick); this.ctx?.close(); this.ctx = null; }
}
export const audio = new AudioController();
