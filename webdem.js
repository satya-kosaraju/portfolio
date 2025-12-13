import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

console.log("WEBDEM v8.4 (camera behind + outward throw bias)");

const canvas = document.getElementById("webdem-canvas");
if (!canvas) throw new Error("Canvas #webdem-canvas not found");

// ================= Scene =================
let renderer, scene, camera, clock;
let ground, hopper, discL, discR;
let orificeMeshL, orificeMeshR, sDivider;
let particlesMesh;
const tmp = new THREE.Object3D();

// ================= Particle storage =================
const MAX = 70000;
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);
const state = new Uint8Array(MAX); // 0 falling, 1 thrown
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
    for (let i = 0; i < MAX; i++) hideInstance(i);
    particlesMesh.instanceMatrix.needsUpdate = true;
  };
}

// ================= Parameters =================
let spreaderZ = 0;
const forwardSpeed = 3.5; // slower looks better; increase later

// camera follow (BEHIND the spreader)
const cameraFollow = true;
const camHeight = 9.5;
const camBack = 18.0;       // behind distance
const camLookAhead = 3.0;   // look slightly ahead of discs

const discY = 0.60;
const discRadius = 0.95;
const leftX = -0.75;
const rightX = 0.75;
const bladeCount = 4;

// Put orifice close to discs (not inside hopper)
const feedY = discY + 0.55; // ~1.15

// Orifice placement: inner side mid-radius
const innerOffset = 0.45;
const orificeW = 0.20;
const orificeLen = 0.32;

// reliable pickup window
const pickupWindow = 0.16;

// ================= Helpers =================
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

// ================= Particle behavior =================
function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;

  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  // drop mostly vertical
  vel[i * 3] = 0.015 * randn();
  vel[i * 3 + 1] = -0.25;
  vel[i * 3 + 2] = 0.015 * randn();
}

function bladeKick(i, discX, discAngle, omega, meanSpeed, speedStd) {
  state[i] = 1;

  const x = pos[i * 3];
  const z = pos[i * 3 + 2];

  const rx = x - discX;
  const rz = z - spreaderZ;
  const r = Math.max(0.18, Math.hypot(rx, rz));

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

  const tangential = 1.15 * speed + 0.45 * rimSpeed;
  const radial = 0.90 * speed;

  let vx = tangential * tx + radial * ux;
  let vz = tangential * tz + radial * uz;

  // ✅ twin-disc outward bias:
  // left disc throws to -X, right disc throws to +X
  const outward = discX < 0 ? -1 : +1;
  vx += outward * (0.55 * speed);

  // swath behind machine (toward camera because camera is behind)
  vz -= 0.18 * speed;

  // less "rocket" upward; more realistic
  vel[i * 3] = vx * (0.90 + 0.20 * Math.random());
  vel[i * 3 + 1] = 2.0 + Math.random() * 0.9;
  vel[i * 3 + 2] = vz * (0.90 + 0.20 * Math.random());

  pos[i * 3 + 1] = discY + 0.02;
}

// ================= Visual parts =================
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

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  extrude.translate(0, 0, -depth / 2);

  const mesh = new THREE.Mesh(
    extrude,
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(1.3, 1.0, 1.0); // make it easier to see
  return mesh;
}

// ================= Init =================
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
  camera.position.set(0, camHeight, -camBack);
  camera.lookAt(0, 1, 0);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // raise hopper so orifice is below it (not inside)
  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 2.35, 0);
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
  orificeMeshL = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0f172a);
  orificeMeshR = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0f172a);

  orificeMeshL.position.set(leftX + innerOffset, feedY, 0);
  orificeMeshR.position.set(rightX - innerOffset, feedY, 0);

  scene.add(orificeMeshL, orificeMeshR);

  // S divider
  sDivider = makeSDivider(0.18, 0x111827);
  sDivider.position.set(0, feedY + 0.03, 0);
  scene.add(sDivider);

  // particles
  particlesMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.028, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x6bc3ff }),
    MAX
  );
  particlesMesh.frustumCulled = false;
  scene.add(particlesMesh);

  for (let i = 0; i < MAX; i++) hideInstance(i);
  particlesMesh.instanceMatrix.needsUpdate = true;

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

// ================= Loop =================
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.02);

  // move spreader forward in +Z
  spreaderZ += forwardSpeed * dt;

  hopper.position.z = spreaderZ;
  discL.position.z = spreaderZ;
  discR.position.z = spreaderZ;
  orificeMeshL.position.z = spreaderZ;
  orificeMeshR.position.z = spreaderZ;
  sDivider.position.z = spreaderZ;

  // camera behind, looking forward
  if (cameraFollow) {
    camera.position.set(0, camHeight, spreaderZ - camBack);
    camera.lookAt(0, 1, spreaderZ + camLookAhead);
  }

  // rotate discs
  const omega = (rpm * 2 * Math.PI) / 60;
  discL.rotation.y += omega * dt;
  discR.rotation.y -= omega * dt;

  // emission split 50/50
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

  const meanSpeed = 9 + (rpm / 1200) * 18;
  const speedStd = 0.22 * meanSpeed;

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

    // pickup zone
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + pickupWindow) {
      // snap to disc plane
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
      hideInstance(i);
      continue;
    }

    setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

init();
