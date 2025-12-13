import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

/**
 * WEBDEM Twin-Disc (visual, not full DEM)
 * - Two discs rotating opposite directions
 * - 4 blades per disc (visual + “hit window”)
 * - Particles drop from two rectangular orifices (inner side)
 * - Particle “slip on disc” then blade-hit eject to ground pattern
 * - OrbitControls: rotate/pan/zoom like EDEM
 */

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

if (rpmEl) rpmEl.oninput = () => { rpm = +rpmEl.value; rpmVal.textContent = rpm; };
if (ppsEl) ppsEl.oninput = () => { pps = +ppsEl.value; ppsVal.textContent = pps; };

// ===== Geometry/physics knobs =====
const DISC_Y = 0.60;
const DISC_R = 0.95;
const DISC_HALF_SPACING = 0.95;      // <-- you asked “distance 0.95”
const LEFT_X = -DISC_HALF_SPACING;
const RIGHT_X = +DISC_HALF_SPACING;

const BLADE_COUNT = 4;

// Orifices: rectangular, placed above inner side of each disc
const FEED_Y = DISC_Y + 0.55;
const INNER_OFFSET = Math.min(0.48, DISC_R - 0.18);
const ORIF_W = 0.22;
const ORIF_L = 0.34;

// Contact + slip-on-disc model
const PICKUP_WINDOW = 0.12;
const ANG_FRICTION = 2.6;         // larger => faster locking to disc speed
const RADIAL_DRIFT = 0.55;        // outward drift
const RELEASE_R = 0.86 * DISC_R;

// Blade “hit” model
const BLADE_HIT_TOL = 0.10;       // rad window around blade
const MIN_SLIP = 0.8;             // needed to consider a blade hit

// Ejection model
const BLADE_PITCH_DEG = 32;       // 0=tangential 90=radial
const THROW_UP_DEG = 14;
const JITTER_DEG = 6;

// To avoid 360° spray (rear deflector)
const REAR_DEFLECTOR = true;      // forces vz backward
const BEHIND_CONE_DEG = 55;       // smaller cone => tighter fan

// Flight
const G = -9.81;
const LIN_DRAG = 0.06;

// Particles
const MAX = 40000;                // keep stable on laptops (you can raise later)
const SPHERE_R = 0.028;

// States:
// 0 falling, 2 on-disc, 1 flying, 3 landed
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);
const state = new Uint8Array(MAX);

// On-disc variables
const discId = new Int8Array(MAX);     // 0 left, 1 right
const rOn = new Float32Array(MAX);
const phiOn = new Float32Array(MAX);
const phiDot = new Float32Array(MAX);

// ===== Three.js globals =====
let renderer, scene, camera, clock, controls;
let discL, discR, particlesMesh;
let cursor = 0;

const tmpObj = new THREE.Object3D();

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
  tmpObj.position.set(1e6, 1e6, 1e6);
  tmpObj.scale.setScalar(0.001);
  tmpObj.updateMatrix();
  particlesMesh.setMatrixAt(i, tmpObj.matrix);
}
function setInstance(i, x, y, z) {
  tmpObj.position.set(x, y, z);
  tmpObj.scale.setScalar(1);
  tmpObj.updateMatrix();
  particlesMesh.setMatrixAt(i, tmpObj.matrix);
}

function resetSim() {
  alive.fill(0);
  state.fill(0);
  cursor = 0;
  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;
}

// ===== Visual build =====
function addBlades(disc, color) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.70, 0.06, 0.12);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });

  for (let k = 0; k < BLADE_COUNT; k++) {
    const a = k * (2 * Math.PI / BLADE_COUNT);
    const blade = new THREE.Mesh(geo, mat);
    blade.position.set(Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
    blade.rotation.y = a;
    group.add(blade);
  }
  disc.add(group);
}

function makeOrifice(w, l, thickness, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, thickness, l),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 })
  );
  mesh.position.set(x, y, z);
  return mesh;
}

function makeSDivider(depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.14, -0.22);
  shape.bezierCurveTo(0.14, -0.22, 0.14, -0.06, 0.00, 0.00);
  shape.bezierCurveTo(-0.14, 0.06, -0.14, 0.22, 0.14, 0.22);

  const extrude = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  extrude.translate(0, 0, -depth / 2);

  const mesh = new THREE.Mesh(
    extrude,
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.65 })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(1.3, 1.0, 1.0);
  return mesh;
}

// ===== Particle state transitions =====
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
  const dz = pos[i * 3 + 2];

  rOn[i] = Math.min(Math.max(0.15, Math.hypot(dx, dz)), DISC_R - 0.03);
  phiOn[i] = Math.atan2(dz, dx);

  // start slower than disc then “locks”
  phiDot[i] = omegaDisc * 0.25;

  pos[i * 3 + 1] = DISC_Y + 0.02;
  vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
}

function clampBehindCone(vx, vz, coneDeg) {
  const cone = (coneDeg * Math.PI) / 180;
  const mag = Math.hypot(vx, vz) + 1e-9;

  // phi=0 => straight behind (-Z)
  let phi = Math.atan2(vx, -vz);
  phi = Math.max(-cone, Math.min(cone, phi));

  return { vx: mag * Math.sin(phi), vz: -mag * Math.cos(phi) };
}

function eject(i, discX, discAngle, omegaDisc, r, bladeRel) {
  state[i] = 1;

  const jitter = (JITTER_DEG * Math.PI / 180) * (Math.random() - 0.5);
  const bladeTheta = discAngle + bladeRel + jitter;

  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  // tangent direction depends on spin direction
  const sgn = omegaDisc >= 0 ? 1 : -1;
  const tx = sgn * (-Math.sin(bladeTheta));
  const tz = sgn * ( Math.cos(bladeTheta));

  // mix tangent/radial by pitch
  const pitch = BLADE_PITCH_DEG * Math.PI / 180;
  let dirx = tx * Math.cos(pitch) + ux * Math.sin(pitch);
  let dirz = tz * Math.cos(pitch) + uz * Math.sin(pitch);

  const dmag = Math.hypot(dirx, dirz) + 1e-9;
  dirx /= dmag; dirz /= dmag;

  const rim = Math.abs(omegaDisc) * r;
  const kick = Math.max(1.0, 1.10 * rim + 0.18 * rim * randn());

  let vx = dirx * kick;
  let vz = dirz * kick;

  // slight bias outward for each disc
  const outward = discX < 0 ? -1 : +1;
  vx += outward * (0.18 * kick);

  if (REAR_DEFLECTOR) vz = -Math.abs(vz);

  // tighten to rear cone
  const cl = clampBehindCone(vx, vz, BEHIND_CONE_DEG);
  vx = cl.vx; vz = cl.vz;

  const up = THROW_UP_DEG * Math.PI / 180;
  const vy = Math.max(0.4, kick * Math.tan(up) + 0.15 * Math.random());

  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;

  pos[i * 3 + 1] = DISC_Y + 0.03;
}

// ===== Init scene =====
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(0, 9.0, -17.0);
  camera.lookAt(0, 1, 0);

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

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // hopper block (visual)
  const hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 2.35, 0);
  scene.add(hopper);

  // discs
  const discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, 0.15, 48);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));
  discL.position.set(LEFT_X, DISC_Y, 0);
  discR.position.set(RIGHT_X, DISC_Y, 0);
  addBlades(discL, 0x93c5fd);
  addBlades(discR, 0x7dd3fc);
  scene.add(discL, discR);

  // two rectangular orifices on inner side
  scene.add(makeOrifice(ORIF_W, ORIF_L, 0.05, LEFT_X + INNER_OFFSET, FEED_Y, 0));
  scene.add(makeOrifice(ORIF_W, ORIF_L, 0.05, RIGHT_X - INNER_OFFSET, FEED_Y, 0));

  // S-divider (visual)
  const sDiv = makeSDivider(0.18);
  sDiv.position.set(0, FEED_Y + 0.03, 0);
  scene.add(sDiv);

  // particles (instanced spheres)
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(SPHERE_R, 6, 6),
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
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ===== Main loop =====
function animate() {
  requestAnimationFrame(animate);

  // keep responsive even inside iframe
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

  // spawn 50/50 from split feed
  const emit = Math.floor(pps * dt);
  const emitLeft = Math.floor(emit / 2);
  const emitRight = emit - emitLeft;

  const centerL = { x: LEFT_X + INNER_OFFSET, z: 0 };
  const centerR = { x: RIGHT_X - INNER_OFFSET, z: 0 };

  for (let n = 0; n < emitLeft; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerL.x, centerL.z, ORIF_W, ORIF_L);
    spawnFalling(i, p.x, FEED_Y, p.z);
  }
  for (let n = 0; n < emitRight; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerR.x, centerR.z, ORIF_W, ORIF_L);
    spawnFalling(i, p.x, FEED_Y, p.z);
  }

  const bladeStep = (2 * Math.PI) / BLADE_COUNT;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    // landed: keep as pattern
    if (state[i] === 3) {
      setInstance(i, pos[i * 3], 0.02, pos[i * 3 + 2]);
      continue;
    }

    // on-disc: slip + drift, blade strike -> eject
    if (state[i] === 2) {
      const which = discId[i];
      const discX = which === 0 ? LEFT_X : RIGHT_X;
      const discAngle = which === 0 ? discL.rotation.y : discR.rotation.y;
      const omegaDisc = which === 0 ? omegaL : omegaR;

      // angular velocity ramps toward disc ω
      phiDot[i] += (omegaDisc - phiDot[i]) * (ANG_FRICTION * dt);
      phiOn[i] += phiDot[i] * dt;

      // drift outward
      rOn[i] = Math.min(DISC_R - 0.02, rOn[i] + RADIAL_DRIFT * dt);

      // update position on disc
      pos[i * 3] = discX + rOn[i] * Math.cos(phiOn[i]);
      pos[i * 3 + 1] = DISC_Y + 0.02;
      pos[i * 3 + 2] = rOn[i] * Math.sin(phiOn[i]);

      // blade hit window in disc frame
      const phiRel = wrapToPi(phiOn[i] - discAngle);
      const k = Math.round(phiRel / bladeStep);
      const bladeRel = k * bladeStep;
      const diff = wrapToPi(phiRel - bladeRel);

      const slip = Math.abs(omegaDisc - phiDot[i]);

      if ((Math.abs(diff) < BLADE_HIT_TOL && slip > MIN_SLIP && rOn[i] > 0.22) || (rOn[i] > RELEASE_R)) {
        eject(i, discX, discAngle, omegaDisc, rOn[i], bladeRel);
      }

      setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // falling/flying integration
    vel[i * 3 + 1] += G * dt;

    const damp = Math.exp(-LIN_DRAG * dt);
    vel[i * 3] *= damp;
    vel[i * 3 + 1] *= damp;
    vel[i * 3 + 2] *= damp;

    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // pickup: falling touches disc
    if (state[i] === 0 && pos[i * 3 + 1] <= DISC_Y + PICKUP_WINDOW) {
      const dxL = pos[i * 3] - LEFT_X;
      const dzL = pos[i * 3 + 2];
      const dxR = pos[i * 3] - RIGHT_X;
      const dzR = pos[i * 3 + 2];

      if (Math.hypot(dxL, dzL) <= DISC_R) beginOnDisc(i, 0, LEFT_X, discL.rotation.y, omegaL);
      else if (Math.hypot(dxR, dzR) <= DISC_R) beginOnDisc(i, 1, RIGHT_X, discR.rotation.y, omegaR);
    }

    // land
    if (pos[i * 3 + 1] <= 0.02) {
      pos[i * 3 + 1] = 0.02;
      vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
      state[i] = 3;
      setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // mark flying
    if (state[i] === 0 && pos[i * 3 + 1] < DISC_Y - 0.05) state[i] = 1;

    setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  if (controls) controls.update();
  renderer.render(scene, camera);
}

init();
