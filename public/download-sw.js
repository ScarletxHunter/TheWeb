/**
 * Streaming-download service worker.
 *
 * For chunked files we can't ask Supabase to serve a single
 * Content-Disposition: attachment response — there is no single object.
 * Instead we register a "task" (list of signed chunk URLs + target filename)
 * with this SW, then navigate a hidden iframe to /__stream-download/<id>.
 *
 * The SW intercepts that fetch, builds a ReadableStream that pulls each
 * chunk URL in sequence, and returns it as a single attachment response.
 * The browser writes the bytes to disk as they arrive — no in-memory blob,
 * so 500 MB / multi-GB files work even on iOS Safari (≥ 16.4).
 */

const STREAM_PATH_PREFIX = '/__stream-download/';
const tasks = new Map();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'register-stream') {
    tasks.set(data.id, {
      urls: Array.isArray(data.urls) ? data.urls : [],
      filename: typeof data.filename === 'string' ? data.filename : 'download',
      mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream',
      totalSize: typeof data.totalSize === 'number' && Number.isFinite(data.totalSize) ? data.totalSize : null,
    });
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({ type: 'registered', id: data.id });
    }
    return;
  }

  if (data.type === 'unregister-stream') {
    tasks.delete(data.id);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(STREAM_PATH_PREFIX)) return;

  const id = url.pathname.slice(STREAM_PATH_PREFIX.length);
  const task = tasks.get(id);
  if (!task) {
    event.respondWith(new Response('Download task not found or already consumed.', { status: 410 }));
    return;
  }

  // One-shot: drop the task on first hit so a refresh doesn't replay it.
  tasks.delete(id);

  event.respondWith(buildStreamResponse(task));
});

function buildStreamResponse(task) {
  const { urls, filename, mimeType, totalSize } = task;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const partUrl of urls) {
          const resp = await fetch(partUrl);
          if (!resp.ok || !resp.body) {
            throw new Error(`Failed to fetch part (${resp.status}): ${partUrl}`);
          }
          const reader = resp.body.getReader();
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  const headers = new Headers({
    'Content-Type': mimeType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeRfc5987(filename)}`,
    'Cache-Control': 'no-store',
    // Keep referrer info off the chunk fetches; signed URLs are sensitive enough.
    'X-Content-Type-Options': 'nosniff',
  });
  if (totalSize !== null) {
    headers.set('Content-Length', String(totalSize));
  }

  return new Response(stream, { headers });
}

function encodeRfc5987(str) {
  // RFC 5987 encoding for Content-Disposition filename*=UTF-8''
  return encodeURIComponent(str).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
