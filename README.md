# myasolutions.org

Static site on GitHub Pages. No build step: edit a file, push, it's live.

## Layout

```
index.html                 front door
investor.html  login.html  404.html
products/   bethanyshell · education · defense · physical · robotics · marine · ground · air · pricing
evidence/   reports (+ reports/*.pdf) · become-a-believer
impact/     giving · b-corp
company/    about · team · careers · contact
assets/css/ tokens.css (colours, type, spacing) · base.css (chrome) · blocks.css (block library) · fonts.css
assets/js/site.js          nav, footer, launch countdown — for every page
media/plates/              web-sized still images (-1600 / -800)
_template.html             copy to start a page; open it in a browser to see every block
```

Old flat URLs (`/marine.html`, `/about.html`, …) are small redirect files that forward to the new address, so existing links keep working.

## Common jobs

- **Change the menu or footer:** edit `NAV` / `FOOTER` at the top of `assets/js/site.js`. Every page updates.
- **Change a colour or font size site-wide:** `assets/css/tokens.css`.
- **Add a page:** copy `_template.html` into its folder, set the title/description/canonical and the `data-group` / `data-back` attributes on `<body>`, stack blocks, add it to `NAV`/`FOOTER` and `sitemap.xml`.
- **Post a benefit report:** put the PDF in `impact/reports/`, then update the "Current report" card and the table in `impact/b-corp.html`.
- **Add an image:** export a ~1600px-wide JPG (and an ~800px one) into `media/plates/`. Plates are shown duotone automatically; portraits of people use `plate--photo` and keep their colour.
- **Launch day:** the countdown flips to "Live now" on its own at 13 Nov 2026, 09:00 PT (`LAUNCH` in `site.js`).

No page should need its own `<style>`. If a block is missing, add it to `blocks.css`.
Fonts are self-hosted and the site makes no third-party requests except the links people click (DocSend, Stripe, YouTube, GitHub).
