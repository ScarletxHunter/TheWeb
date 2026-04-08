import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, UserPlus, X, Crown, User, Menu } from 'lucide-react';
import { getMyGroups, createGroup, deleteGroup, getGroupMembers, addGroupMember, removeGroupMember, findUserByEmail } from '../lib/database';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import type { Group, GroupMember } from '../types';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

export function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getMyGroups();
    setGroups(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadMembers = async (group: Group) => {
    setSelectedGroup(group);
    const data = await getGroupMembers(group.id);
    setMembers(data);
  };

  const handleCreate = async () => {
    if (!user || !newName.trim()) return;
    setCreating(true);
    const { error } = await createGroup(newName.trim(), newDesc.trim() || null, user.id, newColor);
    if (error) toast.error('Failed to create group');
    else { toast.success('Group created'); setShowCreate(false); setNewName(''); setNewDesc(''); refresh(); }
    setCreating(false);
  };

  const handleDelete = async (group: Group) => {
    if (!confirm(`Delete "${group.name}"? All group files will be unlinked.`)) return;
    const { error } = await deleteGroup(group.id);
    if (error) toast.error('Failed to delete group');
    else { toast.success('Group deleted'); setSelectedGroup(null); refresh(); }
  };

  const handleInvite = async () => {
    if (!selectedGroup || !inviteEmail.trim()) return;
    const profile = await findUserByEmail(inviteEmail.trim());
    if (!profile) { toast.error('User not found'); return; }
    const { error } = await addGroupMember(selectedGroup.id, profile.id);
    if (error) toast.error('Failed to add member');
    else { toast.success('Member added'); setInviteEmail(''); loadMembers(selectedGroup); }
  };

  const handleRemoveMember = async (_memberId: string, userId: string) => {
    if (!selectedGroup) return;
    if (!confirm('Remove this member?')) return;
    const { error } = await removeGroupMember(selectedGroup.id, userId);
    if (error) toast.error('Failed to remove member');
    else { toast.success('Member removed'); loadMembers(selectedGroup); }
  };

  const isGroupAdmin = (group: Group) => group.created_by === user?.id;

  return (
    <>
      <header className="bg-gray-900 border-b border-gray-800 px-4 lg:px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          className="lg:hidden text-gray-400 hover:text-white cursor-pointer"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Users className="w-6 h-6 text-gray-400" />
        <h1 className="text-lg font-semibold text-white">Groups</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" /> New Group
        </button>
      </header>

      <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No groups yet</p>
            <p className="text-gray-600 text-sm mt-1">Create a group to share files with others</p>
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map(group => (
              <div
                key={group.id}
                onClick={() => loadMembers(group)}
                className={`bg-gray-900 border rounded-xl p-4 cursor-pointer hover:border-gray-700 transition-colors ${
                  selectedGroup?.id === group.id ? 'border-indigo-500' : 'border-gray-800'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: group.avatar_color }}
                  >
                    {group.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{group.name}</p>
                    {group.description && (
                      <p className="text-xs text-gray-500 truncate">{group.description}</p>
                    )}
                  </div>
                  {isGroupAdmin(group) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(group); }}
                      className="p-1.5 text-gray-600 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Group detail / members panel */}
        {selectedGroup && (
          <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{selectedGroup.name} - Members</h2>
              <button onClick={() => setSelectedGroup(null)} className="text-gray-500 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add member */}
            {isGroupAdmin(selectedGroup) && (
              <div className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="Enter email to invite"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleInvite}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" /> Add
                </button>
              </div>
            )}

            {/* Member list */}
            <div className="space-y-2">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-medium">
                    {(member.profiles?.display_name || member.profiles?.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{member.profiles?.display_name || member.profiles?.email}</p>
                    <p className="text-xs text-gray-500 truncate">{member.profiles?.email}</p>
                  </div>
                  {member.role === 'admin' ? (
                    <span className="flex items-center gap-1 text-xs text-yellow-500"><Crown className="w-3 h-3" /> Admin</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-500"><User className="w-3 h-3" /> Member</span>
                  )}
                  {isGroupAdmin(selectedGroup) && member.user_id !== user?.id && (
                    <button
                      onClick={() => handleRemoveMember(member.id, member.user_id)}
                      className="p-1 text-gray-600 hover:text-red-400 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create group modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center lg:p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-md p-6 z-10 animate-slide-up lg:animate-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Create Group</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Design Team"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What's this group for?"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`w-8 h-8 rounded-full cursor-pointer transition-transform ${newColor === c ? 'ring-2 ring-white scale-110' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="w-full mt-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg cursor-pointer transition-colors"
            >
              {creating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
