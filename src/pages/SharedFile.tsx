import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Globe, AlertCircle, Clock, Lock } from 'lucide-react';
import { getShareLinkByToken } from '../lib/database';
import { blobDownload } from '../lib/storage';
import { formatBytes, hashPassword } from '../lib/utils';
import toast, { Toaster } from 'react-hot-toast';
import type { ShareLink } from '../types';

export function SharedFile() {
  const { token } = useParams<{ token: string }>();
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) {
        setError('Invalid link');
        setLoading(false);
        return;
      }
      const data = await getShareLinkByToken(token);
      if (!data) {
        setError('Link not found or has been deleted');
      } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('This link has expired');
      } else {
        setLink(data);
        if (!data.password_hash) setUnlocked(true);
      }
      setLoading(false);
    }
    load();
  }, [token]);

  const handleUnlock = async () => {
    if (!link?.password_hash || !passwordInput) return;
    const hash = await hashPassword(passwordInput);
    if (hash === link.password_hash) {
      setUnlocked(true);
      setPasswordError('');
    } else {
      setPasswordError('Incorrect password');
    }
  };

  const handleDownload = async () => {
    if (!link?.files) return;
    setDownloading(true);
    const { error } = await blobDownload(link.files.storage_path, link.files.name);
    if (error) toast.error('Download failed');
    setDownloading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <Toaster position="top-right" />
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Link Unavailable</h1>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  const file = link!.files!;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <Toaster position="top-right" />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mb-4">
            <Globe className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">TheWeb</h1>
          <p className="text-gray-400 mt-1">Shared file download</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {!unlocked ? (
            /* Password gate */
            <div className="text-center">
              <Lock className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-white font-medium mb-1">This file is password protected</p>
              <p className="text-sm text-gray-400 mb-4">Enter the password to access the download</p>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder="Enter password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
              />
              {passwordError && (
                <p className="text-sm text-red-400 mb-3">{passwordError}</p>
              )}
              <button
                onClick={handleUnlock}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" /> Unlock
              </button>
            </div>
          ) : (
            /* Download section */
            <>
              <div className="text-center mb-6">
                <p className="text-lg font-medium text-white break-all">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{formatBytes(file.size)}</p>
                {link!.expires_at && (
                  <div className="flex items-center justify-center gap-1 mt-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    Expires {new Date(link!.expires_at).toLocaleString()}
                  </div>
                )}
              </div>

              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-5 h-5" />
                {downloading ? 'Preparing download...' : 'Download File'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
