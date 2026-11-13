/* Luna's voice line beside the film: a few seconds of the film's sound, drawn as bars that flow
   past while it plays. Luna's voice is purple, everyone else's ink, music grey, and what hasn't
   played yet waits in light grey. It only shows the sound: Vimeo's own bar does the seeking. */
(function (ns) {
  "use strict";
  const { clamp } = ns.util;

  const RATE = 10; // loudness values per second in envelope.js
  const SPAN = 7; // seconds on the line at once
  const NOW_AT = 0.7; // where "now" sits along the line
  const EDGE = 0.1; // share of the width over which each end fades out
  const STILL_PITCH = 5; // px per bar when the line holds still (reduced motion)

  function cssColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  /** Spreads the loudness over 0 to 1 so quiet speech still shows: the square root, against the 98th percentile. */
  function normalise(values) {
    const clean = values.map((v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0));
    const sorted = clean.slice().sort((a, b) => a - b);
    const top = sorted[Math.floor((sorted.length - 1) * 0.98)] || 1;
    return clean.map((v) => Math.sqrt(clamp(v / top, 0, 1)));
  }

  /** @param {unknown} list @returns {{ s: number, e: number, who: string }[]} */
  function readVoices(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((v) => v && Number.isFinite(Number(v.s)) && Number.isFinite(Number(v.e)) && Number(v.e) > Number(v.s))
      .map((v) => ({ s: Number(v.s), e: Number(v.e), who: String(v.who || "") }))
      .sort((a, b) => a.s - b.s);
  }

  class ListenLine {
    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.levels = [];
      this.voices = [];
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.last = null;
      this.colors = {
        luna: cssColor("--accent", "#7a2ff2"),
        voice: cssColor("--ink", "#151414"),
        music: "#a9adb4",
        rest: cssColor("--rest", "#cfd1d6"),
      };
      new ResizeObserver(() => this.resize()).observe(canvas);
    }

    setData(envelope, voices) {
      this.levels = Array.isArray(envelope) && envelope.length ? normalise(envelope) : [];
      this.voices = readVoices(voices);
      this.redraw();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = rect.width;
      this.height = rect.height;
      this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
      this.redraw();
    }

    redraw() {
      if (this.last) this.draw(this.last.t, this.last.options);
    }

    /** Who is speaking at `t` ("luna", "owner" and so on), or "" between lines. */
    whoAt(t) {
      let lo = 0;
      let hi = this.voices.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.voices[mid].s <= t) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      for (let i = found; i >= 0 && i >= found - 1; i--) {
        if (t < this.voices[i].e) return this.voices[i].who;
      }
      return "";
    }

    /** The loudness at `t`, from 0 to 1. */
    levelAt(t) {
      const i = Math.floor(t * RATE);
      return i >= 0 && i < this.levels.length ? this.levels[i] : 0;
    }

    maxBetween(a, b) {
      let top = 0;
      const last = Math.min(this.levels.length - 1, Math.ceil(b * RATE));
      for (let i = Math.max(0, Math.floor(a * RATE)); i <= last; i++) top = Math.max(top, this.levels[i]);
      return top;
    }

    colorFor(at, t) {
      if (at > t) return this.colors.rest;
      const who = this.whoAt(at);
      if (who === "luna") return this.colors.luna;
      return who ? this.colors.voice : this.colors.music;
    }

    /**
     * Draws the line with `t` as now. It flows, with now at NOW_AT; with `range` (for reduced
     * motion) it holds still and shows that stretch of the film instead.
     * @param {number} t @param {{ paused?: boolean, range?: [number, number] | null }} [options]
     */
    draw(t, options = {}) {
      this.last = { t, options };
      const { ctx, width: w, height: h, dpr } = this;
      if (!w || !h || !ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const bars = options.range ? this.stillBars(options.range, w) : this.flowBars(t, w);
      const dim = options.paused ? 0.55 : 1;
      bars.forEach((bar) => {
        const played = bar.at <= t;
        const edge = options.range ? 1 : clamp(Math.min(bar.x, w - bar.x) / (w * EDGE), 0, 1);
        ctx.globalAlpha = edge * (played ? dim : 0.9);
        ctx.fillStyle = this.colorFor(bar.at, t);
        const half = Math.max(bar.w / 2, (h / 2 - 2) * bar.level);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bar.x - bar.w / 2, h / 2 - half, bar.w, half * 2, bar.w / 2);
        else ctx.rect(bar.x - bar.w / 2, h / 2 - half, bar.w, half * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    /** One bar per loudness value, sliding left as the film plays. */
    flowBars(t, w) {
      const from = t - SPAN * NOW_AT;
      const perSecond = w / SPAN;
      const barW = Math.max(2, (perSecond / RATE) * 0.5);
      const bars = [];
      const last = Math.ceil((from + SPAN) * RATE) + 1;
      for (let i = Math.floor(from * RATE) - 1; i <= last; i++) {
        const at = i / RATE;
        const x = (at - from) * perSecond;
        if (x < -barW || x > w + barW) continue;
        bars.push({ at, x, w: barW, level: this.levelAt(at) });
      }
      return bars;
    }

    /** A still picture of one stretch (the chapter that is playing), each bar the loudest moment in its slot. */
    stillBars([a, b], w) {
      const count = Math.max(1, Math.floor(w / STILL_PITCH));
      const slot = (b - a) / count;
      const bars = [];
      for (let j = 0; j < count; j++) {
        const at = a + (j + 0.5) * slot;
        bars.push({ at, x: (j + 0.5) * STILL_PITCH * (w / (count * STILL_PITCH)), w: 2.5, level: this.maxBetween(at - slot / 2, at + slot / 2) });
      }
      return bars;
    }
  }

  ns.ListenLine = ListenLine;
})(window.LunaFilm);
