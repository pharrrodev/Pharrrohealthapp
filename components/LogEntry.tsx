import React from 'react';
import { GlucoseReading, Meal, Medication, LogEntry as LogEntryType, WeightReading, BloodPressureReading } from '../types';
import { DropletIcon, ForkSpoonIcon, MicIcon, PencilIcon, PillIcon, CameraIcon, WeightScaleIcon, BloodPressureIcon } from './Icons';

interface LogEntryProps {
  log: LogEntryType;
}

const GlucoseEntry: React.FC<{ log: GlucoseReading }> = ({ log }) => {
  const getGlucoseColor = (value: number) => {
    const high = log.displayUnit === 'mmol/L' ? 10 : 180;
    const low = log.displayUnit === 'mmol/L' ? 4 : 70;
    if (value > high) return 'text-red-500';
    if (value < low) return 'text-orange-500';
    return 'text-blue-600';
  };

  return (
    <div className="flex items-center space-x-3">
      <div className="bg-blue-100 rounded-full p-2">
        <DropletIcon className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-700 text-sm">Glucose Reading</p>
        <p className="text-xs text-slate-500 capitalize">{log.context.replace('_', ' ')}</p>
      </div>
      <div className="flex items-baseline space-x-1">
        <p className={`text-xl font-bold ${getGlucoseColor(log.value)}`}>{log.value}</p>
        <p className="text-xs text-slate-500">{log.displayUnit}</p>
      </div>
      {log.source === 'voice' && <MicIcon className="w-4 h-4 text-slate-400" />}
      {log.source === 'manual' && <PencilIcon className="w-4 h-4 text-slate-400" />}
      {log.source === 'photo_analysis' && <CameraIcon className="w-4 h-4 text-slate-400" />}
    </div>
  );
};

const MealEntry: React.FC<{ log: Meal }> = ({ log }) => {
  return (
    <div className="flex items-start space-x-3">
      <div className="bg-green-100 rounded-full p-2">
        <ForkSpoonIcon className="w-5 h-5 text-green-600" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-700 capitalize text-sm">{log.mealType}</p>
        <p className="text-xs text-slate-500">
          {log.foodItems.map(item => item.name).join(', ')}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          <span className="font-medium">{log.totalNutrition.carbohydrates}g</span> carbs
        </p>
      </div>
      {/* FIX: Wrap icon in a span with a title to fix prop type error. */}
      {log.source === 'voice' && <span title="Logged by voice"><MicIcon className="w-4 h-4 text-slate-400 self-center" /></span>}
      {/* FIX: Wrap icon in a span with a title to fix prop type error. */}
      {log.source === 'manual' && <span title="Logged manually"><PencilIcon className="w-4 h-4 text-slate-400 self-center" /></span>}
      {log.photoUrl && (
        <img src={log.photoUrl} alt={log.mealType} className="w-16 h-16 rounded-lg object-cover" />
      )}
    </div>
  );
};

const MedicationEntry: React.FC<{ log: Medication }> = ({ log }) => {
  return (
    <div className="flex items-center space-x-3">
      <div className="bg-purple-100 rounded-full p-2">
        <PillIcon className="w-5 h-5 text-purple-600" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-700 text-sm">{log.name}</p>
        <p className="text-xs text-slate-500">{`${log.quantity} x ${log.dosage}${log.unit}`}</p>
      </div>
       {log.source === 'voice' && <MicIcon className="w-4 h-4 text-slate-400" />}
      {log.source === 'manual' && <PencilIcon className="w-4 h-4 text-slate-400" />}
    </div>
  );
};

const WeightEntry: React.FC<{ log: WeightReading }> = ({ log }) => {
    return (
      <div className="flex items-center space-x-3">
        <div className="bg-teal-100 rounded-full p-2">
          <WeightScaleIcon className="w-5 h-5 text-teal-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-700 text-sm">Weight Reading</p>
          <p className="text-xs text-slate-500">Logged {log.source === 'voice' ? 'by voice' : (log.source === 'photo_analysis' ? 'by photo' : 'manually')}</p>
        </div>
        <div className="flex items-baseline space-x-1">
          <p className={`text-xl font-bold text-teal-600`}>{log.value}</p>
          <p className="text-xs text-slate-500">{log.unit}</p>
        </div>
        {log.source === 'voice' && <MicIcon className="w-4 h-4 text-slate-400" />}
        {log.source === 'manual' && <PencilIcon className="w-4 h-4 text-slate-400" />}
        {log.source === 'photo_analysis' && <CameraIcon className="w-4 h-4 text-slate-400" />}
      </div>
    );
};
  
const BloodPressureEntry: React.FC<{ log: BloodPressureReading }> = ({ log }) => {
    return (
        <div className="flex items-center space-x-3">
        <div className="bg-indigo-100 rounded-full p-2">
            <BloodPressureIcon className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1">
            <p className="font-semibold text-slate-700 text-sm">Blood Pressure</p>
            <p className="text-xs text-slate-500">Pulse: {log.pulse} bpm</p>
        </div>
        <div className="text-right">
            <p className={`text-xl font-bold text-indigo-600`}>{log.systolic} / {log.diastolic}</p>
            <p className="text-xs text-slate-500">mmHg</p>
        </div>
        <div className="flex flex-col items-center justify-center pl-2 space-y-1">
            {log.source === 'voice' && <MicIcon className="w-4 h-4 text-slate-400" />}
            {log.source === 'manual' && <PencilIcon className="w-4 h-4 text-slate-400" />}
            {log.source === 'photo_analysis' && <CameraIcon className="w-4 h-4 text-slate-400" />}
        </div>
        </div>
    );
};


const LogEntry: React.FC<LogEntryProps> = ({ log }) => {
  const date = new Date(log.timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12; // Get hours in 12-hour format (1-12)
  const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
  const timeString = `${formattedHours}:${formattedMinutes}`;
  
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const dateString = `${day}/${month}`;

  const renderContent = () => {
    switch (log.type) {
      case 'glucose':
        return <GlucoseEntry log={log} />;
      case 'meal':
        return <MealEntry log={log} />;
      case 'medication':
        return <MedicationEntry log={log} />;
      case 'weight':
        return <WeightEntry log={log} />;
      case 'blood_pressure':
        return <BloodPressureEntry log={log as BloodPressureReading} />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white p-3 rounded-xl shadow-sm flex items-start space-x-3">
      <div className="text-center w-16">
        <p className="font-semibold text-slate-700">{timeString}</p>
        <p className="text-xs text-slate-500">{ampm}</p>
        <p className="text-xs text-slate-400 mt-0.5">{dateString}</p>
      </div>
      <div className="border-l border-slate-200 pl-3 flex-1">
        {renderContent()}
      </div>
    </div>
  );
};

export default LogEntry;