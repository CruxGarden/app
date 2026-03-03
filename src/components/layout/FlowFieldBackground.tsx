import { useEffect, useRef } from 'react';

// ── Simplex 3D Noise ──────────────────────────────────────

const F3 = 1 / 3;
const G3 = 1 / 6;

// Gradient vectors flattened for fast indexed access: GRAD3[gi*3], GRAD3[gi*3+1], GRAD3[gi*3+2]
const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

class Noise3D {
  private perm: Uint8Array;
  private permMod12: Uint8Array;

  constructor(seed = 42) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = ((s * 1103515245 + 12345) & 0x7fffffff);
      const j = s % (i + 1);
      const tmp = p[i]!;
      p[i] = p[j]!;
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]!;
      this.permMod12[i] = this.perm[i]! % 12;
    }
  }

  get(x: number, y: number, z: number): number {
    const perm = this.perm;
    const pm12 = this.permMod12;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const gi = pm12[ii + perm[jj + perm[kk]!]!]! * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[gi]! * x0 + GRAD3[gi + 1]! * y0 + GRAD3[gi + 2]! * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const gi = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]!]!]! * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[gi]! * x1 + GRAD3[gi + 1]! * y1 + GRAD3[gi + 2]! * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const gi = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]!]!]! * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[gi]! * x2 + GRAD3[gi + 1]! * y2 + GRAD3[gi + 2]! * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const gi = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]!]!]! * 3;
      t3 *= t3;
      n += t3 * t3 * (GRAD3[gi]! * x3 + GRAD3[gi + 1]! * y3 + GRAD3[gi + 2]! * z3);
    }

    return 32 * n;
  }
}

// ── Shaders ───────────────────────────────────────────────

const PARTICLE_VS = `
attribute vec3 a_data;
uniform vec2 u_resolution;
uniform float u_pointSize;
varying float v_alpha;

void main() {
  vec2 ndc = (a_data.xy / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_alpha = a_data.z;
}
`;

const PARTICLE_FS = `
precision mediump float;
uniform vec3 u_color;
varying float v_alpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.3, d) * v_alpha;
  gl_FragColor = vec4(u_color, a);
}
`;

const QUAD_VS = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FADE_FS = `
precision mediump float;
uniform vec4 u_fadeColor;
void main() {
  gl_FragColor = u_fadeColor;
}
`;

// ── WebGL Helpers ─────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function linkProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  return p;
}

// ── Color Parsing ─────────────────────────────────────────

function parseCSSColor(raw: string): [number, number, number] {
  raw = raw.trim();
  const rgbMatch = raw.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    return [parseInt(rgbMatch[1]) / 255, parseInt(rgbMatch[2]) / 255, parseInt(rgbMatch[3]) / 255];
  }
  let hex = raw.replace('#', '');
  if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function readCSSVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ── Particle ──────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

function spawnParticle(w: number, h: number, randomAge: boolean): Particle {
  const maxAge = 100 + Math.random() * 220;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    age: randomAge ? Math.random() * maxAge : 0,
    maxAge,
  };
}

// ── Constants ─────────────────────────────────────────────

const PARTICLE_COUNT = 4000;
const NOISE_SCALE = 0.002;
const TIME_SCALE = 0.075;
const BASE_SPEED = 0.6;
const TRAIL_PERSIST = 0.3;  // fraction remaining per second
const POINT_SIZE = 1.5;
const TWO_PI = Math.PI * 2;

// ── Component ─────────────────────────────────────────────

export default function FlowFieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;

    // Read palette colors
    const readColors = () => {
      const flowVar = readCSSVar('--flow-color', '');
      const flowColor = parseCSSColor(flowVar || readCSSVar('--accent', '#7db3a3'));
      const bgColor = parseCSSColor(readCSSVar('--bg', '#0b0d0c'));
      const speed = parseFloat(readCSSVar('--flow-speed', '1')) || 1;
      return { flowColor, bgColor, speed };
    };

    let colors = readColors();

    const onPaletteChange = () => { colors = readColors(); };
    document.addEventListener('palette-change', onPaletteChange);

    // Compile shaders
    const particleProg = linkProgram(gl, PARTICLE_VS, PARTICLE_FS);
    const fadeProg = linkProgram(gl, QUAD_VS, FADE_FS);

    // Particle program locations
    const p_aData = gl.getAttribLocation(particleProg, 'a_data');
    const p_uResolution = gl.getUniformLocation(particleProg, 'u_resolution');
    const p_uPointSize = gl.getUniformLocation(particleProg, 'u_pointSize');
    const p_uColor = gl.getUniformLocation(particleProg, 'u_color');

    // Fade program locations
    const f_aPos = gl.getAttribLocation(fadeProg, 'a_pos');
    const f_uFadeColor = gl.getUniformLocation(fadeProg, 'u_fadeColor');

    // Quad geometry buffer
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // Particle data buffer
    const particleData = new Float32Array(PARTICLE_COUNT * 3);
    const particleBuf = gl.createBuffer()!;

    // Noise
    const noise = new Noise3D(42);

    // Sizing
    let w = canvas.clientWidth;
    let h = canvas.clientHeight;
    canvas.width = w;
    canvas.height = h;

    // Particles
    let particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(spawnParticle(w, h, true));
    }

    // Initial clear
    gl.viewport(0, 0, w, h);
    gl.clearColor(colors.bgColor[0], colors.bgColor[1], colors.bgColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Resize handler
    const handleResize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(spawnParticle(w, h, true));
      }
      gl.clearColor(colors.bgColor[0], colors.bgColor[1], colors.bgColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };
    window.addEventListener('resize', handleResize);

    // Reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Animation loop
    let time = 0;
    let lastTime = 0;
    let animFrame: number;

    const animate = (now: number) => {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0.016;
      lastTime = now;
      time += dt * colors.speed;

      // Frame-rate-independent fade
      const fadeAlpha = 1 - Math.pow(TRAIL_PERSIST, dt * colors.speed);

      // ── Fade pass ──
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(fadeProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.enableVertexAttribArray(f_aPos);
      gl.vertexAttribPointer(f_aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(f_uFadeColor, colors.bgColor[0], colors.bgColor[1], colors.bgColor[2], fadeAlpha);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Update particles ──
      const noiseTime = time * TIME_SCALE;
      const speed = BASE_SPEED * colors.speed;
      const dt60 = dt * 60; // normalize to 60fps

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i]!;

        if (!prefersReducedMotion) {
          const angle = noise.get(p.x * NOISE_SCALE, p.y * NOISE_SCALE, noiseTime) * TWO_PI;
          p.x += Math.cos(angle) * speed * dt60;
          p.y += Math.sin(angle) * speed * dt60;
        }

        p.age += dt60;

        if (p.age >= p.maxAge || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
          const np = spawnParticle(w, h, false);
          particles[i] = np;
          particleData[i * 3] = np.x;
          particleData[i * 3 + 1] = np.y;
          particleData[i * 3 + 2] = 0;
          continue;
        }

        // Life-cycle alpha: fade in 10%, sustain, fade out 30%
        const lifeRatio = p.age / p.maxAge;
        let alpha: number;
        if (lifeRatio < 0.1) alpha = lifeRatio / 0.1;
        else if (lifeRatio > 0.7) alpha = (1 - lifeRatio) / 0.3;
        else alpha = 1;

        particleData[i * 3] = p.x;
        particleData[i * 3 + 1] = p.y;
        particleData[i * 3 + 2] = alpha * 0.25;
      }

      // ── Draw particles (additive) ──
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      gl.useProgram(particleProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
      gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(p_aData);
      gl.vertexAttribPointer(p_aData, 3, gl.FLOAT, false, 0, 0);
      gl.uniform2f(p_uResolution, w, h);
      gl.uniform1f(p_uPointSize, POINT_SIZE);
      gl.uniform3f(p_uColor, colors.flowColor[0], colors.flowColor[1], colors.flowColor[2]);
      gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);

      animFrame = requestAnimationFrame(animate);
    };

    animFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('palette-change', onPaletteChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0, pointerEvents: 'none' }}
    />
  );
}
