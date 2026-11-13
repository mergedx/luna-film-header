/* The film itself: a Vimeo player when a link is set (Vimeo brings its own play button and
   controls), otherwise the local preview file with the browser's own controls. Both report the
   same events: ready, play, pause, ended, time, seeked, blocked and failure. */
(function (ns) {
  "use strict";
  const { loadScript, safeUrl } = ns.util;

  const VIMEO_SDK = "https://player.vimeo.com/api/player.js";
  const ACCENT = "7a2ff2"; // Vimeo's play button and progress bar in Luna's purple
  const MAX_GLIDE = 0.6; // seconds the clock may run on between the player's own time reports
  const READY_WAIT = 15000; // ms to wait for Vimeo before saying something is wrong
  const SEEK_SETTLE = 2000; // ms to ignore stale time reports after asking for a jump
  const NOT_A_VIDEO = ["showcase", "album"]; // numbers after these name a collection, not a video

  /**
   * Reads a Vimeo link: "https://vimeo.com/123", "https://vimeo.com/123/abcdef1234" (unlisted),
   * "https://player.vimeo.com/video/123?h=abcdef1234", ".../showcase/9/video/123" or just "123".
   * @param {unknown} value @returns {{ id: string, hash: string } | null}
   */
  function parseVimeo(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) return { id: text, hash: "" };
    try {
      const url = new URL(text);
      if (!/(^|\.)vimeo\.com$/i.test(url.hostname)) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      const isNumber = (p) => /^\d+$/.test(p || "");
      const marker = parts.findIndex((p) => p === "video" || p === "videos");
      let at = marker >= 0 && isNumber(parts[marker + 1]) ? marker + 1 : -1;
      if (at < 0) at = parts.findIndex((p, i) => isNumber(p) && !NOT_A_VIDEO.includes(parts[i - 1]));
      if (at < 0) return null;
      const next = parts[at + 1] || "";
      const hash = url.searchParams.get("h") || (/^[0-9a-f]{8,}$/i.test(next) ? next : "");
      return { id: parts[at], hash };
    } catch (e) {
      return null;
    }
  }

  class Source extends EventTarget {
    constructor() {
      super();
      this.duration = 0;
      this.playing = false;
      this.done = false;
      this.lastTime = 0;
      this.stamp = 0;
      this.target = null; // a jump we asked for that the player hasn't confirmed yet
      this.aimedAt = 0;
    }

    emit(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { detail }));
    }

    /** The current time, gliding smoothly between the player's own reports (about four a second). */
    get time() {
      if (!this.playing) return this.lastTime;
      const glide = Math.min(MAX_GLIDE, (performance.now() - this.stamp) / 1000);
      const t = this.lastTime + glide;
      return this.duration ? Math.min(t, this.duration) : t;
    }

    report(seconds) {
      if (!Number.isFinite(seconds)) return false;
      this.lastTime = seconds;
      this.stamp = performance.now();
      return true;
    }

    /** A time report from the player while the film runs. Reports sent before a jump we asked for landed are stale. */
    tick(seconds) {
      if (this.target !== null) {
        const landed = Math.abs(seconds - this.target) < 1 || performance.now() - this.aimedAt > SEEK_SETTLE;
        if (!landed) return;
        this.target = null;
      }
      if (this.report(seconds)) this.emit("time", seconds);
    }

    jumped(seconds) {
      this.target = null;
      if (this.report(seconds)) this.emit("seeked", seconds);
    }

    /** Remembers a jump we asked for, so stale time reports can't pull the panel back. */
    aim(t) {
      this.target = t;
      this.aimedAt = performance.now();
      this.report(t);
    }

    started() {
      this.done = false;
      this.playing = true;
      this.stamp = performance.now();
      this.emit("play");
    }

    stopped() {
      if (this.done) return; // the end of the film already reported itself
      this.playing = false;
      this.emit("pause");
    }

    finished() {
      this.report(this.duration);
      this.playing = false;
      this.done = true;
      this.emit("ended");
    }

    /** A play or jump the player turned down. */
    refused(error) {
      const name = error ? error.name : "";
      if (name === "NotAllowedError") this.emit("blocked");
      else if (name === "PasswordError" || name === "PrivacyError") this.emit("failure", "This Vimeo video is private or needs a password, so it can't play here. Check its privacy settings.");
    }
  }

  class VideoSource extends Source {
    constructor(card, src, startAt) {
      super();
      const v = document.createElement("video");
      v.controls = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.src = src;
      v.setAttribute("aria-label", "The Luna film");
      card.prepend(v);
      this.video = v;
      v.addEventListener("loadedmetadata", () => {
        this.duration = v.duration || 0;
        if (startAt > 0 && startAt < this.duration - 1) v.currentTime = startAt;
        this.emit("ready", { width: v.videoWidth, height: v.videoHeight, duration: this.duration });
      });
      v.addEventListener("play", () => {
        this.report(v.currentTime);
        this.started();
      });
      v.addEventListener("pause", () => {
        this.report(v.currentTime);
        if (!v.ended) this.stopped();
      });
      v.addEventListener("timeupdate", () => this.tick(v.currentTime));
      v.addEventListener("seeked", () => this.jumped(v.currentTime));
      v.addEventListener("ended", () => this.finished());
      v.addEventListener("error", () => this.emit("failure", "The preview file couldn't play. Check the preview line in config.js."));
    }

    /** The video element knows its own time exactly, so there is nothing to glide. */
    get time() {
      return this.video.currentTime || 0;
    }

    playFrom(t) {
      this.video.currentTime = t;
      this.aim(t);
      this.video.play().catch((error) => this.refused(error));
    }

    pause() {
      this.video.pause();
    }
  }

  class VimeoSource extends Source {
    constructor(card, video, options) {
      super();
      this.player = null;
      this.ready = false;
      this.frame = VimeoSource.frame(video, options);
      card.prepend(this.frame);
      // A private or blocked video shows Vimeo's own notice in the frame and never reports ready.
      this.waitTimer = setTimeout(() => {
        if (!this.ready) this.emit("failure", "Vimeo isn't answering. Check the link in config.js and the video's privacy settings.");
      }, READY_WAIT);
      loadScript(VIMEO_SDK)
        .then(() => this.connect())
        .catch(() => this.emit("failure", "Vimeo's player didn't load. Check the connection, then reload the page."));
    }

    static frame({ id, hash }, { quality, startAt }) {
      const params = new URLSearchParams({ color: ACCENT, title: "0", byline: "0", portrait: "0", dnt: "1", playsinline: "1" });
      if (hash) params.set("h", hash);
      if (quality) params.set("quality", quality);
      const frame = document.createElement("iframe");
      const start = startAt > 0 ? `#t=${Math.floor(startAt)}s` : "";
      frame.src = `https://player.vimeo.com/video/${encodeURIComponent(id)}?${params}${start}`;
      frame.title = "The Luna film";
      frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
      frame.allowFullscreen = true;
      return frame;
    }

    connect() {
      const Vimeo = window.Vimeo;
      if (!Vimeo || !Vimeo.Player) throw new Error("Vimeo's player script is missing");
      const p = new Vimeo.Player(this.frame);
      this.player = p;
      const seconds = (data) => (data ? data.seconds : NaN);
      p.on("play", (data) => {
        this.report(seconds(data));
        this.started();
      });
      p.on("pause", (data) => {
        this.report(seconds(data));
        this.stopped();
      });
      p.on("timeupdate", (data) => this.tick(seconds(data)));
      p.on("seeked", (data) => this.jumped(seconds(data)));
      p.on("ended", () => this.finished());
      p.on("error", (data) => {
        if (data && data.method) return; // a refused play or jump: its own promise handles it (refused)
        this.emit("failure", "Vimeo couldn't play the film. Check the link in config.js, and that the video may be embedded on this site.");
      });
      return Promise.all([p.getDuration(), p.getVideoWidth(), p.getVideoHeight()])
        .then(([duration, width, height]) => {
          this.ready = true;
          clearTimeout(this.waitTimer);
          this.duration = duration;
          this.emit("ready", { width, height, duration });
        })
        .catch(() => this.emit("failure", "Vimeo couldn't open the film. Check the link in config.js and the video's privacy settings."));
    }

    playFrom(t) {
      this.aim(t);
      const p = this.player;
      if (!p) return;
      p.setCurrentTime(t)
        .then(() => p.play())
        .catch((error) => this.refused(error));
    }

    pause() {
      if (this.player) this.player.pause().catch(() => {});
    }
  }

  /** True on this computer (localhost or a file), where the local preview film exists. */
  function isLocal() {
    const host = window.location.hostname;
    return window.location.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]", ""].includes(host) || host.endsWith(".localhost");
  }

  /** @returns {VimeoSource | VideoSource | null} null online without a Vimeo link: the page shows its setup note */
  function createSource(card, config) {
    const startAt = Math.max(0, Number(config.startAt) || 0);
    const video = parseVimeo(config.vimeo);
    if (video) return new VimeoSource(card, video, { quality: String(config.quality || ""), startAt });
    const preview = isLocal() ? safeUrl(config.preview || "") : "";
    return preview ? new VideoSource(card, preview, startAt) : null;
  }

  ns.createSource = createSource;
  ns.parseVimeo = parseVimeo;
})(window.LunaFilm);
