# satya-kosaraju.github.io/portfolio

Personal site of **Satya Venkatesh Kosaraju** — mechanical systems and simulation
engineer working across machine design, experimental testing, computer vision,
automation, prototyping, and validated physics-based modeling at Iowa State
University's Soil Machine Dynamics Laboratory.

**Live:** https://satya-kosaraju.github.io/portfolio/

## Stack

- Static HTML / CSS / vanilla JS — no build step, no frameworks
- Hero: Canvas 2D granular-flow simulation with velocity-colormap particle
  coloring and live HUD telemetry
- `webdem.html`: interactive WebGL twin-disc spreader simulation
  (Three.js r160 with pinned module imports)
- Scroll-linked animations via IntersectionObserver + rAF;
  `prefers-reduced-motion` fully respected

## Files

| File | Purpose |
| --- | --- |
| `index.html` / `style.css` / `main.js` | Main site |
| `webdem.html` / `webdem.css` / `webdem.js` | Interactive twin-disc simulation |
| `Satya_resume.pdf` | Résumé |

## Deploy

Push to `main`; GitHub Pages serves the repo root. Hard-refresh
(Ctrl/Cmd+Shift+R) after deploys — Pages caches aggressively.
