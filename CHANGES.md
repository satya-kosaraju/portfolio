# Portfolio update — deployment notes

## Files changed
- `index.html` — content rewrite, mobile hamburger, meta tags, new sections
- `style.css` — removed duplicated `.webdem-*` block, added hamburger + new section styles
- `webdem.html` — removed duplicate `<canvas>` tag, added back-link
- `webdem.js` — fixed `loadSpreaderModel()` → `loadSpreaderCAD()`, removed duplicate `clampBehindCone` and `eject` definitions, bumped version log
- `webdem.css` — added back-link + small mobile fix

## You must do these before pushing
1. **Rename your GLB file:**
   `spreader__1_.glb` → `spreader.glb` (the JS now loads `spreader.glb`)

2. **Delete the dead file:**
   `particles.json` — nothing in your HTML loads it. Remove it from the repo to clean up.

## Recommended (won't break, but worth doing)
3. **Add a real OG preview image** at `og-preview.png` in the repo root (1200×630, e.g. a still of your simulation), then uncomment the `og:image` meta tag in `index.html`. This is what shows up when you share the URL on LinkedIn / Slack / WhatsApp.

4. **Project card numbers.** Each project card has a `<!-- TODO -->` comment where you should drop one concrete result (e.g. "matched experimental AOR within 2°", "validated across 3 flow regimes", "RPM range tested: 400–900"). Even one number per card transforms how recruiters read these.

5. **Add real thumbnails for projects.** The colored gradient placeholders work but real screenshots from EDEM, your CAD models, or experimental photos would land much harder. Replace the `<span class="thumb-label">` blocks with `<img src="images/dem-thumb.png" alt="..." />` and add a `images/` folder.

6. **DEM video poster.** YouTube embeds load slowly. If you want faster initial paint, replace the iframe with a click-to-play poster image.

## What was broken before
- `webdem.js` called a nonexistent function (`loadSpreaderModel`) → ReferenceError on init, console-only failure, hard to spot
- `clampBehindCone` and `eject` were defined twice in the same file
- `style.css` had its entire `.webdem-*` block duplicated (lines 691–768 and 773–850)
- `webdem.html` had two `<canvas id="webdem-canvas">` tags (invalid HTML)
- Hero said "Master's student" but you're graduating May 2026 — updated
- Footer said © 2025 → now 2026
- Mobile nav had no hamburger; links just disappeared below 640px
- No SEO meta tags, no favicon, no OG previews
- Patent had no number on display; John Deere collab, thesis title, conference presentation, Gold Medal, Education section, Awards section were all absent
