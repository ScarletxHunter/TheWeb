import { Navigate } from 'react-router-dom';
import { ExternalLink, CreditCard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { UserManager } from '../components/admin/UserManager';
import { StorageStats } from '../components/admin/StorageStats';

// Supabase project ref. Lives here (not env) so the link is always
// correct after deploy without extra config. Public info — appears
// in your dashboard URL.
const SUPABASE_PROJECT_REF = 'uvpkgnyqorprnjyqrwfy';

export function Admin() {
  const { isAdmin } = useAuth();

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <>
      <Header onMenuClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))} onSearch={() => {}} title="Admin" />
      <div className="flex-1 p-4 lg:p-6 space-y-8 overflow-y-auto">
        <StorageStats />

        {/* Supabase plan management — has to be done on supabase.com,
            their dashboard handles billing. We link out instead. */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Supabase plan</h2>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Storage, bandwidth, and database limits live on your Supabase project.
            Subscription changes have to be made on supabase.com — once you upgrade
            there, every user's per-quota limit can grow accordingly.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/billing`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Manage subscription <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/usage`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors"
            >
              Usage & limits <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <UserManager />
      </div>
    </>
  );
}
