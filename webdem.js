import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/DRACOLoader.js";

console.log("WEBDEM (twin-disc + CAD) loaded");

// ===== DOM =====
const canvas   = document.getElementById("webdem-canvas");
const rpmEl    = document.getElementById("rpm");
const ppsEl    = document.getElementById("pps");
const rpmVal   = document.getElementById("rpmVal");
const ppsVal   = document.getElementById("ppsVal");
const resetBtn = document.getElementById("resetSim");

let rpm = rpmEl ? +rpmEl.value : 650;
let pps = ppsEl ? +ppsEl.value : 1200;

if (rpmVal) rpmVal.textContent = rpm;
if (ppsVal) ppsVal.textContent = pps;

if (rpmEl) rpmEl.oninput = () => (rpmVal.textContent = (rpm = +rpmEl.value));
if (ppsEl) ppsEl.oninput = () => (ppsVal.textContent = (pps = +ppsEl.value));

// ===== CAD model settings (EDIT HERE if needed) =====
const CAD_PATH     = "spreader.glb";  // file in same folder as webdem.html
const CAD_SCALE    = 0.0018;          // try 0.001 – 0.01 if you don't see it
const CAD_OFFSET_Y = 0.0;             // vertical move
const CAD_OFFSET_Z = 0.0;             // forward/back

let spreaderModel = null;

// ===== DEM-ish parameters =====
const discY       = 0.60;
const discRadius  = 0.95;
const discHalfSpacing = 0.95;         // ±0.95 m
const leftX  = -discHalfSpacing;
const rightX = +discHalfSpacing;

const bladeCount   = 4;
const feedY        = discY + 0.55;

const innerOffset  = Math.min(0.48, discRadius - 0.18);
const orificeW     = 0.22;
const orificeL     = 0.34;

const g            = -9.81;
const linDrag      = 0.06;
const pickupWindow = 0.12;
const radialDrift  = 0.55;
const angFric      = 2.6;
const bladeHitTol  = 0.10;
const minSlip      = 0.8;
const releaseR     = 0.86 * discRadius;

const bladePitchDeg = 32;
const throwUpDeg    = 14;
const jitterDeg     = 6;

const rearDeflector = true;
const behindConeDeg = 55;

const MAX = 60000;

// states: 0 falling, 2 on-disc, 1 flying, 3 landed
const pos    = new Float32Array(MAX * 3);
const vel    = new Float32Array(MAX * 3);
const alive  = new Uint8Array(MAX);
const state  = new Uint8Array(MAX);
const discId = new Int8Array(MAX);

const rOn    = new Float32Array(MAX);
const phiOn  = new Float32Array(MAX);
const phiDot = new Float32Array(MAX);

let cursor  = 0;
let emitAcc = 0;

// ===== Three.js globals =====
let renderer, scene, camera, clock, controls;
let discL, discR, hopperSimple, particlesMesh;

const tmp = new THREE.Object3D();

// ---------- helpers ----------
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
    z: cz + (Math.random() - 0.5) * l
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
  cursor  = 0;
  emitAcc = 0;
  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;
  console.log("Simulation reset");
}

// ---------- visual discs ----------
function addBlades(disc, color) {
  const group = new THREE.Group();
  const geo   = new THREE.BoxGeometry(0.70, 0.06, 0.12);
  const mat   = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });

  for (let k = 0; k < bladeCount; k++) {
    const a = k * (2 * Math.PI / bladeCount);
    const blade = new THREE.Mesh(geo, mat);
    blade.position.set(Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
    blade.rotation.y = a;
    group.add(blade);
  }
  disc.add(group);
}

// ---------- particle state transitions ----------
function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;

  pos[i * 3]     = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  vel[i * 3]     = 0.06 * randn();
  vel[i * 3 + 1] = -0.25;
  vel[i * 3 + 2] = 0.06 * randn();
}

function beginOnDisc(i, whichDisc, discX, omegaDisc) {
  state[i]  = 2;
  discId[i] = whichDisc;

  const dx = pos[i * 3]     - discX;
  const dz = pos[i * 3 + 2];

  rOn[i]   = Math.min(Math.max(0.15, Math.hypot(dx, dz)), discRadius - 0.03);
  phiOn[i] = Math.atan2(dz, dx);

  phiDot[i] = omegaDisc * 0.25;        // slip

  pos[i * 3 + 1] = discY + 0.02;
  vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
}

function clampBehindCone(vx, vz, coneDeg) {
  const cone = (coneDeg * Math.PI) / 180;
  const mag  = Math.hypot(vx, vz) + 1e-9;

  // phi = 0 => straight behind (-Z)
  let phi = Math.atan2(vx, -vz);
  if (phi > cone)  phi = cone;
  if (phi < -cone) phi = -cone;

  return {
    vx: mag * Math.sin(phi),
    vz: -mag * Math.cos(phi)
  };
}

function eject(i, discX, discAngle, omegaDisc, r, bladeRel) {
  state[i] = 1;

  const jitter     = (jitterDeg * Math.PI / 180) * (Math.random() - 0.5);
  const bladeTheta = discAngle + bladeRel + jitter;

  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  const sgn = omegaDisc >= 0 ? 1 : -1;
  const tx  = sgn * (-Math.sin(bladeTheta));
  const tz  = sgn * ( Math.cos(bladeTheta));

  const pitch = bladePitchDeg * Math.PI / 180;
  let dirx = tx * Math.cos(pitch) + ux * Math.sin(pitch);
  let dirz = tz * Math.cos(pitch) + uz * Math.sin(pitch);

  const dmag = Math.hypot(dirx, dirz) + 1e-9;
  dirx /= dmag;
  dirz /= dmag;

  const rim  = Math.abs(omegaDisc) * r;
  const kick = Math.max(1.0, 1.10 * rim + 0.18 * rim * randn());

  let vx = dirx * kick;
  let vz = dirz * kick;

  const outward = discX < 0 ? -1 : +1;
  vx += outward * (0.18 * kick);

  if (rearDeflector) vz = -Math.abs(vz);
  if (behindConeDeg < 90) {
    const cl = clampBehindCone(vx, vz, behindConeDeg);
    vx = cl.vx;
    vz = cl.vz;
  }

  const up = throwUpDeg * Math.PI / 180;
  const vy = Math.max(0.4, kick * Math.tan(up) + 0.15 * Math.random());

  vel[i * 3]     = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;

  pos[i * 3 + 1] = discY + 0.03;
}

// ---------- CAD loader ----------
function loadSpreaderModel() {
  console.log("Trying to load CAD from:", CAD_PATH);

  const loader      = new GLTFLoader();
  const dracoLoader = new DRACOLoader();

  // Public Draco decoders hosted by Google
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
  loader.setDRACOLoader(dracoLoader);

  loader.load(
    CAD_PATH,
    (gltf) => {
      spreaderModel = gltf.scene;

      spreaderModel.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material && obj.material.isMeshStandardMaterial) {
            obj.material.metalness = 0.15;
            obj.material.roughness = 0.6;
          }
        }
      });

      // >>>> adjust these 3 lines to align with discs
      spreaderModel.scale.set(CAD_SCALE, CAD_SCALE, CAD_SCALE);
      spreaderModel.position.set(0, CAD_OFFSET_Y, CAD_OFFSET_Z);
      // if needed: turn around
      // spreaderModel.rotation.y = Math.PI;

      scene.add(spreaderModel);

      console.log("CAD loaded OK:", CAD_PATH);
    },
    (xhr) => {
      if (xhr.total) {
        const pct = (xhr.loaded / xhr.total) * 100;
        console.log(`CAD loading ${CAD_PATH}: ${pct.toFixed(1)}%`);
      } else {
        console.log(`CAD loading ${CAD_PATH}: ${xhr.loaded} bytes`);
      }
    },
    (err) => {
      console.error("CAD GLB load error:", err);
    }
  );
}

// ---------- init ----------
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
  controls.minDistance = 3;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 1.0, 0);
  controls.update();

  // lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  // ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // simple hopper + discs (still used for alignment)
  hopperSimple = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopperSimple.position.set(0, 2.35, 0);
  scene.add(hopperSimple);

  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  discL = new THREE.Mesh(
    discGeo,
    new THREE.MeshStandardMaterial({ color: 0x2563eb })
  );
  discR = new THREE.Mesh(
    discGeo,
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8 })
  );
  discL.position.set(leftX,  discY, 0);
  discR.position.set(rightX, discY, 0);
  addBlades(discL, 0x93c5fd);
  addBlades(discR, 0x7dd3fc);
  scene.add(discL, discR);

  // orifices
  const orMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 });
  const orGeo = new THREE.BoxGeometry(orificeW, 0.05, orificeL);
  const orL   = new THREE.Mesh(orGeo, orMat);
  const orR   = new THREE.Mesh(orGeo, orMat);
  orL.position.set(leftX  + innerOffset, feedY, 0);
  orR.position.set(rightX - innerOffset, feedY, 0);
  scene.add(orL, orR);

  // particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  particlesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(particlesMesh);

  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;

  if (resetBtn) resetBtn.onclick = resetSim;

  // finally load CAD model
  loadSpreaderModel();

  resize();
  animate();
}

// ---------- resize ----------
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ---------- main loop ----------
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.02);

  const omega  = (rpm * 2 * Math.PI) / 60;
  const omegaL = +omega;
  const omegaR = -omega;

  discL.rotation.y += omegaL * dt;
  discR.rotation.y += omegaR * dt;

  // emission with accumulator (smooth)
  emitAcc += pps * dt;
  while (emitAcc >= 1) {
    emitAcc -= 1;
    const i = cursor;
    cursor = (cursor + 1) % MAX;

    const left = Math.random() < 0.5;
    const cx   = left ? (leftX + innerOffset) : (rightX - innerOffset);
    const p    = sampleRect(cx, 0, orificeW, orificeL);
    spawnFalling(i, p.x, feedY, p.z);
  }

  const bladeStep = (2 * Math.PI) / bladeCount;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    // landed
    if (state[i] === 3) {
      setInstance(i, pos[i * 3], 0.02, pos[i * 3 + 2]);
      continue;
    }

    // on-disc
    if (state[i] === 2) {
      const which     = discId[i];
      const discX     = which === 0 ? leftX : rightX;
      const discAngle = which === 0 ? discL.rotation.y : discR.rotation.y;
      const omegaDisc = which === 0 ? omegaL : omegaR;

      phiDot[i] += (omegaDisc - phiDot[i]) * (angFric * dt);
      phiOn[i]  += phiDot[i] * dt;

      rOn[i] = Math.min(discRadius - 0.02, rOn[i] + radialDrift * dt);

      pos[i * 3]     = discX + rOn[i] * Math.cos(phiOn[i]);
      pos[i * 3 + 1] = discY + 0.02;
      pos[i * 3 + 2] =        rOn[i] * Math.sin(phiOn[i]);

      const phiRel   = wrapToPi(phiOn[i] - discAngle);
      const k        = Math.round(phiRel / bladeStep);
      const bladeRel = k * bladeStep;
      const diff     = wrapToPi(phiRel - bladeRel);

      const slip = Math.abs(omegaDisc - phiDot[i]);

      if ((Math.abs(diff) < bladeHitTol && slip > minSlip && rOn[i] > 0.22) ||
          rOn[i] > releaseR) {
        eject(i, discX, discAngle, omegaDisc, rOn[i], bladeRel);
      }

      setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // falling / flying
    vel[i * 3 + 1] += g * dt;

    const damp = Math.exp(-linDrag * dt);
    vel[i * 3]     *= damp;
    vel[i * 3 + 1] *= damp;
    vel[i * 3 + 2] *= damp;

    pos[i * 3]     += vel[i * 3];
    pos[i * 3 + 1] += vel[i * 3 + 1];
    pos[i * 3 + 2] += vel[i * 3 + 2];

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

    // ground contact
    if (pos[i * 3 + 1] <= 0.02) {
      pos[i * 3 + 1] = 0.02;
      vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
      state[i] = 3;
    }

    setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  if (controls) controls.update();
  renderer.render(scene, camera);
}

init();
