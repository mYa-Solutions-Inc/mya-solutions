# myasolutions.org

Static site on GitHub Pages. No build step: edit a file, push, it's live.
Jean, the site's guide, runs as a small separate service on Google Cloud Run.

## The look: Windows

Every page opens on one window (a framed scene with a single line and Jean's ask bar), tells one story in short sections, and ends on the unfinished window — the launch countdown, Follow, the founder's circle, Join the team, Share.
White sand is most of the page, warm sand for surfaces, water (turquoise) only where you act or where Jean points. Two times of day: Daylight and Dusk (footer switch). "Aa" in the header enlarges all text.

## Layout

```
index.html                 front door
investor.html  login.html  404.html
products/   bethanyshell · education · defense · physical · robotics · marine · ground · air · pricing
evidence/   reports (+ reports/*.pdf) · become-a-believer
impact/     giving · b-corp
company/    about · team · careers · contact
assets/css/ tokens.css (colour, type, Daylight/Dusk) · base.css (chrome + Jean) · blocks.css (block library) · fonts.css
assets/js/  site.js (nav, footer, unfinished window, Aa, Dusk) · jean.js (Jean on the page) · jean-config.js (her address)
assets/jean/site-index.json   everything Jean may answer from — built from the pages
media/hero/*.mp4 + media/plates/   window films and stills
services/jean-site/        Jean's answer service (Cloud Run) — not published with the site
tools/build_site_index.py  rebuilds Jean's index
_template.html             copy to start a page; open it in a browser to see every block
```

Old flat URLs (`/marine.html`, `/about.html`, …) are small redirect files that forward to the new address.

## Jean on the site

- She answers **only from this website** (the index), can see which page and sections the visitor has on screen, lights up the part that answers, and — only when the visitor clicks — takes them there or drafts an email to a real address.
- Conversations are **not stored**: the last few turns live in the visitor's own browser tab; the service keeps nothing but anonymous counts.
- **Turning her on:** deploy `services/jean-site` (see its README), then put the URL it prints into `assets/js/jean-config.js`:
  `window.JEAN_ENDPOINT = "https://jean-site-….run.app";`
  Until then she runs in *search-only* mode and says so plainly.
- **Changing the model** (e.g. moving to a local one) is an environment change on the service — no website change.
- **Keeping her current:** the GitHub Action `.github/workflows/site-index.yml` rebuilds `assets/jean/site-index.json` on every push to main. To do it by hand: `python3 tools/build_site_index.py`. Give important sections a one-line `data-summary="…"` — that's what she reads first.
- **Per-page suggestions:** `data-jean-suggest="Question one|Question two"` on the ask bar (and on `<body>` for the panel).

## Common jobs

- **Menu or footer:** edit `NAV` / `FOOTER` at the top of `assets/js/site.js`.
- **A colour or font size site-wide:** `assets/css/tokens.css`.
- **Add a page:** copy `_template.html` into its folder, set title/description/canonical and the `data-group` / `data-back` attributes on `<body>`, stack blocks, add it to `NAV`/`FOOTER`, `sitemap.xml` and the `PAGES` list in `tools/build_site_index.py`.
- **Post a benefit report:** put the PDF in `impact/reports/`, then update the "Current report" card and the table in `impact/b-corp.html`.
- **Images:** a ~1600px and ~800px JPG in `media/plates/`. Window films: a short muted MP4 in `media/hero/` plus a still for its poster. Photos show in full colour with sunlight inside the frame; portraits use `plate--photo` and get no glow.
- **Launch day:** the countdown flips on its own at 13 Nov 2026, 09:00 PT (`LAUNCH` in `site.js`).

No page should need its own `<style>`. Fonts (Newsreader, Hanken Grotesk) are self-hosted; the site makes no third-party requests except links people click and, once switched on, Jean's own service.
