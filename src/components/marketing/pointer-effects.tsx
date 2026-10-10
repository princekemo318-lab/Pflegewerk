"use client";

/**
 * Zeigerabhängige Effekte – nur für feine Zeiger (Maus/Trackpad), nie auf Touch,
 * und nicht bei „Bewegung reduzieren“. Werte werden per requestAnimationFrame
 * weich nachgeführt und nur als CSS-Variablen gesetzt (kein React-Re-Render).
 */
import { useEffect, useRef, type ReactNode } from "react";

function motionAllowed() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Kippt den Inhalt sanft in Richtung Zeiger und führt einen Lichtkegel mit. */
export function TiltStage({ children, max = 7 }: { children: ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !motionAllowed()) return;
    let raf = 0;
    const target = { x: 0, y: 0, mx: 50, my: 40, a: 0 };
    const cur = { ...target };

    const tick = () => {
      const k = 0.09;
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      cur.mx += (target.mx - cur.mx) * k;
      cur.my += (target.my - cur.my) * k;
      cur.a += (target.a - cur.a) * k;
      el.style.setProperty("--rx", `${cur.y.toFixed(3)}deg`);
      el.style.setProperty("--ry", `${cur.x.toFixed(3)}deg`);
      el.style.setProperty("--mx", `${cur.mx.toFixed(2)}%`);
      el.style.setProperty("--my", `${cur.my.toFixed(2)}%`);
      el.style.setProperty("--spot", cur.a.toFixed(3));
      const settled =
        Math.abs(target.x - cur.x) < 0.01 && Math.abs(target.y - cur.y) < 0.01 && Math.abs(target.a - cur.a) < 0.005;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      target.x = (px - 0.5) * 2 * max;
      target.y = -(py - 0.5) * 2 * max * 0.7;
      target.mx = px * 100;
      target.my = py * 100;
      target.a = 1;
      kick();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      target.a = 0;
      kick();
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [max]);

  return (
    <div ref={ref} className="tilt-stage">
      <div className="tilt-inner">{children}</div>
    </div>
  );
}

/** Lässt Elemente mit `.spotlight` dort aufleuchten, wo der Zeiger ist. */
export function PointerSpotlight() {
  useEffect(() => {
    if (!motionAllowed()) return;
    let raf = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!last) return;
      const el = (last.target as Element | null)?.closest?.(".spotlight") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--sx", `${last.clientX - r.left}px`);
      el.style.setProperty("--sy", `${last.clientY - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);
  return null;
}
