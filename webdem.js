import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("webdem-canvas");

let renderer, scene, camera, clock;
let particlesMesh, tmpObj;
let ground;
let discL, discR, hopper;

const MAX = 45000;
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
};

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
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 7, 14);
  camera.lookAt(0, 1, 0);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(6, 10, 6);
  scene.add(sun);

  // Ground
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Hopper (visual only)
  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.4, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x111827 })
  );
  hopper.position.set(0, 1.6, 0);
  scene.add(hopper);

  // Twin discs
  const discGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.15, 36);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x2563eb });

  discL = new THREE.Mesh(discGeo, discMat);
  discR = new THREE.Mesh(discGeo, discMat);

  discL.position.set(-1.2, 0.6, 0);
  discR.position.set(1.2, 0.6, 0);

  scene.add(discL, discR);

  // Particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.03, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff }),
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

  const omega = (rpm * 2 * Math.PI) / 60;
  discL.rotation.y += omega * dt;
  discR.rotation.y -= omega * dt;

  // --- PARTICLE FEED BETWEEN DISCS ---
  const emit = Math.floor(pps * dt);
  const feedY = 1.05;

  for (let n = 0; n < emit; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;

    // drop between discs
    const x = randn() * 0.12;
    const z = randn() * 0.12;

    // choose which disc picks it up
    const left = x < 0;
    const theta = (left ? discL : discR).rotation.y;

    const dir = left ? -1 : 1;
    const speed = 7 + rpm / 180;

    const vx = dir * Math.cos(theta) * speed;
    const vz = Math.sin(theta) * speed;
    const vy = 2.2 + Math.random();

    spawn(i, x, feedY, z, vx, vy, vz);
  }

  // --- PHYSICS ---
  const g = -9.81;
  const drag = 0.02;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    vel[i * 3 + 1] += g * dt;

    vel[i * 3] *= 1 - drag;
    vel[i * 3 + 1] *= 1 - drag;
    vel[i * 3 + 2] *= 1 - drag;

    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    if (pos[i * 3 + 1] < 0.02) {
      alive[i] = 0;
      continue;
    }

    tmpObj.position.set(
      pos[i * 3],
      pos[i * 3 + 1],
      pos[i * 3 + 2]
    );
    tmpObj.updateMatrix();
    particlesMesh.setMatrixAt(i, tmpObj.matrix);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

init();
