/* ==========================================
   main.js
   - Hero canvas particle simulation (DEM-themed)
   - Scroll reveal via IntersectionObserver
   - Animated number counters
   - Mobile nav toggle
   - Navbar scroll state
   - Scroll progress bar
========================================== */

(() => {
  "use strict";

  /* ------------------------------------------
     Hero canvas — granular flow simulation
     Particles fall from above, land on a rotating
     disc, get flung outward, form a spread pattern.
  ------------------------------------------ */
  const canvas = document.getElementById("heroCanvas");
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1;
    const particles = [];
    let disc = { x: 0, y: 0, r: 0, angle: 0, omega: 1.4 };
    let lastT = performance.now();
    let running = true;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Disc position: right-ish, mid-vertical, scaled to viewport
      disc.x = w * 0.72;
      disc.y = h * 0.55;
      disc.r = Math.min(w * 0.11, 110);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Pause animation when tab is hidden
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) {
        lastT = performance.now();
        loop();
      }
    });

    // Particle factory
    const G = 480;          // gravity (px/s^2)
    const SPAWN_PER_SEC = 80;
    let spawnAcc = 0;

    const spawn = () => {
      // emit just above the disc, slightly off-center to bias one side
      const offsetX = (Math.random() - 0.5) * disc.r * 0.6;
      particles.push({
        x: disc.x + offsetX,
        y: -10,
        vx: (Math.random() - 0.5) * 20,
        vy: 40 + Math.random() * 40,
        r: 1.2 + Math.random() * 1.4,
        state: 0, // 0 falling, 1 on disc, 2 flying, 3 landed
        landedAge: 0,
        hue: Math.random() < 0.3 ? "warm" : "cool",
        onAngle: 0,
        onR: 0,
        onSpeed: 0,
      });
    };

    const groundY = () => h - 30;

    const update = (dt) => {
      // rotate disc
      disc.angle += disc.omega * dt;

      // spawn
      spawnAcc += SPAWN_PER_SEC * dt;
      while (spawnAcc >= 1 && particles.length < 600) {
        spawnAcc -= 1;
        spawn();
      }

      const gy = groundY();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // landed: gradually fade and remove oldest
        if (p.state === 3) {
          p.landedAge += dt;
          if (p.landedAge > 4) particles.splice(i, 1);
          continue;
        }

        // on-disc spinning
        if (p.state === 1) {
          // accelerate angular speed toward disc omega
          p.onSpeed += (disc.omega * 1.4 - p.onSpeed) * 4 * dt;
          p.onAngle += p.onSpeed * dt;
          // radial drift outward
          p.onR += 32 * dt;
          p.x = disc.x + p.onR * Math.cos(p.onAngle);
          p.y = disc.y + p.onR * Math.sin(p.onAngle) * 0.25; // squashed perspective

          // eject when reaching rim
          if (p.onR >= disc.r * 0.9) {
            const tangent = p.onAngle + Math.PI / 2;
            const speed = 220 + Math.random() * 90;
            p.vx = Math.cos(tangent) * speed;
            p.vy = Math.sin(tangent) * speed * 0.35 - 100; // upward kick
            p.state = 2;
          }
          continue;
        }

        // falling / flying — physics
        p.vy += G * dt;
        p.vx *= 1 - 0.05 * dt;
        p.vy *= 1 - 0.02 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // pickup on disc
        if (p.state === 0) {
          const dx = p.x - disc.x;
          const dy = p.y - disc.y;
          const dist = Math.hypot(dx, dy * 4); // squashed perspective check
          if (dist < disc.r * 0.85 && p.y >= disc.y - 6 && p.y <= disc.y + 14) {
            p.state = 1;
            p.onAngle = Math.atan2(dy, dx);
            p.onR = Math.max(8, Math.hypot(dx, dy));
            p.onSpeed = 0.6;
          }
        }

        // landed on ground
        if (p.y >= gy) {
          p.y = gy;
          p.vx = 0;
          p.vy = 0;
          p.state = 3;
          p.landedAge = 0;
        }

        // off-screen
        if (p.x < -30 || p.x > w + 30 || p.y > h + 50) {
          particles.splice(i, 1);
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Disc shadow ellipse
      ctx.fillStyle = "rgba(107, 195, 255, 0.04)";
      ctx.beginPath();
      ctx.ellipse(disc.x, disc.y + 8, disc.r * 1.05, disc.r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Disc outline
      ctx.strokeStyle = "rgba(107, 195, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(disc.x, disc.y, disc.r, disc.r * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Disc center mark
      ctx.fillStyle = "rgba(107, 195, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(disc.x, disc.y, 2, 0, Math.PI * 2);
      ctx.fill();

      // Rotating blades (just visual indicators)
      ctx.strokeStyle = "rgba(151, 218, 255, 0.4)";
      ctx.lineWidth = 1.5;
      for (let b = 0; b < 4; b++) {
        const a = disc.angle + (b * Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(disc.x, disc.y);
        ctx.lineTo(
          disc.x + Math.cos(a) * disc.r * 0.85,
          disc.y + Math.sin(a) * disc.r * 0.85 * 0.26
        );
        ctx.stroke();
      }

      // Faint dimension line annotation
      ctx.strokeStyle = "rgba(107, 195, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(disc.x - disc.r, disc.y + disc.r * 0.32);
      ctx.lineTo(disc.x + disc.r, disc.y + disc.r * 0.32);
      ctx.stroke();
      ctx.setLineDash([]);

      // Particles
      for (const p of particles) {
        const isWarm = p.hue === "warm";
        const isFlying = p.state === 2;
        const alpha = p.state === 3 ? Math.max(0, 0.6 - p.landedAge * 0.15) : (isFlying ? 0.9 : 0.7);

        if (isWarm) {
          ctx.fillStyle = `rgba(246, 226, 179, ${alpha})`;
        } else if (isFlying) {
          ctx.fillStyle = `rgba(151, 218, 255, ${alpha})`;
        } else {
          ctx.fillStyle = `rgba(107, 195, 255, ${alpha * 0.85})`;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        // motion trail for flying
        if (isFlying) {
          ctx.strokeStyle = `rgba(151, 218, 255, ${alpha * 0.25})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.stroke();
        }
      }
    };

    const loop = (now = performance.now()) => {
      if (!running) return;
      let dt = (now - lastT) / 1000;
      if (dt > 0.05) dt = 0.05;
      lastT = now;
      update(dt);
      draw();
      requestAnimationFrame(loop);
    };

    // Respect prefers-reduced-motion
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(loop);
    } else {
      // Static frame
      for (let i = 0; i < 30; i++) spawn();
      update(2);
      draw();
    }
  }

  /* ------------------------------------------
     Scroll reveal
  ------------------------------------------ */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("visible"));
  }

  /* ------------------------------------------
     Animated counters
  ------------------------------------------ */
  const counters = document.querySelectorAll("[data-counter]");
  if ("IntersectionObserver" in window && counters.length) {
    const animateCounter = (el) => {
      const target = parseInt(el.dataset.counter, 10);
      if (isNaN(target)) return;
      const duration = 1200;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(eased * target);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const counterIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterIO.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((c) => counterIO.observe(c));
  }

  /* ------------------------------------------
     Mobile nav
  ------------------------------------------ */
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  if (toggle && links) {
    const close = () => {
      links.classList.remove("open");
      toggle.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const isOpen = links.classList.toggle("open");
      toggle.classList.toggle("open", isOpen);
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    links.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
    document.addEventListener("click", (e) => {
      if (!toggle.contains(e.target) && !links.contains(e.target)) close();
    });
  }

  /* ------------------------------------------
     Navbar scrolled state + progress bar
  ------------------------------------------ */
  const navbar = document.getElementById("navbar");
  const progress = document.getElementById("progressBar");
  const onScroll = () => {
    const y = window.scrollY;
    if (navbar) navbar.classList.toggle("scrolled", y > 20);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (y / max) * 100 : 0;
      progress.style.width = pct + "%";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
