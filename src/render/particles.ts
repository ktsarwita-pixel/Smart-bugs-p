import * as THREE from 'three';

const MAX_PARTICLES = 900;

/**
 * Pooled particle system rendered as coloured points. Used for block breaks,
 * mining sparks, footstep dust and robot drill debris.
 */
export class ParticleSystem {
  private positions = new Float32Array(MAX_PARTICLES * 3);
  private colors = new Float32Array(MAX_PARTICLES * 3);
  private sizes = new Float32Array(MAX_PARTICLES);
  private velocities = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private gravity = new Float32Array(MAX_PARTICLES);
  private count = 0;

  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1, 1, 6, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(2, 2, 4, 4);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;

    this.material = new THREE.PointsMaterial({
      size: 0.14,
      map: tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.points);
  }

  spawn(
    position: THREE.Vector3,
    color: THREE.Color,
    count: number,
    speed = 2.4,
    spread = 0.35,
    gravity = 14,
    life = 0.9,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.count >= MAX_PARTICLES) break;
      const idx = this.count++;
      this.positions[idx * 3] = position.x + (Math.random() - 0.5) * spread;
      this.positions[idx * 3 + 1] = position.y + (Math.random() - 0.5) * spread;
      this.positions[idx * 3 + 2] = position.z + (Math.random() - 0.5) * spread;
      this.velocities[idx * 3] = (Math.random() - 0.5) * speed;
      this.velocities[idx * 3 + 1] = Math.random() * speed * 0.8 + 0.4;
      this.velocities[idx * 3 + 2] = (Math.random() - 0.5) * speed;
      this.colors[idx * 3] = color.r;
      this.colors[idx * 3 + 1] = color.g;
      this.colors[idx * 3 + 2] = color.b;
      this.sizes[idx] = 1;
      this.life[idx] = life * (0.7 + Math.random() * 0.6);
      this.maxLife[idx] = this.life[idx];
      this.gravity[idx] = gravity;
    }
  }

  update(dt: number): void {
    let write = 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.velocities[i * 3 + 1] -= this.gravity[i] * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.colors[i * 3] *= 0.995;
      this.colors[i * 3 + 1] *= 0.995;
      this.colors[i * 3 + 2] *= 0.995;

      if (write !== i) {
        for (let c = 0; c < 3; c++) {
          this.positions[write * 3 + c] = this.positions[i * 3 + c];
          this.colors[write * 3 + c] = this.colors[i * 3 + c];
          this.velocities[write * 3 + c] = this.velocities[i * 3 + c];
        }
        this.life[write] = this.life[i];
        this.maxLife[write] = this.maxLife[i];
        this.gravity[write] = this.gravity[i];
      }
      write++;
    }
    this.count = write;
    this.geometry.setDrawRange(0, this.count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.material.opacity = 1;
  }
}
