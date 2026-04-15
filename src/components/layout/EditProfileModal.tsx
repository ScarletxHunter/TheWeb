import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open || !user) return null;

  const save = async () => {
    setSaving(true);
    let anyError = false;

    if (displayName !== (profile?.display_name ?? '')) {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null })
        .eq('id', user.id);
      if (error) {
        toast.error('Failed to update name');
        anyError = true;
      }
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        toast.error('Password must be at least 6 characters');
        setSaving(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
        anyError = true;
      }
    }

    setSaving(false);
    if (!anyError) {
      toast.success('Profile updated');
      setNewPassword('');
      await refreshProfile();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Edit profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
            <input
              value={profile?.email ?? ''}
              disabled
              className="w-full bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">New password (optional)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
