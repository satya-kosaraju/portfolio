import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

console.log("WEBDEM VERSION v6 LOADED (closer discs + blade pickup)");

const canvas = document.getElementById("webdem-canvas");

let renderer, scene, camera, clock;
let particlesMesh, tmpObj;
let ground, hopper, discL, discR;

const MAX = 65000;

// Particle data
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);

// state: 0 = falling, 1 = thrown
const state = new Uint8Array(MAX);

// which disc: 0 none, 1 left, 2 right
const discId = new Uint8Array(MAX);

let cursor = 0;

// UI
const rpmEl = document.getElementById("rpm");
const ppsEl = document.getElementById("pps");
const rpmVal = document.getElementById("rpmVal");
const ppsVal = document.getElementById("ppsVal");
const resetBtn = document.getElementById("resetSim");

let rpm = +rpmEl.value;
let pps = +ppsEl.value;

rpmVal.textContent = rpm;
ppsVal.textContent = pps;

rpmEl.oninput = () => (rpmVal.textContent = rpm = +rpmEl.value);
ppsEl.oninput = () => (ppsVal.textContent = pps = +ppsEl.value);

resetBtn.onclick = () => {
  alive.fill(0);
  state.fill(0);
  discId.fill(0);
  cursor = 0;
  spreaderZ = 0;
};

// ===== Spreader forward motion =====
let spreaderZ = 0;
const forwardSpeed = 6.0; // m/s visual

// ===== Disc / pickup settings =====
const discY = 0.60;
const discRadius = 0.95;

// ✅ discs closer now (reduced gap)
const leftX = -0.85;
const rightX = 0.85;

const bladeCount = 4;

// ===== Feed/orifice settings =====
// In real spreaders, fertilizer lands on the inner/mid disc region.
// We'll spawn above discs in a pickup zone.
const feedY = 1.35;

// drop zone radii (relative to disc center): inner-to-mid region
const rMin = 0.25;
const rMax = 0.70;

// ===== Utilities =====
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

function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;
  discId[i] = 0;

  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  // falling: mostly vertical
  vel[i * 3] = 0.05 * randn();
  vel[i * 3 + 1] = -0.2 + 0.05 * randn();
  vel[i * 3 + 2] = 0.05 * randn();
}

function bladeKick(i, whichDisc, discAngleY, omega, meanSpeed, speedStd) {
  state[i] = 1;
  discId[i] = whichDisc;

  const x = pos[i * 3];
  const z = pos[i * 3 + 2];

  const discX = whichDisc === 1 ? leftX : rightX;

  // vector from disc center to particle contact point
  const rx = x - discX;
  const rz = z - spreaderZ;
  const r = Math.hypot(rx, rz);

  // contact polar angle
  const theta = Math.atan2(rz, rx);

  // find nearest blade angle
  const bladeStep = (2 * Math.PI) / bladeCount;
  const rel = wrapToPi(theta - discAngleY);
  const k = Math.round(rel / bladeStep);
  const bladeTheta = discAngleY + k * bladeStep;

  // tangential unit direction at bladeTheta
  const tx = -Math.sin(bladeTheta);
  const tz = Math.cos(bladeTheta);

  // radial unit direction at bladeTheta
  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  // variable speed
  const speed = Math.max(2.0, meanSpeed + randn() * speedStd);

  // rim contribution
  const rim = Math.abs(omega) * Math.max(0.3, r);
  const rimScale = 0.30;

  // rearward bias (make swath behind travel direction)
  const rearBias = -0.50 * speed;

  const tangential = 0.80 * speed + rimScale * rim;
  const radial = 0.55 * speed;

  let vx = tangential * tx + radial * ux;
  let vz = tangential * tz + radial * uz + rearBias;

  // random spread
  vx *= (0.88 + 0.24 * Math.random());
  vz *= (0.88 + 0.24 * Math.random());

  const vy = 2.2 + 1.0 * Math.random();

  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;

  // place on disc plane
  pos[i * 3 + 1] = discY + 0.02;
}

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();

  // fixed camera so swath is visible
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(0, 10, 22);
  camera.lookAt(0, 0.9, 8);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 1.8, 0);
  scene.add(hopper);

  // discs
  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 44);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35 }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 }));

  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);

  scene.add(discL, discR);

  // particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff, roughness: 0.4 }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  scene.add(particlesMesh);

  tmpObj = new THREE.Object3D();

  resize();
  animate();
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.02);

  // move spreader forward
  spreaderZ += forwardSpeed * dt;
  hopper.position.z = spreaderZ;
  discL.position.z = spreaderZ;
  discR.position.z = spreaderZ;

  // spin discs counter-rotating
  const omegaMag = (rpm * 2 * Math.PI) / 60;
  const omegaL = +omegaMag;
  const omegaR = -omegaMag;

  discL.rotation.y += omegaL * dt;
  discR.rotation.y += omegaR * dt;

  // speed model (rpm -> mean + variability)
  const meanSpeed = 8 + (rpm / 1200) * 18;
  const speedStd = 0.25 * meanSpeed;

  // emit particles above discs (pickup zone)
  const emit = Math.floor(pps * dt);
  for (let n = 0; n < emit; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;

    const toLeft = Math.random() < 0.5;
    const discX = toLeft ? leftX : rightX;

    const r = rMin + (rMax - rMin) * Math.random();
    const phi = Math.random() * 2 * Math.PI;

    const x = discX + r * Math.cos(phi);
    const z = spreaderZ + r * Math.sin(phi);

    spawnFalling(i, x, feedY, z);
  }

  // physics update
  const g = -9.81;
  const airDrag = 0.012;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    vel[i * 3 + 1] += g * dt;

    vel[i * 3] *= (1 - airDrag);
    vel[i * 3 + 1] *= (1 - airDrag);
    vel[i * 3 + 2] *= (1 - airDrag);

    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // disc contact -> blade pickup
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + 0.01) {
      const x = pos[i * 3];
      const z = pos[i * 3 + 2];

      const dxL = x - leftX;
      const dzL = z - spreaderZ;
      const rL = Math.hypot(dxL, dzL);

      const dxR = x - rightX;
      const dzR = z - spreaderZ;
      const rR = Math.hypot(dxR, dzR);

      if (rL <= discRadius) {
        bladeKick(i, 1, discL.rotation.y, omegaL, meanSpeed, speedStd);
      } else if (rR <= discRadius) {
        bladeKick(i, 2, discR.rotation.y, omegaR, meanSpeed, speedStd);
      }
    }

    // ground hit -> despawn
    if (pos[i * 3 + 1] < 0.02) {
      alive[i] = 0;
      continue;
    }

    // render
    tmpObj.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    tmpObj.updateMatrix();
    particlesMesh.setMatrixAt(i, tmpObj.matrix);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

init();
