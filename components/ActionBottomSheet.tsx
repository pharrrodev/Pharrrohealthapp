import React from 'react';
import { DropletIcon, WeightScaleIcon, BloodPressureIcon, ForkSpoonIcon, PillIcon, XIcon } from './Icons';

interface ActionBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onLogGlucose: () => void;
  onLogWeight: () => void;
  onLogBloodPressure: () => void;
  onLogMeal: () => void;
  onLogMedication: () => void;
}

const ActionBottomSheet: React.FC<ActionBottomSheetProps> = ({
  isOpen,
  onClose,
  onLogGlucose,
  onLogWeight,
  onLogBloodPressure,
  onLogMeal,
  onLogMedication,
}) => {
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div 
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-modal="true" 
        role="dialog"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>

      {/* Sheet */}
      <div className={`bg-slate-50 rounded-t-2xl shadow-xl w-full max-w-lg p-4 pt-3 transition-transform duration-300 ease-in-out transform absolute bottom-0 left-1/2 -translate-x-1/2 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-800">What would you like to log?</h3>
          <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          <ActionButton
            icon={<DropletIcon className="w-8 h-8 text-blue-600" />}
            label="Glucose"
            onClick={() => handleAction(onLogGlucose)}
          />
          <ActionButton
            icon={<WeightScaleIcon className="w-8 h-8 text-teal-600" />}
            label="Weight"
            onClick={() => handleAction(onLogWeight)}
          />
          <ActionButton
            icon={<BloodPressureIcon className="w-8 h-8 text-indigo-600" />}
            label="Blood Pressure"
            onClick={() => handleAction(onLogBloodPressure)}
          />
          <ActionButton
            icon={<ForkSpoonIcon className="w-8 h-8 text-green-600" />}
            label="Meal"
            onClick={() => handleAction(onLogMeal)}
          />
          <ActionButton
            icon={<PillIcon className="w-8 h-8 text-purple-600" />}
            label="Medication"
            onClick={() => handleAction(onLogMedication)}
          />
        </div>
      </div>
    </div>
  );
};

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-sm hover:shadow-md hover:bg-slate-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    {icon}
    <span className="mt-2 text-sm font-medium text-slate-700 text-center">{label}</span>
  </button>
);

export default ActionBottomSheet;
