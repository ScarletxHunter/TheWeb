import { useState, useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMyGroups, getMyStorageUsed } from '../../lib/database';
import { formatBytes } from '../../lib/utils';
import {
  Shield,
  LogOut,
  Globe,
  Trash2,
  Users,
  HardDrive,
  X,
} from 'lucide-react';
import type { Group } from '../../types';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [groups, setGroups] = useState<Group[]>([]);
  const [storageUsed, setStorageUsed] = useState(0);

  const currentSpace = searchParams.get('space') || 'personal';
  const currentGroupId = searchParams.get('groupId');

  useEffect(() => {
    getMyGroups().then(setGroups);
    if (user) getMyStorageUsed(user.id).then(setStorageUsed);
  }, [user]);

  const navLinks = [
    { to: '/trash', icon: Trash2, label: 'Trash' },
    { to: '/groups', icon: Users, label: 'Groups' },
    ...(isAdmin ? [{ to: '/admin', icon: Shield, label: 'Admin' }] : []),
  ];

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 hidden lg:flex ${
          open ? '!flex translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
          <Link to="/" className="flex items-center gap-3 no-underline" onClick={onClose}>
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white">TheWeb</span>
          </Link>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Spaces */}
        <div className="px-3 py-3 border-b border-gray-800">
          <p className="px-3 mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Spaces</p>

          {/* My Files */}
          <Link
            to="/?space=personal"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
              location.pathname === '/' && currentSpace === 'personal'
                ? 'bg-indigo-600/20 text-indigo-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <HardDrive className="w-5 h-5" />
            My Files
          </Link>

          {/* Groups */}
          {groups.map(group => (
            <Link
              key={group.id}
              to={`/?space=group&groupId=${group.id}`}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
                currentSpace === 'group' && currentGroupId === group.id
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: group.avatar_color }}
              >
                {group.name[0].toUpperCase()}
              </div>
              <span className="truncate">{group.name}</span>
            </Link>
          ))}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          {navLinks.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
                  active
                    ? 'bg-indigo-600/20 text-indigo-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <link.icon className="w-5 h-5" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Storage quota */}
        <div className="border-t border-gray-800 px-4 py-3">
          {(() => {
            const maxStorage = profile?.quota_bytes ?? 1024 * 1024 * 1024;
            const pct = Math.min((storageUsed / maxStorage) * 100, 100);
            return (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">My Storage</span>
                  <span className="text-xs text-gray-500">
                    {formatBytes(storageUsed)} / {formatBytes(maxStorage)}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>

        {/* User info */}
        <div className="border-t border-gray-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-medium">
              {(profile?.display_name || profile?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {profile?.display_name || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
