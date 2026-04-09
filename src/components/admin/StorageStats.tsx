import { useState, useEffect } from 'react';
import { HardDrive, FileIcon, Database, Users } from 'lucide-react';
import { getTotalStorageUsed, getTotalFileCount, getStoragePerUser } from '../../lib/database';
import { formatBytes } from '../../lib/utils';

interface UserStorage {
  user_id: string;
  display_name: string | null;
  email: string;
  total_size: number;
  file_count: number;
}

export function StorageStats() {
  const [storageUsed, setStorageUsed] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [userStorage, setUserStorage] = useState<UserStorage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [used, count, perUser] = await Promise.all([
        getTotalStorageUsed(),
        getTotalFileCount(),
        getStoragePerUser(),
      ]);
      setStorageUsed(used);
      setFileCount(count);
      setUserStorage(perUser);
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
      label: 'Site Storage Used',
      value: formatBytes(storageUsed),
      sub: `of ${formatBytes(maxStorage)} total`,
    },
    {
      icon: FileIcon,
      label: 'Total Files',
      value: fileCount.toString(),
      sub: 'across all users',
    },
    {
      icon: Database,
      label: 'Usage',
      value: `${usagePercent.toFixed(1)}%`,
      sub: usagePercent > 90 ? 'Critical!' : usagePercent > 70 ? 'Getting full' : 'Healthy',
    },
    {
      icon: Users,
      label: 'Active Uploaders',
      value: userStorage.length.toString(),
      sub: 'users with files',
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <p className="text-xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Storage bar */}
      <div className="bg-gray-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Site-Wide Storage (shared by all users)</span>
          <span className="text-sm text-gray-400">
            {formatBytes(storageUsed)} / {formatBytes(maxStorage)}
          </span>
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.max(usagePercent, 0.5)}%` }}
          />
        </div>
        <p className="text-xs text-gray-600 mt-2">
          This 1 GB limit is shared across the entire site. When full, no one can upload.
        </p>
      </div>

      {/* Per-user breakdown */}
      {userStorage.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Storage Per User</h3>
          <div className="space-y-3">
            {userStorage.map((u) => {
              const userPct = storageUsed > 0 ? (u.total_size / storageUsed) * 100 : 0;
              return (
                <div key={u.user_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {(u.display_name || u.email)[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-white truncate">{u.display_name || u.email}</span>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatBytes(u.total_size)} ({u.file_count} files)
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${Math.max(userPct, 0.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
