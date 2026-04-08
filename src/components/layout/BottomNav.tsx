import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Home, Plus, Trash2, Shield, Users } from 'lucide-react';

export function BottomNav() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleUploadClick = () => {
    if (location.pathname !== '/') {
      navigate('/');
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('scroll-to-upload'));
    }, 100);
  };

  const tabs = [
    { to: '/', icon: Home, label: 'Files' },
    { to: '#upload', icon: Plus, label: 'Upload', action: handleUploadClick },
    { to: '/groups', icon: Users, label: 'Groups' },
    { to: '/trash', icon: Trash2, label: 'Trash' },
    ...(isAdmin ? [{ to: '/admin', icon: Shield, label: 'Admin' }] : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 lg:hidden safe-area-pb">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const active = tab.to === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.to);
          const isAction = 'action' in tab && tab.action;

          if (isAction) {
            return (
              <button
                key={tab.label}
                onClick={tab.action as () => void}
                className="flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-gray-500 hover:text-indigo-400 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center -mt-5 shadow-lg shadow-indigo-500/30">
                  <tab.icon className="w-5 h-5 text-white" />
                </div>
                <span className="mt-0.5">{tab.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium transition-colors no-underline ${
                active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
