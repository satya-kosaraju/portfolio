import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

console.log("WEBDEM VERSION v5 LOADED (blade pickup)");

const canvas = document.getElementById("webdem-canvas");

let renderer, scene, camera, clock;
let particlesMesh, tmpObj;
let ground, hopper, discL, discR;

const MAX = 60000;

// Particle data
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const alive = new Uint8Array(MAX);

// state: 0 = falling, 1 = thrown
const state = new Uint8Array(MAX);

// which disc: 0 none, 1 left, 2 right (for debug/logic)
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

// Spreader forward motion (+Z) so you see a swath trail
let spreaderZ = 0;
const forwardSpeed = 6.0; // m/s visual

// Disc geometry / physics settings
const discY = 0.60;
const discRadius = 0.95;
const leftX = -1.35;
const rightX = 1.35;
const bladeCount = 4;

// Feed/orifice (between discs)
const feedY = 1.35; // start height
const feedSpread = 0.10; // x/z noise (meters)

// Simple normal random
function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function spawnFalling(i, x, y, z) {
  alive[i] = 1;
  state[i] = 0; // falling
  discId[i] = 0;

  pos[i * 3] = x;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z;

  // falling: almost no horizontal velocity (like dropping through orifice)
  vel[i * 3] = 0.15 * randn();
  vel[i * 3 + 1] = -0.2 + 0.05 * randn();
  vel[i * 3 + 2] = 0.15 * randn();
}

// When particle contacts a disc, “blade pickup” gives it a kick
function bladeKick(i, whichDisc, discAngleY, omega, particleSpeedMean, particleSpeedStd) {
  state[i] = 1;
  discId[i] = whichDisc;

  const x = pos[i * 3];
  const z = pos[i * 3 + 2];

  const discX = whichDisc === 1 ? leftX : rightX;

  // Vector from disc center to particle contact point
  const rx = x - discX;
  const rz = z - spreaderZ;
  const r = Math.hypot(rx, rz);

  // Contact angle on disc (0..2pi)
  let theta = Math.atan2(rz, rx);

  // Find nearest blade angle (4 blades equally spaced)
  // blades are at discAngleY + k*(2π/bladeCount)
  const bladeStep = (2 * Math.PI) / bladeCount;

  // Normalize angle difference
  const rel = wrapToPi(theta - discAngleY);
  const k = Math.round(rel / bladeStep);
  const bladeTheta = discAngleY + k * bladeStep;

  // Tangential direction at bladeTheta (perpendicular to radius)
  // For a disc rotating about +Y:
  // tangential unit vector = (-sin, 0, cos) at bladeTheta
  const tx = -Math.sin(bladeTheta);
  const tz = Math.cos(bladeTheta);

  // Radial (outward) unit vector at bladeTheta
  const ux = Math.cos(bladeTheta);
  const uz = Math.sin(bladeTheta);

  // Sample particle ejection speed (variable)
  const speed = Math.max(2.0, particleSpeedMean + randn() * particleSpeedStd);

  // Disc rim tangential speed contribution ~ omega * r
  const rim = omega * Math.max(0.4, r); // keep non-zero
  const rimScale = 0.35; // how much rim speed contributes to throw

  // Rearward bias (real spreaders mostly throw backward relative to travel)
  // We'll push a bit in -Z direction.
  const rearBias = -0.35 * speed;

  // Compose ejection velocity:
  // - tangential component (blade pickup)
  // - radial component (vane/deflector)
  // - slight upward lift
  // - rear bias (swath)
  const tangential = 0.75 * speed + rimScale * rim;
  const radial = 0.55 * speed;

  let vx = tangential * tx + radial * ux;
  let vz = tangential * tz + radial * uz + rearBias;

  // Mirror effect: right disc often opposite spin; but we already pass omega sign via discAngle.
  // Add small stochastic spread
  vx *= (0.9 + 0.2 * Math.random());
  vz *= (0.9 + 0.2 * Math.random());

  // Give some upward velocity
  const vy = 2.2 + 1.0 * Math.random();

  vel[i * 3] = vx;
  vel[i * 3 + 1] = vy;
  vel[i * 3 + 2] = vz;

  // Move particle to disc plane so it doesn't instantly “miss”
  pos[i * 3 + 1] = discY + 0.02;
}

function wrapToPi(a) {
  // Wrap angle to [-pi, pi]
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();

  // Fixed camera so swath is visible
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 10, 22);
  camera.lookAt(0, 0.9, 8);

  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x020617, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  hopper = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 1.6, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
  );
  hopper.position.set(0, 1.8, 0);
  scene.add(hopper);

  const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.15, 44);
  discL = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35 }));
  discR = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 }));

  discL.position.set(leftX, discY, 0);
  discR.position.set(rightX, discY, 0);

  scene.add(discL, discR);

  // Particles instanced mesh
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

  // Move spreader forward
  spreaderZ += forwardSpeed * dt;
  hopper.position.z = spreaderZ;
  discL.position.z = spreaderZ;
  discR.position.z = spreaderZ;

  // Spin discs (counter-rotating)
  const omegaMag = (rpm * 2 * Math.PI) / 60;
  const omegaL = +omegaMag;
  const omegaR = -omegaMag;

  discL.rotation.y += omegaL * dt;
  discR.rotation.y += omegaR * dt;

  // Variable throw speed settings (based on rpm)
  const meanSpeed = 9 + (rpm / 1200) * 16;
  const speedStd = 0.22 * meanSpeed;

  // Emit falling particles from orifice between discs
  const emit = Math.floor(pps * dt);
  for (let n = 0; n < emit; n++) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;

    const x = randn() * feedSpread;                  // between discs
    const z = spreaderZ + randn() * feedSpread;      // near orifice
    spawnFalling(i, x, feedY, z);
  }

  // Physics update
  const g = -9.81;
  const airDrag = 0.012;

  for (let i = 0; i < MAX; i++) {
    if (!alive[i]) continue;

    // Gravity always
    vel[i * 3 + 1] += g * dt;

    // Light drag
    vel[i * 3] *= (1 - airDrag);
    vel[i * 3 + 1] *= (1 - airDrag);
    vel[i * 3 + 2] *= (1 - airDrag);

    // Integrate
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

    // --- Disc contact / blade pickup ---
    if (state[i] === 0 && pos[i * 3 + 1] <= discY + 0.01) {
      const x = pos[i * 3];
      const z = pos[i * 3 + 2];

      // Check if inside left disc
      const dxL = x - leftX;
      const dzL = z - spreaderZ;
      const rL = Math.hypot(dxL, dzL);

      // Check if inside right disc
      const dxR = x - rightX;
      const dzR = z - spreaderZ;
      const rR = Math.hypot(dxR, dzR);

      // If it lands on a disc, apply blade kick
      if (rL <= discRadius) {
        bladeKick(i, 1, discL.rotation.y, omegaL, meanSpeed, speedStd);
      } else if (rR <= discRadius) {
        bladeKick(i, 2, discR.rotation.y, omegaR, meanSpeed, speedStd);
      }
    }

    // Ground hit -> despawn
    if (pos[i * 3 + 1] < 0.02) {
      alive[i] = 0;
      continue;
    }

    // Render instance
    tmpObj.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    tmpObj.updateMatrix();
    particlesMesh.setMatrixAt(i, tmpObj.matrix);
  }

  particlesMesh.instanceMatrix.needsUpdate = true;
  renderer.render(scene, camera);
}

init();
