/* ============================================================
   Global Coffee Board — 3D floating coffee beans
   Classic script (no ES module) so it works over file://, the
   IDE preview pane, and http alike. Uses the global THREE from
   the CDN UMD build. Falls back to CSS beans if THREE is absent
   (offline / CDN blocked) so the hero never looks bland.
   ============================================================ */
(function () {
  var canvas = document.getElementById("bean-canvas");
  if (!canvas) return;

  function cssFallback() {
    // Lightweight DOM beans so the background always has life.
    if (document.getElementById("css-beans")) return;
    var layer = document.createElement("div");
    layer.id = "css-beans";
    layer.setAttribute("aria-hidden", "true");
    var n = window.innerWidth < 720 ? 10 : 20;
    var html = "";
    for (var i = 0; i < n; i++) {
      var size = 26 + Math.random() * 70;
      var left = Math.random() * 100;
      var delay = -Math.random() * 18;
      var dur = 16 + Math.random() * 16;
      var rot = Math.random() * 360;
      html +=
        '<span class="css-bean" style="width:' + size + "px;height:" + size * 1.35 +
        "px;left:" + left + "%;animation-delay:" + delay + "s;animation-duration:" + dur +
        "s;transform:rotate(" + rot + 'deg)"></span>';
    }
    layer.innerHTML = html;
    document.body.appendChild(layer);
  }

  if (!window.THREE || !window.WebGLRenderingContext) { cssFallback(); return; }
  try { initScene(canvas); } catch (e) { console.warn("3D scene disabled:", e); cssFallback(); }

  function makeBeanGeometry() {
    var geo = new THREE.SphereGeometry(1, 40, 28);
    var pos = geo.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.x *= 1.0; v.y *= 0.62; v.z *= 1.42;
      var crease = Math.exp(-(v.x * v.x) * 9) * 0.32;
      v.y -= Math.sign(v.y || 1) * crease * Math.min(1, Math.abs(v.y) * 3 + 0.15);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function initScene(canvas) {
    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0e0a05, 0.055);

    var camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 16);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene.add(new THREE.AmbientLight(0x4a3418, 0.9));
    var key = new THREE.DirectionalLight(0xffd9a0, 2.4); key.position.set(6, 8, 10); scene.add(key);
    var rim = new THREE.DirectionalLight(0xe0a458, 1.1); rim.position.set(-8, -4, -6); scene.add(rim);
    var glow = new THREE.PointLight(0xf0c069, 1.6, 40); glow.position.set(0, 2, 8); scene.add(glow);

    var geo = makeBeanGeometry();
    var mat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.52, metalness: 0.15, emissive: 0x2a1a0a, emissiveIntensity: 0.4 });

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var isMobile = window.innerWidth < 720;
    var COUNT = isMobile ? 34 : 90;

    var beans = [];
    var group = new THREE.Group();
    for (var i = 0; i < COUNT; i++) {
      var m = new THREE.Mesh(geo, mat);
      var r = 3 + Math.random() * 14;
      var a = Math.random() * Math.PI * 2;
      m.position.set(Math.cos(a) * r * 0.9, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 18 - 2);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      var s = 0.4 + Math.random() * 0.9;
      m.scale.setScalar(s);
      beans.push({
        mesh: m,
        spin: new THREE.Vector3((Math.random() - .5) * .006, (Math.random() - .5) * .006, (Math.random() - .5) * .004),
        float: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        baseY: m.position.y,
      });
      group.add(m);
    }
    scene.add(group);

    var target = { x: 0, y: 0 };
    window.addEventListener("pointermove", function (e) {
      target.x = (e.clientX / window.innerWidth - 0.5);
      target.y = (e.clientY / window.innerHeight - 0.5);
    });

    var scrollY = 0;
    window.addEventListener("scroll", function () { scrollY = window.scrollY || 0; }, { passive: true });

    window.addEventListener("resize", function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    var t = 0;
    function animate() {
      requestAnimationFrame(animate);
      t += 0.01;
      if (!reduce) {
        for (var i = 0; i < beans.length; i++) {
          var b = beans[i];
          b.mesh.rotation.x += b.spin.x;
          b.mesh.rotation.y += b.spin.y;
          b.mesh.rotation.z += b.spin.z;
          b.mesh.position.y = b.baseY + Math.sin(t + b.phase) * b.float;
        }
        group.rotation.y += 0.0008;
      }
      camera.position.x += (target.x * 3 - camera.position.x) * 0.04;
      camera.position.y += (-target.y * 2 - (scrollY * 0.002) - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();
  }
})();
