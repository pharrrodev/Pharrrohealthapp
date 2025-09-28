import React, { useState } from 'react';
import { LogEntry as LogEntryType } from '../types';
import LogEntry from './LogEntry';

interface ActivityPageProps {
  logs: LogEntryType[];
}

const ActivityPage: React.FC<ActivityPageProps> = ({ logs }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const totalPages = Math.ceil(logs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentLogs = logs.slice(startIndex, startIndex + itemsPerPage);

  const goToNextPage = () => setCurrentPage((page) => Math.min(page + 1, totalPages));
  const goToPrevPage = () => setCurrentPage((page) => Math.max(page - 1, 1));

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <h2 className="text-xl font-semibold text-slate-700">Recent Activity</h2>
        {logs.length > itemsPerPage && (
          <div className="flex items-center space-x-2 text-sm">
            <button
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-white border border-slate-300 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Prev
            </button>
            <span className="text-slate-600 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-white border border-slate-300 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div className="flex-grow space-y-3">
        {currentLogs.length > 0 ? (
          currentLogs.map(log => (
            <LogEntry key={`${log.type}-${log.id}`} log={log} />
          ))
        ) : (
          <div className="text-center py-10 bg-white rounded-xl shadow-sm h-full flex flex-col justify-center items-center">
            <p className="text-slate-500">No recent activity.</p>
            <p className="text-slate-400 text-sm mt-1">Use the '+' button to log your first entry.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPage;