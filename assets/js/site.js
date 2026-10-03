/* ═══════════════════════════════════════════════════════════════════════
   FILE / ROOT:  assets/js/site.js  (mYa Solutions website)
   DESCRIPTION:  The chrome every page shares, drawn from one place:
                 header + menus + mobile drawer, the "welcome back" line,
                 the unfinished window (launch countdown, follow, share),
                 the footer, text size (Aa), Daylight/Dusk, the scroll drift
                 inside windows — and it loads Jean (jean-config.js, jean.js).

                 To add or rename a page in the menus: edit NAV / FOOTER.
                 A page opts in with:
                   <body data-group="Products" data-back="products/physical.html" data-back-label="Physical">
                   <div data-site-header></div> …content… <div data-site-footer></div>
                   <script src="(relative)/assets/js/site.js" defer></script>
                 Paths in NAV/FOOTER are written from the site root.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var LAUNCH = new Date("2026-11-13T09:00:00-08:00").getTime();
  var REPO = "https://github.com/AyindeRudolph/bethany-sil";
  var FOLLOW_MAIL = "mailto:contactus@myasolutions.org?subject=" + encodeURIComponent("Follow the journey") +
    "&body=" + encodeURIComponent("Please let me know when the next window opens.");

  var NAV = [
    { name: "Products", items: [
      { label: "BethanyShell", note: "security", href: "products/bethanyshell.html" },
      { label: "Education", href: "products/education.html" },
      { label: "Jean for Defense", href: "products/defense.html" },
      { label: "Physical Intelligence", href: "products/physical.html" },
      { label: "Robotics", href: "products/robotics.html", sub: true },
      { label: "Marine", href: "products/marine.html", sub: true },
      { label: "Ground", href: "products/ground.html", sub: true },
      { label: "Air", href: "products/air.html", sub: true, soon: true },
      { rule: true },
      { label: "Pricing", href: "products/pricing.html" }
    ]},
    { name: "Evidence", items: [
      { label: "Methodology reports", href: "evidence/reports.html" },
      { label: "Public repository ↗", href: REPO, external: true },
      { label: "Become a Believer (film)", href: "evidence/become-a-believer.html" }
    ]},
    { name: "Impact", items: [
      { label: "Giving Back", href: "impact/giving.html" },
      { label: "B Corp & the M-class share", href: "impact/b-corp.html" },
      { label: "Environmental footprint", href: "impact/giving.html#environment" }
    ]},
    { name: "Company", items: [
      { label: "About", href: "company/about.html" },
      { label: "Team", href: "company/team.html" },
      { label: "Careers", href: "company/careers.html" },
      { label: "Contact", href: "company/contact.html" }
    ]},
    { name: "Investor", href: "investor.html" }
  ];

  var FOOTER = [
    { h: "Products", items: [
      ["BethanyShell", "products/bethanyshell.html"], ["Education", "products/education.html"],
      ["Defense", "products/defense.html"], ["Physical Intelligence", "products/physical.html"],
      ["Robotics", "products/robotics.html"], ["Marine", "products/marine.html"], ["Ground", "products/ground.html"],
      ["Air (soon)", "products/air.html"], ["Pricing", "products/pricing.html"] ] },
    { h: "Evidence", items: [
      ["Methodology reports", "evidence/reports.html"], ["Public repository ↗", REPO],
      ["Become a Believer", "evidence/become-a-believer.html"] ] },
    { h: "Impact", items: [
      ["Giving Back", "impact/giving.html"], ["B Corp & the M-class share", "impact/b-corp.html"],
      ["Environmental footprint", "impact/giving.html#environment"] ] },
    { h: "Company", items: [
      ["About", "company/about.html"], ["Team", "company/team.html"], ["Careers", "company/careers.html"],
      ["Contact", "company/contact.html"], ["Investor", "investor.html"], ["Log in", "login.html"] ] }
  ];

  /* ── Root: work out the site root from this script's own URL ───────── */
  var me = document.currentScript || document.querySelector('script[src*="assets/js/site.js"]');
  var ROOT = new URL("../../", me.src).href;
  window.MYA_ROOT = ROOT;
  function url(p) { return /^(https?:|mailto:)/.test(p) ? p : new URL(p, ROOT).href; }
  var here = location.href.split("#")[0].split("?")[0].replace(/index\.html$/, "");
  function isCurrent(p) {
    if (/^(https?:|mailto:)/.test(p) || p.indexOf("#") >= 0) return false;
    return url(p).replace(/index\.html$/, "") === here;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ext(p) { return /^https?:/.test(p) ? ' target="_blank" rel="noopener"' : ""; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  var body = document.body;
  var html = document.documentElement;
  var group = body.getAttribute("data-group") || "";
  var isHome = body.hasAttribute("data-home");
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Time of day + text size (applied before paint where possible) ── */
  var SIZES = ["100%", "112.5%", "125%"], SIZE_TAGS = ["", "+", "++"], SIZE_NAMES = ["Standard", "Large", "Largest"];
  var size = Math.min(2, Math.max(0, parseInt(store("mya-size") || "0", 10) || 0));
  function applySize() { html.style.fontSize = SIZES[size]; document.querySelectorAll("[data-size-btn]").forEach(function (b) { b.setAttribute("aria-label", "Text size: " + SIZE_NAMES[size] + ". Activate to change."); var s = b.querySelector("small"); if (s) s.textContent = SIZE_TAGS[size]; }); }
  function theme() { return store("mya-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dusk" : "day"); }
  function applyTheme() {
    var t = theme(); html.setAttribute("data-theme", t);
    document.querySelectorAll("[data-theme-btn]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-theme-btn") === t ? "true" : "false"); });
  }
  applyTheme(); applySize();

  /* ── Countdown ─────────────────────────────────────────────────────── */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function cdText() {
    var d = Math.max(0, LAUNCH - Date.now());
    return Math.floor(d / 864e5) + " : " + pad(Math.floor(d % 864e5 / 36e5)) + " : " + pad(Math.floor(d % 36e5 / 6e4)) + " : " + pad(Math.floor(d % 6e4 / 1e3));
  }
  var launched = Date.now() >= LAUNCH;

  /* ── Header ───────────────────────────────────────────────────────── */
  function menuHTML() {
    return NAV.map(function (m, i) {
      if (m.href) {
        var cur = isCurrent(m.href);
        return "<li" + (cur ? ' class="is-current"' : "") + '><a href="' + url(m.href) + '"' + (cur ? ' aria-current="page"' : "") + ">" + esc(m.name) + "</a></li>";
      }
      var items = m.items.map(function (it) {
        if (it.rule) return "<li><hr></li>";
        var cur = isCurrent(it.href);
        return '<li><a href="' + url(it.href) + '"' + ext(it.href) + (it.sub ? ' class="sub"' : "") + (cur ? ' aria-current="page"' : "") + ">" +
          esc(it.label) + (it.note ? ' <span class="tag-soon">' + esc(it.note) + "</span>" : "") + (it.soon ? ' <span class="tag-soon">soon</span>' : "") + "</a></li>";
      }).join("");
      return '<li class="has-menu' + (group === m.name ? " is-current" : "") + '"><button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu-' + i + '">' +
        esc(m.name) + '</button><ul class="menu-panel" id="menu-' + i + '">' + items + "</ul></li>";
    }).join("");
  }
  function drawerHTML() {
    var out = "";
    NAV.forEach(function (m) {
      if (m.href) return;
      out += "<h2>" + esc(m.name) + "</h2>" + m.items.filter(function (it) { return !it.rule; }).map(function (it) {
        return '<a href="' + url(it.href) + '"' + ext(it.href) + (it.sub ? ' class="sub"' : "") + (isCurrent(it.href) ? ' aria-current="page"' : "") + ">" + esc(it.label) + (it.soon ? '&nbsp;<span class="tag-soon">soon</span>' : "") + "</a>";
      }).join("");
    });
    out += '<h2>More</h2><a href="' + url("investor.html") + '">Investor</a><a href="' + url("login.html") + '">Log in</a>';
    out += '<div class="drawer-tools"><button class="pill-tool" type="button" data-size-btn>Aa <small></small></button>' +
      '<button class="pill-tool" type="button" data-theme-toggle>Daylight / Dusk</button></div>';
    return out;
  }
  var back = body.getAttribute("data-back");
  var backLabel = body.getAttribute("data-back-label") || "Back";

  var header = document.querySelector("[data-site-header]");
  if (header) {
    header.outerHTML =
      '<a class="skip" href="#main">Skip to main content</a>' +
      '<header class="site-header"><div class="site-header-inner">' +
        '<a class="wordmark" href="' + url("index.html") + '"><img src="' + url("assets/logo.jpg") + '" alt="" width="32" height="32">mYa Solutions</a>' +
        '<nav aria-label="Main"><ul class="menus">' + menuHTML() + "</ul></nav>" +
        '<div class="header-tools">' +
          '<button class="pill-tool" type="button" data-size-btn>Aa <small></small></button>' +
          '<a class="header-link" href="' + url("login.html") + '">Log in</a>' +
          '<a class="header-follow" href="#next">Follow</a>' +
          '<button class="hamburger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span></span><span></span><span></span></button>' +
        "</div>" +
      "</div></header>" +
      (back && !isHome ? '<div class="back-line"><a href="' + url(back) + '">← ' + esc(backLabel) + "</a></div>" : "") +
      '<div class="drawer-scrim" data-close></div>' +
      '<nav class="drawer" id="drawer" aria-label="Menu"><div class="drawer-head"><span class="wordmark">mYa Solutions</span><button class="drawer-close" type="button" aria-label="Close menu" data-close>×</button></div>' + drawerHTML() + "</nav>";
  }

  /* ── Welcome back (home only): the site remembers where you were ───── */
  var LAST = "mya-last";
  if (isHome) {
    var last = null;
    try { last = JSON.parse(store(LAST) || "null"); } catch (e) { last = null; }
    var hero = document.querySelector(".window-hero");
    if (last && last.path && last.title && hero) {
      var mem = document.createElement("div");
      mem.className = "memory";
      mem.innerHTML = '<div class="memory-inner" role="status"><span>Welcome back. Last time you were reading about ' + esc(last.title) + '.</span>' +
        '<div class="actions"><a class="btn btn--primary" href="' + url(last.path) + '">Pick up there</a><button class="btn btn--line" type="button" data-forget>Start fresh</button></div></div>';
      hero.parentNode.insertBefore(mem, hero);
      mem.querySelector("[data-forget]").addEventListener("click", function () { store(LAST, null); try { sessionStorage.removeItem("jean-history"); } catch (e) {} mem.remove(); });
    }
  } else if (!/\/(404|login)\.html$/.test(location.pathname)) {
    var t = (body.getAttribute("data-memory-title") || document.title.split(/ [|—] /)[0]).trim();
    var path = location.href.replace(ROOT, "").split("#")[0].split("?")[0];
    if (t && path) store(LAST, JSON.stringify({ path: path, title: t }));
  }

  /* ── The unfinished window + footer ───────────────────────────────── */
  var footer = document.querySelector("[data-site-footer]");
  if (footer) {
    var next = body.hasAttribute("data-no-next") ? "" :
      '<section class="next-window" id="next" aria-labelledby="next-title" data-summary="The next window: JeanOS opens to the public on 13 November 2026. Follow the journey, join the founder\'s circle, join the team, or share this window.">' +
        '<div class="next-frame"><div class="next-pane"><div>' +
          '<p class="eyebrow">The next window</p>' +
          '<h2 id="next-title">This one isn\'t <em>finished yet.</em></h2>' +
          (launched
            ? '<p class="lede">JeanOS is open. What fills this window next is the next problem we solve together. Follow along and watch it fill in.</p>'
            : '<p class="lede">JeanOS opens to the public on 13 November. Follow along and watch it fill in.</p>' +
              '<div class="next-cd" data-cd aria-hidden="true">' + cdText() + '</div><div class="next-cd-units" aria-hidden="true">days · hrs · min · sec</div>') +
          '<div class="actions">' +
            '<a class="btn btn--primary" href="' + FOLLOW_MAIL + '">Follow the journey</a>' +
            '<a class="btn btn--on-dark" href="' + url("products/pricing.html") + '">Join the founder\'s circle</a>' +
            '<a class="btn btn--on-dark" href="' + url("company/careers.html") + '">Join the team</a>' +
            '<button class="btn btn--on-dark" type="button" data-share>Share this window</button>' +
          "</div>" +
          '<p class="fine">Follow opens your email app — one note when the next window opens, nothing else.</p>' +
        "</div></div></div>" +
      "</section>";
    footer.outerHTML = next +
      '<footer class="site-footer"><div class="footer-grid">' +
        '<div class="footer-brand"><p>mYa Solutions</p><p>The other half of the AI story. Private, local intelligence from Oakland, California.</p></div>' +
        FOOTER.map(function (f) {
          return '<nav aria-label="' + esc(f.h) + '"><h2>' + esc(f.h) + "</h2><ul>" + f.items.map(function (it) {
            return '<li><a href="' + url(it[1]) + '"' + ext(it[1]) + ">" + esc(it[0]) + "</a></li>";
          }).join("") + "</ul></nav>";
        }).join("") +
        '<div class="footer-tools"><span class="fine">Time of day</span>' +
          '<div class="theme-switch" role="group" aria-label="Time of day"><button type="button" data-theme-btn="day">Daylight</button><button type="button" data-theme-btn="dusk">Dusk</button></div>' +
          '<button class="pill-tool" type="button" data-size-btn style="justify-self:start">Aa <small></small></button>' +
        "</div>" +
      "</div>" +
      '<p class="footer-legal">In memoriam: Kamyia Fletcher (1995–2024) · © ' + new Date().getFullYear() + ' mYa Solutions, Inc. · Oakland, California · <a href="mailto:arudolph@myasolutions.org">arudolph@myasolutions.org</a></p>' +
      "</footer>";
  }

  /* ── Menus: hover on desktop, click/tap + keyboard everywhere ──────── */
  var openLi = null, closeTimer = null;
  function setOpen(li, on) {
    if (!li) return;
    li.classList.toggle("open", on);
    var b = li.querySelector(".menu-btn"); if (b) b.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) { if (openLi && openLi !== li) setOpen(openLi, false); openLi = li; } else if (openLi === li) openLi = null;
  }
  document.querySelectorAll(".menus > li.has-menu").forEach(function (li) {
    var btn = li.querySelector(".menu-btn");
    btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(li, !li.classList.contains("open")); });
    li.addEventListener("mouseenter", function () { if (matchMedia("(hover:hover)").matches) { clearTimeout(closeTimer); setOpen(li, true); } });
    li.addEventListener("mouseleave", function () { if (matchMedia("(hover:hover)").matches) { closeTimer = setTimeout(function () { setOpen(li, false); }, 220); } });
    li.addEventListener("focusout", function (e) { if (!li.contains(e.relatedTarget)) setOpen(li, false); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setOpen(li, true); var a = li.querySelector(".menu-panel a"); if (a) a.focus(); }
    });
  });
  document.addEventListener("click", function (e) { if (openLi && !openLi.contains(e.target)) setOpen(openLi, false); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (openLi) { var b = openLi.querySelector(".menu-btn"); setOpen(openLi, false); b && b.focus(); }
    if (body.classList.contains("drawer-open")) toggleDrawer(false);
  });

  /* ── Drawer ───────────────────────────────────────────────────────── */
  var burger = document.querySelector(".hamburger");
  function toggleDrawer(on) {
    body.classList.toggle("drawer-open", on);
    if (burger) burger.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) { var c = document.querySelector(".drawer-close"); c && c.focus(); } else if (burger) burger.focus();
  }
  if (burger) burger.addEventListener("click", function () { toggleDrawer(!body.classList.contains("drawer-open")); });
  document.querySelectorAll("[data-close]").forEach(function (el) { el.addEventListener("click", function () { toggleDrawer(false); }); });
  document.querySelectorAll(".drawer a").forEach(function (a) { a.addEventListener("click", function () { body.classList.remove("drawer-open"); }); });

  /* ── Tools: text size, time of day, share ─────────────────────────── */
  document.querySelectorAll("[data-size-btn]").forEach(function (b) {
    b.addEventListener("click", function () { size = (size + 1) % 3; store("mya-size", String(size)); applySize(); });
  });
  document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
    b.addEventListener("click", function () { store("mya-theme", b.getAttribute("data-theme-btn")); applyTheme(); });
  });
  document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () { store("mya-theme", theme() === "dusk" ? "day" : "dusk"); applyTheme(); });
  });
  applySize(); applyTheme();
  document.querySelectorAll("[data-share]").forEach(function (b) {
    b.addEventListener("click", function () {
      var data = { title: document.title, url: location.href.split("#")[0] };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data.url).then(function () { b.textContent = "Link copied"; setTimeout(function () { b.textContent = "Share this window"; }, 2400); });
      }
    });
  });

  /* ── Window frames: wrap photographs so they sit inside the glass ──── */
  document.querySelectorAll(".duotone").forEach(function (el) {
    if (el.querySelector(":scope > .duo-clip")) return;
    var clip = document.createElement("div"); clip.className = "duo-clip";
    Array.prototype.slice.call(el.childNodes).forEach(function (n) { if (!(n.classList && n.classList.contains("corner"))) clip.appendChild(n); });
    el.insertBefore(clip, el.firstChild);
  });

  /* ── The scene drifts slightly as you scroll, like walking past a lit house ── */
  if (!reduced) {
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { html.style.setProperty("--py", Math.min(window.scrollY * 0.12, 60)); ticking = false; });
    }, { passive: true });
  }

  /* ── Tick every countdown on the page ─────────────────────────────── */
  var cds = document.querySelectorAll("[data-cd]");
  if (cds.length && !launched) {
    var tick = function () { var t = cdText(); cds.forEach(function (el) { el.textContent = t; }); };
    tick(); setInterval(tick, 1000);
  }
  if (launched) document.querySelectorAll("[data-prelaunch]").forEach(function (el) { el.hidden = true; });
  document.querySelectorAll("[data-postlaunch]").forEach(function (el) { el.hidden = !launched; });

  /* ── Jean: config first (endpoint), then the guide itself ─────────── */
  function load(src, cb) { var s = document.createElement("script"); s.src = src; s.defer = true; s.onload = cb || null; s.onerror = cb || null; document.head.appendChild(s); }
  if (!body.hasAttribute("data-no-jean")) load(url("assets/js/jean-config.js"), function () { load(url("assets/js/jean.js")); });
})();

/* Motion inside windows: hero films play muted and looping, unless the visitor prefers reduced motion. */
(function () {
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".window-scene video").forEach(function (v) {
    v.muted = true;
    if (reduced) { v.removeAttribute("autoplay"); v.pause(); return; }
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  });
})();
