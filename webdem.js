import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

console.log("WEBDEM v1.00 (twin-disc, split feed, behind-cone throw, spacing ±0.95)");

const canvas = document.getElementById("webdem-canvas");
if (!canvas) throw new Error("Canvas #webdem-canvas not found");

// ===== UI =====
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

// ===== Scene =====
let renderer, scene, camera, clock;

// ===== Geometry + Setup =====
const discY = 0.60;
const discRadius = 0.95;
const bladeCount = 4;

// USER REQUEST: distance ±0.95
const discSpacing = 1.90;     // centers at -0.95 and +0.95
const leftX = -discSpacing / 2;
const rightX = +discSpacing / 2;

// feed/orifice
const feedY = discY + 0.55;
const innerOffset = Math.min(0.48, discRadius - 0.18);
const orificeW = 0.22;        // rectangle width
const orificeLen = 0.34;      // rectangle length

// motion / camera
const forwardSpeed = 3.5;     // set 0 if you want stationary machine
let spreaderZ = 0;

const camHeight = 9.5;
const camBack = 18.0;
const camLookAhead = 3.0;

// pickup
const pickupWindow = 0.18;

// appearance + tuning
const outwardFactor = 0.55;
const bladeJitter = 0.40;
const drag = 0.012;

// BIG FIX: force behind-only cone (prevents 360°)
const enforceBehindCone = true;
const behindConeDeg = 70; // 40 narrower, 90 wider

// carry-on-disc (removes jet-lines)
const carryMin = 0.03;
const carryMax = 0.10;
const radialDrift = 0.65;

// ===== Particles =====
const MAX = 70000;
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);

// state: 0 falling, 2 riding disc, 1 thrown
const state = new Uint8Array(MAX);

// carry data (state==2)
const discId = new Int8Array(MAX);      // 0 left, 1 right
const carryT = new Float32Array(MAX);
const carryDur = new Float32Array(MAX);
const localR = new Float32Array(MAX);
const localPhi = new Float32Array(MAX);

let cursor = 0;
let particlesMesh;
const tmp = new THREE.Object3D();

let hopper, discL, discR, orificeMeshL, orificeMeshR, sDivider;
let frameDT = 0.016;

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

// ===== Particle transitions =====
function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0;

  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  vel[i * 3] = 0.03 * randn();
  vel[i * 3 + 1] = -0.25;
  vel[i * 3 + 2] = forwardSpeed + 0.03 * randn();
}

function beginCarry(i, whichDisc, discX, discAngle) {
  state[i] = 2;
  discId[i] = whichDisc;

  carryT[i] = 0;
  carryDur[i] = carryMin + Math.random() * (carryMax - carryMin);

  const dx = pos[i * 3] - discX;
  const dz = pos[i * 3 + 2] - spreaderZ;

  const r = Math.max(0.15, Math.hypot(dx, dz));
  const phiWorld = Math.atan2(dz, dx);

  localR[i] = Math.min(r, discRadius - 0.03);
  localPhi[i] = wrapToPi(phiWorld - discAngle);

  pos[i * 3 + 1] = discY + 0.02;

  vel[i * 3] = 0;
  vel[i * 3 + 1] = 0;
  vel[i * 3 + 2] = forwardSpeed;
}

function ejectFromDisc(i, discX, discAngle, omega, meanSpeed, speedStd) {
  state[i] = 1;

  const discAngleEff = discAngle + omega * (Math.random() - 0.5) * frameDT;

  const dx = pos[i * 3] - discX;
  const dz = pos[i * 3 + 2] - spreaderZ;
  const theta = Math.atan2(dz, dx);

  const bladeStep = (2 * Math.PI) / bladeCount;
  const rel = wrapToPi(theta - discAngleEff);
  const k = Math.round(rel / bladeStep + randn() * 0.25);

  let bladeTheta = discAngleEff + k * bladeStep;
  bladeTheta += (Math.random() - 0.5) * bladeJitter;

  const tx = -Math.sin(bladeTheta);
  const tz = Math.cos(bladeTheta);
  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  const r = Math.max(0.18, Math.hypot(dx, dz));
  const speed = Math.max(3.0, meanSpeed + randn() * speedStd);
  const rimSpeed = Math.abs(omega) * r;

  const tangential = 1.05 * speed + 0.50 * rimSpeed;
  const radial = 0.85 * speed;

  let vxRel = tangential * tx + radial * ux;
  let vzRel = tangential * tz + radial * uz;

  // twin-disc outward bias
  const outward = discX < 0 ? -1 : +1;
  vxRel += outward * (outwardFactor * speed);

  // ===== FIX: force throw into a cone behind the machine (-Z) =====
  if (enforceBehindCone) {
    const cone = (behindConeDeg * Math.PI) / 180;
    const mag = Math.hypot(vxRel, vzRel) + 1e-9;

    // phi=0 => straight behind (-Z)
    let phi = Math.atan2(vxRel, -vzRel);

    if (phi > cone) phi = cone;
    if (phi < -cone) phi = -cone;

    vxRel = mag * Math.sin(phi);
    vzRel = -mag * Math.cos(phi);
  }

  // assign final velocity
  vel[i * 3] = vxRel * (0.90 + 0.25 * Math.random());
  vel[i * 3 + 1] = 1.6 + Math.random() * 0.9;
  vel[i * 3 + 2] = vzRel * (0.90 + 0.25 * Math.random()) + forwardSpeed;

  pos[i * 3 + 1] = discY + 0.02;
}

// ===== Visual parts =====
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
  mesh.scale.set(1.3, 1.0, 1.0);
  return mesh;
}

// ===== Init =====
function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
  camera.position.set(0, camHeight, -camBack);
  camera.lookAt(0, 1, 0);

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

  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 2.35, 0);
  scene.add(hopper);

  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 48);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));

  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);

  addBlades(discL, 0x93c5fd);
  addBlades(discR, 0x7dd3fc);

  scene.add(discL, discR);

  // rectangular split orifices (inner side of each disc)
  orificeMeshL = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0f172a);
  orificeMeshR = makeOrificeMesh(orificeW, orificeLen, 0.05, 0x0f172a);

  orificeMeshL.position.set(leftX + innerOffset, feedY, 0);
  orificeMeshR.position.set(rightX - innerOffset, feedY, 0);

  scene.add(orificeMeshL, orificeMeshR);

  // S-divider (visual)
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

// ===== Loop =====
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.02);
  frameDT = dt;

  // move forward
  spreaderZ += forwardSpeed * dt;

  hopper.position.z = spreaderZ;
  discL.position.z = spreaderZ;
  discR.position.z = spreaderZ;
  orificeMeshL.position.z = spreaderZ;
  orificeMeshR.position.z = spreaderZ;
  sDivider.position.z = spreaderZ;

  camera.position.set(0, camHeight, spreaderZ - camBack);
  camera.lookAt(0, 1, spreaderZ + camLookAhead);

  // discs rotate opposite
  const omega = (rpm * 2 * Math.PI) / 60;
  discL.rotation.y += omega * dt;
  discR.rotation.y -= omega * dt;

  // emit 50/50 from split feed
  const emit = Math.floor(pps * dt);
  const emitLeft = Math.floor(emit / 2);
  const emitRight = emit - emitLeft;

  const centerL = { x: leftX + innerOffset, z: spreaderZ };
  const centerR = { x: rightX - innerOffset, z: spreaderZ };

  for (let n = 0; n < emitLeft; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerL.x, centerL.z, orificeW, orificeLen);
    spawnFalling(i, p.x, feedY, p.z);
  }
  for (let n = 0; n < emitRight; n++) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    const p = sampleRect(centerR.x, centerR.z, orificeW, orificeLen);
    spawnFalling(i, p.x, feedY, p.z);
  }

  const meanSpeed = 9 + (rpm / 1200) * 18;
  const speedStd = 0.22 * meanSpeed;
  const g = -9.81;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    // riding disc
    if (state[i] === 2) {
      carryT[i] += dt;

      const which = discId[i];
      const discX = which === 0 ? leftX : rightX;
      const discAngle = which === 0 ? discL.rotation.y : discR.rotation.y;
      const discOmega = which === 0 ? omega : -omega;

      localR[i] = Math.min(discRadius - 0.02, localR[i] + radialDrift * dt);
      const phi = discAngle + localPhi[i];

      pos[i * 3] = discX + localR[i] * Math.cos(phi);
      pos[i * 3 + 1] = discY + 0.02;
      pos[i * 3 + 2] = spreaderZ + localR[i] * Math.sin(phi);

      if (carryT[i] >= carryDur[i]) {
        ejectFromDisc(i, discX, discAngle, discOmega, meanSpeed, speedStd);
      }

      setInstance(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      continue;
    }

    // falling / thrown
    vel[i * 3 + 1] += g * dt;

    vel[i * 3] *= (1 - drag);
    vel[i * 3 + 1] *= (1 - drag);
    vel[i * 3 + 2] *= (1 - drag);

    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // pickup window: falling touches disc -> start carry
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + pickupWindow) {
      const dxL = pos[i * 3] - leftX;
      const dzL = pos[i * 3 + 2] - spreaderZ;
      const dxR = pos[i * 3] - rightX;
      const dzR = pos[i * 3 + 2] - spreaderZ;

      if (Math.hypot(dxL, dzL) <= discRadius) {
        beginCarry(i, 0, leftX, discL.rotation.y);
      } else if (Math.hypot(dxR, dzR) <= discRadius) {
        beginCarry(i, 1, rightX, discR.rotation.y);
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
