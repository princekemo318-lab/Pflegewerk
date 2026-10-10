"use client";

/**
 * Fließendes Licht im Hero – ein kleiner WebGL-Shader ohne Bibliothek.
 * - rendert in halber Auflösung (weich und sparsam)
 * - pausiert außerhalb des Sichtbereichs und in Hintergrund-Tabs
 * - übernimmt Farben aus den Design-Tokens und reagiert auf Hell/Dunkel
 * - bei „Bewegung reduzieren“ nur ein Standbild; ohne WebGL bleibt der CSS-Hintergrund
 */
import { useEffect, useRef } from "react";

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `precision mediump float;
uniform vec2 u_res;uniform float u_t;uniform vec3 u_a;uniform vec3 u_b;uniform vec3 u_c;uniform vec3 u_bg;uniform float u_dark;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.02;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;vec2 q=uv;q.x*=u_res.x/u_res.y;
  float t=u_t*.045;
  vec2 w=vec2(fbm(q*1.4+vec2(t,-t*.7)),fbm(q*1.4+vec2(-t*.6,t)+3.1));
  float f=fbm(q*1.1+w*1.6+t*.4);
  vec3 col=mix(u_a,u_b,smoothstep(.25,.75,f));
  col=mix(col,u_c,smoothstep(.55,.95,w.y));
  // Lichtfeld oben mittig, nach unten und zu den Seiten weich auslaufend
  vec2 c=uv-vec2(.5,1.05);c.x*=1.25;
  float mask=smoothstep(1.05,.05,length(c));
  float k=mask*mix(.6,.62,u_dark)*(.55+.45*f);
  vec3 o=mix(u_bg,col,k);
  // feines Rauschen gegen Banding
  o+=(h(gl_FragCoord.xy+u_t)-.5)/255.;
  gl_FragColor=vec4(o,1.);
}`;

function cssColor(name: string): [number, number, number] {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  probe.remove();
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

export function AuroraCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("u_res"), uT = u("u_t"), uA = u("u_a"), uB = u("u_b"), uC = u("u_c"), uBg = u("u_bg"), uDark = u("u_dark");

    const applyColors = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      gl.uniform3fv(uA, cssColor("--primary-soft"));
      gl.uniform3fv(uB, cssColor("--accent"));
      gl.uniform3fv(uC, cssColor("--info"));
      gl.uniform3fv(uBg, cssColor("--bg"));
      gl.uniform1f(uDark, dark ? 1 : 0);
    };
    applyColors();

    const resize = () => {
      const scale = 0.5;
      const w = Math.max(1, Math.min(1400, canvas.clientWidth) * scale);
      const h = Math.max(1, canvas.clientHeight * scale);
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    const t0 = performance.now() - 40_000;
    const draw = (now: number) => {
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.ready = "true";
    };
    const loop = (now: number) => {
      draw(now);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (reduced) {
        draw(performance.now());
        return;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    const onVisibility = () => !document.hidden && visible && start();
    document.addEventListener("visibilitychange", onVisibility);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(performance.now());
    });
    ro.observe(canvas);
    const mo = new MutationObserver(() => {
      applyColors();
      if (reduced) draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      // Kontext nicht verwerfen: React führt Effekte im Dev-Modus doppelt aus und
      // würde sonst einen verlorenen Kontext wiederverwenden. Der Browser räumt beim Entfernen auf.
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={`aurora-canvas ${className ?? ""}`} />;
}
