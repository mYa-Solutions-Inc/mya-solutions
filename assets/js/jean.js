/* ═══════════════════════════════════════════════════════════════════════
   FILE / ROOT:  assets/js/jean.js  (mYa Solutions website)
   DESCRIPTION:  Jean, embedded in the site. She answers from this website
                 only, can see which page and which sections the visitor has
                 on screen, lights up the part that answers, and — only when
                 the visitor says yes — takes them there or drafts an email.

                 • Ask bars: any element with [data-jean-ask] becomes one.
                     data-jean-style="glass" (inside a window) | "page"
                     data-jean-suggest="Question one|Question two"
                 • Everywhere else: the "Ask Jean" button opens a panel.
                 • Answers come from window.JEAN_ENDPOINT (services/jean-site).
                   With no endpoint, or if it can't be reached, she falls back
                   to searching assets/jean/site-index.json in the browser and
                   says so — she never pretends to have answered.
                 • Memory: the last few turns live in this tab only
                   (sessionStorage). Nothing is sent anywhere else.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__jeanLoaded) return; window.__jeanLoaded = true;

  var ENDPOINT = String(window.JEAN_ENDPOINT || "").replace(/\/+$/, "");
  var ROOT = window.MYA_ROOT || new URL("/", location.href).href;
  var PAGE = (location.href.replace(ROOT, "").split("#")[0].split("?")[0]) || "index.html";
  if (/\/$/.test(PAGE)) PAGE += "index.html";
  var TITLE = document.title.split(/ [|—] /)[0].trim();
  var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EMAILS = ["contactus@myasolutions.org", "ir@myasolutions.org", "careers@myasolutions.org", "arudolph@myasolutions.org"];
  var DEFAULT_SUGGEST = ["What does mYa Solutions build?", "When does JeanOS launch?", "How do I talk to a person?"];

  function url(p) { return new URL(p, ROOT).href; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function safePath(p) { return typeof p === "string" && /^[a-z0-9][a-z0-9\-\/]*\.html$/i.test(p) && p.indexOf("..") < 0; }
  function safeId(i) { return typeof i === "string" && /^[A-Za-z0-9][A-Za-z0-9\-_]*$/.test(i); }

  /* ── What the visitor can see right now ───────────────────────────── */
  var visible = new Set();
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); });
    }, { threshold: 0.25 });
    document.querySelectorAll("main section[id], main article[id], section.next-window[id]").forEach(function (s) { io.observe(s); });
  }

  /* ── Conversation memory: this tab only ───────────────────────────── */
  function getHistory() { try { return JSON.parse(sessionStorage.getItem("jean-history") || "[]"); } catch (e) { return []; } }
  function remember(role, text) {
    var h = getHistory(); h.push({ role: role, text: String(text).slice(0, 1000) }); h = h.slice(-6);
    try { sessionStorage.setItem("jean-history", JSON.stringify(h)); } catch (e) {}
  }

  /* ── Showing: light up the answer, let the rest step back ─────────── */
  var focusTimer = null;
  function highlight(id) {
    var t = document.getElementById(id);
    if (!t) return false;
    document.querySelectorAll(".jean-focus").forEach(function (n) { n.classList.remove("jean-focus"); });
    document.querySelectorAll(".jean-dim").forEach(function (n) { n.classList.remove("jean-dim"); });
    t.classList.add("jean-focus");
    if (t.classList.contains("story") && t.parentNode) {
      Array.prototype.forEach.call(t.parentNode.children, function (s) { if (s !== t) s.classList.add("jean-dim"); });
    }
    var top = t.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: REDUCED ? "auto" : "smooth" });
    if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
    t.focus({ preventScroll: true });
    clearTimeout(focusTimer);
    focusTimer = setTimeout(function () {
      t.classList.remove("jean-focus");
      document.querySelectorAll(".jean-dim").forEach(function (n) { n.classList.remove("jean-dim"); });
    }, 6500);
    return true;
  }
  function goTo(path, id) {
    if (!safePath(path)) return;
    if (path === PAGE) { if (!highlight(id)) location.hash = id; return; }
    location.href = url(path) + (safeId(id) ? "?jean=" + encodeURIComponent(id) + "#" + id : "");
  }
  // Arriving from another page's "Show me"
  (function () {
    var m = /[?&]jean=([^&#]+)/.exec(location.search);
    if (!m) return;
    var id = decodeURIComponent(m[1]);
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
    if (safeId(id)) setTimeout(function () { highlight(id); }, 450);
  })();

  /* ── Search-only fallback: the site index, in the browser ─────────── */
  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) indexPromise = fetch(url("assets/jean/site-index.json"), { cache: "force-cache" }).then(function (r) { if (!r.ok) throw new Error("index"); return r.json(); });
    return indexPromise;
  }
  var STOP = "a an and are as at be but by can do does for from how i if in is it its me my of on or our so that the their them this to us was we what when where which who why will with you your about tell much many".split(" ");
  function terms(s) { return String(s).toLowerCase().replace(/[^a-z0-9$%.\s-]/g, " ").split(/\s+/).filter(function (w) { return w.length > 1 && STOP.indexOf(w) < 0; }); }
  function localSearch(q, idx) {
    var qt = terms(q); if (!qt.length) return null;
    var best = null, bestScore = 0;
    idx.sections.forEach(function (s) {
      var head = terms(s.heading + " " + s.page), text = terms(s.summary + " " + s.text);
      var score = 0;
      qt.forEach(function (t) {
        var stem = t.replace(/(ing|ed|es|s)$/, "");
        head.forEach(function (w) { if (w === t || (stem.length > 3 && w.indexOf(stem) === 0)) score += 3; });
        var hits = 0; text.forEach(function (w) { if (w === t || (stem.length > 3 && w.indexOf(stem) === 0)) hits++; });
        score += Math.min(hits, 4);
      });
      if (s.path === PAGE) score *= 1.15;
      if (visible.has(s.id) && s.path === PAGE) score *= 1.1;
      if (score > bestScore) { bestScore = score; best = s; }
    });
    return bestScore >= 3 ? best : null;
  }
  function fallback(q, reason) {
    return loadIndex().then(function (idx) {
      var s = localSearch(q, idx);
      var lead = reason === "offline" ? "My full answers aren't switched on here yet, so I can only point you to the closest part of the site. "
                                      : "I can't reach my full answers right now, so I can only point you to the closest part of the site. ";
      if (!s) return { mode: "search", answer: lead + "I couldn't find a match for that. A person can help — would you like me to start an email?",
        sources: [], action: { type: "draft_email", to: "contactus@myasolutions.org", subject: "A question from the website", body: q, label: "Write to a person" } };
      return { mode: "search", answer: lead + "This looks closest: “" + s.heading + "” — " + s.summary,
        sources: [{ path: s.path, id: s.id, heading: s.heading }], action: { type: "show", path: s.path, id: s.id, label: s.path === PAGE ? "Show me" : "Take me there" } };
    }).catch(function () {
      return { mode: "search", answer: "I can't reach the site's guide right now. A person can help — would you like me to start an email?", sources: [],
        action: { type: "draft_email", to: "contactus@myasolutions.org", subject: "A question from the website", body: q, label: "Write to a person" } };
    });
  }

  /* ── Asking ───────────────────────────────────────────────────────── */
  function ask(q) {
    var payload = { question: q, page: { path: PAGE, title: TITLE }, visible: Array.from(visible).slice(0, 12), history: getHistory() };
    if (!ENDPOINT) return fallback(q, "offline");
    var ctl = new AbortController(); var timer = setTimeout(function () { ctl.abort(); }, 25000);
    return fetch(ENDPOINT + "/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal })
      .then(function (r) {
        clearTimeout(timer);
        if (r.status === 429) return { mode: "busy", answer: "You're asking faster than I can keep up. Give me a minute, then try again.", sources: [], action: null };
        if (!r.ok) return fallback(q, "error");
        return r.json().then(function (d) { if (!d || typeof d.answer !== "string" || !d.answer.trim()) return fallback(q, "error"); return d; });
      })
      .catch(function () { clearTimeout(timer); return fallback(q, "error"); });
  }

  /* ── Rendering an answer (text only — never HTML from the server) ─── */
  function renderAnswer(card, q, d) {
    card.innerHTML = "";
    if (d.mode === "search") card.appendChild(el("span", "jean-offline", "Search only"));
    card.appendChild(el("p", "jean-asked", "Jean · you asked “" + q + "”"));
    card.appendChild(el("p", "jean-text", d.answer));
    var src = (d.sources || []).filter(function (s) { return s && safePath(s.path) && safeId(s.id); }).slice(0, 3);
    if (src.length && d.mode !== "search") {
      var ps = el("p", "jean-sources", "From: ");
      src.forEach(function (s) {
        var a = el("a", null, s.heading || s.path);
        a.href = url(s.path) + "#" + s.id;
        a.addEventListener("click", function (e) { e.preventDefault(); goTo(s.path, s.id); });
        ps.appendChild(a);
      });
      card.appendChild(ps);
    }
    var act = d.action, row = el("div", "actions");
    if (act && act.type === "show" && safePath(act.path) && safeId(act.id)) {
      var b = el("button", "btn btn--primary", act.label || (act.path === PAGE ? "Show me" : "Take me there"));
      b.type = "button"; b.addEventListener("click", function () { goTo(act.path, act.id); });
      row.appendChild(b);
    } else if (act && act.type === "draft_email" && EMAILS.indexOf(act.to) >= 0) {
      var m = el("a", "btn btn--primary", act.label || "Draft the email");
      m.href = "mailto:" + act.to + "?subject=" + encodeURIComponent(String(act.subject || "").slice(0, 120)) + "&body=" + encodeURIComponent(String(act.body || "").slice(0, 1200));
      row.appendChild(m);
    }
    if (row.children.length) {
      var no = el("button", "btn btn--line", "Not now"); no.type = "button";
      no.addEventListener("click", function () { row.remove(); });
      row.appendChild(no);
      card.appendChild(row);
    }
    var note = el("p", "jean-note", "Jean is an AI guide that answers from this website. ");
    var person = el("a", null, "Talk to a person"); person.href = url("company/contact.html");
    note.appendChild(person); note.appendChild(document.createTextNode(" anytime."));
    card.appendChild(note);
  }

  function handle(q, outlet, button) {
    q = String(q || "").trim().slice(0, 500);
    if (!q) return;
    var card = el("div", "jean-answer");
    card.appendChild(el("p", "jean-asked", "Jean · you asked “" + q + "”"));
    card.appendChild(el("p", "jean-text is-thinking", "Looking through the site…"));
    outlet(card);
    if (button) button.disabled = true;
    ask(q).then(function (d) {
      renderAnswer(card, q, d);
      if (d.mode === "live") { remember("user", q); remember("jean", d.answer); }
    }).finally(function () { if (button) button.disabled = false; });
  }

  /* ── An ask bar ───────────────────────────────────────────────────── */
  var barCount = 0;
  function buildBar(styleName, placeholder, suggestions, outlet) {
    var id = "jean-q-" + (++barCount);
    var form = el("form", "jean-bar jean-bar--" + styleName);
    form.setAttribute("role", "search");
    var label = el("label", "sr-only", "Ask Jean a question"); label.htmlFor = id;
    var input = el("input"); input.id = id; input.type = "text"; input.autocomplete = "off"; input.maxLength = 500;
    input.placeholder = placeholder || "Ask Jean anything";
    var btn = el("button", null, "Ask"); btn.type = "submit";
    form.appendChild(label); form.appendChild(input); form.appendChild(btn);
    form.addEventListener("submit", function (e) { e.preventDefault(); handle(input.value, outlet, btn); });
    var wrap = el("div", "jean-mount-inner"); wrap.appendChild(form);
    if (suggestions && suggestions.length) {
      var chips = el("div", "jean-chips");
      suggestions.forEach(function (s) {
        var c = el("button", "jean-chip", s); c.type = "button";
        c.addEventListener("click", function () { input.value = s; handle(s, outlet, btn); });
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
    }
    return wrap;
  }

  var inlineBars = [];
  document.querySelectorAll("[data-jean-ask]").forEach(function (mount) {
    var styleName = mount.getAttribute("data-jean-style") || "page";
    var sugg = (mount.getAttribute("data-jean-suggest") || "").split("|").map(function (s) { return s.trim(); }).filter(Boolean);
    var live = el("div"); live.setAttribute("aria-live", "polite"); live.setAttribute("aria-atomic", "true");
    var host = mount.closest(".window-hero") || mount;
    if (host === mount) mount.after(live); else host.appendChild(live);
    var outlet = function (card) { live.innerHTML = ""; live.appendChild(card); if (host !== mount) card.style.maxWidth = "46rem"; };
    mount.appendChild(buildBar(styleName, mount.getAttribute("data-jean-placeholder"), sugg, outlet));
    inlineBars.push(mount);
  });

  /* ── The panel, on every page ─────────────────────────────────────── */
  var launch = el("button", "jean-launch");
  launch.type = "button"; launch.setAttribute("aria-haspopup", "dialog"); launch.setAttribute("aria-controls", "jean-panel");
  launch.appendChild(el("span", "dot")); launch.appendChild(document.createTextNode("Ask Jean"));
  var panel = el("section", "jean-panel"); panel.id = "jean-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Ask Jean");
  var head = el("div", "jean-panel-head");
  var hgroup = el("div"); hgroup.appendChild(el("h2", null, "Ask Jean")); hgroup.appendChild(el("p", null, "Answers from this website. A person is always an email away."));
  var close = el("button", "jean-panel-close", "×"); close.type = "button"; close.setAttribute("aria-label", "Close Jean");
  head.appendChild(hgroup); head.appendChild(close);
  var log = el("div", "jean-log"); log.setAttribute("aria-live", "polite");
  log.appendChild(el("p", "jean-empty", "You're on “" + TITLE + "”. Ask about anything on this page — or anywhere on the site."));
  var pageSugg = (document.body.getAttribute("data-jean-suggest") || "").split("|").map(function (s) { return s.trim(); }).filter(Boolean);
  panel.appendChild(head); panel.appendChild(log);
  panel.appendChild(buildBar("page", "Ask in your own words", (pageSugg.length ? pageSugg : DEFAULT_SUGGEST).slice(0, 3), function (card) {
    var empty = log.querySelector(".jean-empty"); if (empty) empty.remove();
    log.appendChild(card); log.scrollTop = log.scrollHeight;
  }));
  document.body.appendChild(launch); document.body.appendChild(panel);
  function openPanel(on) {
    panel.hidden = !on; launch.hidden = on; launch.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) { var i = panel.querySelector("input"); i && i.focus(); } else launch.focus();
  }
  launch.addEventListener("click", function () { openPanel(true); });
  close.addEventListener("click", function () { openPanel(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) openPanel(false); });

  // Tuck the button away while an ask bar is on screen — one way to ask at a time.
  if (inlineBars.length && "IntersectionObserver" in window) {
    var showing = new Set();
    var bio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) showing.add(e.target); else showing.delete(e.target); });
      launch.classList.toggle("is-tucked", showing.size > 0);
    }, { threshold: 0.1 });
    inlineBars.forEach(function (b) { bio.observe(b); });
  }
})();
