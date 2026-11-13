/* The chapter list beside the film, and the "now playing" panel that follows it.
   Clicking a chapter asks the player to jump there; a chapter gets its check once most of it
   has actually played, and the checks are remembered on this browser. */
(function (ns) {
  "use strict";
  const { fmt, riseWords, reducedMotion, clamp, safeUrl } = ns.util;

  const SEEN_SHARE = 0.6; // a chapter counts as watched once this share of it has played
  const SWAP_MS = 200; // how long the chapter text takes to fade out before it changes
  const CHECK = '<svg class="icon ch__check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /** @typedef {{ at: number, title: string, text: string, thumb: string }} Chapter */

  /** @param {unknown} list @returns {Chapter[]} the valid chapters, in time order */
  function normalise(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((c) => c && Number.isFinite(Number(c.at)) && c.title)
      .map((c) => ({ at: Math.max(0, Number(c.at)), title: String(c.title), text: String(c.text || ""), thumb: safeUrl(c.thumb || "") }))
      .sort((a, b) => a.at - b.at);
  }

  /** @param {string} key @returns {number[]} */
  function readSeen(key) {
    try {
      const list = JSON.parse(window.localStorage.getItem(key) || "[]");
      return Array.isArray(list) ? list.filter(Number.isInteger) : [];
    } catch (e) {
      return []; // storage is blocked here (private window, or the embed's settings): start fresh
    }
  }

  /** @param {string} key @param {number[]} list */
  function writeSeen(key, list) {
    try {
      window.localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      /* storage is blocked here: the checks last for this visit only */
    }
  }

  class Chapters {
    /**
     * @param {HTMLOListElement} list
     * @param {unknown} chapters from config.js
     * @param {{ onPick: (index: number) => void, onSeen?: () => void, storageKey: string }} options
     */
    constructor(list, chapters, options) {
      this.list = list;
      this.items = normalise(chapters);
      this.limit = this.items.length; // chapters that start before the film ends
      this.duration = 0;
      this.index = -1;
      this.watched = this.items.map(() => 0);
      this.storageKey = options.storageKey;
      this.onSeen = options.onSeen || (() => {});
      this.seen = new Set(readSeen(this.storageKey).filter((i) => i >= 0 && i < this.items.length));
      this.rows = this.items.map((chapter, i) => this.row(chapter, i, options.onPick));
      list.addEventListener("keydown", (e) => this.onKey(e));
    }

    get count() {
      return this.limit;
    }

    row(chapter, i, onPick) {
      const li = document.createElement("li");
      li.style.setProperty("--i", String(i));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ch";
      button.setAttribute("aria-current", "false");

      const parts = [];
      if (chapter.thumb) {
        const img = document.createElement("img");
        img.className = "ch__thumb";
        img.src = chapter.thumb;
        img.alt = "";
        img.width = 144;
        img.height = 256;
        img.loading = "lazy";
        img.decoding = "async";
        parts.push(img);
      } else {
        const blank = document.createElement("span");
        blank.className = "ch__thumb";
        parts.push(blank);
      }

      const n = document.createElement("span");
      const num = document.createElement("span");
      n.className = "ch__n";
      num.className = "ch__num";
      num.textContent = String(i + 1).padStart(2, "0");
      n.appendChild(num);
      n.insertAdjacentHTML("beforeend", CHECK);

      const body = document.createElement("span");
      const title = document.createElement("span");
      const text = document.createElement("span");
      body.className = "ch__body";
      title.className = "ch__title";
      text.className = "ch__text";
      title.textContent = chapter.title;
      text.textContent = chapter.text;
      body.append(title, text);

      const time = document.createElement("span");
      time.className = "ch__time";
      time.textContent = fmt(chapter.at);

      button.append(...parts, n, body, time);
      button.addEventListener("click", () => onPick(i));
      li.appendChild(button);
      this.list.appendChild(li);
      this.label(button, i);
      return button;
    }

    label(button, i) {
      const chapter = this.items[i];
      const seen = this.seen.has(i) ? ", watched" : "";
      button.setAttribute("aria-label", `Chapter ${i + 1}, ${chapter.title}, at ${fmt(chapter.at)}${seen}`);
      button.classList.toggle("is-seen", this.seen.has(i));
    }

    /** Up and down arrows move between chapters; Home and End jump to the first and last. */
    onKey(e) {
      const visible = this.rows.slice(0, this.limit);
      const at = visible.indexOf(document.activeElement);
      if (at < 0) return;
      const moves = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: visible.length - 1 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      visible[clamp(moves[e.key], 0, visible.length - 1)].focus();
    }

    /** Hides chapters that start after the film ends (a typo in config.js, or a shorter cut). */
    setDuration(duration) {
      this.duration = duration;
      this.limit = duration > 0 ? this.items.filter((c) => c.at < duration - 0.5).length : this.items.length;
      this.rows.forEach((row, i) => {
        row.parentElement.hidden = i >= this.limit;
      });
    }

    at(i) {
      return i >= 0 && i < this.limit ? this.items[i] : undefined;
    }

    indexAt(t) {
      let found = -1;
      for (let i = 0; i < this.limit; i++) {
        if (t >= this.items[i].at - 0.05) found = i;
      }
      return this.limit ? Math.max(0, found) : -1;
    }

    endOf(i) {
      return i + 1 < this.limit ? this.items[i + 1].at : this.duration || this.items[i].at + 1;
    }

    seenCount() {
      let n = 0;
      this.seen.forEach((i) => {
        if (i < this.limit) n += 1;
      });
      return n;
    }

    /** Lights the chapter that is playing and fills it as it plays. */
    update(t, live) {
      const idx = live ? this.indexAt(t) : -1;
      if (idx !== this.index) {
        this.rows.forEach((row, i) => row.setAttribute("aria-current", i === idx ? "true" : "false"));
        this.index = idx;
      }
      if (idx >= 0) {
        const start = this.items[idx].at;
        const p = clamp((t - start) / Math.max(0.001, this.endOf(idx) - start), 0, 1);
        this.rows[idx].style.setProperty("--p", p.toFixed(4));
      }
      return idx;
    }

    /** Counts `dt` seconds of real playback at `t`, and checks the chapter once enough of it has played. */
    watch(t, dt) {
      const i = this.indexAt(t);
      if (i < 0 || this.seen.has(i)) return;
      this.watched[i] += dt;
      const length = this.endOf(i) - this.items[i].at;
      if (this.watched[i] >= Math.min(length * SEEN_SHARE, length - 0.5)) this.markSeen(i);
    }

    markSeen(i) {
      this.seen.add(i);
      writeSeen(this.storageKey, Array.from(this.seen).sort((a, b) => a - b));
      this.label(this.rows[i], i);
      this.onSeen();
    }
  }

  class NowTitle {
    /** @param {HTMLElement} el */
    constructor(el) {
      this.el = el;
      this.text = "";
      this.timer = 0;
    }

    /** Swaps the title: the old words leave upward, the new ones rise in. */
    set(text) {
      if (text === this.text) return;
      this.text = text;
      clearTimeout(this.timer);
      if (reducedMotion() || !this.el.textContent) {
        this.show(text);
        return;
      }
      this.el.classList.add("is-leaving");
      this.timer = setTimeout(() => this.show(text), 380);
    }

    /** Plays the rise again, for when the panel comes back into view. */
    replay(text) {
      clearTimeout(this.timer);
      this.text = text;
      this.show(text);
    }

    show(text) {
      this.el.classList.remove("is-leaving", "is-in");
      riseWords(this.el, text);
      void this.el.offsetWidth; // restart the transition from the hidden position
      this.el.classList.add("is-in");
    }
  }

  class NowPanel {
    /** @param {{ count: HTMLElement, title: HTMLElement, text: HTMLElement }} parts */
    constructor(parts) {
      this.count = parts.count;
      this.title = new NowTitle(parts.title);
      this.text = parts.text;
      this.index = -2;
      this.timer = 0;
    }

    /**
     * Shows the chapter that is playing.
     * @param {number} index @param {Chapter | undefined} chapter @param {number} total
     * @param {{ paused?: boolean, replay?: boolean }} [options]
     */
    show(index, chapter, total, options = {}) {
      const where = index >= 0 ? `Chapter ${index + 1} of ${total}` : "Now playing";
      this.count.textContent = options.paused ? where + " · Paused" : where;
      if (index === this.index && !options.replay) return;
      this.index = index;
      const title = chapter ? chapter.title : "";
      const text = chapter ? chapter.text : "";
      if (options.replay) this.title.replay(title);
      else this.title.set(title);
      this.swapText(text, Boolean(options.replay));
    }

    swapText(text, instant) {
      clearTimeout(this.timer);
      if (instant || reducedMotion() || !this.text.textContent) {
        this.text.textContent = text;
        this.text.classList.remove("is-swapping");
        return;
      }
      this.text.classList.add("is-swapping");
      this.timer = setTimeout(() => {
        this.text.textContent = text;
        this.text.classList.remove("is-swapping");
      }, SWAP_MS);
    }
  }

  ns.Chapters = Chapters;
  ns.NowPanel = NowPanel;
})(window.LunaFilm);
