import { useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFiles } from '../hooks/useFiles';
import { useFolders } from '../hooks/useFolders';
import { Header } from '../components/layout/Header';
import { FileGrid } from '../components/files/FileGrid';
import { FileUpload } from '../components/files/FileUpload';
import { FolderCard } from '../components/folders/FolderCard';
import { FolderBreadcrumbs } from '../components/folders/FolderBreadcrumbs';
import { CreateFolder } from '../components/folders/CreateFolder';
import { ShareLinkModal } from '../components/sharing/ShareLinkModal';
import { FilePreviewModal } from '../components/files/FilePreviewModal';
import { MoveToFolderModal } from '../components/files/MoveToFolderModal';
import { FolderOpen, Trash2, X, Download, FolderInput } from 'lucide-react';
import { trashFile, trashFiles, renameFile } from '../lib/database';
import { downloadFile } from '../lib/storage';
import toast from 'react-hot-toast';
import type { FileRecord } from '../types';

export function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder');
  const space = searchParams.get('space') || 'personal';
  const groupId = searchParams.get('groupId');

  // Build space context for queries
  const spaceContext = useMemo(() => {
    if (space === 'group' && groupId) {
      return { type: 'group' as const, groupId };
    }
    return user ? { type: 'personal' as const, userId: user.id } : undefined;
  }, [space, groupId, user?.id]);

  const { files, loading: filesLoading, refresh: refreshFiles, searchFiles } = useFiles(folderId, spaceContext);
  const { folders, breadcrumbs, loading: foldersLoading, refresh: refreshFolders } = useFolders(folderId, spaceContext);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareFile, setShareFile] = useState<FileRecord | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [moveFileIds, setMoveFileIds] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);

  const navigateToFolder = useCallback(
    (id: string | null) => {
      const params: Record<string, string> = {};
      if (id) params.folder = id;
      if (space !== 'personal') params.space = space;
      if (groupId) params.groupId = groupId;
      setSearchParams(params);
      setSelectedIds(new Set());
    },
    [setSearchParams, space, groupId]
  );

  const handleUploadComplete = useCallback(() => {
    refreshFiles();
  }, [refreshFiles]);

  const handleRefreshAll = useCallback(() => {
    refreshFiles();
    refreshFolders();
  }, [refreshFiles, refreshFolders]);

  // Selection
  const toggleSelect = useCallback((fileId: string, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedRef.current) {
        const lastIdx = files.findIndex(f => f.id === lastSelectedRef.current);
        const curIdx = files.findIndex(f => f.id === fileId);
        if (lastIdx >= 0 && curIdx >= 0) {
          const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = start; i <= end; i++) next.add(files[i].id);
          return next;
        }
      }
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      lastSelectedRef.current = fileId;
      return next;
    });
  }, [files]);

  const clearSelection = () => setSelectedIds(new Set());
  const selectAll = () => setSelectedIds(new Set(files.map(f => f.id)));

  // Bulk actions - available to all users (owner-based permissions enforced by RLS)
  const handleBulkTrash = async () => {
    if (!confirm(`Move ${selectedIds.size} file(s) to trash?`)) return;
    const { error } = await trashFiles([...selectedIds]);
    if (error) toast.error('Failed to trash files');
    else { toast.success(`${selectedIds.size} file(s) moved to trash`); clearSelection(); refreshFiles(); }
  };

  const handleBulkDownload = async () => {
    const selected = files.filter(f => selectedIds.has(f.id));
    for (const file of selected) {
      const { url } = await downloadFile(file.storage_path);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
      }
    }
    toast.success(`Downloading ${selected.length} file(s)`);
  };

  // Single file actions
  const handleTrashFile = async (file: FileRecord) => {
    const { error } = await trashFile(file.id);
    if (error) toast.error('Failed to trash file');
    else { toast.success('File moved to trash'); refreshFiles(); }
  };

  const handleRenameFile = async (file: FileRecord) => {
    const newName = prompt('Rename file:', file.name);
    if (!newName || newName === file.name) return;
    const { error } = await renameFile(file.id, newName);
    if (error) toast.error('Failed to rename');
    else { toast.success('File renamed'); refreshFiles(); }
  };

  const loading = filesLoading || foldersLoading;
  const selectionMode = selectedIds.size > 0;
  const isGroupSpace = space === 'group' && groupId;
  const headerTitle = isGroupSpace ? 'Group Files' : 'My Files';

  return (
    <>
      <Header
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        onSearch={searchFiles}
        title={headerTitle}
      />

      {/* Bulk action toolbar */}
      {selectionMode && (
        <div className="bg-indigo-600/10 border-b border-indigo-500/30 px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-indigo-300">{selectedIds.size} selected</span>
          <button onClick={selectAll} className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded cursor-pointer">Select All</button>
          <div className="flex-1" />
          <button onClick={handleBulkDownload} className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Download
          </button>
          <button onClick={() => setMoveFileIds([...selectedIds])} className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer">
            <FolderInput className="w-3.5 h-3.5" /> Move
          </button>
          <button onClick={handleBulkTrash} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /> Trash
          </button>
          <button onClick={clearSelection} className="p-1.5 text-gray-500 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 p-4 lg:p-6 space-y-6 overflow-y-auto">
        {/* Breadcrumbs + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <FolderBreadcrumbs breadcrumbs={breadcrumbs} onNavigate={navigateToFolder} />
          <CreateFolder
            parentId={folderId}
            onCreated={refreshFolders}
            groupId={isGroupSpace ? groupId : undefined}
          />
        </div>

        {/* Upload zone - available to all users */}
        <FileUpload
          folderId={folderId}
          onUploadComplete={handleUploadComplete}
          groupId={isGroupSpace ? groupId : undefined}
        />

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Folders */}
        {!loading && folders.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-400 mb-3">Folders</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {folders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  onNavigate={navigateToFolder}
                  onRefresh={handleRefreshAll}
                />
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        {!loading && files.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-400 mb-3">
              Files ({files.length})
            </h2>
            <FileGrid
              files={files}
              onRefresh={refreshFiles}
              onShareFile={setShareFile}
              onPreviewFile={setPreviewFile}
              onTrashFile={handleTrashFile}
              onRenameFile={handleRenameFile}
              onMoveFile={(file) => setMoveFileIds([file.id])}
              selectedIds={selectedIds}
              onSelect={toggleSelect}
              selectionMode={selectionMode}
            />
          </div>
        )}

        {/* Empty state */}
        {!loading && folders.length === 0 && files.length === 0 && (
          <div className="text-center py-16">
            <FolderOpen className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">
              {folderId ? 'This folder is empty' : 'No files yet'}
            </p>
            <p className="text-gray-600 text-sm mt-1">
              Upload files or create a folder to get started
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {shareFile && (
        <ShareLinkModal file={shareFile} onClose={() => setShareFile(null)} />
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          files={files}
          onClose={() => setPreviewFile(null)}
          onShare={() => { setShareFile(previewFile); setPreviewFile(null); }}
          onNavigate={setPreviewFile}
        />
      )}

      {moveFileIds && (
        <MoveToFolderModal
          fileIds={moveFileIds}
          currentFolderId={folderId}
          onClose={() => { setMoveFileIds(null); clearSelection(); }}
          onMoved={() => { refreshFiles(); clearSelection(); }}
        />
      )}
    </>
  );
}
