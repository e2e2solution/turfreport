import html2canvas from 'html2canvas';
import { openShareImage } from './shareImageBridge.js';

export function waitForPaint(ms = 150) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, ms);
    });
  });
}

const CANVAS_OPTS = (element) => ({
  backgroundColor: '#ffffff',
  scale: 2,
  useCORS: true,
  logging: false,
  width: element.scrollWidth,
  height: element.scrollHeight,
  windowWidth: element.scrollWidth,
  windowHeight: element.scrollHeight,
});

export async function captureElementAsBlob(element) {
  if (!element) throw new Error('Nothing to capture');
  const canvas = await html2canvas(element, CANVAS_OPTS(element));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create image'));
    }, 'image/png');
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadElementImage(element, filename) {
  const blob = await captureElementAsBlob(element);
  downloadBlob(blob, filename);
}

export function shareImageBlob(blob, filename, title = 'Vathiyayath Sports Hub') {
  openShareImage({ blob, filename, title });
}
