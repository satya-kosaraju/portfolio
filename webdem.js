import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

console.log("WEBDEM VERSION v7 LOADED (realistic blade pickup)");

const canvas = document.getElementById("webdem-canvas");

let renderer, scene, camera, clock;
let particlesMesh, tmpObj;
let ground, hopper, discL, discR;

const MAX = 70000;

// ================= Particle arrays =================
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);

// 0 = falling, 1 = thrown
const state = new Uint8Array(MAX);
let cursor = 0;

// ================= UI =================
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
  cursor = 0;
  spreaderZ = 0;
};

// ================= Geometry / physics =================
let spreaderZ = 0;
const forwardSpeed = 5.5;

const discY = 0.60;
const discRadius = 0.95;

// discs closer together (important)
const leftX = -0.75;
const rightX = 0.75;

const bladeCount = 4;

// feed / orifice
const feedY = 1.45;
const rMin = 0.25;
const rMax = 0.65;

// ================= Utilities =================
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

// ================= Particle spawning =================
function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;

  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  vel[i * 3] = 0.03 * randn();
  vel[i * 3 + 1] = -0.15;
  vel[i * 3 + 2] = 0.03 * randn();
}

// ================= Blade pickup physics =================
function bladeKick(i, discX, discAngle, omega, meanSpeed, speedStd) {
  state[i] = 1;

  const x = pos[i * 3];
  const z = pos[i * 3 + 2];

  const rx = x - discX;
  const rz = z - spreaderZ;
  const r = Math.max(0.25, Math.hypot(rx, rz));

  const theta = Math.atan2(rz, rx);
  const bladeStep = (2 * Math.PI) / bladeCount;

  const rel = wrapToPi(theta - discAngle);
  const k = Math.round(rel / bladeStep);
  const bladeTheta = discAngle + k * bladeStep;

  // Tangential and radial directions
  const tx = -Math.sin(bladeTheta);
  const tz = Math.cos(bladeTheta);

  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  const speed = Math.max(3.0, meanSpeed + randn() * speedStd);

  const rimSpeed = Math.abs(omega) * r;
  const tangential = 1.2 * speed + 0.35 * rimSpeed;
  const radial = 0.85 * speed;

  let vx = tangential * tx + radial * ux;
  let vz = tangential * tz + radial * uz;

  // mild rearward bias (tractor motion)
  vz -= 0.2 * speed;

  vx *= 0.9 + 0.2 * Math.random();
  vz *= 0.9 + 0.2 * Math.random();

  vel[i * 3] = vx;
  vel[i * 3 + 1] = 3.2 + Math.random() * 1.2;
  vel[i * 3 + 2] = vz;

  pos[i * 3 + 1] = discY + 0.02;
}

// ================= Visual blades =================
function addBlades(disc, color) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.7, 0.06, 0.12);
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

// ================= Init =================
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  camera.position.set(0, 10, 22);
  camera.lookAt(0, 1, 8);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 1.9, 0);
  scene.add(hopper);

  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));

  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);

  addBlades(discL, 0x93c5fd);
  addBlades(discR, 0x7dd3fc);

  scene.add(discL, discR);

  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  scene.add(particlesMesh);

  tmpObj = new THREE.Object3D();

  resize();
  animate();
}

// ================= Resize =================
function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// ================= Main loop =================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.02);

  spreaderZ += forwardSpeed * dt;
  hopper.position.z = spreaderZ;
  discL.position.z = spreaderZ;
  discR.position.z = spreaderZ;

  const omega = (rpm * 2 * Math.PI) / 60;
  discL.rotation.y += omega * dt;
  discR.rotation.y -= omega * dt;

  const meanSpeed = 9 + (rpm / 1200) * 18;
  const speedStd = 0.22 * meanSpeed;

  // spawn particles ON discs (pickup region)
  const emit = Math.floor(pps * dt);
  for (let n = 0; n < emit; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;

    const toLeft = Math.random() < 0.5;
    const discX = toLeft ? leftX : rightX;

    const r = rMin + Math.random() * (rMax - rMin);
    const phi = Math.random() * 2 * Math.PI;

    spawnFalling(
      i,
      discX + r * Math.cos(phi),
      feedY,
      spreaderZ + r * Math.sin(phi)
    );
  }

  const g = -9.81;
  const drag = 0.012;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    vel[i * 3 + 1] += g * dt;

    vel[i * 3] *= (1 - drag);
    vel[i * 3 + 1] *= (1 - drag);
    vel[i * 3 + 2] *= (1 - drag);

    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    if (state[i] === 0 && pos[i * 3 + 1] <= discY + 0.01) {
      const dxL = pos[i * 3] - leftX;
      const dzL = pos[i * 3 + 2] - spreaderZ;
      const dxR = pos[i * 3] - rightX;
      const dzR = pos[i * 3 + 2] - spreaderZ;

      if (Math.hypot(dxL, dzL) <= discRadius) {
        bladeKick(i, leftX, discL.rotation.y, omega, meanSpeed, speedStd);
      } else if (Math.hypot(dxR, dzR) <= discRadius) {
        bladeKick(i, rightX, discR.rotation.y, -omega, meanSpeed, speedStd);
      }
    }

    if (pos[i * 3 + 1] < 0.02) {
      alive[i] = 0;
      continue;
    }

    tmpObj.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    tmpObj.updateMatrix();
    particlesMesh.setMatrixAt(i, tmpObj.matrix);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

init();
