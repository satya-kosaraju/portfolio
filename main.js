/* ============================================================
   SVK PORTFOLIO v3 — main.js
   - Hero canvas: velocity-colored granular sim + live HUD readouts
   - Intro sequence handled in CSS (.intro)
   - Scroll reveals (IntersectionObserver, stagger, variants)
   - Scramble-decode effect on eyebrows
   - Animated counters
   - Method timeline: scroll-linked line draw + step "lit" states
   - Navbar state, mobile overlay menu, active link + rail sync
   - Scroll progress bar
   - Magnetic buttons + reticle cursor (fine pointers only)
   - prefers-reduced-motion respected throughout
   ============================================================ */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ------------------------------------------
     Velocity colormap (slow → fast)
     Matches --v0..--v4 in style.css
  ------------------------------------------ */
  const RAMP = [
    [47, 107, 255],   // #2F6BFF
    [25, 200, 230],   // #19C8E6
    [143, 230, 73],   // #8FE649
    [255, 212, 59],   // #FFD43B
    [255, 122, 47]    // #FF7A2F
  ];

  const rampColor = (t) => {
    const x = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
    const i = Math.min(Math.floor(x), RAMP.length - 2);
    const f = x - i;
    const a = RAMP[i], b = RAMP[i + 1];
    const r = (a[0] + (b[0] - a[0]) * f) | 0;
    const g = (a[1] + (b[1] - a[1]) * f) | 0;
    const bl = (a[2] + (b[2] - a[2]) * f) | 0;
    return `rgb(${r},${g},${bl})`;
  };

  /* ------------------------------------------
     HERO SIM — particles fall onto a spinning
     disc and get flung outward, colored by speed
  ------------------------------------------ */
  const canvas = document.getElementById("heroCanvas");
  const hudParticles = document.getElementById("hudParticles");
  const hudOmega = document.getElementById("hudOmega");
  const hudTime = document.getElementById("hudTime");

  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1;
    const particles = [];
    const MAX_P = 900;
    const G = 520;                 // px/s²
    const OMEGA = 8.0;             // rad/s (real value shown in HUD)
    const disc = { x: 0, y: 0, rx: 0, ry: 0, angle: 0 };
    let simT = 0;
    let lastT = performance.now();
    let running = !document.hidden;
    let spawnAcc = 0;
    let hudAcc = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const compact = w < 760;
      disc.x = compact ? w * 0.5 : w * 0.72;
      disc.y = compact ? h * 0.78 : h * 0.6;
      disc.rx = Math.min(w * 0.13, 130);
      disc.ry = disc.rx * 0.28;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const spawn = () => {
      // The material enters as a compact stream near the spinner hub.
      // It only becomes wide after the rotating vanes accelerate it.
      const spread = disc.rx * 0.18;
      particles.push({
        x: disc.x + (Math.random() * 2 - 1) * spread,
        y: -10 - Math.random() * 40,
        vx: (Math.random() * 2 - 1) * 8,
        vy: 40 + Math.random() * 60,
        r: 1.1 + Math.random() * 1.5,
        state: "feed",
        phase: 0,
        orbitR: 0,
        releaseR: 0,
        radialV: 0,
        releaseAt: 0,
        life: 1
      });
    };

    const step = (dt) => {
      simT += dt;
      disc.angle += OMEGA * dt;

      // steady feed
      spawnAcc += dt * 105;
      while (spawnAcc >= 1 && particles.length < MAX_P) {
        spawn();
        spawnAcc -= 1;
      }
      spawnAcc = Math.min(spawnAcc, 4);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.state === "feed") {
          p.vy += G * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;

          // Capture particles near the hub. A random blade phase represents
          // the continuously changing contact point on the rotating disc.
          const dx = (p.x - disc.x) / disc.rx;
          const dy = (p.y - disc.y) / disc.ry;
          if (dx * dx + dy * dy <= 0.92 && p.y >= disc.y - disc.ry * 0.8) {
            p.state = "disc";
            p.phase = disc.angle + Math.random() * Math.PI * 2;
            p.orbitR = disc.rx * (0.12 + Math.random() * 0.14);
            p.releaseR = disc.rx * (0.72 + Math.random() * 0.24);
            p.radialV = disc.rx * (2.2 + Math.random() * 1.2);
            p.releaseAt = 0.055 + Math.random() * 0.16;
            p.vx = 0;
            p.vy = 0;
          }
        } else if (p.state === "disc") {
          // Travel with the vane while migrating outward. Showing this short
          // residence time makes the motion read as spreading, not splitting.
          p.phase += OMEGA * dt * (0.94 + Math.random() * 0.08);
          p.orbitR += p.radialV * dt;
          p.releaseAt -= dt;

          const perspective = disc.ry / disc.rx;
          p.x = disc.x + Math.cos(p.phase) * p.orbitR;
          p.y = disc.y + Math.sin(p.phase) * p.orbitR * perspective;

          if (p.orbitR >= p.releaseR || p.releaseAt <= 0) {
            const tangential = OMEGA * p.orbitR;
            const radial = p.radialV * (0.7 + Math.random() * 0.35);

            // Tangential + radial velocity gives a continuous broadcast fan.
            // Small scatter represents particle-to-particle variation.
            let vx = -Math.sin(p.phase) * tangential + Math.cos(p.phase) * radial;
            let vy = (Math.cos(p.phase) * tangential + Math.sin(p.phase) * radial) * perspective;
            const scatter = (Math.random() * 2 - 1) * 0.22;
            const cs = Math.cos(scatter), sn = Math.sin(scatter);
            const speedScale = 0.78 + Math.random() * 0.34;
            p.vx = (vx * cs - vy * sn) * speedScale;
            p.vy = (vx * sn + vy * cs) * speedScale - (35 + Math.random() * 70);
            p.state = "flight";
          }
        } else {
          p.vy += G * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt * 0.28;

          // Gentle drag separates the ballistic arcs without forming hard jets.
          p.vx *= Math.pow(0.992, dt * 60);
        }

        if (p.y > h + 30 || p.x < -60 || p.x > w + 60 || p.life <= 0) {
          particles.splice(i, 1);
        }
      }
    };

    const drawDisc = () => {
      // shaft
      ctx.strokeStyle = "rgba(42,56,80,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(disc.x, disc.y);
      ctx.lineTo(disc.x, disc.y - disc.rx * 0.9);
      ctx.stroke();

      // disc body
      ctx.beginPath();
      ctx.ellipse(disc.x, disc.y, disc.rx, disc.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(16,23,36,0.92)";
      ctx.fill();
      ctx.strokeStyle = "rgba(42,56,80,1)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // rotating vanes (projected)
      ctx.strokeStyle = "rgba(25,200,230,0.55)";
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        const a = disc.angle + (k * Math.PI) / 2;
        const ex = Math.cos(a) * disc.rx;
        const ey = Math.sin(a) * disc.ry;
        ctx.beginPath();
        ctx.moveTo(disc.x, disc.y);
        ctx.lineTo(disc.x + ex, disc.y + ey);
        ctx.stroke();
      }

      // hub
      ctx.beginPath();
      ctx.ellipse(disc.x, disc.y, disc.rx * 0.16, disc.ry * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,122,47,0.9)";
      ctx.fill();
    };

    const VMAX = 780; // speed mapped to hottest ramp color
    const draw = () => {
      // trail fade — matches --bg0
      ctx.fillStyle = "rgba(6,9,13,0.28)";
      ctx.fillRect(0, 0, w, h);

      drawDisc();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const speed = Math.hypot(p.vx, p.vy);
        ctx.globalAlpha = Math.max(p.life, 0) * 0.95;
        ctx.fillStyle = rampColor(speed / VMAX);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const fmtTime = (t) => {
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
    };

    const updateHud = () => {
      if (hudParticles) hudParticles.textContent = String(particles.length).padStart(4, "0");
      if (hudOmega) hudOmega.textContent = OMEGA.toFixed(1);
      if (hudTime) hudTime.textContent = fmtTime(simT);
    };

    const loop = (now) => {
      if (!running) return;
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      step(dt);
      draw();
      hudAcc += dt;
      if (hudAcc > 0.15) { updateHud(); hudAcc = 0; }
      requestAnimationFrame(loop);
    };

    if (reduceMotion) {
      // static frame: pre-run the sim silently, render once
      ctx.fillStyle = "#06090d";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++) step(1 / 60);
      draw();
      updateHud();
    } else {
      document.addEventListener("visibilitychange", () => {
        running = !document.hidden;
        if (running) {
          lastT = performance.now();
          requestAnimationFrame(loop);
        }
      });
      requestAnimationFrame(loop);
    }
  }

  /* ------------------------------------------
     Scroll progress bar
  ------------------------------------------ */
  const progressBar = document.getElementById("progressBar");
  const setProgress = () => {
    if (!progressBar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    progressBar.style.transform = `scaleX(${p})`;
  };

  /* ------------------------------------------
     Navbar scrolled state
  ------------------------------------------ */
  const navbar = document.getElementById("navbar");
  const setNavState = () => {
    if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 24);
  };

  /* ------------------------------------------
     Mobile menu
  ------------------------------------------ */
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const open = navLinks.classList.toggle("open");
      navToggle.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    navLinks.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      })
    );
  }

  /* ------------------------------------------
     Scramble-decode effect
  ------------------------------------------ */
  const CHARS = "01▮▯/\\|=+*·<>";
  const scramble = (el) => {
    if (reduceMotion) return;
    const original = el.dataset.original || el.textContent;
    el.dataset.original = original;
    const dur = 620;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const solved = Math.floor(original.length * t);
      let out = original.slice(0, solved);
      for (let i = solved; i < original.length; i++) {
        const c = original[i];
        out += c === " " ? " " : CHARS[(Math.random() * CHARS.length) | 0];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = original;
    };
    requestAnimationFrame(tick);
  };

  /* ------------------------------------------
     Counters
  ------------------------------------------ */
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.counter);
    if (isNaN(target)) return;
    if (reduceMotion) { el.textContent = String(target); return; }
    const dur = 1300;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = String(target);
    };
    requestAnimationFrame(tick);
  };

  /* ------------------------------------------
     Reveal system (with stagger + per-element hooks)
  ------------------------------------------ */
  // stagger delays for children of [data-stagger]
  document.querySelectorAll("[data-stagger]").forEach((wrap) => {
    wrap.querySelectorAll(".reveal").forEach((el, i) => {
      el.style.setProperty("--rd", `${i * 0.09}s`);
    });
  });

  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add("in");
          el.querySelectorAll("[data-scramble]").forEach(scramble);
          if (el.matches("[data-scramble]")) scramble(el);
          el.querySelectorAll("[data-counter]").forEach(runCounter);
          io.unobserve(el);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
    document.querySelectorAll("[data-counter]").forEach((el) => {
      el.textContent = el.dataset.counter;
    });
  }

  /* ------------------------------------------
     Active section → nav links + rail dots + label
  ------------------------------------------ */
  const sections = document.querySelectorAll("section[id]");
  const navAnchors = document.querySelectorAll(".nav-links a[href^='#']");
  const railDots = document.querySelectorAll(".rail-dot");
  const railLabel = document.getElementById("railLabel");

  const setActive = (id, name) => {
    navAnchors.forEach((a) =>
      a.classList.toggle("active", a.getAttribute("href") === `#${id}`)
    );
    railDots.forEach((d) =>
      d.classList.toggle("active", d.getAttribute("href") === `#${id}`)
    );
    if (railLabel && name) railLabel.textContent = name;
  };

  if ("IntersectionObserver" in window) {
    const secIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            setActive(el.id, el.dataset.name || el.id.toUpperCase());
          }
        });
      },
      { rootMargin: "-42% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((s) => secIO.observe(s));
  }

  /* ------------------------------------------
     Method timeline — scroll-linked line + lit steps
  ------------------------------------------ */
  const methodWrap = document.getElementById("methodWrap");
  const mSteps = methodWrap ? methodWrap.querySelectorAll(".m-step") : [];
  const setMethodProgress = () => {
    if (!methodWrap) return;
    const rect = methodWrap.getBoundingClientRect();
    const vh = window.innerHeight;
    const raw = (vh * 0.72 - rect.top) / rect.height;
    const p = Math.min(Math.max(raw, 0), 1);
    methodWrap.style.setProperty("--p", p.toFixed(4));
    const litLine = rect.top + rect.height * p;
    mSteps.forEach((s) => {
      const sr = s.getBoundingClientRect();
      s.classList.toggle("lit", sr.top + 24 <= litLine);
    });
  };
  if (reduceMotion && methodWrap) {
    methodWrap.style.setProperty("--p", "1");
    mSteps.forEach((s) => s.classList.add("lit"));
  }

  /* ------------------------------------------
     Scroll handler (rAF-throttled)
  ------------------------------------------ */
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      setProgress();
      setNavState();
      if (!reduceMotion) setMethodProgress();
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------
     Magnetic buttons (fine pointers only)
  ------------------------------------------ */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll("[data-magnetic]").forEach((btn) => {
      const strength = 7;
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        btn.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ------------------------------------------
     Reticle cursor (fine pointers only)
  ------------------------------------------ */
  const dot = document.getElementById("cursorDot");
  const ring = document.getElementById("cursorRing");
  if (dot && ring && finePointer && !reduceMotion) {
    let mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener("mousemove", (e) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    }, { passive: true });

    const follow = () => {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);

    const hotSel = "a, button, .project, .stat, .award, .stack-col";
    document.addEventListener("mouseover", (e) => {
      ring.classList.toggle("hot", !!e.target.closest(hotSel));
    }, { passive: true });
  }
})();
