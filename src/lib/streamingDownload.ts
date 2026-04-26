import { supabase } from './supabase';

const BUCKET = 'vault-files';
const SW_URL = '/download-sw.js';
const SW_SCOPE = '/';
const STREAM_DOWNLOAD_PREFIX = '/__stream-download/';
const STREAM_PREVIEW_PREFIX = '/__stream-preview/';
const SIGNED_URL_TTL_SECONDS = 3600;

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export function isStreamingDownloadSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (typeof ReadableStream === 'undefined') return false;
  if (window.isSecureContext === false) return false;
  return true;
}

export async function ensureStreamingDownloadSW(): Promise<ServiceWorker> {
  if (!isStreamingDownloadSupported()) {
    throw new Error('Streaming downloads are not supported in this browser.');
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  }

  await registrationPromise;
  await navigator.serviceWorker.ready;

  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  // First-load case: SW is active but hasn't claimed this page yet.
  return new Promise<ServiceWorker>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Service worker did not take control in time.'));
    }, 8_000);

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (navigator.serviceWorker.controller) {
          window.clearTimeout(timeout);
          resolve(navigator.serviceWorker.controller);
        }
      },
      { once: true },
    );
  });
}

async function getSignedUrlsForPaths(paths: string[]): Promise<{ urls: string[]; error: string | null }> {
  const results = await Promise.all(
    paths.map((path) => supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)),
  );

  const urls: string[] = [];
  for (const result of results) {
    if (result.error || !result.data?.signedUrl) {
      return { urls: [], error: result.error?.message ?? 'Failed to sign chunk URL' };
    }
    urls.push(result.data.signedUrl);
  }
  return { urls, error: null };
}

function generateTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function waitForSwAck(id: string, expectedType: 'registered' | 'preview-registered'): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      reject(new Error('Service worker did not acknowledge the task.'));
    }, 5_000);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === expectedType && event.data?.id === id) {
        window.clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('message', onMessage);
        resolve();
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
  });
}

/**
 * Stream a multi-part file directly to disk via the download SW.
 * No in-memory blob — works for arbitrarily large files on iOS / Android / desktop.
 */
export async function streamingDownloadChunked(args: {
  chunkPaths: string[];
  filename: string;
  mimeType?: string;
  totalSize?: number;
}): Promise<{ error: string | null }> {
  if (args.chunkPaths.length === 0) {
    return { error: 'No chunks to download.' };
  }

  let controller: ServiceWorker;
  try {
    controller = await ensureStreamingDownloadSW();
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Service worker unavailable.' };
  }

  const { urls, error: signError } = await getSignedUrlsForPaths(args.chunkPaths);
  if (signError) return { error: signError };

  const id = generateTaskId();
  const ack = waitForSwAck(id, 'registered');

  controller.postMessage({
    type: 'register-stream',
    id,
    urls,
    filename: args.filename,
    mimeType: args.mimeType ?? 'application/octet-stream',
    totalSize: args.totalSize,
  });

  try {
    await ack;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to register download task.' };
  }

  // Hidden iframe trick: navigation goes through the SW, which returns an
  // attachment response, so the browser saves to disk without leaving the page.
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = `${STREAM_DOWNLOAD_PREFIX}${id}`;
  document.body.appendChild(iframe);

  window.setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 60_000);

  return { error: null };
}

export interface PreviewSession {
  url: string;
  unregister: () => void;
}

/**
 * Register a chunked file with the SW for live preview. Returns a same-origin
 * URL that can be fed straight to a `<video>`, `<audio>`, `<img>`, or
 * `<iframe>` element. The SW handles HTTP Range requests so video/audio
 * elements can seek the timeline.
 *
 * Call `session.unregister()` when the preview is no longer needed (e.g. on
 * modal close) so the SW frees the task and the signed chunk URLs.
 */
export async function registerPreviewStream(args: {
  chunkPaths: string[];
  mimeType: string;
  totalSize: number;
  partSize: number;
}): Promise<{ session: PreviewSession | null; error: string | null }> {
  if (args.chunkPaths.length === 0) {
    return { session: null, error: 'No chunks to preview.' };
  }
  if (!Number.isFinite(args.totalSize) || args.totalSize <= 0) {
    return { session: null, error: 'Total size is required to register a preview.' };
  }
  if (!Number.isFinite(args.partSize) || args.partSize <= 0) {
    return { session: null, error: 'Part size is required to register a preview.' };
  }

  let controller: ServiceWorker;
  try {
    controller = await ensureStreamingDownloadSW();
  } catch (err) {
    return { session: null, error: err instanceof Error ? err.message : 'Service worker unavailable.' };
  }

  const { urls, error: signError } = await getSignedUrlsForPaths(args.chunkPaths);
  if (signError) return { session: null, error: signError };

  const id = generateTaskId();
  const ack = waitForSwAck(id, 'preview-registered');

  controller.postMessage({
    type: 'register-preview',
    id,
    urls,
    mimeType: args.mimeType,
    totalSize: args.totalSize,
    partSize: args.partSize,
  });

  try {
    await ack;
  } catch (err) {
    return { session: null, error: err instanceof Error ? err.message : 'Failed to register preview task.' };
  }

  return {
    session: {
      url: `${STREAM_PREVIEW_PREFIX}${id}`,
      unregister: () => controller.postMessage({ type: 'unregister-preview', id }),
    },
    error: null,
  };
}
