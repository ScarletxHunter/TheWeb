import { useState, useEffect } from 'react';
import { HardDrive, FileIcon, Database } from 'lucide-react';
import { getTotalStorageUsed, getTotalFileCount } from '../../lib/database';
import { formatBytes } from '../../lib/utils';

export function StorageStats() {
  const [storageUsed, setStorageUsed] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [used, count] = await Promise.all([
        getTotalStorageUsed(),
        getTotalFileCount(),
      ]);
      setStorageUsed(used);
      setFileCount(count);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxStorage = 1024 * 1024 * 1024; // 1GB free tier
  const usagePercent = Math.min((storageUsed / maxStorage) * 100, 100);

  const stats = [
    {
      icon: HardDrive,
      label: 'Storage Used',
      value: formatBytes(storageUsed),
      sub: `of ${formatBytes(maxStorage)}`,
    },
    {
      icon: FileIcon,
      label: 'Total Files',
      value: fileCount.toString(),
      sub: 'files uploaded',
    },
    {
      icon: Database,
      label: 'Usage',
      value: `${usagePercent.toFixed(1)}%`,
      sub: 'of free tier',
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Storage bar */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Storage Usage</span>
          <span className="text-sm text-gray-400">
            {formatBytes(storageUsed)} / {formatBytes(maxStorage)}
          </span>
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
