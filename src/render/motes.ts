import * as THREE from 'three';

const COUNT = 150;
const RANGE = 14;

/**
 * Drifting dust motes that follow the miner. In the dark they glow like
 * sparks in the air, which makes the caves feel alive.
 */
export class Motes {
  readonly points: THREE.Points;
  private positions = new Float32Array(COUNT * 3);
  private drift = new Float32Array(COUNT * 3);
  private phases = new Float32Array(COUNT);
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const colors = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * RANGE * 2;
      this.positions[i * 3 + 1] = (Math.random() - 0.5) * RANGE * 2;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE * 2;
      this.drift[i * 3] = (Math.random() - 0.5) * 0.16;
      this.drift[i * 3 + 1] = 0.02 + Math.random() * 0.09;
      this.drift[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
      this.phases[i] = Math.random() * Math.PI * 2;
      const warm = 0.7 + Math.random() * 0.3;
      colors[i * 3] = 0.95 * warm;
      colors[i * 3 + 1] = 0.85 * warm;
      colors[i * 3 + 2] = 0.55 * warm;
    }
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8, 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(8, 8, 7, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;

    this.material = new THREE.PointsMaterial({
      size: 0.09,
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'motes';
    this.points.renderOrder = 1;
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.points);
  }

  /**
   * Moves the motes and wraps them around the miner, so they are always
   * where the camera is looking.
   */
  update(dt: number, center: THREE.Vector3, light: number): void {
    const half = RANGE;
    for (let i = 0; i < COUNT; i++) {
      const x = i * 3;
      this.phases[i] += dt * 0.7;
      const wobble = Math.sin(this.phases[i]) * 0.06;
      this.positions[x] += (this.drift[x] + wobble) * dt;
      this.positions[x + 1] += this.drift[x + 1] * dt;
      this.positions[x + 2] += (this.drift[x + 2] + Math.cos(this.phases[i] * 0.8) * 0.06) * dt;

      // Wrap around the miner.
      let dx = this.positions[x] - center.x;
      let dy = this.positions[x + 1] - center.y;
      let dz = this.positions[x + 2] - center.z;
      if (dx > half) this.positions[x] -= half * 2;
      else if (dx < -half) this.positions[x] += half * 2;
      if (dy > half) this.positions[x + 1] -= half * 2;
      else if (dy < -half) this.positions[x + 1] += half * 2;
      if (dz > half) this.positions[x + 2] -= half * 2;
      else if (dz < -half) this.positions[x + 2] += half * 2;
    }
    this.geometry.attributes.position.needsUpdate = true;
    // They only really show in the dark.
    this.material.opacity = 0.08 + (1 - light) * 0.55;
  }
}
