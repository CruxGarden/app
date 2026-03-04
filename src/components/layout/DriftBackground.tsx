import { useEffect, useRef } from 'react';

// ── Shaders ───────────────────────────────────────────────

const STAR_VS = `
attribute vec4 a_data; // x, y, z, size
attribute float a_alpha;
uniform vec2 u_resolution;
uniform float u_fov;
varying float v_alpha;
varying float v_size;

void main() {
  float perspective = u_fov / (u_fov + a_data.z);
  vec2 screen = a_data.xy * perspective;
  vec2 ndc = (screen / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = a_data.w * perspective;
  v_alpha = a_alpha * perspective;
  v_size = a_data.w;
}
`;

const STAR_FS = `
precision mediump float;
uniform vec3 u_color;
uniform vec3 u_glow;
varying float v_alpha;
varying float v_size;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;

  // Core: bright center
  float core = smoothstep(1.0, 0.0, d);

  // Glow: soft halo for larger stars
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
  x: number;
  y: number;
  z: number;
  size: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

const FAR_Z = 1000;
const FOV = 600;
const DRIFT_SPEED = 0.15; // base Z units per second — very slow

function spawnStar(w: number, h: number, randomZ: boolean): Star {
  return {
    x: (Math.random() - 0.5) * w * 2.5,
    y: (Math.random() - 0.5) * h * 2.5,
    z: randomZ ? Math.random() * FAR_Z : FAR_Z + Math.random() * 100,
    size: 1 + Math.random() * 4,
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
    const a_data = gl.getAttribLocation(prog, 'a_data');
    const a_alpha = gl.getAttribLocation(prog, 'a_alpha');
    const u_resolution = gl.getUniformLocation(prog, 'u_resolution');
    const u_fov = gl.getUniformLocation(prog, 'u_fov');
    const u_color = gl.getUniformLocation(prog, 'u_color');
    const u_glow = gl.getUniformLocation(prog, 'u_glow');

    // Buffers
    let starCount = colors.density;
    let dataArr = new Float32Array(starCount * 4); // x, y, z, size
    let alphaArr = new Float32Array(starCount);
    const dataBuf = gl.createBuffer()!;
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
      dataArr = new Float32Array(starCount * 4);
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

    const animate = (now: number) => {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0.016;
      lastTime = now;

      const speed = DRIFT_SPEED * colors.speed;

      // Clear
      gl.clearColor(colors.bgColor[0], colors.bgColor[1], colors.bgColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Update stars
      for (let i = 0; i < starCount; i++) {
        const s = stars[i]!;

        if (!prefersReducedMotion) {
          s.z -= speed * dt * 60;
        }

        // Respawn behind far plane
        if (s.z <= 0) {
          const ns = spawnStar(w, h, false);
          stars[i] = ns;
          dataArr[i * 4] = ns.x;
          dataArr[i * 4 + 1] = ns.y;
          dataArr[i * 4 + 2] = ns.z;
          dataArr[i * 4 + 3] = ns.size;
          alphaArr[i] = 0;
          continue;
        }

        // Twinkle
        const twinkle = prefersReducedMotion
          ? 1
          : 0.6 + 0.4 * Math.sin(now * 0.0003 * s.twinkleSpeed + s.twinkleOffset);

        // Depth fade: stars far away are dimmer
        const depthFade = 1 - (s.z / FAR_Z);

        // Near fade: stars very close fade out gracefully
        const nearFade = Math.min(s.z / 50, 1);

        const alpha = twinkle * depthFade * depthFade * nearFade;

        // Center offset: project x,y to screen center
        const cx = w / 2 + s.x;
        const cy = h / 2 + s.y;

        dataArr[i * 4] = cx;
        dataArr[i * 4 + 1] = cy;
        dataArr[i * 4 + 2] = s.z;
        dataArr[i * 4 + 3] = s.size;
        alphaArr[i] = alpha;
      }

      // Draw
      gl.enable(gl.BLEND);
      if (isLightBg) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      }

      gl.useProgram(prog);

      // Data buffer (x, y, z, size)
      gl.bindBuffer(gl.ARRAY_BUFFER, dataBuf);
      gl.bufferData(gl.ARRAY_BUFFER, dataArr, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(a_data);
      gl.vertexAttribPointer(a_data, 4, gl.FLOAT, false, 0, 0);

      // Alpha buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
      gl.bufferData(gl.ARRAY_BUFFER, alphaArr, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(a_alpha);
      gl.vertexAttribPointer(a_alpha, 1, gl.FLOAT, false, 0, 0);

      // Uniforms
      gl.uniform2f(u_resolution, w, h);
      gl.uniform1f(u_fov, FOV);
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
