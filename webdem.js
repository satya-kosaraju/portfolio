import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("webdem-canvas");

let renderer, scene, camera, clock;
let particlesMesh, tmpObj;
let ground;
let spinner, spreaderBody;

const MAX = 35000; // keep reasonable for GitHub Pages
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

rpmEl.addEventListener("input", () => {
  rpm = +rpmEl.value;
  rpmVal.textContent = rpm;
});

ppsEl.addEventListener("input", () => {
  pps = +ppsEl.value;
  ppsVal.textContent = pps;
});

resetBtn.addEventListener("click", resetSim);

function resetSim() {
  alive.fill(0);
  cursor = 0;
}

// Quick approx normal random
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function spawnParticle(origin, baseSpeed, angleSpreadRad) {
  const i = cursor;
  cursor = (cursor + 1) % MAX;

  alive[i] = 1;

  // position
  pos[i * 3 + 0] = origin.x;
  pos[i * 3 + 1] = origin.y;
  pos[i * 3 + 2] = origin.z;

  // random launch direction in shallow cone
  const yaw = (Math.random() * Math.PI * 2);
  const pitch = (Math.PI / 10) + randn() * angleSpreadRad;
  const speed = baseSpeed * (1 + 0.08 * randn());

  const vx = Math.cos(yaw) * Math.cos(pitch) * speed;
  const vy = Math.sin(pitch) * speed;
  const vz = Math.sin(yaw) * Math.cos(pitch) * speed;

  vel[i * 3 + 0] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;
}

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 6.5, 13);
  camera.lookAt(0, 1.2, 0);

  clock = new THREE.Clock();

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x0b1220, 1.0));

  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(6, 10, 6);
  scene.add(dir);

  // Ground
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // Simple spreader body (placeholder)
  spreaderBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.2, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  spreaderBody.position.set(0, 1.1, 0);
  scene.add(spreaderBody);

  // Spinner disk (placeholder)
  spinner = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.15, 32),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35 })
  );
  spinner.position.set(0, 0.55, 0);
  scene.add(spinner);

  // Particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.03, 6, 6),
    new THREE.MeshStandardMaterial({
      color: 0x6bc3ff,
      roughness: 0.4,
      metalness: 0.0,
      transparent: true,
      opacity: 0.95,
    }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  scene.add(particlesMesh);

  tmpObj = new THREE.Object3D();

  onResize();
  animate();
}

function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.02);

  // Spin
  const omega = (rpm * 2 * Math.PI) / 60;
  spinner.rotation.y += omega * dt;

  // Emit particles from spinner edge
  const emitCount = Math.floor(pps * dt);
  const origin = new THREE.Vector3(0, 0.65, 0);

  const baseSpeed = 6 + (rpm / 1200) * 14; // ~6 to ~20 m/s
  const angleSpread = 0.12; // radians

  for (let k = 0; k < emitCount; k++) {
    const r = 0.95;
    const theta = spinner.rotation.y + Math.random() * 0.35;

    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);

    const p0 = new THREE.Vector3(origin.x + x, origin.y, origin.z + z);

    spawnParticle(p0, baseSpeed, angleSpread);

    // Tangential bias (spinning disc effect)
    const i = (cursor - 1 + MAX) % MAX;
    const tx = -Math.sin(theta);
    const tz = Math.cos(theta);

    vel[i * 3 + 0] = tx * baseSpeed * (0.9 + 0.2 * Math.random());
    vel[i * 3 + 2] = tz * baseSpeed * (0.9 + 0.2 * Math.random());
    vel[i * 3 + 1] = 2.0 + 1.2 * Math.random();
  }

  // Update particles
  const g = -9.81;
  const drag = 0.02;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    vel[i * 3 + 1] += g * dt;

    vel[i * 3 + 0] *= (1 - drag);
    vel[i * 3 + 1] *= (1 - drag);
    vel[i * 3 + 2] *= (1 - drag);

    pos[i * 3 + 0] += vel[i * 3 + 0] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    if (pos[i * 3 + 1] <= 0.02) {
      alive[i] = 0;
      continue;
    }

    tmpObj.position.set(pos[i * 3 + 0], pos[i * 3 + 1], pos[i * 3 + 2]);
    tmpObj.updateMatrix();
    particlesMesh.setMatrixAt(i, tmpObj.matrix);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

document.addEventListener("DOMContentLoaded", init);
