import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ExternalLink, CreditCard, Database, HardDrive } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { UserManager } from '../components/admin/UserManager';
import { StorageStats } from '../components/admin/StorageStats';
import { getProjectUsage, type ProjectUsage } from '../lib/database';
import { formatBytes } from '../lib/utils';

// Supabase project ref. Public info — appears in your dashboard URL.
const SUPABASE_PROJECT_REF = 'uvpkgnyqorprnjyqrwfy';

// Free-tier limits we surface in the UI. If you upgrade the plan,
// bump these (or pull them dynamically once Supabase exposes a plan API).
const FREE_TIER = {
  db: 500 * 1024 * 1024,        // 500 MB
  storage: 1024 * 1024 * 1024,  // 1 GB
  name: 'Free',
};

function UsageBar({ used, max, label, icon: Icon }: {
  used: number; max: number; label: string; icon: typeof Database;
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
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
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

  const dbPct = usage ? (usage.db_bytes / FREE_TIER.db) * 100 : 0;
  const storagePct = usage ? (usage.storage_bytes / FREE_TIER.storage) * 100 : 0;
  const nearLimit = dbPct > 80 || storagePct > 80;

  return (
    <>
      <Header onMenuClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))} onSearch={() => {}} title="Admin" />
      <div className="flex-1 p-4 lg:p-6 space-y-8 overflow-y-auto">
        <StorageStats />

        {/* Supabase plan + live project usage. The actual upgrade
            checkout lives on supabase.com — Supabase doesn't expose
            plan changes via API, so we surface real numbers here and
            jump out only for the payment step. */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-white">Project plan</h2>
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
              {FREE_TIER.name}
            </span>
          </div>

          {!usage ? (
            <div className="h-20 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 mb-5">
              <UsageBar used={usage.storage_bytes} max={FREE_TIER.storage} label="File storage" icon={HardDrive} />
              <UsageBar used={usage.db_bytes} max={FREE_TIER.db} label="Database" icon={Database} />
            </div>
          )}

          {nearLimit && (
            <div className="mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-300">
              You're over 80% of a free-tier limit. Upgrading on Supabase unlocks 8 GB DB / 100 GB storage on the Pro plan.
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
            Supabase doesn't allow plan changes via API — checkout has to happen on
            their site. After upgrading, raise individual users' quota in Admin → Users.
          </p>
        </div>

        <UserManager />
      </div>
    </>
  );
}
