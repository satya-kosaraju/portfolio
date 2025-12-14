import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

console.log("WEBDEM (twin-disc + CAD) loaded");

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

// ===== Params (edit these) =====
const discY = 0.60;
const discRadius = 0.95;

// distance = ±0.95  => left = -0.95, right = +0.95
const discHalfSpacing = 0.95;
const leftX = -discHalfSpacing;
const rightX = +discHalfSpacing;

const bladeCount = 4;
const feedY = discY + 0.55;

// orifice rectangles (inner side)
const innerOffset = Math.min(0.48, discRadius - 0.18);
const orificeW = 0.22;
const orificeL = 0.34;

// motion tuning
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

// rear-only fan (prevents 360°)
const rearDeflector = true;
const behindConeDeg = 55;

// particles
const MAX = 60000;

// CAD
const CAD_PATH = "spreader.glb"; // <— change if your filename differs
const CAD_SCALE = 1.0; // <— adjust if model too big/small (try 0.001 or 0.01 if huge)
const CAD_POS = new THREE.Vector3(0, 0, 0);
const CAD_ROT_Y = 0; // radians (if needed)

// Optional: if you know exact mesh names inside GLB, put them here:
const CAD_LEFT_DISC_NAME_HINTS = ["left", "disc", "disk"];
const CAD_RIGHT_DISC_NAME_HINTS = ["right", "disc", "disk"];

// ===== Particle state =====
// states: 0 falling, 2 on-disc, 1 flying, 3 landed
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);
const state = new Uint8Array(MAX);
const discId = new Int8Array(MAX);

const rOn = new Float32Array(MAX);
const phiOn = new Float32Array(MAX);
const phiDot = new Float32Array(MAX);

let cursor = 0;
let emitAcc = 0;

// ===== Three.js =====
let renderer, scene, camera, clock, controls;
let particlesMesh;

let discL_proc = null;
let discR_proc = null;

// CAD references:
let cadRoot = null;
let cadLeftDisc = null;
let cadRightDisc = null;

const tmp = new THREE.Object3D();

// ===== Utils =====
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
  emitAcc = 0;
  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;
}

// ===== Procedural fallback discs (if CAD disc meshes not found) =====
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

function buildProceduralDiscs() {
  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  discL_proc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb }));
  discR_proc = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));

  discL_proc.position.set(leftX, discY, 0);
  discR_proc.position.set(rightX, discY, 0);

  addBlades(discL_proc, 0x93c5fd);
  addBlades(discR_proc, 0x7dd3fc);

  scene.add(discL_proc, discR_proc);
}

// ===== DEM-like physics =====
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

function beginOnDisc(i, whichDisc, discX, omegaDisc) {
  state[i] = 2;
  discId[i] = whichDisc;

  const dx = pos[i * 3] - discX;
  const dz = pos[i * 3 + 2];

  rOn[i] = Math.min(Math.max(0.15, Math.hypot(dx, dz)), discRadius - 0.03);
  phiOn[i] = Math.atan2(dz, dx);

  // slip: starts slower
  phiDot[i] = omegaDisc * 0.25;

  pos[i * 3 + 1] = discY + 0.02;
  vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
}

function clampBehindCone(vx, vz, coneDeg) {
  const cone = (coneDeg * Math.PI) / 180;
  const mag = Math.hypot(vx, vz) + 1e-9;

  // phi=0 => straight behind (-Z)
  let phi = Math.atan2(vx, -vz);
  if (phi > cone) phi = cone;
  if (phi < -cone) phi = -cone;

  return { vx: mag * Math.sin(phi), vz: -mag * Math.cos(phi) };
}

function eject(i, discX, discAngle, omegaDisc, r, bladeRel) {
  state[i] = 1;

  const jitter = (jitterDeg * Math.PI / 180) * (Math.random() - 0.5);
  const bladeTheta = discAngle + bladeRel + jitter;

  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  const sgn = omegaDisc >= 0 ? 1 : -1;
  const tx = sgn * (-Math.sin(bladeTheta));
  const tz = sgn * ( Math.cos(bladeTheta));

  const pitch = bladePitchDeg * Math.PI / 180;
  let dirx = tx * Math.cos(pitch) + ux * Math.sin(pitch);
  let dirz = tz * Math.cos(pitch) + uz * Math.sin(pitch);

  const dmag = Math.hypot(dirx, dirz) + 1e-9;
  dirx /= dmag; dirz /= dmag;

  const rim = Math.abs(omegaDisc) * r;
  const kick = Math.max(1.0, 1.10 * rim + 0.18 * rim * randn());

  let vx = dirx * kick;
  let vz = dirz * kick;

  // tiny outward bias per disc
  const outward = discX < 0 ? -1 : +1;
  vx += outward * (0.18 * kick);

  if (rearDeflector) vz = -Math.abs(vz);

  const cl = clampBehindCone(vx, vz, behindConeDeg);
  vx = cl.vx; vz = cl.vz;

  const up = throwUpDeg * Math.PI / 180;
  const vy = Math.max(0.4, kick * Math.tan(up) + 0.15 * Math.random());

  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;

  pos[i * 3 + 1] = discY + 0.03;
}

// ===== CAD loader + helpers =====
function normalizeName(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesHints(name, hints) {
  const n = normalizeName(name);
  return hints.every((h) => n.includes(h));
}

function findDiscMeshes(root) {
  // Strategy:
  // 1) try to find meshes where name contains "left"+"disc/disk" and same for right
  // 2) if not found, keep null and use procedural discs

  let leftCandidate = null;
  let rightCandidate = null;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const n = normalizeName(obj.name);

    // You can refine these rules once you know your GLB mesh names
    const isDiscish = n.includes("disc") || n.includes("disk") || n.includes("spinner") || n.includes("plate");
    const isLeft = n.includes("left") || n.includes("l_") || n.includes("_l");
    const isRight = n.includes("right") || n.includes("r_") || n.includes("_r");

    if (isDiscish && isLeft && !leftCandidate) leftCandidate = obj;
    if (isDiscish && isRight && !rightCandidate) rightCandidate = obj;
  });

  cadLeftDisc = leftCandidate;
  cadRightDisc = rightCandidate;

  console.log("CAD left disc:", cadLeftDisc ? cadLeftDisc.name : "(not found)");
  console.log("CAD right disc:", cadRightDisc ? cadRightDisc.name : "(not found)");
}

function loadCAD() {
  const loader = new GLTFLoader();
  loader.load(
    CAD_PATH,
    (gltf) => {
      cadRoot = gltf.scene;

      cadRoot.scale.setScalar(CAD_SCALE);
      cadRoot.position.copy(CAD_POS);
      cadRoot.rotation.y = CAD_ROT_Y;

      // Make it look nice
      cadRoot.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = true;

        // Some exports use unlit/basic materials; force standard look if needed
        if (!obj.material || !("roughness" in obj.material)) {
          obj.material = new THREE.MeshStandardMaterial({ color: 0xbfd7ff, roughness: 0.6, metalness: 0.15 });
        } else {
          obj.material.roughness = Math.min(0.9, obj.material.roughness ?? 0.6);
          obj.material.metalness = Math.min(0.4, obj.material.metalness ?? 0.15);
        }
      });

      scene.add(cadRoot);

      // Try to find CAD discs (optional)
      findDiscMeshes(cadRoot);

      // If we found CAD discs, hide procedural discs (if they exist)
      if (cadLeftDisc || cadRightDisc) {
        if (discL_proc) discL_proc.visible = false;
        if (discR_proc) discR_proc.visible = false;
      }

      console.log("CAD loaded OK:", CAD_PATH);
    },
    undefined,
    (err) => {
      console.warn("CAD load failed, using procedural geometry only.", err);
    }
  );
}

// ===== Init =====
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(0, 8.5, -15.5);
  camera.lookAt(0, 1, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  controls.enablePan = true;
  controls.panSpeed = 0.8;

  // SLOWER wheel zoom:
  controls.enableZoom = true;
  controls.zoomSpeed = 0.25;      // <- slower than default
  controls.keyPanSpeed = 10;

  controls.minDistance = 3;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 1.0, 0);
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 2.35, 0);
  hopper.castShadow = true;
  hopper.receiveShadow = true;
  scene.add(hopper);

  // Build fallback discs
  buildProceduralDiscs();

  // Orifice visuals
  const orMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 });
  const orGeo = new THREE.BoxGeometry(orificeW, 0.05, orificeL);
  const orL = new THREE.Mesh(orGeo, orMat);
  const orR = new THREE.Mesh(orGeo, orMat);
  orL.position.set(leftX + innerOffset, feedY, 0);
  orR.position.set(rightX - innerOffset, feedY, 0);
  scene.add(orL, orR);

  // Particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff, roughness: 0.55, metalness: 0.05 }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  particlesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(particlesMesh);

  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;

  if (resetBtn) resetBtn.onclick = resetSim;

  // Load CAD model
  loadCAD();

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

// ===== Loop =====
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.02);

  // opposite rotation
  const omega = (rpm * 2 * Math.PI) / 60;
  const omegaL = +omega;
  const omegaR = -omega;

  // If CAD discs found, rotate them. Else rotate procedural discs.
  if (cadLeftDisc) cadLeftDisc.rotation.y += omegaL * dt;
  else if (discL_proc) discL_proc.rotation.y += omegaL * dt;

  if (cadRightDisc) cadRightDisc.rotation.y += omegaR * dt;
  else if (discR_proc) discR_proc.rotation.y += omegaR * dt;

  // For discAngle calculations (used by ejection), we still need angles.
  // We'll read from whatever disc object is active:
  const discL_obj = cadLeftDisc || discL_proc;
  const discR_obj = cadRightDisc || discR_proc;

  const discAngleL = discL_obj ? discL_obj.rotation.y : 0;
  const discAngleR = discR_obj ? discR_obj.rotation.y : 0;

  // smoother emission (no stutter)
  emitAcc += pps * dt;
  while (emitAcc >= 1) {
    emitAcc -= 1;

    const i = cursor;
    cursor = (cursor + 1) % MAX;

    // 50/50 split into the two inner orifices
    const left = Math.random() < 0.5;

    const cx = left ? (leftX + innerOffset) : (rightX - innerOffset);
    const p = sampleRect(cx, 0, orificeW, orificeL);
    spawnFalling(i, p.x, feedY, p.z);
  }

  const bladeStep = (2 * Math.PI) / bladeCount;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    if (state[i] === 3) {
      setInstance(i, pos[i * 3], 0.02, pos[i * 3 + 2]);
      continue;
    }

    // ON DISC
    if (state[i] === 2) {
      const which = discId[i];
      const discX = which === 0 ? leftX : rightX;

      const discAngle = which === 0 ? discAngleL : discAngleR;
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

    // FALLING / FLYING integration
    vel[i * 3 + 1] += g * dt;

    const damp = Math.exp(-linDrag * dt);
    vel[i * 3]     *= damp;
    vel[i * 3 + 1] *= damp;
    vel[i * 3 + 2] *= damp;

    pos[i * 3]     += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // pickup
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + pickupWindow) {
      const dxL = pos[i * 3] - leftX;
      const dzL = pos[i * 3 + 2];
      const dxR = pos[i * 3] - rightX;
      const dzR = pos[i * 3 + 2];

      if (Math.hypot(dxL, dzL) <= discRadius) beginOnDisc(i, 0, leftX, omegaL);
      else if (Math.hypot(dxR, dzR) <= discRadius) beginOnDisc(i, 1, rightX, omegaR);
    }

    // land
    if (pos[i * 3 + 1] <= 0.02) {
      pos[i * 3 + 1] = 0.02;
      vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
      state[i] = 3;
    }

    setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

init();
