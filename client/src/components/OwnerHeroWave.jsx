import { useEffect, useMemo, useRef } from 'react';
import { subscribeDeviceMotion } from '../utils/deviceMotionBus';
import {
  buildValueWaveLayers, computeValueScore, heroGradientForScore,
} from '../utils/waveValueScore';

const lerp = (a, b, t) => a + (b - a) * t;
const BOAT_SPEED = 0.75;

function waveYAt(x, w, h, phase, wave, yShift) {
  const baseY = h * wave.y + yShift;
  return baseY + Math.sin(x * wave.length + phase) * wave.amp;
}

function drawWave(ctx, w, h, phase, wave, yShift) {
  const baseY = h * wave.y + yShift;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, baseY);
  for (let x = 0; x <= w; x += 2) {
    const y = baseY + Math.sin(x * wave.length + phase) * wave.amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = wave.fill;
  ctx.fill();
}

function drawBoat(ctx, w, h, phase, waves, motion, travel) {
  const wave = waves[0];
  if (!wave) return;

  const yShift = motion.phaseY * 0.6;
  const cycle = w + 72;
  const bx = (travel % cycle) - 36;
  const wavePhase = phase + motion.phaseX;
  const by = waveYAt(bx, w, h, wavePhase, wave, yShift) - 2;
  const rock = Math.sin(phase * 0.65 + motion.phaseX * 0.4 + bx * 0.03) * 0.07 + motion.tx * 0.0015;

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(rock);

  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.quadraticCurveTo(0, 8, 16, 0);
  ctx.lineTo(12, 5);
  ctx.quadraticCurveTo(0, 10, -12, 5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(26, 54, 93, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(0, -20);
  ctx.stroke();

  ctx.fillStyle = '#1e4a8a';
  ctx.fillRect(1, -20, 14, 9);
  ctx.strokeStyle = '#c41e3a';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(1, -20, 14, 9);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 7px Arial, sans-serif';
  ctx.fillText('V', 5.5, -13.5);

  ctx.restore();
}

function syncCanvasSize(canvas, ctx, w, h, dpr) {
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export default function OwnerHeroWave({
  children, variant = 'daily', value, minValue, maxValue,
}) {
  const waterCanvasRef = useRef(null);
  const boatCanvasRef = useRef(null);
  const contentRef = useRef(null);
  const heroRef = useRef(null);
  const motionRef = useRef({ tx: 0, ty: 0, phaseX: 0, phaseY: 0 });
  const targetRef = useRef({ tx: 0, ty: 0, phaseX: 0, phaseY: 0 });
  const displayScoreRef = useRef(0.5);
  const wavesRef = useRef([]);

  const score = useMemo(
    () => computeValueScore(value, minValue, maxValue),
    [value, minValue, maxValue],
  );

  const scoreRef = useRef(score);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    return subscribeDeviceMotion((t) => {
      targetRef.current = t;
    });
  }, []);

  useEffect(() => {
    const waterCanvas = waterCanvasRef.current;
    const boatCanvas = boatCanvasRef.current;
    if (!waterCanvas || !boatCanvas) return undefined;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const waterCtx = waterCanvas.getContext('2d');
    const boatCtx = boatCanvas.getContext('2d');
    let raf = 0;
    let phase = 0;
    let boatTravel = 0;
    let dpr = 1;
    let w = 0;
    let h = 0;

    const resize = () => {
      const parent = waterCanvas.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = parent.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      syncCanvasSize(waterCanvas, waterCtx, w, h, dpr);
      syncCanvasSize(boatCanvas, boatCtx, w, h, dpr);
    };

    const paintWater = () => {
      const motion = motionRef.current;
      const { phaseX, phaseY } = motion;
      waterCtx.clearRect(0, 0, w, h);
      wavesRef.current.forEach((wave, i) => {
        drawWave(waterCtx, w, h, phase + phaseX + i * 1.4, wave, phaseY * (0.6 + i * 0.2));
      });
    };

    const paintBoat = () => {
      const motion = motionRef.current;
      boatCtx.clearRect(0, 0, w, h);
      drawBoat(boatCtx, w, h, phase, wavesRef.current, motion, boatTravel);
    };

    const paintAll = () => {
      paintWater();
      paintBoat();
    };

    resize();
    paintAll();

    const ro = new ResizeObserver(resize);
    ro.observe(waterCanvas.parentElement);

    if (prefersReduced) {
      wavesRef.current = buildValueWaveLayers(scoreRef.current);
      paintAll();
      const hero = heroRef.current?.closest('.owner-hero');
      if (hero) hero.style.background = heroGradientForScore(scoreRef.current, variant);
      return () => ro.disconnect();
    }

    const tick = () => {
      phase += 0.04;
      boatTravel += BOAT_SPEED;

      const m = motionRef.current;
      const t = targetRef.current;
      m.tx = lerp(m.tx, t.tx, 0.1);
      m.ty = lerp(m.ty, t.ty, 0.1);
      m.phaseX = lerp(m.phaseX, t.phaseX, 0.1);
      m.phaseY = lerp(m.phaseY, t.phaseY, 0.1);

      displayScoreRef.current = lerp(displayScoreRef.current, scoreRef.current, 0.07);
      wavesRef.current = buildValueWaveLayers(displayScoreRef.current);

      const hero = heroRef.current?.closest('.owner-hero');
      if (hero) {
        hero.style.background = heroGradientForScore(displayScoreRef.current, variant);
      }

      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${m.tx.toFixed(2)}px, ${m.ty.toFixed(2)}px, 0)`;
      }

      paintAll();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [variant]);

  return (
    <div ref={heroRef} className="owner-hero-wave-wrap">
      <canvas ref={waterCanvasRef} className="owner-hero-wave-canvas" aria-hidden="true" />
      <canvas ref={boatCanvasRef} className="owner-hero-boat-canvas" aria-hidden="true" />
      <div ref={contentRef} className="owner-hero-wave-content">
        {children}
      </div>
    </div>
  );
}
