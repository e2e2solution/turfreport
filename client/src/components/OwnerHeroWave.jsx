import { useEffect, useMemo, useRef } from 'react';
import {
  buildValueWaveLayers, computeValueScore, heroGradientForScore,
} from '../utils/waveValueScore';

const lerp = (a, b, t) => a + (b - a) * t;
const BOAT_SPEED = 0.55;
const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

function waveYAt(x, w, h, phase, wave) {
  const baseY = h * wave.y;
  return baseY + Math.sin(x * wave.length + phase) * wave.amp;
}

function drawWave(ctx, w, h, phase, wave) {
  const baseY = h * wave.y;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, baseY);
  for (let x = 0; x <= w; x += 3) {
    const y = baseY + Math.sin(x * wave.length + phase) * wave.amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = wave.fill;
  ctx.fill();
}

function drawBoat(ctx, w, h, phase, waves, travel) {
  const wave = waves[0];
  if (!wave) return;

  const cycle = w + 72;
  const bx = (travel % cycle) - 36;
  const by = waveYAt(bx, w, h, phase, wave) - 2;
  const rock = Math.sin(phase * 0.5 + bx * 0.02) * 0.05;

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
  const heroRef = useRef(null);
  const displayScoreRef = useRef(0.5);
  const wavesRef = useRef([]);
  const sizeRef = useRef({ w: 0, h: 0 });

  const score = useMemo(
    () => computeValueScore(value, minValue, maxValue),
    [value, minValue, maxValue],
  );

  const scoreRef = useRef(score);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

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
    let resizeTimer = 0;

    const applySize = () => {
      const parent = waterCanvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (Math.abs(nextW - sizeRef.current.w) < 2 && Math.abs(nextH - sizeRef.current.h) < 2) {
        return;
      }
      sizeRef.current = { w: nextW, h: nextH };
      w = nextW;
      h = nextH;
      dpr = Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.5 : 2);
      syncCanvasSize(waterCanvas, waterCtx, w, h, dpr);
      syncCanvasSize(boatCanvas, boatCtx, w, h, dpr);
    };

    const resize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(applySize, isTouchDevice ? 180 : 80);
    };

    const paintWater = () => {
      waterCtx.clearRect(0, 0, w, h);
      wavesRef.current.forEach((wave, i) => {
        drawWave(waterCtx, w, h, phase + i * 1.4, wave);
      });
    };

    const paintBoat = () => {
      boatCtx.clearRect(0, 0, w, h);
      drawBoat(boatCtx, w, h, phase, wavesRef.current, boatTravel);
    };

    const paintAll = () => {
      if (!w || !h) return;
      paintWater();
      paintBoat();
    };

    applySize();
    wavesRef.current = buildValueWaveLayers(scoreRef.current);
    paintAll();

    const ro = new ResizeObserver(resize);
    ro.observe(waterCanvas.parentElement);

    if (prefersReduced) {
      const hero = heroRef.current?.closest('.owner-hero');
      if (hero) hero.style.background = heroGradientForScore(scoreRef.current, variant);
      return () => {
        clearTimeout(resizeTimer);
        ro.disconnect();
      };
    }

    const tick = () => {
      phase += isTouchDevice ? 0.028 : 0.04;
      boatTravel += BOAT_SPEED;

      const prevScore = displayScoreRef.current;
      displayScoreRef.current = lerp(displayScoreRef.current, scoreRef.current, 0.04);
      if (Math.abs(displayScoreRef.current - prevScore) > 0.008) {
        wavesRef.current = buildValueWaveLayers(displayScoreRef.current);
      }

      const hero = heroRef.current?.closest('.owner-hero');
      if (hero) {
        hero.style.background = heroGradientForScore(displayScoreRef.current, variant);
      }

      paintAll();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, [variant]);

  return (
    <div ref={heroRef} className="owner-hero-wave-wrap">
      <canvas ref={waterCanvasRef} className="owner-hero-wave-canvas" aria-hidden="true" />
      <canvas ref={boatCanvasRef} className="owner-hero-boat-canvas" aria-hidden="true" />
      <div className="owner-hero-wave-content">
        {children}
      </div>
    </div>
  );
}
