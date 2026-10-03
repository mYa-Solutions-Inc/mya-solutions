/* ═══════════════════════════════════════════════════════════════════════
   mYa Solutions — site.js
   One nav, one footer, one countdown for every page.

   To add or rename a page in the menus: edit NAV / FOOTER below. That is
   the only place — every page picks it up.

   A page opts in with:
     <body data-group="Products" data-back="products/physical.html" data-back-label="Physical">
     <div data-site-header></div>  …content…  <div data-site-footer></div>
     <script src="(relative)/assets/js/site.js" defer></script>
   Paths in NAV/FOOTER are written from the site root.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var LAUNCH = new Date("2026-11-13T09:00:00-08:00").getTime();
  var REPO = "https://github.com/AyindeRudolph/bethany-sil";

  var NAV = [
    { name: "Products", items: [
      { label: "BethanyShell", note: "security", href: "products/bethanyshell.html" },
      { label: "Education", note: "Marva", href: "products/education.html" },
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
    { name: "Investor", href: "investor.html" },
    { name: "Sign In", href: "login.html", cls: "signin" }
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
      ["Contact", "company/contact.html"], ["Investor", "investor.html"], ["Sign In", "login.html"] ] }
  ];

  /* ── Root: work out the site root from this script's own URL ───────── */
  var me = document.currentScript || document.querySelector('script[src*="assets/js/site.js"]');
  var ROOT = new URL("../../", me.src).href;
  function url(p) { return /^(https?:|mailto:)/.test(p) ? p : new URL(p, ROOT).href; }
  var here = location.href.split("#")[0].replace(/index\.html$/, "");
  function isCurrent(p) {
    if (/^(https?:|mailto:)/.test(p) || p.indexOf("#") >= 0) return false;
    return url(p).replace(/index\.html$/, "") === here;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ext(p) { return /^https?:/.test(p) ? ' target="_blank" rel="noopener"' : ""; }

  var body = document.body;
  var group = body.getAttribute("data-group") || "";
  var isHome = body.hasAttribute("data-home");

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
        return '<li' + (isCurrent(m.href) ? ' class="is-current"' : "") + '><a href="' + url(m.href) + '"' + (m.cls ? ' class="' + m.cls + '"' : "") + (isCurrent(m.href) ? ' aria-current="page"' : "") + ">" + esc(m.name) + "</a></li>";
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
        return '<a href="' + url(it.href) + '"' + ext(it.href) + (it.sub ? ' class="sub"' : "") + (isCurrent(it.href) ? ' aria-current="page"' : "") + ">" + esc(it.label) + (it.soon ? "&nbsp;<span class=\"tag-soon\">soon</span>" : "") + "</a>";
      }).join("");
    });
    out += "<h2>Direct</h2>" + '<a href="' + url("investor.html") + '">Investor</a><a href="' + url("login.html") + '">Sign In</a>';
    out += '<a class="btn btn--primary drawer-cta" href="' + url("products/pricing.html") + '">' + (launched ? "JeanOS is live — pricing" : "Join the founder's circle") + "</a>";
    return out;
  }
  var back = body.getAttribute("data-back");
  var backLabel = body.getAttribute("data-back-label") || "Back";

  var header = document.querySelector("[data-site-header]");
  if (header) {
    var cd = launched
      ? '<span class="cd-label">JeanOS</span><span class="cd-value">Live now</span>'
      : '<span class="cd-label">Launch</span><span class="cd-value" data-cd>' + cdText() + "</span>";
    header.outerHTML =
      '<a class="skip" href="#main">Skip to content</a>' +
      '<header class="topbar"><div class="topbar-inner">' +
        (back ? '<a class="back-pill" href="' + url(back) + '">← ' + esc(backLabel) + "</a>" : "") +
        '<a class="brand" href="' + url("index.html") + '"><img src="' + url("assets/logo.jpg") + '" alt="" width="52" height="52"><span class="brand-name">mYa Solutions</span></a>' +
        '<nav aria-label="Main"><ul class="menus">' + menuHTML() + "</ul></nav>" +
        '<a class="countdown-pill" href="' + url("products/pricing.html") + '" aria-label="Commercial launch countdown">' + cd + "</a>" +
        '<button class="hamburger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span></span><span></span><span></span></button>' +
      "</div>" +
      '<a class="cd-strip" href="' + url("products/pricing.html") + '">' + cd + "</a>" +
      "</header>" +
      '<div class="drawer-scrim" data-close></div>' +
      '<nav class="drawer" id="drawer" aria-label="Menu"><div class="drawer-head"><span class="brand-name">mYa Solutions</span><button class="drawer-close" type="button" aria-label="Close menu" data-close>×</button></div>' + drawerHTML() + "</nav>";
  }

  /* ── Footer ───────────────────────────────────────────────────────── */
  var footer = document.querySelector("[data-site-footer]");
  if (footer) {
    footer.outerHTML =
      '<footer class="site-footer"><div class="footer-inner">' +
        '<a href="' + url("index.html") + '"><img class="footer-logo" src="' + url("assets/logo.jpg") + '" alt="mYa Solutions" width="132" height="132"></a>' +
        '<div class="footer-tag">The other half of the AI story.</div>' +
        '<div class="footer-map">' + FOOTER.map(function (f) {
          return "<div><h2>" + esc(f.h) + "</h2><ul>" + f.items.map(function (it) {
            return '<li><a href="' + url(it[1]) + '"' + ext(it[1]) + ">" + esc(it[0]) + "</a></li>";
          }).join("") + "</ul></div>";
        }).join("") + "</div>" +
        '<div class="footer-legal">In memoriam: Kamyia Fletcher (1995–2024) · © ' + new Date().getFullYear() + ' mYa Solutions, Inc. · Oakland, California · <a href="mailto:arudolph@myasolutions.org">arudolph@myasolutions.org</a></div>' +
      "</div></footer>";
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

  /* ── Blueprint corners + duotone clip, so markup stays short ───────── */
  document.querySelectorAll(".blueprint").forEach(function (el) {
    if (el.querySelector(":scope > .corner")) return;
    ["tl", "tr", "bl", "br"].forEach(function (c) { var i = document.createElement("i"); i.className = "corner " + c; i.setAttribute("aria-hidden", "true"); el.appendChild(i); });
  });
  document.querySelectorAll(".duotone").forEach(function (el) {
    if (el.querySelector(":scope > .duo-clip")) return;
    var clip = document.createElement("div"); clip.className = "duo-clip";
    Array.prototype.slice.call(el.childNodes).forEach(function (n) { if (!(n.classList && n.classList.contains("corner"))) clip.appendChild(n); });
    el.insertBefore(clip, el.firstChild);
  });

  /* ── Tick every countdown on the page ─────────────────────────────── */
  var cds = document.querySelectorAll("[data-cd]");
  if (cds.length && !launched) {
    setInterval(function () { var t = cdText(); cds.forEach(function (el) { el.textContent = t; }); }, 1000);
  }
  if (launched) document.querySelectorAll("[data-prelaunch]").forEach(function (el) { el.hidden = true; });
  document.querySelectorAll("[data-postlaunch]").forEach(function (el) { el.hidden = !launched; });
})();
