import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ExternalLink, CreditCard, Database, HardDrive } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { StorageStats } from '../components/admin/StorageStats';
import { UserManager } from '../components/admin/UserManager';
import { PROJECT_DB_LIMIT_BYTES, PROJECT_PLAN_NAME, PROJECT_STORAGE_LIMIT_BYTES } from '../lib/config';
import { useAuth } from '../context/AuthContext';
import { getProjectUsage, type ProjectUsage } from '../lib/database';
import { formatBytes } from '../lib/utils';

const SUPABASE_PROJECT_REF = 'uvpkgnyqorprnjyqrwfy';

const PROJECT_LIMITS = {
  db: PROJECT_DB_LIMIT_BYTES,
  storage: PROJECT_STORAGE_LIMIT_BYTES,
  name: PROJECT_PLAN_NAME,
};

function UsageBar({
  used,
  max,
  label,
  icon: Icon,
}: {
  used: number;
  max: number;
  label: string;
  icon: typeof Database;
}) {
  const pct = Math.min((used / max) * 100, 100);
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-indigo-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-300">{label}</span>
        </div>
        <span className="text-xs text-gray-500">
          {formatBytes(used)} / {formatBytes(max)} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
    </div>
  );
}

export function Admin() {
  const { isAdmin } = useAuth();
  const [usage, setUsage] = useState<ProjectUsage | null>(null);

  useEffect(() => {
    if (isAdmin) getProjectUsage().then(setUsage);
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const dbPct = usage ? (usage.db_bytes / PROJECT_LIMITS.db) * 100 : 0;
  const storagePct = usage ? (usage.storage_bytes / PROJECT_LIMITS.storage) * 100 : 0;
  const nearLimit = dbPct > 80 || storagePct > 80;

  return (
    <>
      <Header
        onMenuClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
        onSearch={() => {}}
        title="Admin"
      />
      <div className="flex-1 p-4 lg:p-6 space-y-8 overflow-y-auto">
        <StorageStats />

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-white">Project plan</h2>
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
              {PROJECT_LIMITS.name}
            </span>
          </div>

          {!usage ? (
            <div className="h-20 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 mb-5">
              <UsageBar
                used={usage.storage_bytes}
                max={PROJECT_LIMITS.storage}
                label="File storage"
                icon={HardDrive}
              />
              <UsageBar
                used={usage.db_bytes}
                max={PROJECT_LIMITS.db}
                label="Database"
                icon={Database}
              />
            </div>
          )}

          <div className="mb-4 px-3 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs text-indigo-200">
            Large uploads already use resumable transfer. To allow files above 1 GB, raise
            Supabase Storage&apos;s global file size limit, then edit the private{' '}
            <code className="bg-gray-950/60 px-1 py-0.5 rounded">vault-files</code> bucket and
            set a matching bucket file size limit. After that, raise the user&apos;s quota in
            Admin -&gt; Users.
          </div>

          {nearLimit && (
            <div className="mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-300">
              You&apos;re over 80% of a configured project limit. If you&apos;ve already upgraded
              Supabase, update the app&apos;s plan values so this dashboard reflects the new
              ceiling.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <a
              href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/billing`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Upgrade on Supabase <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/usage`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors"
            >
              Detailed usage <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <p className="text-xs text-gray-600 mt-4">
            Supabase does not allow plan changes via API, so checkout still happens on their
            site. After upgrading, also raise the global and bucket file size limits in
            Supabase, then raise individual users&apos; quota in Admin -&gt; Users.
          </p>
        </div>

        <UserManager />
      </div>
    </>
  );
}
