import { useState, useEffect } from 'react';
import { Shield, Eye, Users } from 'lucide-react';
import { getAllProfiles, updateProfileRole } from '../../lib/database';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { Profile } from '../../types';

export function UserManager() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfiles = async () => {
    setLoading(true);
    const data = await getAllProfiles();
    setProfiles(data);
    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const toggleRole = async (profile: Profile) => {
    if (profile.id === user?.id) {
      toast.error("You can't change your own role");
      return;
    }
    const newRole = profile.role === 'admin' ? 'viewer' : 'admin';
    const { error } = await updateProfileRole(profile.id, newRole);
    if (error) toast.error('Failed to update role');
    else {
      toast.success(`Updated ${profile.display_name || profile.email} to ${newRole}`);
      loadProfiles();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-white">Users ({profiles.length})</h2>
      </div>

      <div className="space-y-2">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="bg-gray-800 rounded-lg p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-medium">
              {(profile.display_name || profile.email)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {profile.display_name || 'No name'}
              </p>
              <p className="text-xs text-gray-500 truncate">{profile.email}</p>
              <p className="text-xs text-gray-600">Joined {formatDate(profile.created_at)}</p>
            </div>
            <button
              onClick={() => toggleRole(profile)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                profile.role === 'admin'
                  ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {profile.role === 'admin' ? (
                <><Shield className="w-3.5 h-3.5" /> Admin</>
              ) : (
                <><Eye className="w-3.5 h-3.5" /> Viewer</>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
