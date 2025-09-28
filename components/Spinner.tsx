import React from 'react';

const Spinner: React.FC<{ colorClass?: string }> = ({ colorClass = 'border-white' }) => {
  return (
    <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${colorClass}`}></div>
  );
};

export default Spinner;