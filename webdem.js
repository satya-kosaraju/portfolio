import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

/**
 * WEBDEM (visual DEM-like)
 * Twin-disc spinner + hopper feed split into two rectangular orifices.
 * Not real DEM physics; uses a lightweight state model:
 * falling -> on-disc slip/drift -> blade pickup -> eject -> fly -> land.
 */

// ---------- DOM ----------
const canvas = document.getElementById("webdem-canvas");
const rpmEl = document.getElementById("rpm");
const ppsEl = document.getElementById("pps");
const rpmVal = document.getElementById("rpmVal");
const ppsVal = document.getElementById("ppsVal");
const resetBtn = document.getElementById("resetSim");

let rpm = rpmEl ? +rpmEl.value : 650;
let pps = ppsEl ? +ppsEl.value : 1200;

if (rpmVal) rpmVal.textContent = String(rpm);
if (ppsVal) ppsVal.textContent = String(pps);

if (rpmEl) rpmEl.oninput = () => { rpm = +rpmEl.value; rpmVal.textContent = String(rpm); };
if (ppsEl) ppsEl.oninput = () => { pps = +ppsEl.value; ppsVal.textContent = String(pps); };

// ---------- SIM PARAMETERS ----------
const discY = 0.60;
const discRadius = 0.95;

// you asked: “distance 0.95” meaning ±0.95 (so spacing = 1.90)
const discHalfSpacing = 0.95;
const leftX  = -discHalfSpacing;
const rightX = +discHalfSpacing;

const bladeCount = 4;

// Feed + orifices (inner side of each disc)
const feedY = discY + 0.55;
const innerOffset = Math.min(0.48, discRadius - 0.18);
const orificeW = 0.22;
const orificeL = 0.34;

// motion tuning
const g = -9.81;
const linDrag = 0.06;

const pickupWindow = 0.10;     // how close to disc plane to “stick”
const angCoupling = 2.4;       // how fast particle angular speed follows disc
const outwardRate = 0.60;      // radial drift (m/s-ish)
const releaseR = 0.86 * discRadius;

// ejection tuning (fan behind)
const bladePitchDeg = 28;      // more pitch => more radial
const throwUpDeg = 12;
const jitterDeg = 5;

// clamp to rear fan (avoid 360 pattern)
const rearFan = true;
const rearConeDeg = 55;        // smaller => tighter fan
const outwardBias = 0.25;      // push left disc left, right disc right

// ---------- PARTICLES ----------
const MAX = 50000;

// states: 0 falling, 2 on-disc, 1 flying, 3 landed
const alive = new Uint8Array(MAX);
const state = new Uint8Array(MAX);

const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);

// on-disc tracking
const discId = new Int8Array(MAX);      // 0 left, 1 right
const rOn = new Float32Array(MAX);
const phiOn = new Float32Array(MAX);    // world polar angle around disc center
const phiDot = new Float32Array(MAX);   // particle angular speed
const bladeIdx = new Int8Array(MAX);    // which blade “captured” (-1 none)

// ---------- THREE ----------
let renderer, scene, camera, controls, clock;
let discL, discR, hopper;
let particlesMesh;
const tmp = new THREE.Object3D();
let cursor = 0;

// ---------- helpers ----------
function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function wrapPi(a) {
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
  bladeIdx.fill(255); // 255 means -1 for Uint8 storage look; we’ll set explicitly below
  cursor = 0;
  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;
}

function addBlades(disc, color) {
  const group = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(0.70, 0.06, 0.12);
  const bladeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });

  for (let k = 0; k < bladeCount; k++) {
    const a = k * (2 * Math.PI / bladeCount);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
    blade.rotation.y = a;
    group.add(blade);
  }
  disc.add(group);
}

function clampToRearFan(vx, vz, coneDeg) {
  // “rear” = negative Z
  const cone = (coneDeg * Math.PI) / 180;
  const mag = Math.hypot(vx, vz) + 1e-9;

  // angle around rear axis
  let phi = Math.atan2(vx, -vz);
  phi = Math.max(-cone, Math.min(cone, phi));

  return { vx: mag * Math.sin(phi), vz: -mag * Math.cos(phi) };
}

// ---------- spawning ----------
function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;
  bladeIdx[i] = -1;

  pos[i * 3 + 0] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  vel[i * 3 + 0] = 0.05 * randn();
  vel[i * 3 + 1] = -0.20;
  vel[i * 3 + 2] = 0.05 * randn();
}

function beginOnDisc(i, which, discX, omegaDisc) {
  state[i] = 2;
  discId[i] = which;

  const dx = pos[i * 3 + 0] - discX;
  const dz = pos[i * 3 + 2] - 0;

  rOn[i] = Math.min(Math.max(0.18, Math.hypot(dx, dz)), discRadius - 0.03);
  phiOn[i] = Math.atan2(dz, dx);

  phiDot[i] = omegaDisc * 0.25; // start with slip
  bladeIdx[i] = -1;

  pos[i * 3 + 1] = discY + 0.02;
  vel[i * 3 + 0] = 0;
  vel[i * 3 + 1] = 0;
  vel[i * 3 + 2] = 0;
}

function eject(i, discX, discAngle, omegaDisc, r, bladeRel) {
  state[i] = 1;

  const jitter = (jitterDeg * Math.PI / 180) * (Math.random() - 0.5);
  const theta = discAngle + bladeRel + jitter;

  // tangent (spin direction)
  const sgn = omegaDisc >= 0 ? 1 : -1;
  const tx = sgn * (-Math.sin(theta));
  const tz = sgn * ( Math.cos(theta));

  // radial
  const rx = Math.cos(theta);
  const rz = Math.sin(theta);

  // combine by blade pitch
  const pitch = bladePitchDeg * Math.PI / 180;
  let dirx = tx * Math.cos(pitch) + rx * Math.sin(pitch);
  let dirz = tz * Math.cos(pitch) + rz * Math.sin(pitch);

  const dm = Math.hypot(dirx, dirz) + 1e-9;
  dirx /= dm; dirz /= dm;

  // speed ~ rim speed
  const rim = Math.abs(omegaDisc) * r;
  const speed = Math.max(1.0, 1.15 * rim + 0.12 * rim * randn());

  let vx = dirx * speed;
  let vz = dirz * speed;

  // push outward for each disc
  vx += (discX < 0 ? -1 : +1) * outwardBias * speed;

  // clamp to rear fan to avoid 360 ring
  if (rearFan) {
    // also force rearward
    vz = -Math.abs(vz);
    const c = clampToRearFan(vx, vz, rearConeDeg);
    vx = c.vx; vz = c.vz;
  }

  // add vertical component
  const up = throwUpDeg * Math.PI / 180;
  const vy = Math.max(0.35, speed * Math.tan(up) + 0.10 * Math.random());

  vel[i * 3 + 0] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;

  pos[i * 3 + 1] = discY + 0.03;
}

// ---------- init scene ----------
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(0, 7.5, -14.0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.panSpeed = 0.8;
  controls.minDistance = 3;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 1.0, 0);
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // hopper box
  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.65 })
  );
  hopper.position.set(0, 2.35, 0);
  scene.add(hopper);

  // discs
  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.45 }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45 }));
  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);
  addBlades(discL, 0x93c5fd);
  addBlades(discR, 0x7dd3fc);
  scene.add(discL, discR);

  // particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff, roughness: 0.35 }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  scene.add(particlesMesh);

  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;

  if (resetBtn) resetBtn.onclick = resetSim;

  resetSim();
  resize();
  animate();
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

// ---------- loop ----------
function animate() {
  requestAnimationFrame(animate);

  // handle iframe / responsive sizing
  const pr = renderer.getPixelRatio();
  const wantW = Math.floor(canvas.clientWidth * pr);
  const wantH = Math.floor(canvas.clientHeight * pr);
  if (canvas.width !== wantW || canvas.height !== wantH) resize();

  const dt = Math.min(clock.getDelta(), 0.02);

  // disc angular speeds (opposite)
  const omega = (rpm * 2 * Math.PI) / 60;
  const omegaL = +omega;
  const omegaR = -omega;

  discL.rotation.y += omegaL * dt;
  discR.rotation.y += omegaR * dt;

  // split feed (rect orifice above inner side)
  const emit = Math.floor(pps * dt);
  const emitL = Math.floor(emit / 2);
  const emitR = emit - emitL;

  const feedL = { x: leftX + innerOffset, z: 0 };
  const feedR = { x: rightX - innerOffset, z: 0 };

  for (let n = 0; n < emitL; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(feedL.x, feedL.z, orificeW, orificeL);
    spawnFalling(i, p.x, feedY, p.z);
  }
  for (let n = 0; n < emitR; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(feedR.x, feedR.z, orificeW, orificeL);
    spawnFalling(i, p.x, feedY, p.z);
  }

  const bladeStep = (2 * Math.PI) / bladeCount;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    // landed: keep it
    if (state[i] === 3) {
      setInstance(i, pos[i * 3 + 0], 0.02, pos[i * 3 + 2]);
      continue;
    }

    // on-disc: slip + drift -> eject
    if (state[i] === 2) {
      const which = discId[i];
      const discX = which === 0 ? leftX : rightX;
      const discAngle = which === 0 ? discL.rotation.y : discR.rotation.y;
      const omegaDisc = which === 0 ? omegaL : omegaR;

      // couple angular speed toward disc speed
      phiDot[i] += (omegaDisc - phiDot[i]) * (angCoupling * dt);
      phiOn[i] += phiDot[i] * dt;

      // drift outward
      rOn[i] = Math.min(discRadius - 0.02, rOn[i] + outwardRate * dt);

      // current position on disc
      pos[i * 3 + 0] = discX + rOn[i] * Math.cos(phiOn[i]);
      pos[i * 3 + 1] = discY + 0.02;
      pos[i * 3 + 2] = rOn[i] * Math.sin(phiOn[i]);

      // choose nearest blade in disc frame
      const phiRel = wrapPi(phiOn[i] - discAngle);
      const k = Math.round(phiRel / bladeStep);
      const bladeRel = k * bladeStep;
      const diff = Math.abs(wrapPi(phiRel - bladeRel));

      // “capture” window: only when close to blade
      if (diff < 0.12 && rOn[i] > 0.25) bladeIdx[i] = k;

      // eject after reaching outer radius (or captured and close to release)
      if (rOn[i] > releaseR || (bladeIdx[i] !== -1 && rOn[i] > 0.75 * discRadius)) {
        eject(i, discX, discAngle, omegaDisc, rOn[i], bladeRel);
      }

      setInstance(i, pos[i * 3 + 0], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // falling/flying integration
    vel[i * 3 + 1] += g * dt;

    const damp = Math.exp(-linDrag * dt);
    vel[i * 3 + 0] *= damp;
    vel[i * 3 + 1] *= damp;
    vel[i * 3 + 2] *= damp;

    pos[i * 3 + 0] += vel[i * 3 + 0] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // pickup onto disc
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + pickupWindow) {
      const dxL = pos[i * 3 + 0] - leftX;
      const dzL = pos[i * 3 + 2];
      const dxR = pos[i * 3 + 0] - rightX;
      const dzR = pos[i * 3 + 2];

      if (Math.hypot(dxL, dzL) <= discRadius) beginOnDisc(i, 0, leftX, omegaL);
      else if (Math.hypot(dxR, dzR) <= discRadius) beginOnDisc(i, 1, rightX, omegaR);
    }

    // ground -> land
    if (pos[i * 3 + 1] <= 0.02) {
      pos[i * 3 + 1] = 0.02;
      vel[i * 3 + 0] = 0;
      vel[i * 3 + 1] = 0;
      vel[i * 3 + 2] = 0;
      state[i] = 3;
      setInstance(i, pos[i * 3 + 0], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // once below disc plane it’s flying
    if (state[i] === 0 && pos[i * 3 + 1] < discY - 0.05) state[i] = 1;

    setInstance(i, pos[i * 3 + 0], pos[i * 3 + 1], pos[i * 3 + 2]);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

init();
