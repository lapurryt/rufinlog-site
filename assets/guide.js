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

  // ---- iMessage thread: tap a bubble to copy, play each exchange when it scrolls in ----
  document.querySelectorAll(".bubble-btn, .pill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.querySelector(".say").textContent.trim();
      const ok = await copyText(text);
      if (!ok) selectNode(btn.querySelector(".say"));
      const msg = btn.closest(".msg.me");
      if (msg && !btn.classList.contains("pill")) {
        const status = msg.querySelector(".status");
        const hint = status.textContent;
        status.textContent = ok ? "Скопировано" : "Выдели текст и скопируй";
        msg.classList.add("copied");
        clearTimeout(msg._t);
        msg._t = setTimeout(() => {
          msg.classList.remove("copied");
          if (msg.closest(".solo")) status.textContent = hint === "Скопировано" ? "Нажми, чтобы скопировать" : hint;
          else status.textContent = "";
        }, 1600);
      } else {
        toast(ok ? `Скопировано: «${text}»` : "Не вышло скопировать, выдели текст вручную");
      }
    });
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function play(slide) {
    if (slide._played) return;
    slide._played = true;
    let first = true;
    for (const msg of slide.querySelectorAll(".msg")) {
      if (msg.classList.contains("me")) {
        await wait(first ? 120 : 420);
        msg.classList.add("in");
      } else {
        await wait(260);
        msg.classList.add("typing-on");
        await wait(reduce ? 0 : 900);
        msg.classList.remove("typing-on");
        msg.classList.add("in");
      }
      first = false;
    }
    slide.querySelectorAll(".sys, .sep").forEach((el) => el.classList.add("in"));
  }

  // Swipe carousel: one command per slide, iOS-style page dots
  document.querySelectorAll(".phone").forEach((phone) => {
    const track = phone.querySelector(".slides");
    const items = [...track.querySelectorAll(".slide")];
    const dots = [...phone.querySelectorAll(".dot")];
    const caption = phone.querySelector(".caption");
    const arrows = [...phone.querySelectorAll(".pg-arrow")];

    items.forEach((slide) => slide.querySelectorAll(".msg.ai").forEach((m) => {
      const t = document.createElement("span");
      t.className = "typing";
      t.setAttribute("aria-hidden", "true");
      t.innerHTML = "<i></i><i></i><i></i>";
      m.prepend(t);
    }));

    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((s) => { s._played = true; s.querySelectorAll(".msg, .sys, .sep").forEach((el) => el.classList.add("in")); });
    }

    let active = 0;
    let visible = false;
    function activate(i) {
      i = Math.max(0, Math.min(items.length - 1, i));
      active = i;
      dots.forEach((d, k) => d.setAttribute("aria-current", String(k === i)));
      caption.textContent = items[i].dataset.caption;
      arrows[0].disabled = i === 0;
      arrows[1].disabled = i === items.length - 1;
      if (visible) play(items[i]);
    }
    function goTo(i) {
      i = Math.max(0, Math.min(items.length - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? "auto" : "smooth" });
    }

    let ticking = false;
    track.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== active) activate(i);
      });
    }, { passive: true });

    dots.forEach((d, k) => d.addEventListener("click", () => goTo(k)));
    arrows.forEach((btn) => btn.addEventListener("click", () => goTo(active + Number(btn.dataset.dir))));
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(active + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(active - 1); }
    });

    activate(0);
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        visible = true;
        play(items[active]);
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

  // Safari tints the status bar when the page loads; if the phone switches light/dark while the page
  // is open, repaint the root background and theme-color so the tint follows the new theme
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  const retint = () => {
    const bg = scheme.matches ? "#000000" : "#F5F5F7";
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute("content", bg); });
    document.documentElement.style.backgroundColor = bg;
    requestAnimationFrame(() => { document.documentElement.style.backgroundColor = ""; });
  };
  if (scheme.addEventListener) scheme.addEventListener("change", retint);

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
