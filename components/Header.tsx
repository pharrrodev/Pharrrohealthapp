import React from 'react';
import { HeartPulseIcon, SettingsIcon } from './Icons';

interface HeaderProps {
    onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenSettings }) => {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <HeartPulseIcon className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            PharrroHealth
          </h1>
        </div>
        <div>
            <button onClick={onOpenSettings} className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-full transition-colors" title="My Medications">
                <SettingsIcon className="w-6 h-6" />
            </button>
        </div>
      </div>
    </header>
  );
};

export default Header;