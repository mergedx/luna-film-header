/* Shared helpers for the Luna film header. */
(function (ns) {
  "use strict";

  /** @param {number} seconds @returns {string} m:ss */
  function fmt(seconds) {
    const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  }

  /** @param {number} v @param {number} lo @param {number} hi @returns {number} */
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** @param {number} e0 @param {number} e1 @param {number} x @returns {number} */
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  const reducedMotion = () => Boolean(window.matchMedia) && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Resolves a link and keeps it only if it is http(s), blob or file.
   * @param {unknown} value @returns {string} the absolute link, or "" when unsafe
   */
  function safeUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim(), window.location.href);
      return ["http:", "https:", "blob:", "file:"].includes(url.protocol) ? url.href : "";
    } catch (e) {
      return "";
    }
  }

  /**
   * Fills `el` with one masked span per word so the words can rise into place in turn.
   * @param {HTMLElement} el @param {string} text @param {number} [offset] @returns {number} words written
   */
  function riseWords(el, text, offset) {
    el.textContent = "";
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      const outer = document.createElement("span");
      const inner = document.createElement("span");
      outer.className = "w";
      inner.className = "w__in";
      inner.style.setProperty("--i", String((offset || 0) + i));
      inner.textContent = word;
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
    return words.length;
  }

  /** @param {string} src @returns {Promise<void>} */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(script);
    });
  }

  ns.util = { fmt, clamp, smoothstep, reducedMotion, safeUrl, riseWords, loadScript };
})((window.LunaFilm = window.LunaFilm || {}));
