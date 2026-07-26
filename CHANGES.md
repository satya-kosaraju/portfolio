# Portfolio update — deployment notes

## Revision E — recruiter and identity pass

- Added a real engineering presentation photograph to the Profile section
- Added a 1200×630 social preview image and active Open Graph/Twitter metadata
- Added schema.org Person metadata and a direct GitHub contact card
- Replaced the hero status with an explicit role-search signal
- Corrected the thesis to its final official title
- Corrected patent wording to “published Indian patent application” to avoid
  implying that the application was granted
- Updated the footer revision from D to E

## Previous deployment notes

## Files changed
- `index.html` — content rewrite, mobile hamburger, meta tags, new sections
- `style.css` — removed duplicated `.webdem-*` block, added hamburger + new section styles
- `webdem.html` — removed duplicate `<canvas>` tag, added back-link
- `webdem.js` — fixed `loadSpreaderModel()` → `loadSpreaderCAD()`, removed duplicate `clampBehindCone` and `eject` definitions, bumped version log
- `webdem.css` — added back-link + small mobile fix

## Recommended follow-up

1. **Add real project thumbnails.** Screenshots from EDEM, CAD, or experimental
   work would make the case files more tangible while preserving the site's
   current visual system.

2. **Use a click-to-play video poster.** The YouTube embed is the main third-party
   performance cost on the page.

3. **Add detailed project pages.** Link shareable code, CAD, test methods, or
   reports when confidentiality allows.

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
