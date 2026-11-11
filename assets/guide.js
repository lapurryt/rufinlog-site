(() => {
  "use strict";

  const toastEl = document.querySelector(".toast");
  let toastTimer;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  // Screen readers hear what changed even when the change is only shown inline
  const live = document.getElementById("sr-live");
  function announce(text) {
    if (!live) return;
    live.textContent = "";
    setTimeout(() => { live.textContent = text; }, 60);
  }

  // Clipboard: the modern API fails inside some in-app browsers (Instagram), so fall back to a hidden textarea.
  // Commands wrap only between words on phones: "-e" never splits into "-" and "e"
  document.querySelectorAll(".row.cmd code").forEach((code) => {
    const parts = code.textContent.split(/( +)/);
    code.textContent = "";
    parts.forEach((part) => {
      if (/^ +$/.test(part) || part === "") { code.append(part); return; }
      const span = document.createElement("span");
      span.className = part.length > 26 ? "tok long" : "tok";
      span.textContent = part;
      code.append(span);
    });
  });

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function selectNode(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  document.querySelectorAll(".copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = [...btn.parentElement.querySelectorAll("code, .say")].find((el) => el.offsetParent !== null)
        || btn.parentElement.querySelector("code, .say");
      const ok = await copyText(code.textContent.trim());
      if (ok) {
        btn.textContent = "Скопировано";
        btn.classList.add("done");
        setTimeout(() => { btn.textContent = "Скопировать"; btn.classList.remove("done"); }, 1800);
      } else {
        selectNode(code);
        toast("Текст выделен, скопируй его вручную");
      }
    });
  });

  // Windows / Mac switch
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  function guessOS() {
    const ua = navigator.userAgent || "";
    const isPhone = /iPhone|iPad|Android/i.test(ua);
    if (!isPhone && /Macintosh|Mac OS X/i.test(ua)) return "mac";
    return "win";
  }
  function setOS(os) {
    document.body.dataset.os = os;
    document.querySelectorAll("[data-set-os]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.setOs === os));
    });
  }
  setOS(store.get("rufinlog-os") || guessOS());
  document.querySelectorAll("[data-set-os]").forEach((b) => {
    b.addEventListener("click", () => { setOS(b.dataset.setOs); store.set("rufinlog-os", b.dataset.setOs); });
  });

  // Claude Code / Codex switch: show only the chosen AI's step
  function setAI(ai) {
    document.body.dataset.ai = ai;
    document.querySelectorAll("[data-set-ai]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.setAi === ai));
    });
  }
  setAI(store.get("rufinlog-ai") || "claude");
  document.querySelectorAll("[data-set-ai]").forEach((b) => {
    b.addEventListener("click", () => { setAI(b.dataset.setAi); store.set("rufinlog-ai", b.dataset.setAi); });
  });

  // ---- chat in the app window: copy a phrase, play each dialogue when it comes into view ----
  function phraseOf(btn) {
    const msg = btn.closest(".msg.me");
    const say = (msg && !btn.classList.contains("pill") ? msg.querySelector(".bubble-btn .say") : null) || btn.querySelector(".say");
    return say;
  }
  document.querySelectorAll(".bubble-btn, .pill, .copy-msg").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const say = phraseOf(btn);
      const text = say.textContent.trim();
      const ok = await copyText(text);
      if (!ok) selectNode(say);
      const msg = btn.closest(".msg.me");
      if (msg && !btn.classList.contains("pill")) {
        const status = msg.querySelector(".status");
        const hint = status.textContent;
        status.textContent = ok ? "Скопировано" : "Выдели текст и скопируй";
        announce(ok ? `Скопировано: ${text}` : "Не вышло скопировать, выдели текст вручную");
        msg.classList.add("copied");
        clearTimeout(msg._t);
        msg._t = setTimeout(() => {
          msg.classList.remove("copied");
          if (msg.closest(".solo")) status.textContent = hint === "Скопировано" ? "Нажми, чтобы скопировать" : hint;
          else status.textContent = "";
        }, 1800);
      } else {
        toast(ok ? `Скопировано: «${text}»` : "Не вышло скопировать, выдели текст вручную");
      }
    });
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Show a whole dialogue at once (used when people tap the window: nobody has to wait for the animation)
  function finish(slide) {
    slide._skip = true;
    slide._played = true;
    slide.querySelectorAll(".msg, .sys, .sep").forEach((el) => { el.classList.remove("typing-on"); el.classList.add("in"); });
  }

  async function play(slide) {
    if (slide._played) return;
    slide._played = true;
    const pause = (ms) => (slide._skip ? Promise.resolve() : wait(ms));
    let first = true;
    for (const msg of slide.querySelectorAll(".exchange .msg")) {   // earlier history stays put
      if (slide._skip) break;
      if (msg.classList.contains("me")) {
        await pause(first ? 120 : 450);
      } else {
        await pause(220);
        if (slide._skip) break;
        msg.classList.add("typing-on");                             // "Сохраняю версию…"
        await pause(reduce ? 0 : msg.classList.contains("tool") ? 700 : 850);
        msg.classList.remove("typing-on");
      }
      msg.classList.add("in");
      first = false;
    }
    if (slide._skip) finish(slide);
    slide.querySelectorAll(".sys, .sep").forEach((el) => el.classList.add("in"));
  }

  // One dialogue per situation; labelled segments above, swipe and arrow keys on the window
  document.querySelectorAll(".phone").forEach((phone) => {
    const track = phone.querySelector(".slides");
    const items = [...track.querySelectorAll(".slide")];
    const tabs = [...phone.querySelectorAll(".cmd-tabs button")];
    const caption = phone.querySelector(".caption");

    items.forEach((slide) => slide.querySelectorAll(".exchange .msg.ai").forEach((m) => {
      const t = document.createElement("span");
      t.className = "typing working";
      t.setAttribute("aria-hidden", "true");
      t.textContent = (m.dataset.status || (m.classList.contains("tool") ? "Запускаю команду" : "Думаю")) + "…";
      m.prepend(t);
    }));

    if (reduce || !("IntersectionObserver" in window)) items.forEach(finish);

    let active = 0;
    let visible = false;
    function activate(i) {
      i = Math.max(0, Math.min(items.length - 1, i));
      active = i;
      tabs.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
      if (caption) caption.textContent = items[i].dataset.caption;
      items.forEach((s, k) => { s.inert = k !== i; });                 // only the visible dialogue is focusable
      if (visible) play(items[i]);
    }
    // A jump from "Версия" to "Метка" scrolls past the slides between them; ignore those until it lands
    let target = null;
    let landTimer;
    function goTo(i) {
      i = Math.max(0, Math.min(items.length - 1, i));
      target = i;
      clearTimeout(landTimer);
      landTimer = setTimeout(() => { target = null; }, 900);
      track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? "auto" : "smooth" });
      activate(i);
    }

    let ticking = false;
    track.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (track.scrollLeft > 4) phone._swiped = true;
        if (target !== null) {
          if (i === target) target = null;
          return;
        }
        if (i !== active) activate(i);
      });
    }, { passive: true });

    tabs.forEach((b, k) => b.addEventListener("click", () => { phone._swiped = true; goTo(k); }));
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(active + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(active - 1); }
    });
    track.addEventListener("click", () => finish(items[active]));   // tap the window: skip the animation

    activate(0);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        visible = true;
        play(items[active]).then(() => {
          // once: show that the window swipes, unless the person already moved
          if (reduce || active !== 0 || phone._swiped) return;
          setTimeout(() => {
            track.classList.add("hint");
            setTimeout(() => track.classList.remove("hint"), 1000);
          }, 700);
        });
      }, { threshold: 0.4 });
      io.observe(phone);
    } else {
      visible = true;
    }
  });

  // Glow runs only while the club card is on screen (saves battery on phones)
  const glow = document.querySelector(".glow");
  if (glow && "IntersectionObserver" in window) {
    new IntersectionObserver((es) => es.forEach((e) => glow.classList.toggle("on", e.isIntersecting)))
      .observe(glow);
  } else if (glow) {
    glow.classList.add("on");
  }

  // Club card: the lesson sketch draws itself when it scrolls into view
  document.querySelectorAll(".sketch").forEach((sk) => {
    if (reduce || !("IntersectionObserver" in window)) { sk.classList.add("play"); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { sk.classList.add("play"); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(sk);
  });

  // Sections fade up once as they scroll in (Apple product-page rhythm)
  const reveals = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("seen"));
  } else {
    const rio = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("seen"); rio.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach((el) => rio.observe(el));
  }

  // Safari 26 takes the status-bar tint from the sticky nav at the top edge and does not re-read it when
  // the phone switches light/dark while the page is open. Hiding the nav for one frame makes it re-tint.
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  const retint = () => {
    const bg = scheme.matches ? "#000000" : "#F5F5F7";
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute("content", bg); });
    const nav = document.querySelector(".nav");
    if (!nav) return;
    nav.style.display = "none";
    void nav.offsetHeight;
    setTimeout(() => { nav.style.display = ""; }, 60);
    window.__retints = (window.__retints || 0) + 1;
  };
  // the change event does not always arrive, so also compare on return to the tab and every 1.5 s
  let lastDark = scheme.matches;
  const checkScheme = () => {
    if (scheme.matches === lastDark) return;
    lastDark = scheme.matches;
    retint();
  };
  if (scheme.addEventListener) scheme.addEventListener("change", checkScheme);
  document.addEventListener("visibilitychange", checkScheme);
  window.addEventListener("focus", checkScheme);
  window.addEventListener("pageshow", checkScheme);
  setInterval(checkScheme, 1500);

  // "Open on computer": share sheet on phones, copy the link elsewhere
  const shareBtn = document.querySelector("[data-share]");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const url = location.href.split("#")[0];
      if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        try { await navigator.share({ title: document.title, url }); return; } catch (e) { /* cancelled */ }
      }
      const ok = await copyText(url);
      toast(ok ? "Ссылка скопирована. Отправь её себе в Telegram «Избранное»" : url);
    });
  }
})();
