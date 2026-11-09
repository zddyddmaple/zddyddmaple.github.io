import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

const CAMERA_NAME = "Camera | MAIN oblique entrance view";
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_YAW = THREE.MathUtils.degToRad(REDUCED ? 1.1 : 4.2);
const MAX_PITCH = THREE.MathUtils.degToRad(REDUCED ? 0.8 : 3.1);

const canvas = document.querySelector("#view");
const boot = document.querySelector("#boot");
const bootStatus = document.querySelector("#boot-status");
const sheet = document.querySelector("#sheet");
const panels = [...document.querySelectorAll(".panel")];
const navButtons = [...document.querySelectorAll("nav button")];

const pointer = new THREE.Vector2(0, 0);
const pointerSmoothed = new THREE.Vector2(0, 0);
let hasPointer = false;
let lookX = 0;
let lookY = 0;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
} catch (error) {
  document.body.classList.add("no-webgl");
  throw error;
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x0b1120, 1);
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1120);
scene.fog = new THREE.FogExp2(0x0b1120, 0.012);

const camera = new THREE.PerspectiveCamera(21.24, 1, 0.05, 100);
const baseQuat = new THREE.Quaternion();
const lookQuat = new THREE.Quaternion();
const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const lampRest = new THREE.Vector3();
const lampAim = new THREE.Vector3();
const lampDesired = new THREE.Vector3();
const rayPoint = new THREE.Vector3();
let pickables = [];

const lamp = new THREE.SpotLight(0xff9c4d, 420, 0, 0.5, 0.72, 2);
lamp.castShadow = true;
lamp.shadow.mapSize.set(1024, 1024);
lamp.shadow.bias = -0.0004;
lamp.shadow.normalBias = 0.03;
lamp.shadow.camera.near = 0.08;
lamp.shadow.camera.far = 7;
scene.add(lamp);
scene.add(lamp.target);

const bulbGlow = new THREE.PointLight(0xffb067, 6, 1.6, 2);
scene.add(bulbGlow);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

resize();
window.addEventListener("resize", resize);

window.addEventListener("pointermove", (event) => {
  hasPointer = true;
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

function openPanel(id) {
  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === id);
  });
  navButtons.forEach((button) => {
    const on = button.dataset.panel === id;
    if (on) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
}

function closePanel() {
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  navButtons.forEach((button) => button.removeAttribute("aria-current"));
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-current") === "true") closePanel();
    else openPanel(button.dataset.panel);
  });
});
document.querySelector("#close").addEventListener("click", closePanel);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePanel();
});

const PICKS = [
  { id: "about", test: (name) => name.includes("About physical") || name.includes("关于") },
  { id: "work", test: (name) => name.includes("Portfolio") || name.includes("作品") },
  { id: "life", test: (name) => name.includes("Experience") || name.includes("经历") },
  { id: "contact", test: (name) => name.includes("Contact") || name.includes("联系") },
];

let downX = 0;
let downY = 0;
window.addEventListener("pointerdown", (event) => {
  downX = event.clientX;
  downY = event.clientY;
});
window.addEventListener("pointerup", (event) => {
  if (event.target.closest("button, a, #sheet")) return;
  if (Math.hypot(event.clientX - downX, event.clientY - downY) > 8) return;
  const hit = castPointer(event.clientX, event.clientY)[0];
  if (!hit) return;
  let node = hit.object;
  while (node) {
    const name = nodeLabel(node);
    const match = PICKS.find((entry) => entry.test(name));
    if (match) {
      openPanel(match.id);
      return;
    }
    node = node.parent;
  }
});

function castPointer(clientX, clientY) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(pickables, false);
}

function addRoomLights(meta) {
  const hemi = new THREE.HemisphereLight(0x243044, 0x2a2118, 0.38);
  scene.add(hemi);

  for (const entry of meta.lights) {
    if (!entry.name.includes("desk lamp")) {
      const position = new THREE.Vector3(...entry.gltfPosition);
      const forward = new THREE.Vector3(...entry.gltfForward);
      if (entry.name.includes("window")) {
        const area = new THREE.RectAreaLight(new THREE.Color(...entry.color), 18, entry.size[0], entry.size[1]);
        area.position.copy(position);
        area.lookAt(position.clone().add(forward));
        scene.add(area);
      } else {
        const fill = new THREE.DirectionalLight(new THREE.Color(...entry.color), 0.55);
        fill.position.copy(position);
        fill.target.position.copy(position.clone().add(forward));
        scene.add(fill);
        scene.add(fill.target);
      }
    }
  }
}

function placeLamp(origin, rest) {
  const forward = rest.clone().sub(origin);
  if (forward.lengthSq() < 1e-6) forward.set(0, -1, 0);
  forward.normalize();
  lamp.position.copy(origin).addScaledVector(forward, 0.12);
  lampRest.copy(rest);
  lampAim.copy(rest);
  lamp.target.position.copy(rest);
  bulbGlow.position.copy(origin);
}

function nodeLabel(node) {
  return `${node?.name || ""} ${node?.userData?.name || ""}`;
}

function findNamed(root, name) {
  let found = null;
  root.traverse((node) => {
    if (nodeLabel(node).includes(name)) found = node;
  });
  return found;
}

function frameCamera(source) {
  source.updateWorldMatrix(true, false);
  camera.position.setFromMatrixPosition(source.matrixWorld);
  camera.quaternion.setFromRotationMatrix(source.matrixWorld);
  baseQuat.copy(camera.quaternion);
  camera.fov = source.fov;
  camera.near = source.near;
  camera.far = source.far;
  camera.updateProjectionMatrix();
}

function prepareModel(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const ghost = materials.some((material) => material && (material.transparent || material.opacity < 0.95 || material.transmission > 0));
    if (ghost || nodeLabel(node).includes("Lamp |") || nodeLabel(node).includes("Lamp_")) node.castShadow = false;
    pickables.push(node);
  });
}

async function loadStudio() {
  const [meta, gltf] = await Promise.all([
    fetch("assets/studio/scene.json").then((response) => response.json()),
    new GLTFLoader().loadAsync("assets/studio/studio.glb"),
  ]);
  scene.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  prepareModel(gltf.scene);

  let source = null;
  const cameraNames = [];
  gltf.scene.traverse((node) => {
    if (!node.isCamera) return;
    cameraNames.push(nodeLabel(node));
    if (nodeLabel(node).includes("MAIN")) source = node;
  });
  if (!source) throw new Error("场景里没有主相机 " + cameraNames.join(" || "));
  frameCamera(source);

  const originNode = findNamed(gltf.scene, "WEB_lamp_origin");
  const restNode = findNamed(gltf.scene, "WEB_lamp_rest");
  if (!originNode || !restNode) throw new Error("没有台灯定位");
  const origin = new THREE.Vector3();
  const rest = new THREE.Vector3();
  originNode.getWorldPosition(origin);
  restNode.getWorldPosition(rest);
  placeLamp(origin, rest);
  addRoomLights(meta);

  const bulb = gltf.scene.getObjectByName("Lamp | glowing bulb");
  if (bulb && bulb.material) {
    const material = Array.isArray(bulb.material) ? bulb.material[0] : bulb.material;
    material.emissive = new THREE.Color(0xffb15a);
    material.emissiveIntensity = 2.4;
  }

  boot.classList.add("done");
  window.setTimeout(() => boot.remove(), 520);
  renderer.setAnimationLoop(render);
}

function render() {
  try {
  pointerSmoothed.lerp(pointer, REDUCED ? 0.18 : 0.075);
  const targetLookX = hasPointer ? pointerSmoothed.x : 0;
  const targetLookY = hasPointer ? -pointerSmoothed.y : 0;
  lookX += (targetLookX - lookX) * (REDUCED ? 0.2 : 0.08);
  lookY += (targetLookY - lookY) * (REDUCED ? 0.2 : 0.08);
  lookEuler.set(-lookY * MAX_PITCH, -lookX * MAX_YAW, 0, "YXZ");
  lookQuat.setFromEuler(lookEuler);
  camera.quaternion.copy(baseQuat).multiply(lookQuat);

  if (hasPointer) {
    const hits = castPointer(
      ((pointerSmoothed.x + 1) / 2) * window.innerWidth,
      ((pointerSmoothed.y + 1) / 2) * window.innerHeight,
    );
    if (hits.length) lampDesired.copy(hits[0].point);
    else raycaster.ray.at(4.5, lampDesired);
  } else {
    lampDesired.copy(lampRest);
  }
  lampAim.lerp(lampDesired, REDUCED ? 0.2 : 0.16);
  lamp.target.position.copy(lampAim);

  renderer.render(scene, camera);
  } catch (error) {
    console.log("RENDER " + (error && error.stack ? error.stack : error));
    renderer.setAnimationLoop(null);
  }
}

loadStudio().catch((error) => {
  console.log("LOAD " + (error && error.stack ? error.stack : error));
  bootStatus.textContent = "这间屋子没能打开";
  document.body.classList.add("no-webgl");
});
