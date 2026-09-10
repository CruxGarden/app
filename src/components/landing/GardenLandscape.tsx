import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GARDEN_PLACES, type GardenPlaceId, type GardenWorld } from './worlds';

/** A small original diorama. Rendering is demand-driven: no perpetual RAF loop. */
export default function GardenLandscape({
  world,
  onSelect,
}: {
  world: GardenWorld;
  onSelect: (id: GardenPlaceId) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  const [unavailable, setUnavailable] = useState(false);
  const reset = useRef<() => void>(() => {});
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      `${world.name} garden. Drag to look around; choose a place using the buttons below.`,
    );
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.dataset.testid = 'garden-canvas';
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-12, 12, 10, -10, 0.1, 100);
    camera.position.set(17, 15, 21);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 1.3;
    controls.rotateSpeed = 0.55;
    controls.update();
    controls.saveState();
    // Preserve vertical page scrolling on phones; horizontal gestures orbit.
    renderer.domElement.style.touchAction = 'pan-y';
    scene.add(new THREE.HemisphereLight('#fff9e9', world.night ? '#625376' : '#8a9277', 2.5));
    const sun = new THREE.DirectionalLight('#fff1d5', world.night ? 2.1 : 3);
    sun.position.set(-8, 17, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    const garden = new THREE.Group();
    scene.add(garden);
    const materials: THREE.Material[] = [];
    const material = (color: string, opacity = 1) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        flatShading: true,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
      });
      materials.push(m);
      return m;
    };
    const grass = material(world.ground),
      stone = material(world.rock),
      leaves = material(world.leaf);
    const wall = material(world.id === 'glumlot' ? '#a79cba' : '#f2dfbd');
    const roof = material(world.roof),
      wood = material('#685848'),
      trim = material(world.night ? '#d9c9a7' : '#f7ecd1');
    const glass = material(world.water, 0.38),
      water = material(world.water);
    const dark = material('#344d48'),
      light = material(world.night ? '#ffcd8b' : '#b4d6cc');
    const mesh = (
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const object = new THREE.Mesh(geometry, mat);
      object.position.set(x, y, z);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };
    const box = (
      parent: THREE.Object3D,
      size: number[],
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), mat, x, y, z);
    const segments = world.id === '8-bit' ? 4 : 13;
    const base = mesh(garden, new THREE.CylinderGeometry(8.7, 7, 2.4, segments), stone, 0, -0.7, 0);
    base.scale.z = 0.76;
    const soil = mesh(
      garden,
      new THREE.CylinderGeometry(8.9, 8.7, 0.45, segments),
      grass,
      0,
      0.7,
      0,
    );
    soil.scale.z = 0.76;
    const shadow = mesh(
      scene,
      new THREE.CircleGeometry(11, 48),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
      0,
      -2.1,
      0,
    );
    shadow.rotation.x = -Math.PI / 2;
    materials.push(shadow.material);
    // A winding watercourse runs behind the buildings, out over the island edge.
    const points = [
      [-7, 1, -1.6],
      [-4.7, 1, -3.4],
      [-1, 1, -3.8],
      [3.3, 1, -3.1],
      [6.6, 0.95, -2.7],
      [7.7, -0.2, -2.5],
      [7.7, -2.4, -2.5],
    ].map((p) => new THREE.Vector3(...p));
    mesh(
      garden,
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, 0.32, 6, false),
      water,
      0,
      0,
      0,
    );
    // Stepping stones connect the four places.
    for (let i = 0; i < 20; i++) {
      const angle = (i * Math.PI * 2) / 20;
      mesh(
        garden,
        new THREE.CylinderGeometry(0.3, 0.34, 0.12, 6),
        trim,
        Math.cos(angle) * 3.5,
        1,
        Math.sin(angle) * 2.4 + 0.4,
      );
    }
    const groups = new Map<GardenPlaceId, THREE.Group>();
    for (const place of GARDEN_PLACES) {
      const group = new THREE.Group();
      group.userData.place = place.id;
      group.position.set(place.position[0], place.position[1], place.position[2]);
      garden.add(group);
      groups.set(place.id, group);
    }
    const centre = groups.get('site')!;
    box(centre, [4.5, 0.2, 3.8], trim, 0, 0.1, 0);
    if (world.id === 'ancient-egypt') {
      const pyramid = mesh(centre, new THREE.ConeGeometry(3, 4, 4), roof, 0, 2, 0);
      pyramid.rotation.y = Math.PI / 4;
      box(centre, [0.6, 0.9, 0.15], dark, 0, 0.55, 2);
    } else {
      box(centre, [4, 2.3, 3.2], glass, 0, 1.35, 0);
      const canopy = mesh(centre, new THREE.ConeGeometry(3, 1.7, 4), glass, 0, 3.3, 0);
      canopy.rotation.y = Math.PI / 4;
      canopy.scale.z = 0.85;
      const edges = new THREE.EdgesGeometry(canopy.geometry);
      const edgeMat = new THREE.LineBasicMaterial({ color: world.night ? '#f8d5a0' : '#e6e6c5' });
      materials.push(edgeMat);
      const roofFrame = new THREE.LineSegments(edges, edgeMat);
      roofFrame.position.copy(canopy.position);
      roofFrame.rotation.copy(canopy.rotation);
      roofFrame.scale.copy(canopy.scale);
      centre.add(roofFrame);
      for (const x of [-2, -1, 0, 1, 2]) {
        for (const z of [-1.6, 1.6]) box(centre, [0.065, 2.5, 0.065], trim, x, 1.35, z);
      }
      for (const y of [0.35, 1.35, 2.5]) {
        for (const z of [-1.6, 1.6]) box(centre, [4.1, 0.07, 0.07], trim, 0, y, z);
        for (const x of [-2, 2]) box(centre, [0.07, 0.07, 3.2], trim, x, y, 0);
      }
      box(centre, [0.85, 1.5, 0.1], wood, 0, 0.95, 1.66);
      box(centre, [0.65, 1.3, 0.11], light, 0, 0.96, 1.68);
      mesh(centre, new THREE.IcosahedronGeometry(0.7, 0), leaves, -0.9, 0.9, 0.4);
      mesh(centre, new THREE.IcosahedronGeometry(0.9, 0), leaves, 1, 1.1, -0.6);
    }
    const arcade = groups.get('game')!;
    box(arcade, [2, 1.65, 2], wall, 0, 0.85, 0);
    const arcadeRoof = mesh(arcade, new THREE.ConeGeometry(1.7, 1.1, 4), roof, 0, 2.15, 0);
    arcadeRoof.rotation.y = Math.PI / 4;
    box(arcade, [1.1, 1.25, 0.13], dark, 0, 0.8, 1.03);
    box(arcade, [0.8, 0.5, 0.14], light, 0, 1.02, 1.07);
    box(arcade, [1.25, 0.18, 0.6], roof, 0, 0.5, 1.25);
    for (const x of [-0.25, 0.2])
      mesh(arcade, new THREE.SphereGeometry(0.1, 8, 6), trim, x, 0.65, 1.35);
    const workshop = groups.get('tool')!;
    box(workshop, [2.3, 1.9, 2.1], wall, 0, 1, 0);
    box(workshop, [2.7, 0.22, 2.5], roof, 0, 2.08, 0);
    box(workshop, [0.8, 1.45, 0.08], wood, 0.4, 0.8, 1.07);
    box(workshop, [0.65, 0.65, 0.1], light, -0.62, 1.25, 1.09);
    box(workshop, [0.25, 0.7, 0.25], stone, 0.65, 2.4, -0.45);
    const tower = groups.get('story')!;
    const tall = world.id === '80s-fantasy' ? 1.4 : 1;
    mesh(tower, new THREE.CylinderGeometry(0.78, 0.92, 2.5 * tall, 10), wall, 0, 1.25 * tall, 0);
    mesh(tower, new THREE.ConeGeometry(1.14, 1.55, 10), roof, 0, 2.5 * tall + 0.65, 0);
    box(tower, [0.42, 0.8, 0.1], dark, 0, 0.55, 0.86);
    box(tower, [0.3, 0.5, 0.1], light, 0, 1.85 * tall, 0.79);
    // Small original trees and flowers. A deterministic pattern keeps rebuilds stable.
    const positions = [
      [-7, -1],
      [-6, -3],
      [-3.8, -4.4],
      [3.3, -4],
      [5.8, -2.7],
      [6.6, 2.6],
      [3.8, 4.3],
      [-4, 3.8],
      [-6.3, 3.1],
      [2, 4.8],
      [-2.7, -1.3],
    ];
    positions.forEach(([x = 0, z = 0], i) => {
      const height = 1.4 + (i % 3) * 0.45;
      mesh(garden, new THREE.CylinderGeometry(0.11, 0.18, height, 6), wood, x, 1 + height / 2, z);
      if (world.id === 'ancient-egypt') {
        for (let j = 0; j < 5; j++) {
          const frond = box(
            garden,
            [1.4, 0.11, 0.38],
            leaves,
            x + Math.cos(j * 1.26) * 0.5,
            1 + height,
            z + Math.sin(j * 1.26) * 0.5,
          );
          frond.rotation.y = -j * 1.26;
          frond.rotation.z = 0.18;
        }
      } else {
        const crown =
          world.id === '8-bit'
            ? new THREE.BoxGeometry(1.3, 1.5, 1.3)
            : world.id === 'siberian-blizzard'
              ? new THREE.ConeGeometry(0.85, 2, 6)
              : new THREE.IcosahedronGeometry(0.9, 0);
        const tree = mesh(garden, crown, leaves, x, height + 1.35, z);
        if (world.id === 'paper-theatre') tree.scale.z = 0.12;
      }
    });
    for (let i = 0; i < 45; i++) {
      const angle = i * 2.399;
      const radius = 3.8 + (i % 6) * 0.54;
      const x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius * 0.7;
      mesh(garden, new THREE.ConeGeometry(0.1, 0.4, 4), leaves, x, 1.12, z);
      if (i % 3 === 0) mesh(garden, new THREE.IcosahedronGeometry(0.13, 0), roof, x, 1.39, z);
    }
    if (world.night || world.id === 'paper-theatre') {
      mesh(
        garden,
        new THREE.SphereGeometry(world.id === 'paper-theatre' ? 1.2 : 0.7, 16, 12),
        trim,
        -5,
        6,
        -4,
      );
      if (world.id === 'glumlot') {
        const ring = mesh(garden, new THREE.TorusGeometry(2, 0.08, 6, 32), roof, 0, 6.2, -1);
        ring.rotation.x = 1.2;
      }
    }
    let visible = true;
    const render = () => {
      if (visible && !document.hidden) renderer.render(scene, camera);
    };
    const resize = () => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height) return;
      const span = width / height < 1 ? 12.3 : 10;
      camera.left = (-span * width) / height;
      camera.right = (span * width) / height;
      camera.top = span;
      camera.bottom = -span;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible) render();
    });
    intersection.observe(element);
    controls.addEventListener('change', render);
    document.addEventListener('visibilitychange', render);
    const lost = (event: Event) => {
      event.preventDefault();
      setUnavailable(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const hit = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      let object: THREE.Object3D | null =
        raycaster.intersectObjects([...groups.values()], true)[0]?.object ?? null;
      while (object && !object.userData.place) object = object.parent;
      return object?.userData.place as GardenPlaceId | undefined;
    };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pointerMove = (e: PointerEvent) => {
      renderer.domElement.style.cursor = hit(e) ? 'pointer' : 'grab';
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const id = hit(e);
      if (id) select.current(id);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    reset.current = () => {
      controls.reset();
      render();
    };
    resize();
    return () => {
      reset.current = () => {};
      intersection.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', render);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments)
          object.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [world]);
  return (
    <div className="garden-landscape" data-world={world.id}>
      <div className="garden-landscape-canvas" ref={host} />
      {unavailable && (
        <div className="garden-fallback" role="status">
          <span aria-hidden="true">✳</span>
          <p>A world of possibilities.</p>
          <small>Explore the places below.</small>
        </div>
      )}
      {!unavailable && (
        <button
          className="garden-reset"
          onClick={() => reset.current()}
          aria-label="Reset garden view"
        >
          ↺ Reset view
        </button>
      )}
    </div>
  );
}
