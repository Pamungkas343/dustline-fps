// render.js — three.js scene. Builds the map from map.js, syncs meshes from
// state every frame. No game logic: positions, health and effects come from state.
import * as THREE from 'three';
import { BOXES, SITES, BOUNDS, eyeHeight, chestHeight } from './map.js';

const PALETTE = {
  concrete: 0x8a8f98, steel: 0x3c4148, sand: 0xb59a6a, rust: 0xa85b32,
  teal: 0x2ec4b6, orange: 0xe36414, dark: 0x2a2e33, crate: 0x9c7f56,
};
const TEAM_COLOR = { vanguard: 0x2ec4b6, jackals: 0xe36414 };

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,18,0.55)';
  g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
  g.strokeStyle = color; g.lineWidth = 6;
  g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
  g.fillStyle = color; g.font = '900 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nameTexture(name, colorCss) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = '900 30px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = colorCss;
  g.fillText(name, 128, 20);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createRenderer(state, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8d5a8);
  scene.fog = new THREE.Fog(0xe8d5a8, 45, 130);

  const hemi = new THREE.HemisphereLight(0xffe8c0, 0x7a6a52, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.0);
  sun.position.set(25, 35, -15);
  scene.add(sun);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS.maxX - BOUNDS.minX + 4, BOUNDS.maxZ - BOUNDS.minZ + 4),
    new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // lane strips (readable lanes) + site floor tints
  function flatStrip(x, z, w, d, color, opacity) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    scene.add(m);
  }
  flatStrip(0, -14, 56, 4, 0x6b5b3e, 0.35);
  flatStrip(0, 0, 56, 4, 0x6b5b3e, 0.35);
  flatStrip(0, 14, 56, 4, 0x6b5b3e, 0.35);
  for (const k of ['A', 'B']) {
    const s = SITES[k];
    flatStrip(s.cx, s.cz, s.x1 - s.x0, s.z1 - s.z0, k === 'A' ? 0x2ec4b6 : 0xe36414, 0.18);
  }

  // boxes
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = {};
  for (const [k, v] of Object.entries(PALETTE)) {
    mats[k] = new THREE.MeshStandardMaterial({ color: v, roughness: 0.9, metalness: 0.05 });
  }
  for (const b of BOXES) {
    const m = new THREE.Mesh(boxGeo, mats[b.c] || mats.concrete);
    m.scale.set(b.w, b.h, b.d);
    m.position.set(b.x, b.h / 2, b.z);
    scene.add(m);
    // thin darker top edge for readability
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.02, 0.06, b.d + 0.02),
      new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 1 })
    );
    top.position.set(b.x, b.h + 0.01, b.z);
    scene.add(top);
  }

  // site beacons: beam + ring + floating letter
  for (const k of ['A', 'B']) {
    const s = SITES[k];
    const col = k === 'A' ? 0x2ec4b6 : 0xe36414;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 7, 8),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 })
    );
    beam.position.set(s.cx, 3.5, s.cz);
    scene.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.0, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.cx, 0.03, s.cz);
    scene.add(ring);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: letterTexture(k, k === 'A' ? '#2ec4b6' : '#e36414'), transparent: true, side: THREE.DoubleSide })
    );
    letter.position.set(s.cx, 3.6, s.cz);
    scene.add(letter);
  }

  // ---- actors ----
  const actorMeshes = new Map();
  function buildActorMesh(actor) {
    const g = new THREE.Group();
    const col = TEAM_COLOR[actor.team];
    const bodyMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.85, 4, 10), bodyMat);
    body.position.y = 0.95;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), darkMat);
    head.position.y = 1.62;
    g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.1),
      new THREE.MeshBasicMaterial({ color: actor.team === 'vanguard' ? 0x9ff5ec : 0xffc9a3 }));
    visor.position.set(0, 1.64, -0.22);
    g.add(visor);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.7), darkMat);
    gun.position.set(0.25, 1.25, -0.4);
    g.add(gun);
    // name + health bar sprite (canvas, updated on hp change)
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(1.6, 0.4, 1);
    spr.position.y = 2.15;
    g.add(spr);
    scene.add(g);
    return { group: g, canvas, tex, lastHp: -1 };
  }
  function drawTag(actor, mesh) {
    const hp = Math.max(0, Math.ceil(actor.hp));
    if (mesh.lastHp === hp && mesh.lastHp !== -1) return;
    mesh.lastHp = hp;
    const g = mesh.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = '900 26px sans-serif';
    g.textAlign = 'center';
    g.fillStyle = actor.team === 'vanguard' ? '#7df0e2' : '#ffb38a';
    g.fillText(actor.name, 128, 22);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(58, 34, 140, 12);
    g.fillStyle = hp > 30 ? '#37d67a' : '#d63a37';
    g.fillRect(58, 34, 140 * hp / 100, 12);
  }

  // ---- player viewmodel ----
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 250);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const gunGroup = new THREE.Group();
  const gunDark = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6, metalness: 0.3 });
  const gunAccent = new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.5, metalness: 0.4 });
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), gunDark);
  gunGroup.add(recv);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34), gunDark);
  barrel.position.set(0, 0.03, -0.4);
  gunGroup.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), gunDark);
  mag.position.set(0, -0.13, -0.05);
  gunGroup.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.12), gunAccent);
  sight.position.set(0, 0.1, -0.1);
  gunGroup.add(sight);
  gunGroup.position.set(0.28, -0.24, -0.5);
  camera.add(gunGroup);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  flash.position.set(0, 0.03, -0.58);
  gunGroup.add(flash);
  const flashLight = new THREE.PointLight(0xffc860, 0, 6);
  flashLight.position.set(0, 0, -0.6);
  gunGroup.add(flashLight);

  // ---- fx pools ----
  const tracerPool = [];
  for (let i = 0; i < 16; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push(line);
  }
  const impactPool = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0 })
    );
    scene.add(m);
    impactPool.push(m);
  }
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7d3c, transparent: true, opacity: 0 })
  );
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff7d3c, 0, 30);
  scene.add(boomLight);

  // ---- bomb mesh ----
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.5 }));
  bombGroup.add(bombBody);
  const bombLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  bombLamp.position.set(0, 0.2, 0);
  bombGroup.add(bombLamp);
  bombGroup.visible = false;
  scene.add(bombGroup);

  let walkCycle = 0;
  let lastShotT = -9;

  function syncActor(actor, t) {
    let mesh = actorMeshes.get(actor.id);
    if (!mesh) { mesh = buildActorMesh(actor); actorMeshes.set(actor.id, mesh); }
    const g = mesh.group;
    g.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    if (!actor.alive) {
      g.rotation.set(-Math.PI / 2 * 0.9, actor.yaw, 0);
      g.position.y = 0.25;
    } else {
      g.rotation.set(0, actor.yaw, 0);
      g.position.y = actor.pos.y;
    }
    drawTag(actor, mesh);
    return mesh;
  }

  return {
    dom: renderer.domElement,
    render(state, dt) {
      const t = state.time;
      const p = state.player;
      // camera
      if (state.phase === 'title') {
        const a = t * 0.07;
        camera.position.set(Math.cos(a) * 34, 17, Math.sin(a) * 34);
        camera.lookAt(0, 1, 0);
      } else if (p && p.alive) {
        camera.position.set(p.pos.x, eyeHeight(p), p.pos.z);
        camera.rotation.y = p.yaw;
        camera.rotation.x = p.pitch;
        camera.rotation.z = 0;
      } else {
        // spectate first alive ally
        const ally = state.bots.find(b => b.alive && b.team === 'vanguard');
        if (ally) {
          camera.position.set(ally.pos.x, eyeHeight(ally), ally.pos.z);
          camera.rotation.y = ally.yaw;
          camera.rotation.x = ally.pitch;
          camera.rotation.z = 0;
        }
      }
      // actors
      if (p) {
        // hide the player's own body mesh (first-person) — keep tag off too
        const pm = actorMeshes.get(p.id);
        if (pm) pm.group.visible = false;
      }
      for (const b of state.bots) syncActor(b, t);
      // viewmodel bob + recoil
      if (p) {
        walkCycle += (p.moving ? dt * 9 : 0);
        const bobY = p.moving ? Math.sin(walkCycle) * 0.012 : 0;
        const bobX = p.moving ? Math.cos(walkCycle * 0.5) * 0.008 : 0;
        gunGroup.position.set(0.28 + bobX, -0.24 + bobY, -0.5);
        if (p.lastShotT !== lastShotT) {
          lastShotT = p.lastShotT;
          gunGroup.position.z = -0.42;
          flash.material.opacity = 0.95;
          flashLight.intensity = 4;
        }
        gunGroup.position.z += (-0.5 - gunGroup.position.z) * Math.min(1, dt * 14);
        flash.material.opacity = Math.max(0, flash.material.opacity - dt * 14);
        flashLight.intensity = Math.max(0, flashLight.intensity - dt * 60);
        // hide viewmodel when dead / in menus
        gunGroup.visible = p.alive && (state.phase === 'live' || state.phase === 'roundEnd');
      }
      // tracers
      tracerPool.forEach((line, i) => {
        const tr = state.tracers[i];
        if (!tr) { line.material.opacity = 0; return; }
        const age = t - tr.t;
        const pos = line.geometry.attributes.position;
        pos.setXYZ(0, tr.a.x, tr.a.y, tr.a.z);
        pos.setXYZ(1, tr.b.x, tr.b.y, tr.b.z);
        pos.needsUpdate = true;
        line.material.color.set(tr.color || '#ffe9a8');
        line.material.opacity = Math.max(0, 0.9 * (1 - age / (tr.life + 0.05)));
      });
      // impacts
      impactPool.forEach((m, i) => {
        const im = state.impacts[i];
        if (!im) { m.material.opacity = 0; return; }
        const age = t - im.t;
        m.position.set(im.pos.x, im.pos.y, im.pos.z);
        const s = 1 + age * 6;
        m.scale.set(s, s, s);
        m.material.opacity = Math.max(0, 0.9 * (1 - age / (im.life + 0.05)));
        if (im.kind === 'boom') { m.material.color.set(0xff7d3c); m.scale.set(s * 2, s * 2, s * 2); }
        else m.material.color.set(0xffd27d);
      });
      // explosion flash (bomb detonation uses impacts kind boom)
      const boomImp = state.impacts.find(i => i.kind === 'boom');
      if (boomImp) {
        const age = t - boomImp.t;
        boom.position.set(boomImp.pos.x, Math.max(1, boomImp.pos.y), boomImp.pos.z);
        const s = 1 + age * 14;
        boom.scale.set(s, s, s);
        boom.material.opacity = Math.max(0, 0.75 * (1 - age / 0.55));
        boomLight.position.copy(boom.position);
        boomLight.intensity = Math.max(0, 60 * (1 - age / 0.55));
      } else {
        boom.material.opacity = 0;
        boomLight.intensity = 0;
      }
      // bomb mesh
      const bomb = state.bomb;
      if ((bomb.state === 'planted' || bomb.state === 'dropped') && bomb.pos) {
        bombGroup.visible = true;
        bombGroup.position.set(bomb.pos.x, 0.16, bomb.pos.z);
        bombLamp.material.color.set(Math.sin(t * 8) > 0 ? 0xff3b30 : 0x550000);
      } else {
        bombGroup.visible = false;
      }
      renderer.render(scene, camera);
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },
  };
}
