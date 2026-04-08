import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/layout/Header';
import { UserManager } from '../components/admin/UserManager';
import { StorageStats } from '../components/admin/StorageStats';

export function Admin() {
  const { isAdmin } = useAuth();

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <>
      <Header onMenuClick={() => {}} onSearch={() => {}} title="Admin" />
      <div className="flex-1 p-4 lg:p-6 space-y-8 overflow-y-auto">
        <StorageStats />
        <UserManager />
      </div>
    </>
  );
}
