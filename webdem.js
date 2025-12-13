import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

console.log("WEBDEM v1.10 (slip->blade hit->eject->land pattern)");

// ===== DOM =====
const canvas = document.getElementById("webdem-canvas");
const rpmEl = document.getElementById("rpm");
const ppsEl = document.getElementById("pps");
const rpmVal = document.getElementById("rpmVal");
const ppsVal = document.getElementById("ppsVal");
const resetBtn = document.getElementById("resetSim");

let rpm = rpmEl ? +rpmEl.value : 650;
let pps = ppsEl ? +ppsEl.value : 1200;

if (rpmVal) rpmVal.textContent = rpm;
if (ppsVal) ppsVal.textContent = pps;
if (rpmEl) rpmEl.oninput = () => (rpmVal.textContent = (rpm = +rpmEl.value));
if (ppsEl) ppsEl.oninput = () => (ppsVal.textContent = (pps = +ppsEl.value));

// ===== Params =====
// geometry
const discY = 0.60;
const discRadius = 0.95;
const bladeCount = 4;

// REQUEST: distance ±0.95 => spacing 1.90
const discSpacing = 1.90;
const leftX = -discSpacing / 2;
const rightX = +discSpacing / 2;

// split orifices (rectangles) above inner side of each disc
const feedY = discY + 0.55;
const innerOffset = Math.min(0.48, discRadius - 0.18);
const orificeW = 0.22;
const orificeLen = 0.34;

// "more realistic" tuning
const pickupWindow = 0.12;       // how close to disc to start contact
const radialDrift = 0.55;        // outward drift along disc
const angFric = 2.6;             // angular velocity ramps to disc ω (lower => more slip)
const bladeHitTol = 0.10;        // rad window for blade strike
const minSlip = 0.8;             // rad/s slip needed for a "hit"
const releaseR = 0.86 * discRadius;

// blade physics
const bladePitchDeg = 32;        // 0=tangential, 90=radial
const throwUpDeg = 14;           // vertical lift angle
const jitterDeg = 6;             // ejection direction jitter

// "no 360" deflector (rear-only)
const enforceBehind = true;
const behindConeDeg = 55;        // smaller => tighter fan
const rearDeflector = true;      // clamps forward throws to rear

// drag + gravity
const g = -9.81;
const linDrag = 0.06;            // per second (air drag-ish)

// particles
const MAX = 65000;

// states:
// 0 falling
// 2 on-disc (slip + drift)
// 1 flying
// 3 landed (stays)
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);
const state = new Uint8Array(MAX);

// on-disc variables
const discId = new Int8Array(MAX);     // 0 left, 1 right
const rOn = new Float32Array(MAX);
const phiOn = new Float32Array(MAX);   // world polar angle around disc center
const phiDot = new Float32Array(MAX);  // particle angular speed (slip)

// ===== Three.js =====
let renderer, scene, camera, clock;
let discL, discR, hopper, orificeMeshL, orificeMeshR, sDivider;
let particlesMesh;
const tmp = new THREE.Object3D();
let cursor = 0;

function wrapToPi(a) {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}
function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sampleRect(cx, cz, w, l) {
  return { x: cx + (Math.random() - 0.5) * w, z: cz + (Math.random() - 0.5) * l };
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
  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;
}

// ===== Visual parts =====
function addBlades(disc, color) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.70, 0.06, 0.12);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });

  for (let k = 0; k < bladeCount; k++) {
    const a = k * (2 * Math.PI / bladeCount);
    const blade = new THREE.Mesh(geo, mat);
    blade.position.set(Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
    blade.rotation.y = a;
    group.add(blade);
  }
  disc.add(group);
}
function makeOrificeMesh(w, l, thickness, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, thickness, l),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
  );
}
function makeSDivider(depth, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.14, -0.22);
  shape.bezierCurveTo(0.14, -0.22, 0.14, -0.06, 0.00, 0.00);
  shape.bezierCurveTo(-0.14, 0.06, -0.14, 0.22, 0.14, 0.22);

  const extrude = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  extrude.translate(0, 0, -depth / 2);

  const mesh = new THREE.Mesh(
    extrude,
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(1.3, 1.0, 1.0);
  return mesh;
}

// ===== Spawn/Transitions =====
function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;

  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  vel[i * 3] = 0.06 * randn();
  vel[i * 3 + 1] = -0.25;
  vel[i * 3 + 2] = 0.06 * randn();
}

function beginOnDisc(i, whichDisc, discX, discAngle, omegaDisc) {
  state[i] = 2;
  discId[i] = whichDisc;

  const dx = pos[i * 3] - discX;
  const dz = pos[i * 3 + 2] - 0;

  rOn[i] = Math.min(Math.max(0.15, Math.hypot(dx, dz)), discRadius - 0.03);
  phiOn[i] = Math.atan2(dz, dx);

  // start with slip (slower than disc), ramp up via angFric
  phiDot[i] = omegaDisc * 0.25;

  pos[i * 3 + 1] = discY + 0.02;
  vel[i * 3] = 0;
  vel[i * 3 + 1] = 0;
  vel[i * 3 + 2] = 0;
}

function clampBehindCone(vx, vz, coneDeg) {
  const cone = (coneDeg * Math.PI) / 180;
  const mag = Math.hypot(vx, vz) + 1e-9;

  // phi=0 => straight behind (-Z)
  let phi = Math.atan2(vx, -vz);
  if (phi > cone) phi = cone;
  if (phi < -cone) phi = -cone;

  return {
    vx: mag * Math.sin(phi),
    vz: -mag * Math.cos(phi),
  };
}

function eject(i, discX, discAngle, omegaDisc, r, bladeRel) {
  state[i] = 1;

  // blade world angle
  const jitter = (jitterDeg * Math.PI / 180) * (Math.random() - 0.5);
  const bladeTheta = discAngle + bladeRel + jitter;

  // unit vectors at bladeTheta
  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  // tangent direction depends on spin direction
  const sgn = omegaDisc >= 0 ? 1 : -1;
  const tx = sgn * (-Math.sin(bladeTheta));
  const tz = sgn * ( Math.cos(bladeTheta));

  // direction from blade pitch
  const pitch = bladePitchDeg * Math.PI / 180;
  let dirx = tx * Math.cos(pitch) + ux * Math.sin(pitch);
  let dirz = tz * Math.cos(pitch) + uz * Math.sin(pitch);

  // normalize
  const dmag = Math.hypot(dirx, dirz) + 1e-9;
  dirx /= dmag; dirz /= dmag;

  // speed ~ rim speed + blade kick
  const rim = Math.abs(omegaDisc) * r;
  const kick = Math.max(1.0, 1.10 * rim + 0.18 * rim * randn());

  let vx = dirx * kick;
  let vz = dirz * kick;

  // twin-disc outward bias (slight)
  const outward = discX < 0 ? -1 : +1;
  vx += outward * (0.18 * kick);

  // rear deflector: kill forward velocity
  if (rearDeflector) vz = -Math.abs(vz);

  // enforce cone behind
  if (enforceBehind) {
    const cl = clampBehindCone(vx, vz, behindConeDeg);
    vx = cl.vx; vz = cl.vz;
  }

  const up = throwUpDeg * Math.PI / 180;
  const vy = Math.max(0.4, kick * Math.tan(up) + 0.15 * Math.random());

  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;

  pos[i * 3 + 1] = discY + 0.03;
}

// ===== Init =====
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(0, 9.0, -17.0);
  camera.lookAt(0, 1, 0);

  // --- EDEM-like navigation (mouse rotate/pan/zoom) ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

controls.enablePan = true;
controls.panSpeed = 0.8;

controls.minDistance = 3;
controls.maxDistance = 80;

controls.maxPolarAngle = Math.PI * 0.49; // prevent going under the ground
controls.target.set(0, 1.0, 0);
controls.update();

// Make controls accessible in animate()
window.__controls = controls;


  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 2.35, 0);
  scene.add(hopper);

  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));
  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);
  addBlades(discL, 0x93c5fd);
  addBlades(discR, 0x7dd3fc);
  scene.add(discL, discR);

  // rectangular split orifices (inner side)
  orificeMeshL = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0f172a);
  orificeMeshR = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0f172a);
  orificeMeshL.position.set(leftX + innerOffset, feedY, 0);
  orificeMeshR.position.set(rightX - innerOffset, feedY, 0);
  scene.add(orificeMeshL, orificeMeshR);

  // S divider (visual)
  sDivider = makeSDivider(0.18, 0x111827);
  sDivider.position.set(0, feedY + 0.03, 0);
  scene.add(sDivider);

  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  scene.add(particlesMesh);
  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;

  if (resetBtn) resetBtn.onclick = resetSim;

  resize();
  animate();
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ===== Loop =====
function animate() {
  requestAnimationFrame(animate);

  // auto-resize if iframe changes
  if (canvas.width !== Math.floor(canvas.clientWidth * renderer.getPixelRatio()) ||
      canvas.height !== Math.floor(canvas.clientHeight * renderer.getPixelRatio())) {
    resize();
  }

  const dt = Math.min(clock.getDelta(), 0.02);

  // disc ω (opposite rotation)
  const omega = (rpm * 2 * Math.PI) / 60;
  const omegaL = +omega;
  const omegaR = -omega;

  discL.rotation.y += omegaL * dt;
  discR.rotation.y += omegaR * dt;

  // emit 50/50 from split feed
  const emit = Math.floor(pps * dt);
  const emitLeft = Math.floor(emit / 2);
  const emitRight = emit - emitLeft;

  const centerL = { x: leftX + innerOffset, z: 0 };
  const centerR = { x: rightX - innerOffset, z: 0 };

  for (let n = 0; n < emitLeft; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerL.x, centerL.z, orificeW, orificeLen);
    spawnFalling(i, p.x, feedY, p.z);
  }
  for (let n = 0; n < emitRight; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerR.x, centerR.z, orificeW, orificeLen);
    spawnFalling(i, p.x, feedY, p.z);
  }

  const bladeStep = (2 * Math.PI) / bladeCount;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    // LAND: stay (pattern visualization)
    if (state[i] === 3) {
      setInstance(i, pos[i * 3], 0.02, pos[i * 3 + 2]);
      continue;
    }

    // ON DISC: slip -> blade catches -> eject
    if (state[i] === 2) {
      const which = discId[i];
      const discX = which === 0 ? leftX : rightX;
      const discAngle = which === 0 ? discL.rotation.y : discR.rotation.y;
      const omegaDisc = which === 0 ? omegaL : omegaR;

      // ramp angular speed toward ω (slip model)
      phiDot[i] += (omegaDisc - phiDot[i]) * (angFric * dt);
      phiOn[i] += phiDot[i] * dt;

      // drift outward
      rOn[i] = Math.min(discRadius - 0.02, rOn[i] + radialDrift * dt);

      // position on disc
      pos[i * 3] = discX + rOn[i] * Math.cos(phiOn[i]);
      pos[i * 3 + 1] = discY + 0.02;
      pos[i * 3 + 2] = 0 + rOn[i] * Math.sin(phiOn[i]);

      // blade hit detection (disc frame)
      const phiRel = wrapToPi(phiOn[i] - discAngle);
      const k = Math.round(phiRel / bladeStep);
      const bladeRel = k * bladeStep;
      const diff = wrapToPi(phiRel - bladeRel);

      const slip = Math.abs(omegaDisc - phiDot[i]);

      // eject if blade catches OR reached release radius
      if ((Math.abs(diff) < bladeHitTol && slip > minSlip && rOn[i] > 0.22) || rOn[i] > releaseR) {
        eject(i, discX, discAngle, omegaDisc, rOn[i], bladeRel);
      }

      setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // FALLING / FLYING integration
    vel[i * 3 + 1] += g * dt;

    const damp = Math.exp(-linDrag * dt);
    vel[i * 3] *= damp;
    vel[i * 3 + 1] *= damp;
    vel[i * 3 + 2] *= damp;

    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // pickup: falling touches disc -> on-disc state (slip)
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + pickupWindow) {
      const dxL = pos[i * 3] - leftX;
      const dzL = pos[i * 3 + 2] - 0;
      const dxR = pos[i * 3] - rightX;
      const dzR = pos[i * 3 + 2] - 0;

      if (Math.hypot(dxL, dzL) <= discRadius) {
        beginOnDisc(i, 0, leftX, discL.rotation.y, omegaL);
      } else if (Math.hypot(dxR, dzR) <= discRadius) {
        beginOnDisc(i, 1, rightX, discR.rotation.y, omegaR);
      }
    }

    // ground contact -> land & stay (realistic pattern)
    if (pos[i * 3 + 1] <= 0.02) {
      pos[i * 3 + 1] = 0.02;
      vel[i * 3] = 0;
      vel[i * 3 + 1] = 0;
      vel[i * 3 + 2] = 0;
      state[i] = 3;
      setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // once it's in flight
    if (state[i] === 0 && pos[i * 3 + 1] < discY - 0.05) state[i] = 1;

    setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  if (controls) controls.update();
  renderer.render(scene, camera);
}

init();
