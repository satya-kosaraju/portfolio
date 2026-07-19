/* ==========================================
   WebDEM — Twin disc spreader simulation
   Self-contained: no external assets required.
   ========================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

console.log("WEBDEM v3 — Three.js r160");

// ----- DOM -----
const canvas    = document.getElementById("webdem-canvas");
const rpmEl     = document.getElementById("rpm");
const ppsEl     = document.getElementById("pps");
const rpmVal    = document.getElementById("rpmVal");
const ppsVal    = document.getElementById("ppsVal");
const resetBtn  = document.getElementById("resetSim");
const loadingEl = document.getElementById("wdLoading");
const statActive = document.getElementById("statActive");
const statLanded = document.getElementById("statLanded");
const statFps   = document.getElementById("statFps");

let rpm = rpmEl ? +rpmEl.value : 650;
let pps = ppsEl ? +ppsEl.value : 1200;

if (rpmVal) rpmVal.textContent = rpm;
if (ppsVal) ppsVal.textContent = pps;

if (rpmEl) rpmEl.addEventListener("input", () => {
  rpm = +rpmEl.value;
  rpmVal.textContent = rpm;
});
if (ppsEl) ppsEl.addEventListener("input", () => {
  pps = +ppsEl.value;
  ppsVal.textContent = pps;
});

// ----- Geometry / physics constants -----
const discY = 0.60;
const discRadius = 0.95;
const discHalfSpacing = 0.95;
const leftX  = -discHalfSpacing;
const rightX = +discHalfSpacing;

const bladeCount = 4;
const feedY = discY + 0.55;

const innerOffset = Math.min(0.48, discRadius - 0.18);
const orificeW = 0.22;
const orificeL = 0.34;

const g = -9.81;
const linDrag = 0.06;
const pickupWindow = 0.12;
const radialDrift = 0.55;
const angFric = 2.6;
const bladeHitTol = 0.10;
const minSlip = 0.8;
const releaseR = 0.86 * discRadius;

const bladePitchDeg = 32;
const throwUpDeg = 14;
const jitterDeg = 6;
const rearDeflector = true;
const behindConeDeg = 55;

const MAX = 60000;

// states: 0 falling, 1 flying, 2 on-disc, 3 landed
const pos   = new Float32Array(MAX * 3);
const vel   = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);
const state = new Uint8Array(MAX);
const discId = new Int8Array(MAX);
const rOn    = new Float32Array(MAX);
const phiOn  = new Float32Array(MAX);
const phiDot = new Float32Array(MAX);

let cursor = 0;
let emitAcc = 0;

// ----- Three.js globals -----
let renderer, scene, camera, clock, controls;
let discL, discR, particlesMesh;
let hopperGroup;

const tmp = new THREE.Object3D();

// ----- Velocity-ramp state colors (matches site palette) -----
const COL_FALL = new THREE.Color(0x19c8e6); // cyan   — falling
const COL_DISC = new THREE.Color(0x8fe649); // lime   — on disc
const COL_FLY  = new THREE.Color(0xff7a2f); // orange — flying
const COL_LAND = new THREE.Color(0x46536a); // dim    — landed
let colorsDirty = false;
function setPColor(i, c) {
  particlesMesh.setColorAt(i, c);
  colorsDirty = true;
}

// ----- Helpers -----
function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function wrapToPi(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

function sampleRect(cx, cz, w, l) {
  return {
    x: cx + (Math.random() - 0.5) * w,
    z: cz + (Math.random() - 0.5) * l,
  };
}

function hideInstance(i) {
  tmp.position.set(1e6, 1e6, 1e6);
  tmp.scale.setScalar(0.001);
  tmp.updateMatrix();
  particlesMesh.setMatrixAt(i, tmp.matrix);
}

function setInstance(i, x, y, z) {
  tmp.position.set(x, y, z);
  tmp.scale.setScalar(1);
  tmp.updateMatrix();
  particlesMesh.setMatrixAt(i, tmp.matrix);
}

function resetSim() {
  alive.fill(0);
  state.fill(0);
  cursor = 0;
  emitAcc = 0;
  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;
}

// ----- Visual builders -----
function addBlades(disc, color) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.70, 0.06, 0.12);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 });
  for (let k = 0; k < bladeCount; k++) {
    const a = (k * 2 * Math.PI) / bladeCount;
    const blade = new THREE.Mesh(geo, mat);
    blade.position.set(Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
    blade.rotation.y = a;
    blade.castShadow = true;
    group.add(blade);
  }
  // central hub
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.4 })
  );
  hub.position.y = 0.09;
  group.add(hub);
  disc.add(group);
}

function buildHopper() {
  const group = new THREE.Group();

  // Top box
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x141c2a, roughness: 0.55, metalness: 0.25,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.8), boxMat);
  box.position.set(0, 2.4, 0);
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);

  // Down-pipe each side
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x2a3850, roughness: 0.6, metalness: 0.3,
  });
  for (const side of [-1, +1]) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.12, 0.9, 16),
      pipeMat
    );
    pipe.position.set(side * (discHalfSpacing - innerOffset), 1.3, 0);
    pipe.castShadow = true;
    group.add(pipe);
  }

  // Frame uprights
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x0b111b, roughness: 0.7, metalness: 0.3,
  });
  for (const x of [-1.3, 1.3]) {
    for (const z of [-1.1, 1.1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 3.2, 0.07),
        frameMat
      );
      post.position.set(x, 1.6, z);
      post.castShadow = true;
      group.add(post);
    }
  }

  return group;
}

function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;
  setPColor(i, COL_FALL);
  pos[i * 3]     = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;
  vel[i * 3]     = 0.06 * randn();
  vel[i * 3 + 1] = -0.25;
  vel[i * 3 + 2] = 0.06 * randn();
}

function beginOnDisc(i, whichDisc, discX, omegaDisc) {
  state[i] = 2;
  setPColor(i, COL_DISC);
  discId[i] = whichDisc;
  const dx = pos[i * 3] - discX;
  const dz = pos[i * 3 + 2];
  rOn[i] = Math.min(Math.max(0.15, Math.hypot(dx, dz)), discRadius - 0.03);
  phiOn[i] = Math.atan2(dz, dx);
  phiDot[i] = omegaDisc * 0.25;
  pos[i * 3 + 1] = discY + 0.02;
  vel[i * 3] = 0;
  vel[i * 3 + 1] = 0;
  vel[i * 3 + 2] = 0;
}

function clampBehindCone(vx, vz, coneDeg) {
  const cone = (coneDeg * Math.PI) / 180;
  const mag = Math.hypot(vx, vz) + 1e-9;
  let phi = Math.atan2(vx, -vz);
  if (phi >  cone) phi =  cone;
  if (phi < -cone) phi = -cone;
  return { vx:  mag * Math.sin(phi), vz: -mag * Math.cos(phi) };
}

function eject(i, discX, discAngle, omegaDisc, r, bladeRel) {
  state[i] = 1;
  setPColor(i, COL_FLY);

  const jitter = (jitterDeg * Math.PI / 180) * (Math.random() - 0.5);
  const bladeTheta = discAngle + bladeRel + jitter;

  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  const sgn = omegaDisc >= 0 ? 1 : -1;
  const tx = sgn * -Math.sin(bladeTheta);
  const tz = sgn *  Math.cos(bladeTheta);

  const pitch = (bladePitchDeg * Math.PI) / 180;
  let dirx = tx * Math.cos(pitch) + ux * Math.sin(pitch);
  let dirz = tz * Math.cos(pitch) + uz * Math.sin(pitch);

  const dmag = Math.hypot(dirx, dirz) + 1e-9;
  dirx /= dmag;
  dirz /= dmag;

  const rim = Math.abs(omegaDisc) * r;
  const kick = Math.max(1.0, 1.10 * rim + 0.18 * rim * randn());

  let vx = dirx * kick;
  let vz = dirz * kick;

  const outward = discX < 0 ? -1 : 1;
  vx += outward * (0.18 * kick);

  if (rearDeflector) vz = -Math.abs(vz);

  if (behindConeDeg > 0) {
    const cl = clampBehindCone(vx, vz, behindConeDeg);
    vx = cl.vx;
    vz = cl.vz;
  }

  const up = (throwUpDeg * Math.PI) / 180;
  const vy = Math.max(0.4, kick * Math.tan(up) + 0.15 * Math.random());

  vel[i * 3]     = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;
  pos[i * 3 + 1] = discY + 0.03;
}

// ----- Init -----
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(0, 8.5, -15.5);
  camera.lookAt(0, discY, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.panSpeed = 0.7;
  controls.zoomSpeed = 0.4;
  controls.minDistance = 5;
  controls.maxDistance = 45;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.target.set(0, discY + 0.4, 0);
  controls.update();

  // Lights
  scene.add(new THREE.HemisphereLight(0x9fb6d8, 0x05070a, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  scene.add(sun);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({
      color: 0x080b10, roughness: 0.95, metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid overlay
  const grid = new THREE.GridHelper(40, 40, 0x22304a, 0x131b28);
  grid.position.y = 0.005;
  grid.material.opacity = 0.4;
  grid.material.transparent = true;
  scene.add(grid);

  // Hopper structure (procedural, no GLB)
  hopperGroup = buildHopper();
  scene.add(hopperGroup);

  // Discs
  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  const discMatL = new THREE.MeshStandardMaterial({ color: 0x1a2432, roughness: 0.4, metalness: 0.5 });
  const discMatR = new THREE.MeshStandardMaterial({ color: 0x1a2432, roughness: 0.4, metalness: 0.5 });
  discL = new THREE.Mesh(discGeo, discMatL);
  discR = new THREE.Mesh(discGeo, discMatR);
  discL.castShadow = true;
  discR.castShadow = true;
  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);
  addBlades(discL, 0x19c8e6);
  addBlades(discR, 0xff7a2f);
  scene.add(discL, discR);

  // Particles (instanced)
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.55, metalness: 0.05,
    }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  particlesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(particlesMesh);

  for (let i = 0; i < MAX; i++) {
    hideInstance(i);
    particlesMesh.setColorAt(i, COL_FALL);
  }
  particlesMesh.instanceMatrix.needsUpdate = true;
  if (particlesMesh.instanceColor) particlesMesh.instanceColor.needsUpdate = true;

  if (resetBtn) resetBtn.addEventListener("click", resetSim);

  resize();
  window.__WEBDEM_OK = true;
  if (loadingEl) loadingEl.classList.add("hidden");

  animate();
}

function resize() {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ----- FPS tracking -----
let fpsAcc = 0;
let fpsCount = 0;
let fpsTimer = 0;

// ----- Main loop -----
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.02);

  // FPS
  fpsAcc += dt;
  fpsCount++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    const fps = Math.round(fpsCount / fpsAcc);
    if (statFps) statFps.textContent = fps;
    fpsAcc = 0;
    fpsCount = 0;
    fpsTimer = 0;
  }

  // Disc rotation (opposite directions)
  const omega = (rpm * 2 * Math.PI) / 60;
  const omegaL = +omega;
  const omegaR = -omega;
  discL.rotation.y += omegaL * dt;
  discR.rotation.y += omegaR * dt;

  // Emit particles
  emitAcc += pps * dt;
  while (emitAcc >= 1) {
    emitAcc -= 1;
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    const left = Math.random() < 0.5;
    const cx = left ? (leftX + innerOffset) : (rightX - innerOffset);
    const p = sampleRect(cx, 0, orificeW, orificeL);
    spawnFalling(i, p.x, feedY, p.z);
  }

  const bladeStep = (2 * Math.PI) / bladeCount;

  let activeCount = 0;
  let landedCount = 0;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    if (state[i] === 3) {
      // landed
      landedCount++;
      setInstance(i, pos[i * 3], 0.02, pos[i * 3 + 2]);
      continue;
    }

    activeCount++;

    // ON DISC
    if (state[i] === 2) {
      const which = discId[i];
      const discX = which === 0 ? leftX : rightX;
      const discAngle = which === 0 ? discL.rotation.y : discR.rotation.y;
      const omegaDisc = which === 0 ? omegaL : omegaR;

      phiDot[i] += (omegaDisc - phiDot[i]) * (angFric * dt);
      phiOn[i] += phiDot[i] * dt;
      rOn[i] = Math.min(discRadius - 0.02, rOn[i] + radialDrift * dt);

      pos[i * 3]     = discX + rOn[i] * Math.cos(phiOn[i]);
      pos[i * 3 + 1] = discY + 0.02;
      pos[i * 3 + 2] =        rOn[i] * Math.sin(phiOn[i]);

      const phiRel = wrapToPi(phiOn[i] - discAngle);
      const k = Math.round(phiRel / bladeStep);
      const bladeRel = k * bladeStep;
      const diff = wrapToPi(phiRel - bladeRel);
      const slip = Math.abs(omegaDisc - phiDot[i]);

      if ((Math.abs(diff) < bladeHitTol && slip > minSlip && rOn[i] > 0.22) || rOn[i] > releaseR) {
        eject(i, discX, discAngle, omegaDisc, rOn[i], bladeRel);
      }

      setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // FALLING / FLYING
    vel[i * 3 + 1] += g * dt;
    const damp = Math.exp(-linDrag * dt);
    vel[i * 3]     *= damp;
    vel[i * 3 + 1] *= damp;
    vel[i * 3 + 2] *= damp;

    pos[i * 3]     += vel[i * 3]     * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // pickup
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + pickupWindow) {
      const dxL = pos[i * 3] - leftX;
      const dzL = pos[i * 3 + 2];
      const dxR = pos[i * 3] - rightX;
      const dzR = pos[i * 3 + 2];
      if (Math.hypot(dxL, dzL) <= discRadius) {
        beginOnDisc(i, 0, leftX, omegaL);
      } else if (Math.hypot(dxR, dzR) <= discRadius) {
        beginOnDisc(i, 1, rightX, omegaR);
      }
    }

    // ground
    if (pos[i * 3 + 1] <= 0.02) {
      pos[i * 3 + 1] = 0.02;
      vel[i * 3] = 0;
      vel[i * 3 + 1] = 0;
      vel[i * 3 + 2] = 0;
      state[i] = 3;
      setPColor(i, COL_LAND);
    }

    setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }

  if (statActive) statActive.textContent = activeCount;
  if (statLanded) statLanded.textContent = landedCount;

  particlesMesh.instanceMatrix.needsUpdate = true;
  if (colorsDirty && particlesMesh.instanceColor) {
    particlesMesh.instanceColor.needsUpdate = true;
    colorsDirty = false;
  }
  controls.update();
  renderer.render(scene, camera);
}

// ----- Boot -----
try {
  init();
} catch (err) {
  console.error("WebDEM failed to init:", err);
  window.__WEBDEM_OK = true; // watchdog stands down — we show our own message
  if (loadingEl) {
    loadingEl.innerHTML = `<div class="wd-loading-text wd-loading-err">
      Could not start WebGL — ${err && err.message ? err.message : "unknown error"}.<br>
      Try a different browser or device.
    </div>
    <button class="wd-btn" onclick="location.reload()">Retry</button>`;
  }
}
