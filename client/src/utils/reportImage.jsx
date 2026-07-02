import { createRoot } from 'react-dom/client';
import { fetchReportPreview } from '../api';
import ReportImageCapture from '../components/ReportImageCapture';
import {
  captureElementAsBlob, downloadBlob, shareImageBlob, waitForPaint,
} from './captureImage';

function sectionsForParams(params) {
  const sec = params.section || 'turf_online';
  if (sec === 'gym') return ['gym'];
  if (sec === 'football_coaching') return ['football_coaching'];
  if (sec === 'turf') return ['turf'];
  if (sec === 'online') return ['online'];
  if (sec === 'all') return ['turf', 'online', 'gym', 'football_coaching'];
  return ['turf', 'online'];
}

export function buildTitle(params) {
  const payment = params.filter_type === 'payment';
  const sec = params.section || 'turf_online';
  const range = params.match_date || (params.from && params.to ? `${params.from} to ${params.to}` : '');

  if (sec === 'gym') {
    return payment ? `Gym — Payments Received (${range})` : `Gym Report (${range})`;
  }
  if (sec === 'football_coaching') {
    return payment ? `Football Coaching — Payments Received (${range})` : `Football Coaching Report (${range})`;
  }
  if (payment) return `Turf + Online — Payments Received (${range})`;
  if (sec === 'all') return `All Bookings (${range})`;
  return `Turf + Online Report (${range})`;
}

export function reportImageFilename(params) {
  const { from, to, match_date, filter_type, section } = params;
  const sec = section || 'turf_online';
  const paymentFilter = filter_type === 'payment';

  if (sec === 'gym') {
    if (paymentFilter) return `gym-payment-${match_date || `${from}-${to}`}.png`;
    return match_date ? `gym-report-${match_date}.png` : `gym-report-${from}-${to}.png`;
  }
  if (sec === 'football_coaching') {
    if (paymentFilter) return `football-coaching-payment-${match_date || `${from}-${to}`}.png`;
    return match_date ? `football-coaching-${match_date}.png` : `football-coaching-${from}-${to}.png`;
  }
  if (paymentFilter) return `payment-report-${match_date || `${from}-${to}`}.png`;
  if (match_date) return `report-${match_date}.png`;
  return `report-${from}-${to}.png`;
}

async function renderReportCapture(params, existingData = null) {
  const data = existingData || await fetchReportPreview(params);
  const sections = sectionsForParams(params);
  const title = buildTitle(params);
  const filename = reportImageFilename(params);

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <ReportImageCapture title={title} sections={sections} data={data} />
  );

  await waitForPaint();

  const target = container.querySelector('.report-image-export');
  if (!target) {
    root.unmount();
    document.body.removeChild(container);
    throw new Error('Failed to render report');
  }

  const cleanup = () => {
    root.unmount();
    document.body.removeChild(container);
  };

  return { target, filename, title, cleanup };
}

async function exportReportImage(params, action, existingData = null) {
  const { target, filename, title, cleanup } = await renderReportCapture(params, existingData);
  try {
    const blob = await captureElementAsBlob(target);
    const shareText = `Vathiyayath Sports Hub\n${title}`;
    if (action === 'share') {
      await shareImageBlob(blob, filename, shareText);
    } else {
      downloadBlob(blob, filename);
    }
  } finally {
    cleanup();
  }
}

export function downloadReportImage(params, existingData = null) {
  return exportReportImage(params, 'download', existingData);
}

export function shareReportImage(params, existingData = null) {
  return exportReportImage(params, 'share', existingData);
}
