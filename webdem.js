/* ============================================================
   SVK PORTFOLIO v3 — "Instrument Panel"
   Palette: deep graphite + velocity-colormap accent ramp
   Type: Archivo (display, expanded) · Instrument Sans (body)
         Martian Mono (HUD / data labels)
   ============================================================ */

/* ------------------ tokens ------------------ */
:root {
  --bg0: #06090d;
  --bg1: #0a0f16;
  --bg2: #101724;
  --line: #1b2634;
  --line2: #2a3850;

  --ink: #e9eef4;
  --mut: #8a97a6;
  --dim: #5b6675;

  /* velocity colormap — slow → fast */
  --v0: #2f6bff;
  --v1: #19c8e6;
  --v2: #8fe649;
  --v3: #ffd43b;
  --v4: #ff7a2f;

  --accent: var(--v4);
  --accent-2: var(--v1);
  --ramp: linear-gradient(90deg, var(--v0), var(--v1), var(--v2), var(--v3), var(--v4));

  --font-display: "Archivo", "Arial Narrow", sans-serif;
  --font-body: "Instrument Sans", "Helvetica Neue", sans-serif;
  --font-mono: "Martian Mono", "SFMono-Regular", monospace;

  --maxw: 1180px;
  --pad: clamp(1.25rem, 4vw, 3rem);
  --radius: 10px;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur: 0.85s;
}

/* ------------------ reset / base ------------------ */
*, *::before, *::after { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--bg0);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 1.0625rem;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

img, svg, iframe { max-width: 100%; }

h1, h2, h3, h4 { margin: 0; line-height: 1.1; }

p { margin: 0 0 1.1em; }
p:last-child { margin-bottom: 0; }

a { color: inherit; text-decoration: none; }

::selection { background: var(--v4); color: var(--bg0); }

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 3px;
}

.skip-link {
  position: fixed;
  top: -100px;
  left: 1rem;
  z-index: 200;
  padding: 0.6rem 1rem;
  background: var(--accent);
  color: var(--bg0);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  border-radius: 6px;
  transition: top 0.2s;
}
.skip-link:focus { top: 1rem; }

/* display type helper */
.display {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 118;
  font-stretch: 118%;
  letter-spacing: 0.01em;
}

/* velocity-ramp gradient text */
.ramp-text {
  background: var(--ramp);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* mono utility */
.eyebrow {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1.1rem;
}

/* ------------------ progress bar ------------------ */
.progress-bar {
  position: fixed;
  top: 0; left: 0;
  height: 2px;
  width: 100%;
  background: var(--ramp);
  transform-origin: 0 50%;
  transform: scaleX(0);
  z-index: 120;
  pointer-events: none;
}

/* ------------------ telemetry rail ------------------ */
.rail {
  position: fixed;
  right: 22px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.rail-label {
  writing-mode: vertical-rl;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.3em;
  color: var(--dim);
  text-transform: uppercase;
  min-height: 6.5em;
  display: flex;
  align-items: center;
}

.rail-dots {
  list-style: none;
  margin: 0; padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rail-dot {
  display: block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--line2);
  transition: background 0.3s, transform 0.3s, box-shadow 0.3s;
}
.rail-dot:hover { background: var(--mut); }
.rail-dot.active {
  background: var(--accent);
  transform: scale(1.5);
  box-shadow: 0 0 10px rgba(255, 122, 47, 0.55);
}

/* ------------------ navbar ------------------ */
.navbar {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  transition: background-color 0.35s, border-color 0.35s, backdrop-filter 0.35s;
  border-bottom: 1px solid transparent;
}
.navbar.scrolled {
  background: rgba(6, 9, 13, 0.78);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom-color: var(--line);
}

.nav-inner {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 0.9rem var(--pad);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.logo { display: flex; align-items: center; gap: 0.7rem; }

.logo-mark {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--accent);
  border: 1px solid var(--line2);
  border-radius: 7px;
  padding: 0.35rem 0.5rem;
  background: var(--bg1);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.logo:hover .logo-mark {
  border-color: var(--accent);
  box-shadow: 0 0 14px rgba(255, 122, 47, 0.25);
}

.logo-text { display: flex; flex-direction: column; line-height: 1.25; }
.logo-name { font-weight: 600; font-size: 0.92rem; letter-spacing: 0.01em; }
.logo-sub {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dim);
}

.nav-links {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 1.7rem;
  margin: 0; padding: 0;
}

.nav-links a {
  font-size: 0.86rem;
  font-weight: 500;
  color: var(--mut);
  display: inline-flex;
  align-items: baseline;
  gap: 0.4em;
  position: relative;
  padding: 0.25rem 0;
  transition: color 0.25s;
}
.nav-links a .num {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  color: var(--dim);
  transition: color 0.25s;
}
.nav-links a::after {
  content: "";
  position: absolute;
  left: 0; bottom: -2px;
  width: 100%; height: 1px;
  background: var(--ramp);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.35s var(--ease-out);
}
.nav-links a:hover, .nav-links a.active { color: var(--ink); }
.nav-links a:hover .num, .nav-links a.active .num { color: var(--accent); }
.nav-links a:hover::after, .nav-links a.active::after { transform: scaleX(1); }

.btn-nav {
  font-family: var(--font-mono);
  font-size: 0.68rem !important;
  letter-spacing: 0.08em;
  color: var(--bg0) !important;
  background: var(--accent);
  padding: 0.55rem 0.95rem !important;
  border-radius: 7px;
  transition: background 0.25s, transform 0.25s, box-shadow 0.25s;
}
.btn-nav::after { display: none; }
.btn-nav:hover {
  background: var(--v3);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(255, 122, 47, 0.3);
}

.nav-toggle {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 42px; height: 42px;
  background: var(--bg1);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  padding: 0 10px;
  z-index: 110;
}
.nav-toggle span {
  display: block;
  height: 2px;
  background: var(--ink);
  border-radius: 2px;
  transition: transform 0.3s var(--ease-out), opacity 0.3s;
}
.nav-toggle.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.nav-toggle.open span:nth-child(2) { opacity: 0; }
.nav-toggle.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* ------------------ hero ------------------ */
.hero {
  position: relative;
  min-height: 100svh;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: var(--bg0);
}

.hero-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  -webkit-mask-image: linear-gradient(180deg, #000 72%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 72%, transparent 100%);
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 56px 56px;
  opacity: 0.28;
  -webkit-mask-image: radial-gradient(120% 90% at 30% 40%, #000 30%, transparent 78%);
  mask-image: radial-gradient(120% 90% at 30% 40%, #000 30%, transparent 78%);
  pointer-events: none;
}

.hero-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(110% 100% at 70% 55%, transparent 40%, rgba(6, 9, 13, 0.75) 100%);
  pointer-events: none;
}

/* HUD corner brackets */
.hud { position: absolute; inset: clamp(0.9rem, 2.5vw, 2rem); pointer-events: none; }
.hud-corner {
  position: absolute;
  width: 26px; height: 26px;
  border: 1px solid var(--line2);
  opacity: 0.9;
}
.hud-corner.tl { top: 0; left: 0; border-right: 0; border-bottom: 0; }
.hud-corner.tr { top: 0; right: 0; border-left: 0; border-bottom: 0; }
.hud-corner.bl { bottom: 0; left: 0; border-right: 0; border-top: 0; }
.hud-corner.br { bottom: 0; right: 0; border-left: 0; border-top: 0; }

.hero-content {
  position: relative;
  z-index: 2;
  max-width: var(--maxw);
  width: 100%;
  margin: 0 auto;
  padding: 7.5rem var(--pad) 6rem;
}

.hero-status {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--line2);
  border-radius: 999px;
  background: rgba(16, 23, 36, 0.6);
  backdrop-filter: blur(6px);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mut);
  margin-bottom: 2rem;
}
.status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--v2);
  box-shadow: 0 0 0 0 rgba(143, 230, 73, 0.6);
  animation: pulse 2.2s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(143, 230, 73, 0.55); }
  70% { box-shadow: 0 0 0 9px rgba(143, 230, 73, 0); }
  100% { box-shadow: 0 0 0 0 rgba(143, 230, 73, 0); }
}

.hero-title {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 121;
  font-stretch: 121%;
  font-weight: 780;
  font-size: clamp(2.9rem, 8.2vw, 6.4rem);
  line-height: 0.98;
  letter-spacing: -0.01em;
  text-transform: uppercase;
  margin-bottom: 1.6rem;
}
.hero-title .line { display: block; }

.hero-sub {
  max-width: 34em;
  font-size: clamp(1.02rem, 1.5vw, 1.2rem);
  color: var(--mut);
  margin-bottom: 2.2rem;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 2.6rem;
  row-gap: 1rem;
  margin-bottom: 2.4rem;
  padding-left: 1rem;
  border-left: 2px solid var(--line2);
}
.hero-meta-item { display: flex; flex-direction: column; gap: 0.2rem; }
.meta-k {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dim);
}
.meta-v { font-size: 0.92rem; font-weight: 500; }

.hero-actions { display: flex; flex-wrap: wrap; gap: 0.9rem; }

.btn-primary, .btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.55em;
  font-weight: 600;
  font-size: 0.93rem;
  padding: 0.85rem 1.5rem;
  border-radius: 9px;
  transition: transform 0.25s var(--ease-out), box-shadow 0.3s, background 0.3s, border-color 0.3s, color 0.3s;
  will-change: transform;
}
.btn-primary {
  background: var(--accent);
  color: var(--bg0);
}
.btn-primary:hover {
  background: var(--v3);
  box-shadow: 0 10px 34px rgba(255, 122, 47, 0.35);
}
.btn-ghost {
  border: 1px solid var(--line2);
  color: var(--ink);
  background: rgba(16, 23, 36, 0.4);
}
.btn-ghost:hover {
  border-color: var(--accent-2);
  color: var(--accent-2);
  box-shadow: 0 8px 26px rgba(25, 200, 230, 0.15);
}

.hero-readout {
  position: absolute;
  left: var(--pad);
  bottom: clamp(1.4rem, 4vh, 2.6rem);
  z-index: 3;
  display: flex;
  gap: 1.6rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  color: var(--dim);
}
.hero-readout b {
  font-weight: 500;
  color: var(--accent-2);
}

.scroll-cue {
  position: absolute;
  right: clamp(1.5rem, 4vw, 3rem);
  bottom: clamp(1.4rem, 4vh, 2.6rem);
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}
.cue-line {
  width: 1px; height: 44px;
  background: linear-gradient(180deg, transparent, var(--accent));
  animation: cueDrop 2s var(--ease-out) infinite;
  transform-origin: top;
}
@keyframes cueDrop {
  0% { transform: scaleY(0); opacity: 0; }
  35% { transform: scaleY(1); opacity: 1; }
  100% { transform: scaleY(1) translateY(8px); opacity: 0; }
}
.cue-text {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.32em;
  color: var(--dim);
}

/* hero load-in sequence */
.js .intro {
  opacity: 0;
  transform: translateY(26px);
  filter: blur(5px);
  animation: introUp 0.9s var(--ease-out) forwards;
  animation-delay: calc(0.12s + var(--d, 0) * 0.11s);
}
@keyframes introUp {
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

/* ------------------ marquee ------------------ */
.marquee {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--bg1);
  overflow: hidden;
  padding: 0.85rem 0;
}
.marquee-track {
  display: flex;
  width: max-content;
  animation: marquee 34s linear infinite;
}
.marquee:hover .marquee-track { animation-play-state: paused; }
.marquee-group {
  display: flex;
  align-items: center;
  gap: 2.2rem;
  padding-right: 2.2rem;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--mut);
  white-space: nowrap;
}
.marquee-group i { color: var(--accent); font-style: normal; }
@keyframes marquee {
  to { transform: translateX(-50%); }
}

/* ------------------ sections ------------------ */
.section {
  position: relative;
  max-width: var(--maxw);
  margin: 0 auto;
  padding: clamp(4.5rem, 10vw, 8rem) var(--pad);
}
.section-tight { padding-top: clamp(3rem, 7vw, 5rem); padding-bottom: clamp(3rem, 7vw, 5rem); }

.section-dark {
  max-width: none;
  background: var(--bg1);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.section-dark > * { max-width: var(--maxw); margin-left: auto; margin-right: auto; }
.section-dark > .bg-grid { max-width: none; }

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 64px 64px;
  opacity: 0.16;
  pointer-events: none;
}
.section-dark .section-head,
.section-dark .method-wrap,
.section-dark .projects,
.contact-section .contact-inner { position: relative; z-index: 1; }

.section-head { margin-bottom: clamp(2.2rem, 5vw, 3.6rem); }

.section-title {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 112;
  font-stretch: 112%;
  font-weight: 680;
  font-size: clamp(1.55rem, 3.4vw, 2.5rem);
  line-height: 1.14;
  letter-spacing: 0;
  max-width: 22em;
}
.section-title em {
  font-style: normal;
  background: var(--ramp);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* ------------------ profile ------------------ */
.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
  margin-bottom: clamp(2.6rem, 6vw, 4rem);
}

.profile-prose .lead {
  font-size: 1.22rem;
  line-height: 1.6;
  color: var(--ink);
}
.profile-prose p { color: var(--mut); }
.profile-prose p.lead { color: var(--ink); }

.link-underline {
  display: inline-flex;
  gap: 0.4em;
  margin-top: 0.6rem;
  font-weight: 600;
  color: var(--accent-2);
  position: relative;
}
.link-underline::after {
  content: "";
  position: absolute;
  left: 0; bottom: -3px;
  width: 100%; height: 1px;
  background: var(--ramp);
  transform: scaleX(0.35);
  transform-origin: left;
  transition: transform 0.35s var(--ease-out);
}
.link-underline:hover::after { transform: scaleX(1); }

/* spec card — CAD title-block styling */
.spec-card {
  border: 1px solid var(--line2);
  border-radius: var(--radius);
  background: var(--bg1);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}
.spec-head {
  display: flex;
  justify-content: space-between;
  padding: 0.65rem 1.1rem;
  background: var(--bg2);
  border-bottom: 1px solid var(--line2);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  color: var(--accent);
}
.spec-rows { margin: 0; }
.spec-row {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 1rem;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid var(--line);
}
.spec-row:last-child { border-bottom: 0; }
.spec-row dt {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dim);
  padding-top: 0.3em;
}
.spec-row dd { margin: 0; font-size: 0.9rem; color: var(--ink); }

/* stats */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg1);
}
.stat {
  padding: 1.5rem 1.4rem;
  border-right: 1px solid var(--line);
  transition: background 0.3s;
}
.stat:last-child { border-right: 0; }
.stat:hover { background: var(--bg2); }
.stat-num {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 116;
  font-stretch: 116%;
  font-weight: 740;
  font-size: 2.4rem;
  line-height: 1;
  background: var(--ramp);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.stat-label {
  margin-top: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dim);
  line-height: 1.6;
}

/* ------------------ method timeline ------------------ */
.method-wrap { position: relative; padding-left: clamp(2.4rem, 5vw, 3.4rem); }

.method-line {
  position: absolute;
  left: 11px;
  top: 8px; bottom: 8px;
  width: 2px;
  background: var(--line2);
  border-radius: 2px;
  overflow: hidden;
}
.method-line::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--ramp);
  transform-origin: top;
  transform: scaleY(var(--p, 0));
}

.method-steps {
  list-style: none;
  margin: 0; padding: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(2rem, 4.5vw, 3rem);
}

.m-step {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1.4rem;
  align-items: start;
  padding: 1.4rem 1.6rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(16, 23, 36, 0.5);
  transition: border-color 0.35s, transform 0.35s var(--ease-out), box-shadow 0.35s;
}
.m-step::before {
  content: "";
  position: absolute;
  left: calc(-1 * clamp(2.4rem, 5vw, 3.4rem) + 6px);
  top: 2rem;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--bg1);
  border: 2px solid var(--line2);
  transition: border-color 0.35s, box-shadow 0.35s, background 0.35s;
}
.m-step.lit::before {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 0 12px rgba(255, 122, 47, 0.6);
}
.m-step:hover {
  border-color: var(--line2);
  transform: translateX(6px);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.35);
}

.m-num {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--dim);
  padding-top: 0.35rem;
  transition: color 0.35s;
}
.m-step.lit .m-num { color: var(--accent); }

.m-body h3 {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 110;
  font-stretch: 110%;
  font-size: 1.22rem;
  font-weight: 660;
  margin-bottom: 0.45rem;
}
.m-body p { color: var(--mut); font-size: 0.96rem; margin: 0; max-width: 52em; }

.m-icon {
  width: 52px; height: 52px;
  stroke: var(--accent-2);
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
  flex-shrink: 0;
}
.m-icon circle { fill: var(--accent-2); stroke: none; opacity: 0.9; }

/* ------------------ evidence ------------------ */
.evidence-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr);
  gap: clamp(1.4rem, 3vw, 2.2rem);
  align-items: stretch;
}

.video-frame {
  position: relative;
  margin: 0;
  border: 1px solid var(--line2);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg1);
  aspect-ratio: 16 / 9;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
}
.video-frame iframe {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  border: 0;
}
.frame-tag {
  position: absolute;
  left: 0.9rem; top: 0.8rem;
  z-index: 2;
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.2em;
  color: var(--ink);
  background: rgba(6, 9, 13, 0.72);
  border: 1px solid var(--line2);
  border-radius: 5px;
  padding: 0.35rem 0.6rem;
  pointer-events: none;
}

.sim-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.4rem;
  padding: 1.6rem;
  border: 1px solid var(--line2);
  border-radius: var(--radius);
  background:
    radial-gradient(120% 120% at 100% 0%, rgba(25, 200, 230, 0.12), transparent 55%),
    var(--bg1);
  overflow: hidden;
  transition: transform 0.35s var(--ease-out), border-color 0.35s, box-shadow 0.35s;
}
.sim-card:hover {
  transform: translateY(-5px);
  border-color: var(--accent-2);
  box-shadow: 0 18px 55px rgba(25, 200, 230, 0.18);
}
.sim-tag {
  align-self: flex-start;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent-2);
  border: 1px solid var(--accent-2);
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
}
.sim-title {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 110;
  font-stretch: 110%;
  font-size: 1.35rem;
  font-weight: 660;
  line-height: 1.25;
}
.sim-title em { font-style: normal; color: var(--accent-2); }
.sim-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  color: var(--dim);
  text-transform: uppercase;
}
.sim-arrow {
  position: absolute;
  right: 1.3rem; bottom: 1rem;
  font-size: 1.5rem;
  color: var(--accent-2);
  transition: transform 0.3s var(--ease-out);
}
.sim-card:hover .sim-arrow { transform: translate(4px, -4px); }

/* ------------------ projects ------------------ */
.projects { display: flex; flex-direction: column; gap: 1.1rem; }

.project {
  position: relative;
  padding: clamp(1.5rem, 3.5vw, 2.3rem);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(16, 23, 36, 0.45);
  overflow: hidden;
  transition: transform 0.4s var(--ease-out), box-shadow 0.4s, background 0.4s;
}
.project::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: var(--ramp);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.4s;
  pointer-events: none;
}
.project:hover {
  transform: translateY(-5px);
  background: rgba(16, 23, 36, 0.75);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.45);
}
.project:hover::before { opacity: 0.9; }

.p-index {
  position: absolute;
  right: 1rem; top: -0.6rem;
  font-family: var(--font-display);
  font-variation-settings: "wdth" 125;
  font-stretch: 125%;
  font-weight: 800;
  font-size: clamp(4rem, 9vw, 6.5rem);
  line-height: 1;
  color: transparent;
  -webkit-text-stroke: 1px var(--line2);
  opacity: 0.55;
  transition: opacity 0.4s, transform 0.5s var(--ease-out);
  pointer-events: none;
}
.project:hover .p-index {
  opacity: 0.9;
  transform: translateY(4px);
  -webkit-text-stroke-color: var(--accent);
}

.p-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  margin-bottom: 0.9rem;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.p-year { color: var(--dim); }
.p-org { color: var(--accent-2); }
.p-chip {
  border: 1px solid var(--line2);
  border-radius: 999px;
  padding: 0.22rem 0.6rem;
  color: var(--mut);
}
.p-chip-accent { border-color: var(--accent); color: var(--accent); }

.p-title {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 112;
  font-stretch: 112%;
  font-weight: 680;
  font-size: clamp(1.25rem, 2.6vw, 1.7rem);
  margin-bottom: 0.7rem;
  max-width: 18em;
}
.featured .p-title { font-size: clamp(1.5rem, 3.2vw, 2.1rem); }

.p-desc { color: var(--mut); max-width: 58em; font-size: 0.98rem; }

.p-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.1rem;
}
.p-tags span {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mut);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  background: var(--bg0);
  transition: border-color 0.3s, color 0.3s;
}
.project:hover .p-tags span { border-color: var(--line2); color: var(--ink); }

/* ------------------ output / publications ------------------ */
.pub-list { list-style: none; margin: 0; padding: 0; }
.pub-item {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 1.4rem;
  padding: 1.5rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.pub-year {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--accent);
  padding-top: 0.35em;
}
.pub-title {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 108;
  font-stretch: 108%;
  font-size: 1.18rem;
  font-weight: 640;
  margin-bottom: 0.45rem;
}
.pub-authors { color: var(--mut); font-size: 0.9rem; margin-bottom: 0.25rem; }
.pub-venue {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--dim);
}

/* ------------------ stack ------------------ */
.stack-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.1rem;
}
.stack-col {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(16, 23, 36, 0.45);
  padding: 1.4rem 1.4rem 1.2rem;
  transition: border-color 0.35s, transform 0.35s var(--ease-out), background 0.35s;
}
.stack-col:hover {
  border-color: var(--line2);
  background: var(--bg1);
  transform: translateY(-4px);
}
.stack-col h4 {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1rem;
  padding-bottom: 0.7rem;
  border-bottom: 1px solid var(--line);
}
.stack-col ul { list-style: none; margin: 0; padding: 0; }
.stack-col li {
  position: relative;
  padding: 0.32rem 0 0.32rem 1.1rem;
  font-size: 0.92rem;
  color: var(--mut);
  transition: color 0.25s, padding-left 0.25s;
}
.stack-col li::before {
  content: "▸";
  position: absolute;
  left: 0;
  color: var(--line2);
  transition: color 0.25s;
}
.stack-col li:hover { color: var(--ink); padding-left: 1.3rem; }
.stack-col li:hover::before { color: var(--accent); }

/* ------------------ education ------------------ */
.edu-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem;
}
.edu-card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(16, 23, 36, 0.45);
  padding: 1.6rem;
  transition: border-color 0.35s, transform 0.35s var(--ease-out);
}
.edu-card:hover { border-color: var(--line2); transform: translateY(-4px); }
.edu-year {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  color: var(--accent);
  margin-bottom: 0.8rem;
}
.edu-degree {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 108;
  font-stretch: 108%;
  font-size: 1.15rem;
  font-weight: 660;
  margin-bottom: 0.35rem;
}
.edu-school { color: var(--mut); font-size: 0.88rem; margin-bottom: 0.8rem; }
.edu-desc { color: var(--mut); font-size: 0.92rem; margin: 0; }
.edu-desc strong { color: var(--ink); }

/* ------------------ recognition ------------------ */
.awards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.1rem;
}
.award {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(16, 23, 36, 0.45);
  padding: 1.3rem;
  transition: border-color 0.35s, transform 0.35s var(--ease-out);
}
.award:hover { border-color: var(--line2); transform: translateY(-4px); }
.award-mark {
  font-size: 1.15rem;
  color: var(--accent);
  border: 1px solid var(--line2);
  border-radius: 8px;
  width: 42px; height: 42px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--bg0);
}
.award-body h3 { font-size: 0.98rem; font-weight: 600; margin-bottom: 0.3rem; }
.award-body p { color: var(--mut); font-size: 0.85rem; margin: 0; }

/* ------------------ contact ------------------ */
.contact-section {
  max-width: none;
  background: var(--bg1);
  border-top: 1px solid var(--line);
}
.contact-inner {
  max-width: var(--maxw);
  margin: 0 auto;
  text-align: left;
}
.contact-title {
  font-family: var(--font-display);
  font-variation-settings: "wdth" 121;
  font-stretch: 121%;
  font-weight: 780;
  font-size: clamp(2.4rem, 6.5vw, 4.6rem);
  line-height: 1;
  text-transform: uppercase;
  margin-bottom: 1.2rem;
}
.contact-title .line { display: block; }
.contact-sub {
  color: var(--mut);
  max-width: 38em;
  margin-bottom: 2.4rem;
}

.contact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 1rem;
}
.contact-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1.3rem 1.4rem;
  border: 1px solid var(--line2);
  border-radius: var(--radius);
  background: var(--bg0);
  transition: transform 0.35s var(--ease-out), border-color 0.35s, box-shadow 0.35s;
}
a.contact-card:hover {
  transform: translateY(-5px);
  border-color: var(--accent);
  box-shadow: 0 16px 44px rgba(255, 122, 47, 0.16);
}
.cc-label {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dim);
}
.cc-value { font-weight: 600; font-size: 0.95rem; word-break: break-word; }
.cc-arrow {
  position: absolute;
  top: 1rem; right: 1.1rem;
  color: var(--accent);
  transition: transform 0.3s var(--ease-out);
}
a.contact-card:hover .cc-arrow { transform: translate(3px, -3px); }
.contact-card-static { border-style: dashed; }
.contact-card-static .cc-value { color: var(--mut); }

/* misc small pieces */
.status-text { white-space: nowrap; }
.pub-body { min-width: 0; }
.nav-cta-li { margin-left: 0.4rem; }

/* ------------------ title-block footer ------------------ */
.titleblock {
  border-top: 1px solid var(--line2);
  background: var(--bg0);
}
.tb-grid {
  max-width: var(--maxw);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 2fr 2fr 1.2fr 0.6fr 0.7fr 0.7fr;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
}
.tb-cell {
  padding: 0.9rem 1rem;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.tb-cell:last-child { border-right: 0; }
.tb-k {
  font-family: var(--font-mono);
  font-size: 0.52rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--dim);
}
.tb-v { font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink); }
.tb-credit {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 0.8rem 1rem 1.1rem;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  color: var(--dim);
  border-top: 1px solid var(--line);
}

/* ------------------ reveal system ------------------ */
.js .reveal {
  opacity: 0;
  transform: translateY(30px);
  filter: blur(4px);
  transition:
    opacity var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out),
    filter var(--dur) var(--ease-out);
  transition-delay: var(--rd, 0s);
  will-change: opacity, transform;
}
.js .reveal[data-reveal="right"] { transform: translateX(36px); }
.js .reveal[data-reveal="left"] { transform: translateX(-36px); }
.js .reveal.in {
  opacity: 1;
  transform: none;
  filter: blur(0);
}

/* ------------------ reticle cursor ------------------ */
.cursor-dot, .cursor-ring {
  position: fixed;
  top: 0; left: 0;
  pointer-events: none;
  z-index: 300;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  display: none;
}
.cursor-dot {
  width: 5px; height: 5px;
  background: var(--accent);
}
.cursor-ring {
  width: 30px; height: 30px;
  border: 1px solid rgba(255, 122, 47, 0.45);
  transition: width 0.25s, height 0.25s, border-color 0.25s;
}
.cursor-ring.hot {
  width: 46px; height: 46px;
  border-color: var(--accent-2);
}
@media (hover: hover) and (pointer: fine) {
  .js .cursor-dot, .js .cursor-ring { display: block; }
}

/* ------------------ responsive ------------------ */
@media (max-width: 1160px) {
  .rail { display: none; }
}

@media (max-width: 960px) {
  .profile-grid,
  .evidence-grid,
  .edu-grid { grid-template-columns: 1fr; }

  .stats-row { grid-template-columns: 1fr 1fr; }
  .stat:nth-child(2n) { border-right: 0; }
  .stat:nth-child(-n+2) { border-bottom: 1px solid var(--line); }

  .stack-grid { grid-template-columns: 1fr 1fr; }

  .m-step { grid-template-columns: auto 1fr; }
  .m-icon { display: none; }
}

@media (max-width: 860px) {
  .nav-toggle { display: flex; }

  .nav-links {
    position: fixed;
    inset: 0;
    flex-direction: column;
    justify-content: center;
    gap: 1.6rem;
    background: rgba(6, 9, 13, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-10px);
    transition: opacity 0.35s var(--ease-out), transform 0.35s var(--ease-out);
  }
  .nav-links.open {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
  .nav-links a { font-size: 1.5rem; }
  .nav-links a .num { font-size: 0.7rem; }
  .btn-nav { font-size: 0.85rem !important; }
}

@media (max-width: 640px) {
  .hero-content { padding-top: 6.5rem; padding-bottom: 7rem; }
  .hero-readout { gap: 1rem; font-size: 0.54rem; }
  .scroll-cue { display: none; }
  .stack-grid { grid-template-columns: 1fr; }
  .stats-row { grid-template-columns: 1fr 1fr; }
  .pub-item { grid-template-columns: 1fr; gap: 0.5rem; }
  .tb-grid { grid-template-columns: 1fr 1fr; }
  .tb-cell { border-bottom: 1px solid var(--line); }
  .p-index { font-size: 3.4rem; }
}

/* ------------------ reduced motion ------------------ */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.001s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001s !important;
  }
  .js .intro, .js .reveal {
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
    animation: none !important;
  }
  .marquee-track { animation: none; }
  .cursor-dot, .cursor-ring { display: none !important; }
  .method-line::after { transform: scaleY(1); }
}
