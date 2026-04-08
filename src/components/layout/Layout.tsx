import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

interface LayoutProps {
  children: ReactNode;
  onUploadClick?: () => void;
}

export function Layout({ children, onUploadClick }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {children}
      </main>
      <BottomNav onUploadClick={onUploadClick} />
    </div>
  );
}

export { Layout as default };
