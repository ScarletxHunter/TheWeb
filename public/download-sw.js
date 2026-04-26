/**
 * Streaming-download + streaming-preview service worker.
 *
 * Two magic URL prefixes the SW intercepts:
 *
 *   /__stream-download/<id>
 *     One-shot download. Concatenates the registered chunk URLs in order
 *     and returns a single attachment response. Browser streams to disk —
 *     no in-memory blob, so 500 MB / multi-GB files work even on iOS Safari.
 *
 *   /__stream-preview/<id>
 *     Long-lived preview. Same chunk source, but no `Content-Disposition:
 *     attachment` and full `Range` request handling so video/audio elements
 *     can seek the timeline. The task stays registered until the client
 *     unregisters it (typically when the preview modal closes).
 */

const STREAM_DOWNLOAD_PREFIX = '/__stream-download/';
const STREAM_PREVIEW_PREFIX = '/__stream-preview/';

const downloadTasks = new Map();
const previewTasks = new Map();

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
    downloadTasks.set(data.id, {
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

  if (data.type === 'register-preview') {
    previewTasks.set(data.id, {
      urls: Array.isArray(data.urls) ? data.urls : [],
      mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream',
      totalSize: typeof data.totalSize === 'number' && Number.isFinite(data.totalSize) ? data.totalSize : 0,
      partSize: typeof data.partSize === 'number' && Number.isFinite(data.partSize) ? data.partSize : 0,
    });
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({ type: 'preview-registered', id: data.id });
    }
    return;
  }

  if (data.type === 'unregister-stream') {
    downloadTasks.delete(data.id);
    return;
  }

  if (data.type === 'unregister-preview') {
    previewTasks.delete(data.id);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(STREAM_DOWNLOAD_PREFIX)) {
    const id = url.pathname.slice(STREAM_DOWNLOAD_PREFIX.length);
    const task = downloadTasks.get(id);
    if (!task) {
      event.respondWith(new Response('Download task not found or already consumed.', { status: 410 }));
      return;
    }
    // One-shot — drop on first hit so refresh doesn't replay.
    downloadTasks.delete(id);
    event.respondWith(buildDownloadResponse(task));
    return;
  }

  if (url.pathname.startsWith(STREAM_PREVIEW_PREFIX)) {
    const id = url.pathname.slice(STREAM_PREVIEW_PREFIX.length);
    const task = previewTasks.get(id);
    if (!task) {
      event.respondWith(new Response('Preview task not found.', { status: 410 }));
      return;
    }
    event.respondWith(buildPreviewResponse(task, event.request));
  }
});

function buildDownloadResponse(task) {
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
    'X-Content-Type-Options': 'nosniff',
  });
  if (totalSize !== null) {
    headers.set('Content-Length', String(totalSize));
  }

  return new Response(stream, { headers });
}

function buildPreviewResponse(task, request) {
  const { urls, mimeType, totalSize, partSize } = task;

  // No Range → 200 with full file. Browser usually re-issues with Range
  // for media elements, but fallback path still has to be valid.
  const rangeHeader = request.headers.get('Range');
  if (!rangeHeader) {
    const stream = streamRange(urls, partSize, totalSize, 0, totalSize - 1);
    return new Response(stream, {
      status: 200,
      headers: previewHeaders(mimeType, totalSize, null),
    });
  }

  const parsed = parseRange(rangeHeader, totalSize);
  if (!parsed) {
    return new Response('Invalid Range', {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` },
    });
  }

  const { start, end } = parsed;
  const stream = streamRange(urls, partSize, totalSize, start, end);
  return new Response(stream, {
    status: 206,
    headers: previewHeaders(mimeType, end - start + 1, `bytes ${start}-${end}/${totalSize}`),
  });
}

function previewHeaders(mimeType, contentLength, contentRange) {
  const headers = new Headers({
    'Content-Type': mimeType,
    'Content-Length': String(contentLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (contentRange) headers.set('Content-Range', contentRange);
  return headers;
}

function parseRange(rangeHeader, totalSize) {
  // Only `bytes=...` units; suffix (-N) and open-ended (N-) accepted.
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];

  let start;
  let end;

  if (startStr === '') {
    if (endStr === '') return null;
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? totalSize - 1 : Number(endStr);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  }

  if (start < 0 || end >= totalSize || start > end) return null;
  return { start, end };
}

function streamRange(urls, partSize, totalSize, start, end) {
  return new ReadableStream({
    async start(controller) {
      try {
        const firstChunk = Math.floor(start / partSize);
        const lastChunk = Math.min(Math.floor(end / partSize), urls.length - 1);

        for (let i = firstChunk; i <= lastChunk; i++) {
          const chunkAbsStart = i * partSize;
          const chunkAbsEnd = Math.min(chunkAbsStart + partSize - 1, totalSize - 1);
          const rangeStart = Math.max(start, chunkAbsStart) - chunkAbsStart;
          const rangeEnd = Math.min(end, chunkAbsEnd) - chunkAbsStart;

          const resp = await fetch(urls[i], {
            headers: { Range: `bytes=${rangeStart}-${rangeEnd}` },
          });
          if (!resp.ok || !resp.body) {
            throw new Error(`Failed to fetch chunk ${i} (${resp.status})`);
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
}

function encodeRfc5987(str) {
  return encodeURIComponent(str).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
