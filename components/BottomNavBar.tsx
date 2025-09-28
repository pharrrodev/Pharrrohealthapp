import React from 'react';
import { ChartBarIcon, ListChecksIcon, CalendarDaysIcon } from './Icons';
import { Page } from '../App';

interface BottomNavBarProps {
    activePage: Page;
    onNavigate: (page: Page) => void;
}

const NavButton: React.FC<{
    page: Page;
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
}> = ({ page, label, icon, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors duration-200 ${isActive ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}
        >
            {icon}
            <span className="text-xs mt-1">{label}</span>
        </button>
    );
};


const BottomNavBar: React.FC<BottomNavBarProps> = ({ activePage, onNavigate }) => {
    return (
        <nav className="flex-shrink-0 bg-white shadow-[0_-1px_3px_rgba(0,0,0,0.1)]">
            <div className="container mx-auto flex justify-around">
                <NavButton
                    page="dashboard"
                    label="Dashboard"
                    icon={<ChartBarIcon className="w-6 h-6" />}
                    isActive={activePage === 'dashboard'}
                    onClick={() => onNavigate('dashboard')}
                />
                <NavButton
                    page="activity"
                    label="Activity"
                    icon={<ListChecksIcon className="w-6 h-6" />}
                    isActive={activePage === 'activity'}
                    onClick={() => onNavigate('activity')}
                />
                <NavButton
                    page="history"
                    label="History"
                    icon={<CalendarDaysIcon className="w-6 h-6" />}
                    isActive={activePage === 'history'}
                    onClick={() => onNavigate('history')}
                />
            </div>
        </nav>
    );
};

export default BottomNavBar;