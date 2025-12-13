import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

console.log("WEBDEM VERSION v8.2 LOADED (rect orifices + S divider + reliable pickup)");

const canvas = document.getElementById("webdem-canvas");
if (!canvas) throw new Error("Canvas #webdem-canvas not found. Check index.html.");

// Scene
let renderer, scene, camera, clock;

// Objects
let ground, hopper, discL, discR;
let orificeMeshL, orificeMeshR, sDivider;
let particlesMesh, tmpObj;

// ================= Particle arrays =================
const MAX = 70000;
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

let rpm = rpmEl ? +rpmEl.value : 650;
let pps = ppsEl ? +ppsEl.value : 1200;

if (rpmVal) rpmVal.textContent = rpm;
if (ppsVal) ppsVal.textContent = pps;

if (rpmEl) rpmEl.oninput = () => (rpmVal.textContent = rpm = +rpmEl.value);
if (ppsEl) ppsEl.oninput = () => (ppsVal.textContent = pps = +ppsEl.value);

if (resetBtn) {
  resetBtn.onclick = () => {
    alive.fill(0);
    state.fill(0);
    cursor = 0;
    spreaderZ = 0;
  };
}

// ================= Geometry / physics =================
let spreaderZ = 0;
const forwardSpeed = 5.5; // set 0.0 if you want to test in place

const discY = 0.60;
const discRadius = 0.95;

const leftX = -0.75;
const rightX = 0.75;

const bladeCount = 4;

// Orifice height
const feedY = 1.35;

// Orifices placed on inner side, mid-radius
const innerOffset = 0.45;

// Rectangle dimensions (meters)
const orificeW = 0.18;     // across stream
const orificeLen = 0.30;   // along stream

// Reliable pickup window (IMPORTANT)
const pickupWindow = 0.08; // meters above disc plane (prevents skipping)

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

function sampleRect(cx, cz, w, l) {
  return {
    x: cx + (Math.random() - 0.5) * w,
    z: cz + (Math.random() - 0.5) * l,
  };
}

// ================= Particle spawn =================
function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;

  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  // mostly vertical drop from orifice
  vel[i * 3] = 0.02 * randn();
  vel[i * 3 + 1] = -0.15;
  vel[i * 3 + 2] = 0.02 * randn();
}

// ================= Blade pickup =================
function bladeKick(i, discX, discAngle, omega, meanSpeed, speedStd) {
  state[i] = 1;

  const x = pos[i * 3];
  const z = pos[i * 3 + 2];

  const rx = x - discX;
  const rz = z - spreaderZ;
  const r = Math.max(0.20, Math.hypot(rx, rz));

  const theta = Math.atan2(rz, rx);
  const bladeStep = (2 * Math.PI) / bladeCount;

  const rel = wrapToPi(theta - discAngle);
  const k = Math.round(rel / bladeStep);
  const bladeTheta = discAngle + k * bladeStep;

  // tangential & radial
  const tx = -Math.sin(bladeTheta);
  const tz = Math.cos(bladeTheta);

  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  const speed = Math.max(3.0, meanSpeed + randn() * speedStd);
  const rimSpeed = Math.abs(omega) * r;

  // throw strength
  const tangential = 1.20 * speed + 0.35 * rimSpeed;
  const radial = 0.85 * speed;

  let vx = tangential * tx + radial * ux;
  let vz = tangential * tz + radial * uz;

  // mild rearward bias (swath behind travel direction)
  vz -= 0.20 * speed;

  vx *= 0.90 + 0.20 * Math.random();
  vz *= 0.90 + 0.20 * Math.random();

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

// ================= Visual: orifice + S divider =================
function makeOrificeMesh(w, l, thickness, color) {
  const geo = new THREE.BoxGeometry(w, thickness, l);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  return new THREE.Mesh(geo, mat);
}

function makeSDivider(depth, color) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.12, -0.20);
  shape.bezierCurveTo(0.12, -0.20, 0.12, -0.05, 0.00, 0.00);
  shape.bezierCurveTo(-0.12, 0.05, -0.12, 0.20, 0.12, 0.20);

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  extrude.translate(0, 0, -depth / 2);

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const mesh = new THREE.Mesh(extrude, mat);

  mesh.rotation.x = Math.PI / 2;
  return mesh;
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

  // discs
  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));

  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);

  addBlades(discL, 0x93c5fd);
  addBlades(discR, 0x7dd3fc);

  scene.add(discL, discR);

  // orifices
  orificeMeshL = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0b1220);
  orificeMeshR = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0b1220);

  orificeMeshL.position.set(leftX + innerOffset, feedY, 0);
  orificeMeshR.position.set(rightX - innerOffset, feedY, 0);

  scene.add(orificeMeshL, orificeMeshR);

  // S divider
  sDivider = makeSDivider(0.16, 0x111827);
  sDivider.position.set(0, feedY + 0.02, 0);
  scene.add(sDivider);

  // particles
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

  // move forward
  spreaderZ += forwardSpeed * dt;
  hopper.position.z = spreaderZ;
  discL.position.z = spreaderZ;
  discR.position.z = spreaderZ;

  orificeMeshL.position.z = spreaderZ;
  orificeMeshR.position.z = spreaderZ;
  sDivider.position.z = spreaderZ;

  // disc rotation
  const omega = (rpm * 2 * Math.PI) / 60;
  discL.rotation.y += omega * dt;
  discR.rotation.y -= omega * dt;

  // variable speed model
  const meanSpeed = 9 + (rpm / 1200) * 18;
  const speedStd = 0.22 * meanSpeed;

  // emission split 50/50 from two rectangular orifices
  const emit = Math.floor(pps * dt);
  const emitLeft = Math.floor(emit / 2);
  const emitRight = emit - emitLeft;

  const centerL = { x: leftX + innerOffset, z: spreaderZ };
  const centerR = { x: rightX - innerOffset, z: spreaderZ };

  for (let n = 0; n < emitLeft; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerL.x, centerL.z, orificeW, orificeLen);
    spawnFalling(i, p.x, feedY, p.z);
  }

  for (let n = 0; n < emitRight; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerR.x, centerR.z, orificeW, orificeLen);
    spawnFalling(i, p.x, feedY, p.z);
  }

  // physics
  const g = -9.81;
  const drag = 0.012;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    // gravity
    vel[i * 3 + 1] += g * dt;

    // drag
    vel[i * 3] *= (1 - drag);
    vel[i * 3 + 1] *= (1 - drag);
    vel[i * 3 + 2] *= (1 - drag);

    // integrate
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // ✅ reliable disc pickup (bigger window + snap)
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + pickupWindow) {
      // snap to disc plane so we never "skip" the contact
      pos[i * 3 + 1] = discY + 0.02;

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

    // ground hit -> despawn
    if (pos[i * 3 + 1] < 0.02) {
      alive[i] = 0;
      continue;
    }

    // render instance
    tmpObj.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    tmpObj.updateMatrix();
    particlesMesh.setMatrixAt(i, tmpObj.matrix);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

init();
