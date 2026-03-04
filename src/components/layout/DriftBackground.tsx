import { useEffect, useRef } from 'react';

// ── Shaders ───────────────────────────────────────────────

// Vertex shader: receives pre-projected screen coords + size + alpha
const STAR_VS = `
attribute vec2 a_pos;
attribute float a_size;
attribute float a_alpha;
uniform vec2 u_resolution;
varying float v_alpha;

void main() {
  vec2 ndc = (a_pos / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = a_size;
  v_alpha = a_alpha;
}
`;

const STAR_FS = `
precision mediump float;
uniform vec3 u_color;
uniform vec3 u_glow;
varying float v_alpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;

  // Core: bright center
  float core = smoothstep(1.0, 0.0, d);

  // Glow: soft halo
  float glow = smoothstep(1.0, 0.0, d * 0.7) * 0.3;

  vec3 col = mix(u_glow, u_color, core);
  float a = (core + glow) * v_alpha;

  gl_FragColor = vec4(col, a);
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

// ── Star ──────────────────────────────────────────────────

interface Star {
  // 3D position: x,y are offsets from center, z is depth
  x: number;
  y: number;
  z: number;
  size: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

const FAR_Z = 1200;
const NEAR_Z = 1;
const FOV = 500;
const DRIFT_SPEED = 0.25; // Z units per frame at 60fps — dreamy pace

// Spawn star with x,y spread wide enough to fill screen at any depth
function spawnStar(w: number, h: number, randomZ: boolean): Star {
  // Spread needs to be wide so stars at FAR_Z still cover the viewport
  // At z, screen pos = offset * FOV/z, so offset = screenEdge * z/FOV
  const spread = Math.max(w, h) * 1.2;
  return {
    x: (Math.random() - 0.5) * spread,
    y: (Math.random() - 0.5) * spread,
    z: randomZ ? NEAR_Z + Math.random() * FAR_Z : FAR_Z + Math.random() * 200,
    size: 1.5 + Math.random() * 3.5,
    twinkleSpeed: 0.3 + Math.random() * 0.8,
    twinkleOffset: Math.random() * Math.PI * 2,
  };
}

// ── Component ─────────────────────────────────────────────

export default function DriftBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: false,
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;

    // Read palette
    const readColors = () => {
      const starColor = parseCSSColor(readCSSVar('--drift-color', '') || readCSSVar('--star-color', '#c8d4ff'));
      const glowColor = parseCSSColor(readCSSVar('--drift-glow', '') || readCSSVar('--accent', '#4a6aff'));
      const bgColor = parseCSSColor(readCSSVar('--drift-bg', '') || readCSSVar('--bg', '#0b0d0c'));
      const speed = parseFloat(readCSSVar('--drift-speed', '1')) || 1;
      const density = parseInt(readCSSVar('--drift-density', '400'), 10) || 400;
      return { starColor, glowColor, bgColor, speed, density };
    };

    let colors = readColors();
    let isLightBg = (colors.bgColor[0] * 0.299 + colors.bgColor[1] * 0.587 + colors.bgColor[2] * 0.114) > 0.5;

    const onPaletteChange = () => {
      colors = readColors();
      isLightBg = (colors.bgColor[0] * 0.299 + colors.bgColor[1] * 0.587 + colors.bgColor[2] * 0.114) > 0.5;
    };
    document.addEventListener('palette-change', onPaletteChange);

    const themeObserver = new MutationObserver(() => {
      colors = readColors();
      isLightBg = (colors.bgColor[0] * 0.299 + colors.bgColor[1] * 0.587 + colors.bgColor[2] * 0.114) > 0.5;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Compile shaders
    const prog = linkProgram(gl, STAR_VS, STAR_FS);
    const a_pos = gl.getAttribLocation(prog, 'a_pos');
    const a_size = gl.getAttribLocation(prog, 'a_size');
    const a_alpha = gl.getAttribLocation(prog, 'a_alpha');
    const u_resolution = gl.getUniformLocation(prog, 'u_resolution');
    const u_color = gl.getUniformLocation(prog, 'u_color');
    const u_glow = gl.getUniformLocation(prog, 'u_glow');

    // Buffers
    let starCount = colors.density;
    let posArr = new Float32Array(starCount * 2);
    let sizeArr = new Float32Array(starCount);
    let alphaArr = new Float32Array(starCount);
    const posBuf = gl.createBuffer()!;
    const sizeBuf = gl.createBuffer()!;
    const alphaBuf = gl.createBuffer()!;

    // Sizing
    let w = canvas.clientWidth;
    let h = canvas.clientHeight;
    canvas.width = w;
    canvas.height = h;

    // Stars
    let stars: Star[] = [];
    function initStars() {
      starCount = colors.density;
      stars = [];
      for (let i = 0; i < starCount; i++) {
        stars.push(spawnStar(w, h, true));
      }
      posArr = new Float32Array(starCount * 2);
      sizeArr = new Float32Array(starCount);
      alphaArr = new Float32Array(starCount);
    }
    initStars();

    gl.viewport(0, 0, w, h);

    // Resize
    const handleResize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      initStars();
    };
    window.addEventListener('resize', handleResize);

    // Reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Animation
    let lastTime = 0;
    let animFrame: number;
    const halfW = () => w / 2;
    const halfH = () => h / 2;

    const animate = (now: number) => {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0.016;
      lastTime = now;

      const speed = DRIFT_SPEED * colors.speed;
      const cx = halfW();
      const cy = halfH();

      // Clear
      gl.clearColor(colors.bgColor[0], colors.bgColor[1], colors.bgColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Update + project stars
      for (let i = 0; i < starCount; i++) {
        const s = stars[i]!;

        // Move star toward camera
        if (!prefersReducedMotion) {
          s.z -= speed * dt * 60;
        }

        // Respawn when past camera
        if (s.z <= NEAR_Z) {
          stars[i] = spawnStar(w, h, false);
          posArr[i * 2] = cx;
          posArr[i * 2 + 1] = cy;
          sizeArr[i] = 0;
          alphaArr[i] = 0;
          continue;
        }

        // Perspective projection: offset from center scales inversely with z
        const perspective = FOV / s.z;
        const screenX = cx + s.x * perspective;
        const screenY = cy + s.y * perspective;

        // Cull if way off screen
        if (screenX < -50 || screenX > w + 50 || screenY < -50 || screenY > h + 50) {
          // Respawn — this star drifted off the edges
          stars[i] = spawnStar(w, h, false);
          posArr[i * 2] = cx;
          posArr[i * 2 + 1] = cy;
          sizeArr[i] = 0;
          alphaArr[i] = 0;
          continue;
        }

        // Twinkle
        const twinkle = prefersReducedMotion
          ? 1
          : 0.6 + 0.4 * Math.sin(now * 0.0003 * s.twinkleSpeed + s.twinkleOffset);

        // Depth fade: far stars are dimmer
        const depthRatio = 1 - s.z / FAR_Z;
        const depthFade = depthRatio * depthRatio;

        // Near fade: stars very close fade out gracefully
        const nearFade = Math.min(s.z / 80, 1);

        posArr[i * 2] = screenX;
        posArr[i * 2 + 1] = screenY;
        sizeArr[i] = s.size * perspective * 2;
        alphaArr[i] = twinkle * depthFade * nearFade;
      }

      // Draw
      gl.enable(gl.BLEND);
      if (isLightBg) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      }

      gl.useProgram(prog);

      // Position buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, posArr, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(a_pos);
      gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

      // Size buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, sizeArr, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(a_size);
      gl.vertexAttribPointer(a_size, 1, gl.FLOAT, false, 0, 0);

      // Alpha buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
      gl.bufferData(gl.ARRAY_BUFFER, alphaArr, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(a_alpha);
      gl.vertexAttribPointer(a_alpha, 1, gl.FLOAT, false, 0, 0);

      // Uniforms
      gl.uniform2f(u_resolution, w, h);
      gl.uniform3f(u_color, colors.starColor[0], colors.starColor[1], colors.starColor[2]);
      gl.uniform3f(u_glow, colors.glowColor[0], colors.glowColor[1], colors.glowColor[2]);

      gl.drawArrays(gl.POINTS, 0, starCount);

      animFrame = requestAnimationFrame(animate);
    };

    animFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('palette-change', onPaletteChange);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0, pointerEvents: 'none' }}
    />
  );
}
