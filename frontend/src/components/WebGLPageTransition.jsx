import { useEffect, useRef } from "react";

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${message}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${message}`);
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

export default function WebGLPageTransition({ direction = "forward", progress = 0 }) {
  const canvasRef = useRef(null);
  const glStateRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) return undefined;

    const vertexShaderSource = `
      attribute vec2 aPosition;
      varying vec2 vUv;

      void main() {
        vUv = (aPosition + 1.0) * 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uProgress;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 grid = vec2(26.0, 120.0);
        vec2 cell = floor(vUv * grid);

        float t1 = floor(uTime * 22.0);
        float t2 = floor(uTime * 12.0);
        float noise = hash(cell + t1);
        float jag = hash(vec2(cell.y, t2));

        float x = vUv.x;
        float borderCut = mix(0.82, 0.52, uProgress) + (jag - 0.5) * 0.14;
        float mask = step(x, borderCut);

        float block = step(0.45, fract(cell.y * 0.21 + t2 * 0.13));
        float sparkle = step(0.86, noise);

        vec3 light = vec3(0.99, 0.91, 0.79);
        vec3 dark = vec3(0.77, 0.47, 0.31);
        vec3 color = mix(light, dark, block);
        color += sparkle * 0.11;

        float edgeGlow = 1.0 - smoothstep(0.0, 0.18, abs(x - borderCut));
        float body = mask * (0.12 + 0.35 * (1.0 - x));
        float fade = 1.0 - smoothstep(0.92, 1.0, uProgress);
        float alpha = clamp((body + edgeGlow * 0.26) * fade, 0.0, 0.9);

        gl_FragColor = vec4(color, alpha);
      }
    `;

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "uTime");
    const uProgress = gl.getUniformLocation(program, "uProgress");

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(40 * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = "40px";
      canvas.style.height = "100%";
      gl.viewport(0, 0, width, height);
    }

    resize();
    window.addEventListener("resize", resize);

    glStateRef.current = {
      render: (progress, timeSeconds) => {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uProgress, progress);
        gl.uniform1f(uTime, timeSeconds);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      cleanup: () => {
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        if (program) gl.deleteProgram(program);
      },
    };

    return () => {
      window.removeEventListener("resize", resize);
      if (glStateRef.current?.cleanup) glStateRef.current.cleanup();
      glStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!glStateRef.current) return;
    glStateRef.current.render(progress, performance.now() * 0.001);
  }, [direction, progress]);

  const directionClass =
    direction === "backward"
      ? "route-edge-webgl-canvas route-edge-webgl-canvas-backward"
      : "route-edge-webgl-canvas route-edge-webgl-canvas-forward";

  return <canvas ref={canvasRef} className={directionClass} aria-hidden="true" />;
}
