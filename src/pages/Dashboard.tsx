import { useState, useCallback } from 'react';
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
import { FolderOpen } from 'lucide-react';
import type { FileRecord } from '../types';

export function Dashboard() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder');

  const { files, loading: filesLoading, refresh: refreshFiles, searchFiles } = useFiles(folderId);
  const { folders, breadcrumbs, loading: foldersLoading, refresh: refreshFolders } = useFolders(folderId);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareFile, setShareFile] = useState<FileRecord | null>(null);

  const navigateToFolder = useCallback(
    (id: string | null) => {
      if (id) {
        setSearchParams({ folder: id });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams]
  );

  const handleUploadComplete = useCallback(() => {
    refreshFiles();
  }, [refreshFiles]);

  const handleRefreshAll = useCallback(() => {
    refreshFiles();
    refreshFolders();
  }, [refreshFiles, refreshFolders]);

  const loading = filesLoading || foldersLoading;

  return (
    <>
      <Header
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        onSearch={searchFiles}
        title="Files"
      />

      <div className="flex-1 p-4 lg:p-6 space-y-6 overflow-y-auto">
        {/* Breadcrumbs + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <FolderBreadcrumbs breadcrumbs={breadcrumbs} onNavigate={navigateToFolder} />
          {isAdmin && (
            <CreateFolder parentId={folderId} onCreated={refreshFolders} />
          )}
        </div>

        {/* Upload zone (admin only) */}
        {isAdmin && (
          <FileUpload folderId={folderId} onUploadComplete={handleUploadComplete} />
        )}

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
              {isAdmin ? 'Upload files or create a folder to get started' : 'No files have been shared yet'}
            </p>
          </div>
        )}
      </div>

      {/* Share modal */}
      {shareFile && (
        <ShareLinkModal file={shareFile} onClose={() => setShareFile(null)} />
      )}
    </>
  );
}
