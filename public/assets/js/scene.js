/* ============================================================
   Global Coffee Board — 3D background
   Floats instances of the coffee-cherry-to-bean GLB model over
   the cinematic photo backdrop, with warm studio lighting and
   a soft environment for realistic reflections. Transparent
   canvas so the photos show through. ES module (loaded via an
   import map on the home page). Degrades to nothing if WebGL
   or the model is unavailable — the photos + scrim remain.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL_URL = "/images/coffee-cherry-to-bean.glb";

const canvas = document.getElementById("bean-canvas");
if (canvas && window.WebGLRenderingContext) {
  try { init(canvas); } catch (e) { console.warn("3D scene disabled:", e); }
}

function init(canvas) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.innerWidth < 720;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 16);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // Soft studio environment for realistic reflections on the model's materials.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;

  // Cinematic key + amber rim + cool fill.
  scene.add(new THREE.AmbientLight(0x40301c, 0.6));
  const key = new THREE.DirectionalLight(0xffe1b0, 2.6); key.position.set(6, 9, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a45, 1.5); rim.position.set(-9, 2, -6); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x6a7bd0, 0.4); fill.position.set(-5, -6, 5); scene.add(fill);

  const group = new THREE.Group();
  scene.add(group);
  const items = [];

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
  loader.setDRACOLoader(draco);

  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;

      // Center + normalise the model to a consistent size.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;

      const proto = new THREE.Group();
      proto.add(model);
      proto.scale.setScalar(2.4 / maxDim);

      const COUNT = isMobile ? 6 : 14;
      for (let i = 0; i < COUNT; i++) {
        const m = proto.clone(true);
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 12;
        m.position.set(Math.cos(a) * r * 0.95, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16 - 2);
        m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        const s = 0.55 + Math.random() * 0.85;
        m.scale.multiplyScalar(s);
        group.add(m);
        items.push({
          mesh: m,
          spin: new THREE.Vector3((Math.random() - .5) * .006, (Math.random() - .5) * .008, (Math.random() - .5) * .004),
          float: 0.25 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
          baseY: m.position.y,
        });
      }
    },
    undefined,
    (err) => console.warn("Could not load coffee model:", err)
  );

  const target = { x: 0, y: 0 };
  window.addEventListener("pointermove", (e) => {
    target.x = e.clientX / window.innerWidth - 0.5;
    target.y = e.clientY / window.innerHeight - 0.5;
  });
  let scrollY = window.scrollY || 0;
  window.addEventListener("scroll", () => { scrollY = window.scrollY || 0; }, { passive: true });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.01;
    if (!reduce) {
      for (const it of items) {
        it.mesh.rotation.x += it.spin.x;
        it.mesh.rotation.y += it.spin.y;
        it.mesh.rotation.z += it.spin.z;
        it.mesh.position.y = it.baseY + Math.sin(t + it.phase) * it.float;
      }
      group.rotation.y += 0.0006;
    }
    camera.position.x += (target.x * 3 - camera.position.x) * 0.04;
    camera.position.y += (-target.y * 2 - scrollY * 0.002 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  animate();
}
