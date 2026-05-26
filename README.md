# Portfolio v2 — Deployment Guide

## What's in this build

A complete rebuild of your portfolio with:
- **Premium typography** — Fraunces (serif display) + Manrope (body) + JetBrains Mono
- **Live hero animation** — Canvas particle simulation showing fertilizer spreading off a spinning disc
- **Smooth scroll reveals** via IntersectionObserver (no AOS dependency)
- **Animated counters** in the About section
- **Working mobile hamburger** menu
- **Scroll progress bar** at the top
- **Sticky navbar** that fills in on scroll
- **Self-contained simulation** — no GLB file required, can't fail to load
- **All your resume content** — patent number, John Deere collab, thesis title, Gold Medal, Education, Publications, Awards, full Skills, phone, location

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main portfolio page |
| `style.css`  | All styles for the main page |
| `main.js`    | Hero canvas + scroll reveal + counters + mobile nav |
| `webdem.html`| Interactive simulation page |
| `webdem.css` | Simulation page styles |
| `webdem.js`  | Self-contained Three.js simulation (no external assets) |

## Deploy — exact steps

This is what was wrong before: you said you updated the code but the live site still shows the old version. That means **the files never reached the live deploy**. Here's the bulletproof process:

### If using GitHub Pages (your current setup)

1. Open your repo: https://github.com/satya-kosaraju/portfolio
2. Delete the old files in the repo:
   - `index.html`
   - `style.css`
   - `webdem.html`
   - `webdem.css`
   - `webdem.js`
   - `particles.json` (it was unused, delete it)
   - `spreader__1_.glb` or `spreader.glb` (no longer needed — the new sim doesn't use it)
3. Upload the 6 new files from this folder.
4. Commit on the `main` branch.
5. Wait 60–90 seconds for GitHub Pages to rebuild.
6. **Force-refresh your browser**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac). GitHub Pages caches aggressively — this step alone fixed many "I uploaded but nothing changed" situations.
7. Open in an incognito/private window to confirm.

### Check it deployed

Visit https://satya-kosaraju.github.io/portfolio/ in incognito. You should see:
- Big serif headline: "Granular flow, modeled."
- A live animated particle simulation in the hero
- A status pill "Currently @ Iowa State × John Deere" with a pulsing dot
- 9 numbered sections including Education, Writing & Talks, Recognition

If you still see the old version: GitHub Pages may not have rebuilt yet. Wait 5 min and force-refresh again.

## Keep your existing résumé file

The new index references `Satya_resume.pdf` — make sure that file is also in the repo (it already is).

## What's intentionally different

- **No more loading overlay** — the old "Simulating DEM…" splash served no purpose and just delayed visible content.
- **The 6-face DEM/CFD/AOR cube is gone** — replaced with the much more impressive live spreader animation in the hero. It's on-brand AND a better visual.
- **Projects are now full-width rows** instead of small cards — better hierarchy, more space for description and tags.
- **Skills are grouped** (Simulation / CAD / Programming / Fab) instead of one flat row.
- **Simulation page no longer needs `spreader.glb`** — the procedural hopper and discs look good on their own and the page can't 404 on an asset anymore.

## After it's live — recommended next moves

These will sharpen the portfolio further but aren't blocking:

1. **Drop one number per project.** Each project description is missing a concrete result. Even one — "matched experimental AOR within 2°", "validated across 3 flow regimes", "tested RPM range 400–900" — changes how recruiters read these. Edit `index.html` → find `<p class="project-desc">` → add it.

2. **Add a real OG preview image.** Take a screenshot of the hero, save as `og-preview.png` (1200×630), commit it, then uncomment the `<meta property="og:image">` tag in `index.html`. LinkedIn shares will then have a real preview.

3. **Project screenshots.** Right now projects are text-only. If you have EDEM screenshots or CAD renders, adding even one image per project would land much harder.

4. **More publications.** Add anything new — even posters, abstracts, thesis defense — to the `<ul class="pub-list">` block in `index.html`. The format is already there to copy.

## Why the simulation was broken on the live site

In your old `webdem.js`, the line `loadSpreaderModel()` was called in `init()` — but only `loadSpreaderCAD()` was defined. That threw a ReferenceError on startup, the rest of `init()` never ran, and the canvas stayed empty.

The new `webdem.js` has no such bug, has no external file dependency, and includes a graceful error message if WebGL isn't available. It will work on every modern browser.
