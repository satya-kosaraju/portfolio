import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

console.log("WEBDEM VERSION v4 LOADED");

const canvas = document.getElementById("webdem-canvas");

let renderer, scene, camera, clock;
let particlesMesh, tmpObj;
let ground;
let discL, discR, hopper;

const MAX = 50000;
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);
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
  cursor = 0;
  spreaderZ = 0;
};

// Spreader moves forward (+Z); particles thrown backward (-Z) => swath
let spreaderZ = 0;
const forwardSpeed = 6.0; // m/s visual speed

function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function spawn(i, x, y, z, vx, vy, vz) {
  alive[i] = 1;
  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;
  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;
}

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();

  // Fixed camera so you SEE the swath trail
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.position.set(0, 10, 22);
  camera.lookAt(0, 0.8, 8);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  // Ground
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Spreader body
  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 1.6, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 1.7, 0);
  scene.add(hopper);

  // Twin discs
  const discGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.15, 40);
  discL = new THREE.Mesh(
    discGeo,
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35 })
  );
  discR = new THREE.Mesh(
    discGeo,
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 })
  );

  discL.position.set(-1.35, 0.6, 0);
  discR.position.set( 1.35, 0.6, 0);

  scene.add(discL, discR);

  // Particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.03, 6, 6),
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

  // Move spreader forward
  spreaderZ += forwardSpeed * dt;

  hopper.position.z = spreaderZ;
  discL.position.z = spreaderZ;
  discR.position.z = spreaderZ;

  // Spin discs opposite directions
  const omega = (rpm * 2 * Math.PI) / 60;
  discL.rotation.y += omega * dt;
  discR.rotation.y -= omega * dt;

  // --- VARIABLE SPEED MODEL ---
  // Mean throw speed based on RPM
  const meanSpeed = 10 + (rpm / 1200) * 18;

  // Speed variability (represents particle size + vane pickup variability)
  const speedStd = 0.25 * meanSpeed; // 25% variation

  // Emit particles dropping between discs
  const emit = Math.floor(pps * dt);
  const feedY = 1.15;

  for (let n = 0; n < emit; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;

    // Drop between discs (world coords)
    const x = randn() * 0.12;
    const z = spreaderZ + randn() * 0.10;

const particleSpeed = Math.max(0.3 * meanSpeed, meanSpeed + randn() * speedStd);

// Fan angle spread (radians). Increase for wider fan.
const fan = 0.55; // ~31 degrees

// Random angle around straight-back direction (-Z)
const a = randn() * fan;

// Split bias (small): left disc slightly prefers left, right disc prefers right
const discBias = (x < 0) ? -0.18 : 0.18;
const angle = a + discBias;

// Convert angle into horizontal direction unit vector
const dirx = Math.sin(angle);
const dirz = -Math.cos(angle); // negative = backward

const vx = dirx * particleSpeed;
const vz = dirz * particleSpeed;
const vy = 1.8 + Math.random() * 1.4;


    spawn(i, x, feedY, z, vx, vy, vz);
  }

  // Physics
  const g = -9.81;
  const drag = 0.018;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    vel[i * 3 + 1] += g * dt;

    vel[i * 3] *= (1 - drag);
    vel[i * 3 + 1] *= (1 - drag);
    vel[i * 3 + 2] *= (1 - drag);

    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // Ground hit -> despawn
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
