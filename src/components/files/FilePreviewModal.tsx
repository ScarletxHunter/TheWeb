import { useState, useEffect } from 'react';
import { X, Download, Share2, ChevronLeft, ChevronRight } from 'lucide-react';
import { downloadFile, blobDownload } from '../../lib/storage';
import { formatBytes } from '../../lib/utils';
import type { FileRecord } from '../../types';

interface FilePreviewModalProps {
  file: FileRecord;
  files?: FileRecord[];
  onClose: () => void;
  onShare: () => void;
  onNavigate?: (file: FileRecord) => void;
}

export function FilePreviewModal({ file, files, onClose, onShare, onNavigate }: FilePreviewModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { url: signedUrl, error } = await downloadFile(file.storage_path);
      if (!error) setUrl(signedUrl);
      setLoading(false);
    }
    load();
  }, [file.storage_path]);

  const handleDownload = async () => {
    await blobDownload(file.storage_path, file.name);
  };

  const currentIndex = files?.findIndex(f => f.id === file.id) ?? -1;
  const hasPrev = currentIndex > 0;
  const hasNext = files ? currentIndex < files.length - 1 : false;

  const navigate = (dir: -1 | 1) => {
    if (!files || !onNavigate) return;
    const next = files[currentIndex + dir];
    if (next) onNavigate(next);
  };

  const isImage = file.mime_type.startsWith('image/');
  const isVideo = file.mime_type.startsWith('video/');
  const isAudio = file.mime_type.startsWith('audio/');
  const isPdf = file.mime_type.includes('pdf');

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-3xl max-h-[90vh] flex flex-col z-10 animate-slide-up lg:animate-none">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
          <div className="min-w-0 flex-1 mr-4">
            <p className="text-sm font-medium text-white truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer" title="Download">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={() => { onShare(); }} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer" title="Share">
              <Share2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px] relative">
          {loading && (
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          )}

          {!loading && url && isImage && (
            <img src={url} alt={file.name} className="max-w-full max-h-[60vh] object-contain rounded-lg" />
          )}

          {!loading && url && isVideo && (
            <video src={url} controls className="max-w-full max-h-[60vh] rounded-lg" />
          )}

          {!loading && url && isAudio && (
            <div className="w-full max-w-md">
              <div className="bg-gray-800 rounded-xl p-6 text-center">
                <div className="w-20 h-20 rounded-full bg-indigo-600/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                </div>
                <p className="text-white font-medium mb-4">{file.name}</p>
                <audio src={url} controls className="w-full" />
              </div>
            </div>
          )}

          {!loading && url && isPdf && (
            <iframe src={url} className="w-full h-[60vh] rounded-lg border border-gray-700" title={file.name} />
          )}

          {!loading && url && !isImage && !isVideo && !isAudio && !isPdf && (
            <div className="text-center">
              <p className="text-gray-400 mb-4">Preview not available for this file type</p>
              <button onClick={handleDownload} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium cursor-pointer transition-colors">
                <Download className="w-5 h-5 inline mr-2" />Download File
              </button>
            </div>
          )}

          {/* Navigation arrows */}
          {hasPrev && (
            <button onClick={() => navigate(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-gray-800/80 hover:bg-gray-700 text-white cursor-pointer">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {hasNext && (
            <button onClick={() => navigate(1)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-gray-800/80 hover:bg-gray-700 text-white cursor-pointer">
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
