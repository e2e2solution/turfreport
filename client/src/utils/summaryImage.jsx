import { createRoot } from 'react-dom/client';
import { TurfSummaryCapture, GymSummaryCapture } from '../components/SummaryImageCapture';
import {
  captureElementAsBlob, downloadBlob, shareImageBlob, waitForPaint,
} from './captureImage';

function summaryFilename(type, period, date) {
  return `${type}-summary-${period}-${date}.png`;
}

async function renderSummaryCapture(Component, props, filename) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<Component {...props} />);
  await waitForPaint(200);

  const target = container.querySelector('.summary-image-export');
  if (!target) {
    root.unmount();
    document.body.removeChild(container);
    throw new Error('Failed to render summary');
  }

  const cleanup = () => {
    root.unmount();
    document.body.removeChild(container);
  };

  return { target, filename, cleanup };
}

async function exportSummaryImage(Component, props, filename, shareText, action) {
  const { target, cleanup } = await renderSummaryCapture(Component, props, filename);
  try {
    const blob = await captureElementAsBlob(target);
    if (action === 'share') {
      await shareImageBlob(blob, filename, shareText);
    } else {
      downloadBlob(blob, filename);
    }
  } finally {
    cleanup();
  }
}

function turfProps(data, period) {
  return { data, rangeLabel: data.range.label, period };
}

function gymProps(data, period) {
  return { data, rangeLabel: data.range.label, period };
}

export function downloadTurfSummaryImage(data, period, date) {
  const filename = summaryFilename('turf', period, date);
  const shareText = `Vathiyayath Sports Hub\nTurf Hours & Payment\n${data.range.label}`;
  return exportSummaryImage(TurfSummaryCapture, turfProps(data, period), filename, shareText, 'download');
}

export function shareTurfSummaryImage(data, period, date) {
  const filename = summaryFilename('turf', period, date);
  const shareText = `Vathiyayath Sports Hub\nTurf Hours & Payment\n${data.range.label}`;
  return exportSummaryImage(TurfSummaryCapture, turfProps(data, period), filename, shareText, 'share');
}

export function downloadGymSummaryImage(data, period, date) {
  const filename = summaryFilename('gym', period, date);
  const shareText = `Vathiyayath Sports Hub\nGym Admissions & Payment\n${data.range.label}`;
  return exportSummaryImage(GymSummaryCapture, gymProps(data, period), filename, shareText, 'download');
}

export function shareGymSummaryImage(data, period, date) {
  const filename = summaryFilename('gym', period, date);
  const shareText = `Vathiyayath Sports Hub\nGym Admissions & Payment\n${data.range.label}`;
  return exportSummaryImage(GymSummaryCapture, gymProps(data, period), filename, shareText, 'share');
}
