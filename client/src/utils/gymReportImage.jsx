import { createRoot } from 'react-dom/client';
import { GymFilterReportCapture } from '../components/GymFilterReportCapture';
import {
  captureElementAsBlob,
  downloadBlob,
  shareImageBlob,
  waitForPaint,
} from './captureImage';

async function renderGymFilterCapture(title, rows) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-12000px;top:0;z-index:-1;pointer-events:none;';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<GymFilterReportCapture title={title} rows={rows} />);
  await waitForPaint(300);

  const target = container.querySelector('.gym-filter-report-export');
  if (!target) {
    root.unmount();
    document.body.removeChild(container);
    throw new Error('Failed to render gym report image');
  }

  return {
    target,
    cleanup: () => {
      root.unmount();
      document.body.removeChild(container);
    },
  };
}

export async function downloadGymFilterReportImage(title, rows, filename) {
  const { target, cleanup } = await renderGymFilterCapture(title, rows);
  try {
    const blob = await captureElementAsBlob(target);
    downloadBlob(blob, filename);
  } finally {
    cleanup();
  }
}

export async function shareGymFilterReportImage(title, rows, filename) {
  const { target, cleanup } = await renderGymFilterCapture(title, rows);
  try {
    const blob = await captureElementAsBlob(target);
    shareImageBlob(blob, filename, title);
  } finally {
    cleanup();
  }
}
