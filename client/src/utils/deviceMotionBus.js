const subscribers = new Set();
let listening = false;
let target = { tx: 0, ty: 0, phaseX: 0, phaseY: 0 };
let permissionRequested = false;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function notify() {
  subscribers.forEach((fn) => fn(target));
}

function applyOrientation(beta, gamma) {
  const g = clamp(gamma ?? 0, -45, 45);
  const b = clamp((beta ?? 0) - 45, -30, 30);
  target = {
    tx: (g / 45) * 14,
    ty: (b / 30) * 10,
    phaseX: (g / 45) * 2.2,
    phaseY: (b / 30) * 8,
  };
  notify();
}

function onOrientation(e) {
  applyOrientation(e.beta, e.gamma);
}

function onMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g) return;
  target = {
    tx: clamp(g.x * 1.6, -16, 16),
    ty: clamp((g.y + 2) * 1.2, -12, 12),
    phaseX: clamp(g.x * 0.25, -2.5, 2.5),
    phaseY: clamp(g.y * 0.35, -10, 10),
  };
  notify();
}

async function requestMotionAccess() {
  const Orientation = window.DeviceOrientationEvent;
  if (Orientation && typeof Orientation.requestPermission === 'function') {
    try {
      return (await Orientation.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  window.addEventListener('devicemotion', onMotion, { passive: true });
}

export async function enableDeviceMotion() {
  if (permissionRequested) return;
  permissionRequested = true;
  const ok = await requestMotionAccess();
  if (ok) startListening();
}

export function subscribeDeviceMotion(fn) {
  subscribers.add(fn);
  fn(target);
  return () => subscribers.delete(fn);
}

if (typeof window !== 'undefined') {
  const onFirstTouch = () => {
    enableDeviceMotion();
    window.removeEventListener('touchstart', onFirstTouch);
    window.removeEventListener('click', onFirstTouch);
  };
  window.addEventListener('touchstart', onFirstTouch, { passive: true, once: true });
  window.addEventListener('click', onFirstTouch, { once: true });
  if (!('ontouchstart' in window)) enableDeviceMotion();
}
