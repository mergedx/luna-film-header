/* Wires the Luna film header together: the film (Vimeo, or the local preview), the layout,
   the story beside the film, the chapters and the voice line. Vimeo draws the play button and
   every playback control; this page frames the film and follows it. */
(function (ns) {
  "use strict";
  const { util, createSource, parseVimeo, Chapters, NowPanel, ListenLine } = ns;
  const { fmt, clamp, safeUrl, riseWords, loadScript, reducedMotion } = util;

  const PANEL_FOR = { loading: "intro", idle: "intro", playing: "now", paused: "now", ended: "end", empty: "empty", error: "error" };
  const READY = ["idle", "playing", "paused", "ended"]; // states with a film that can play
  const MIN_STORY = 260; // px the story column needs beside the film (matches header.css)
  const MIN_RAIL = 300; // px the chapter list needs
  const ROW = { min: 28, max: 92, thumbs: 54, text: 66 }; // chapter row heights, px
  const LIST_CHROME = 14; // px around the chapter list: the head's margin and the list's padding
  const QUIET_AFTER = 700; // ms the speaker's name stays after they stop talking
  const TOAST_MS = 2800;

  const $ = (selector) => document.querySelector(selector);

  /** config.js, overridden by the address: ?vimeo= (another Vimeo link) and ?t= (start at a second). */
  function readConfig() {
    const raw = window.LUNA_FILM_CONFIG || {};
    const params = new URLSearchParams(window.location.search);
    const end = raw.end || {};
    return {
      ...raw,
      vimeo: params.get("vimeo") || raw.vimeo || "",
      brand: { name: "Luna", by: "by MergedX", ...(raw.brand || {}) },
      title: { lead: "Meet", keyword: "Luna.", ...(raw.title || {}) },
      end: { title: "That's Luna.", body: "", ...end, cta: { label: "", href: "", ...(end.cta || {}) } },
      chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
      speakers: raw.speakers && typeof raw.speakers === "object" ? raw.speakers : {},
      startAt: Math.max(0, Number(params.get("t")) || 0),
    };
  }

  function parseAspect(value) {
    const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/.exec(String(value || ""));
    return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : 0;
  }

  const cfg = readConfig();
  const vimeo = parseVimeo(cfg.vimeo);
  const filmName = [cfg.title.lead, cfg.title.keyword].filter(Boolean).join(" ").replace(/[.!]$/, "") || "Luna";
  const inFrame = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();
  // When the page around this one blocks full screen, Vimeo's own button can't work either.
  const offerStandalone = inFrame && !(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  const el = {
    stage: $("#stage"),
    card: $("[data-card]"),
    toast: $("[data-toast]"),
    note: $("[data-note]"),
    rail: $(".chapters"),
    railHead: $(".chapters__head"),
    meta: $("[data-chapters-meta]"),
    standalone: $("[data-standalone]"),
    who: $("[data-listen-who]"),
    whoName: $("[data-listen-name]"),
    endSeen: $("[data-end-seen]"),
    errorDetail: $("[data-error-detail]"),
  };
  const panels = Array.from(document.querySelectorAll("[data-panel]"));

  const filmKey = (vimeo ? "vimeo:" + vimeo.id : "file:" + (cfg.preview || "")) + "@" + cfg.chapters.map((c) => c && c.at).join(",");
  const chapters = new Chapters($("[data-chapter-list]"), cfg.chapters, { onPick: playChapter, onSeen: updateCounts, storageKey: "luna-film:seen:" + filmKey });
  const now = new NowPanel({ count: $("[data-now-count]"), title: $("[data-now-title]"), text: $("[data-now-text]") });
  const listen = new ListenLine($("[data-listen-line]"));
  const source = createSource(el.card, cfg);

  let state = "loading";
  let panelName = "";
  let aspect = parseAspect(cfg.aspect) || 9 / 16;
  let duration = 0;
  let lastTime = null;
  let rafId = 0;
  let visible = true;
  let toastTimer = 0;
  let speaker = "";
  let spokeAt = 0;

  // ---------- Text and texture ----------

  function makeGrain() {
    const size = 180;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 110 + Math.random() * 145;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    el.stage.style.setProperty("--grain", `url(${canvas.toDataURL("image/png")})`);
  }

  /** The lead words, then the keyword on the accent block, all rising in turn. */
  function buildTitle(target, lead, keyword) {
    const count = riseWords(target, lead);
    if (!keyword) return;
    if (count) target.appendChild(document.createTextNode(" "));
    const outer = document.createElement("span");
    const inner = document.createElement("span");
    outer.className = "w";
    inner.className = "w__in title__key";
    inner.style.setProperty("--i", String(count));
    inner.textContent = keyword;
    outer.appendChild(inner);
    target.appendChild(outer);
  }

  function fillText() {
    $("[data-brand-name]").textContent = cfg.brand.name;
    $("[data-brand-by]").textContent = cfg.brand.by;
    $("[data-kicker]").textContent = cfg.kicker || "";
    $("[data-subtitle]").textContent = cfg.subtitle || "";
    $("[data-end-body]").textContent = cfg.end.body || "";
    buildTitle($("[data-title]"), cfg.title.lead, cfg.title.keyword);
    buildTitle($("[data-empty-title]"), "Your film goes", "here.");
    riseWords($("[data-end-title]"), cfg.end.title);
    riseWords($("[data-error-title]"), "The film can't play here.");
    const href = safeUrl(cfg.end.cta.href);
    const cta = $("[data-end-cta]");
    if (href && cfg.end.cta.label) {
      cta.href = href;
      $("[data-end-cta-label]").textContent = cfg.end.cta.label;
      cta.hidden = false;
    }
    if (source && !vimeo) {
      el.note.textContent = "Preview: the film is playing from this computer. Paste the Vimeo link into config.js before you share the header.";
      el.note.hidden = false;
    }
    if (!chapters.count) el.rail.hidden = true;
    el.who.classList.add("is-quiet");
    document.title = filmName;
  }

  function setFact(name, text) {
    const item = $(`[data-fact="${name}"]`);
    if (!item) return;
    item.querySelector("span").textContent = text;
    item.hidden = !text;
  }

  function setFacts(meta) {
    const parts = [meta.duration ? fmt(meta.duration) : "", chapters.count ? `${chapters.count} chapters` : ""];
    setFact("length", parts.filter(Boolean).join(" · "));
    const short = Math.min(meta.width || 0, meta.height || 0);
    setFact("quality", short >= 2160 ? "4K" : short >= 1080 ? "HD" : "");
  }

  /** The film's loudness and who speaks when, for the voice line. Without them the line stays flat. */
  function loadVoiceData() {
    const load = (src) => (safeUrl(src || "") ? loadScript(safeUrl(src)).catch(() => {}) : Promise.resolve());
    Promise.all([load(cfg.envelope), load(cfg.voices)]).then(() => {
      listen.setData(window.LUNA_FILM_ENVELOPE, window.LUNA_FILM_VOICES);
    });
  }

  // ---------- Layout ----------

  /** Sizes the film to the embed and picks a layout: triad, duo, or the film alone (solo). */
  function layout() {
    const style = getComputedStyle(el.stage);
    const padX = parseFloat(style.paddingLeft) || 24;
    const padY = parseFloat(style.paddingTop) || 24;
    const gap = parseFloat(style.columnGap) || 32;
    const innerW = Math.max(1, el.stage.clientWidth - padX * 2);
    const innerH = Math.max(160, el.stage.clientHeight - padY * 2);
    let cardH = innerH;
    let cardW = cardH * aspect;
    const side = innerW - cardW;
    let mode = "solo";
    if (chapters.count && side >= MIN_STORY + MIN_RAIL + gap * 2) mode = "triad";
    else if (side >= MIN_STORY + gap) mode = "duo";
    if (mode === "solo" && cardW > innerW) {
      cardW = innerW;
      cardH = cardW / aspect;
    }
    el.stage.dataset.layout = mode;
    el.stage.style.setProperty("--card-w", Math.round(cardW) + "px");
    el.stage.style.setProperty("--card-h", Math.round(cardH) + "px");
    el.stage.style.setProperty("--card-r", Math.round(clamp(Math.min(cardW, cardH) * 0.075, 14, 32)) + "px");
    sizeRows(mode);
  }

  /** Shares the chapter column's height between the chapters, with frames when the rows are tall enough. */
  function sizeRows(mode) {
    const count = chapters.count;
    if (mode === "solo" || !count) return;
    const room = el.rail.clientHeight - el.railHead.offsetHeight - LIST_CHROME;
    const rowH = Math.floor(clamp((room - (count - 1) * 2) / count, ROW.min, ROW.max));
    const thumbs = mode === "triad" && rowH >= ROW.thumbs;
    el.stage.style.setProperty("--row-h", rowH + "px");
    el.stage.dataset.thumbs = String(thumbs);
    el.stage.dataset.roomy = String(thumbs && rowH >= ROW.text);
  }

  // ---------- States ----------

  function render(next) {
    state = next;
    el.stage.dataset.state = next;
    const panel = PANEL_FOR[next] || "intro";
    if (panel !== panelName) {
      panelName = panel;
      panels.forEach((p) => p.classList.toggle("is-active", p.dataset.panel === panel));
      if (panel === "now") {
        const idx = chapters.indexAt(source.time);
        now.show(idx, chapters.at(idx), chapters.count, { paused: next === "paused", replay: true });
      }
      if (panel === "end") updateEnd();
    }
    el.standalone.hidden = !(offerStandalone && READY.includes(next));
    if (next === "playing") startLoop();
    else {
      stopLoop();
      tick();
    }
  }

  function startLoop() {
    if (!rafId && visible) rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function loop() {
    tick();
    rafId = requestAnimationFrame(loop);
  }

  /** Brings the chapters, the panel and the voice line up to the film's current moment. */
  function tick() {
    if (!source) return;
    const t = source.time;
    const live = state === "playing" || state === "paused";
    const idx = chapters.update(t, live);
    if (!live) return;
    now.show(idx, chapters.at(idx), chapters.count, { paused: state === "paused" });
    const still = reducedMotion() && idx >= 0 ? [chapters.at(idx).at, chapters.endOf(idx)] : null;
    listen.draw(t, { paused: state !== "playing", range: still });
    showSpeaker(listen.whoAt(t), listen.levelAt(t));
  }

  /** Names whoever is talking. Between lines the name lingers a moment, then fades. */
  function showSpeaker(who, level) {
    const at = performance.now();
    if (who) {
      spokeAt = at;
      if (who !== speaker) {
        speaker = who;
        el.who.dataset.who = who;
        el.whoName.textContent = typeof cfg.speakers[who] === "string" ? cfg.speakers[who] : who.charAt(0).toUpperCase() + who.slice(1);
      }
      el.who.classList.remove("is-quiet");
    } else if (state !== "playing" || at - spokeAt > QUIET_AFTER) {
      el.who.classList.add("is-quiet");
    }
    el.who.style.setProperty("--level", (1 + (who ? level : 0) * 0.8).toFixed(3));
  }

  function updateCounts() {
    const seen = chapters.seenCount();
    el.meta.textContent = seen ? `${seen} of ${chapters.count} watched` : duration ? fmt(duration) : "";
  }

  function updateEnd() {
    const seen = chapters.seenCount();
    const total = chapters.count;
    el.endSeen.hidden = !total || seen >= total;
    el.endSeen.textContent = seen ? `You've watched ${seen} of ${total} chapters. Pick any chapter to see it.` : "Pick any chapter to see it again.";
  }

  // ---------- Chapters and the standalone page ----------

  function playChapter(i) {
    const chapter = chapters.at(i);
    if (!chapter || !source || !READY.includes(state)) return;
    source.playFrom(chapter.at);
    lastTime = chapter.at;
    tick();
  }

  function notify(text) {
    el.toast.textContent = ""; // emptied first, so a screen reader announces the same message again
    requestAnimationFrame(() => {
      el.toast.textContent = text;
      el.toast.classList.add("is-on");
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("is-on"), TOAST_MS);
  }

  /** Opens this page on its own, at the same moment, where full screen works. */
  function prepareStandalone() {
    const url = new URL(window.location.href);
    const t = source ? Math.floor(source.time) : 0;
    if (t > 0 && state !== "ended") url.searchParams.set("t", String(t));
    else url.searchParams.delete("t");
    el.standalone.href = url.href;
    if (source && state === "playing") source.pause();
  }

  // ---------- Wiring ----------

  function bindSource() {
    source.addEventListener("ready", (e) => {
      const meta = e.detail;
      if (meta.width && meta.height) aspect = meta.width / meta.height;
      duration = meta.duration || 0;
      chapters.setDuration(duration);
      setFacts(meta);
      layout();
      updateCounts();
      // From "error" too: a slow Vimeo can answer after the page has given up waiting.
      if (state === "loading" || state === "error") render("idle");
    });
    source.addEventListener("play", () => {
      lastTime = source.time;
      render("playing");
    });
    source.addEventListener("pause", () => render("paused"));
    source.addEventListener("ended", () => render("ended"));
    source.addEventListener("time", (e) => {
      const t = e.detail;
      if (state === "playing" && lastTime !== null) {
        const dt = t - lastTime;
        if (dt > 0 && dt < 1.5) chapters.watch(lastTime, dt); // only real playback, not jumps
      }
      lastTime = t;
      if (!rafId) tick(); // keeps the panel current while the loop is off (paused, or scrolled away)
    });
    source.addEventListener("seeked", (e) => {
      lastTime = e.detail;
      // Vimeo rewinds by itself once the film ends, so the end panel stays until the film plays again.
      if (state === "ended") return;
      tick();
    });
    source.addEventListener("blocked", () => notify("Press play on the film to start from here"));
    source.addEventListener("failure", (e) => {
      el.errorDetail.textContent = e.detail;
      render("error");
    });
  }

  function bindPage() {
    el.stage.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const action = target && target.closest("[data-action]");
      if (action && action.dataset.action === "reload") window.location.reload();
    });
    el.standalone.addEventListener("click", prepareStandalone);
    new ResizeObserver(layout).observe(el.stage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible && state === "playing") startLoop();
        else stopLoop();
      },
      { threshold: 0.05 }
    ).observe(el.stage);
  }

  function init() {
    makeGrain();
    fillText();
    layout();
    bindPage();
    if (!source) {
      render("empty");
      return;
    }
    bindSource();
    loadVoiceData();
    render("loading");
  }

  init();
})(window.LunaFilm);
