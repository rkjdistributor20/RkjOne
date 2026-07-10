'use client';

import { useReportWebVitals } from 'next/web-vitals';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

type NavigatorWithConnection = Navigator & {
 connection?: {
  effectiveType?: string;
 };
 deviceMemory?: number;
};

const GOOD_METRIC_SAMPLE_RATE = 0.25;
const sentMetricKeys = new Set<string>();

function shouldSendMetric(metric: Parameters<ReportWebVitalsCallback>[0]) {
 if (metric.rating !== 'good') return true;
 return Math.random() <= GOOD_METRIC_SAMPLE_RATE;
}

function postWebVitals(metric: Parameters<ReportWebVitalsCallback>[0]) {
 if (typeof window === 'undefined') return;

 const key = `${metric.id}:${metric.name}`;
 if (sentMetricKeys.has(key) || !shouldSendMetric(metric)) return;
 sentMetricKeys.add(key);

 const nav = navigator as NavigatorWithConnection;
 const payload = {
  id: metric.id,
  name: metric.name,
  value: metric.value,
  delta: metric.delta,
  rating: metric.rating,
  navigationType: metric.navigationType,
  route: window.location.pathname || '/',
  connectionType: nav.connection?.effectiveType,
  deviceMemory: nav.deviceMemory,
 };
 const body = JSON.stringify(payload);
 const url = '/api/monitoring/web-vitals';

 if (navigator.sendBeacon) {
  const sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  if (sent) return;
 }

 void fetch(url, {
  method: 'POST',
  body,
  keepalive: true,
  headers: {
   'content-type': 'application/json',
  },
 }).catch(() => undefined);
}

export function WebVitalsReporter() {
 useReportWebVitals(postWebVitals);
 return null;
}
