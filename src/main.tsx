import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ensureStreamingDownloadSW, isStreamingDownloadSupported } from './lib/streamingDownload'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the streaming-download service worker eagerly so it is ready
// the first time the user clicks Download on a chunked file. Failures are
// non-fatal — blobDownloadFile falls back to in-memory reassembly.
if (isStreamingDownloadSupported()) {
  ensureStreamingDownloadSW().catch((err) => {
    console.warn('[download-sw] registration failed:', err);
  });
}
