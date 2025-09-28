import React, { useState, useCallback } from 'react';
import { GlucoseReading, Meal, Medication, LogEntry as LogEntryType, UserMedication, WeightReading, BloodPressureReading } from './types';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ActivityPage from './components/ActivityPage';
import HistoryPage from './components/HistoryPage';
import GlucoseLogModal from './components/GlucoseLogModal';
import MealLogModal from './components/MealLogModal';
import MedicationLogModal from './components/MedicationLogModal';
import MyMedicationsModal from './components/MyMedicationsModal';
import BottomNavBar from './components/BottomNavBar';
import { PlusIcon } from './components/Icons';
import { initialGlucoseReadings, initialMeals, initialMedications, initialUserMedications } from './components/dummyData';
import WeightLogModal from './components/WeightLogModal';
import BloodPressureLogModal from './components/BloodPressureLogModal';
import ActionBottomSheet from './components/ActionBottomSheet';

export type Page = 'dashboard' | 'activity' | 'history';

const App: React.FC = () => {
  const [glucoseReadings, setGlucoseReadings] = useState<GlucoseReading[]>(initialGlucoseReadings);
  const [meals, setMeals] = useState<Meal[]>(initialMeals);
  const [medications, setMedications] = useState<Medication[]>(initialMedications);
  const [weightReadings, setWeightReadings] = useState<WeightReading[]>([]);
  const [bloodPressureReadings, setBloodPressureReadings] = useState<BloodPressureReading[]>([]);
  const [userMedications, setUserMedications] = useState<UserMedication[]>(initialUserMedications);
  
  const [isGlucoseModalOpen, setIsGlucoseModalOpen] = useState(false);
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isMedicationModalOpen, setIsMedicationModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isBloodPressureModalOpen, setIsBloodPressureModalOpen] = useState(false);
  const [isMyMedicationsModalOpen, setIsMyMedicationsModalOpen] = useState(false);

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);

  const [glucoseUnit] = useState<'mg/dL' | 'mmol/L'>('mmol/L');
  const [activePage, setActivePage] = useState<Page>('dashboard');

  const addGlucoseReading = useCallback((reading: Omit<GlucoseReading, 'id'>) => {
    setGlucoseReadings(prev => [...prev, { ...reading, id: `g${Date.now()}` }].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  }, []);

  const addMeal = useCallback((meal: Omit<Meal, 'id'>) => {
    const newMeal = { ...meal, id: `m${Date.now()}` };
    setMeals(prev => [...prev, newMeal].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    return newMeal;
  }, []);

  const addMedication = useCallback((medication: Omit<Medication, 'id'>) => {
    setMedications(prev => [...prev, { ...medication, id: `med${Date.now()}` }].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  }, []);

  const addWeightReading = useCallback((reading: Omit<WeightReading, 'id'>) => {
    setWeightReadings(prev => [...prev, { ...reading, id: `w${Date.now()}` }].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  }, []);

  const addBloodPressureReading = useCallback((reading: Omit<BloodPressureReading, 'id'>) => {
    setBloodPressureReadings(prev => [...prev, { ...reading, id: `bp${Date.now()}` }].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  }, []);

  const saveUserMedication = useCallback((med: Omit<UserMedication, 'id'> & { id?: string }) => {
    setUserMedications(prev => {
        const existing = prev.find(m => m.id === med.id);
        if (existing) {
            return prev.map(m => m.id === med.id ? { ...existing, ...med } : m);
        } else {
            return [...prev, { ...med, id: `um${Date.now()}` }];
        }
    });
  }, []);

  const deleteUserMedication = useCallback((id: string) => {
    setUserMedications(prev => prev.filter(m => m.id !== id));
  }, []);


  const combinedLogs: LogEntryType[] = [
    ...glucoseReadings.map(r => ({ ...r, type: 'glucose' as const })),
    ...meals.map(m => ({ ...m, type: 'meal' as const })),
    ...medications.map(med => ({ ...med, type: 'medication' as const })),
    ...weightReadings.map(w => ({ ...w, type: 'weight' as const })),
    ...bloodPressureReadings.map(bp => ({ ...bp, type: 'blood_pressure' as const })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const renderContent = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard 
                    glucoseReadings={glucoseReadings} 
                    weightReadings={weightReadings}
                    bloodPressureReadings={bloodPressureReadings}
                    unit={glucoseUnit} 
                />;
      case 'activity':
        return <ActivityPage logs={combinedLogs} />;
      case 'history':
        return <HistoryPage 
                    onAddGlucose={addGlucoseReading}
                    onAddMeal={addMeal}
                    onAddMedication={addMedication}
                    onAddWeight={addWeightReading}
                    onAddBloodPressure={addBloodPressureReading}
                    userMedications={userMedications}
                    unit={glucoseUnit}
                />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-800 font-sans">
      <Header onOpenSettings={() => setIsMyMedicationsModalOpen(true)} />
      
      <main className="flex-grow container mx-auto px-4 md:px-6 py-6 overflow-hidden">
        {renderContent()}
      </main>

      <div className="fixed bottom-20 right-6">
        <button
          onClick={() => setIsActionSheetOpen(true)}
          className="bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-transform transform hover:scale-110 duration-200"
          aria-label="Add new log"
        >
          <PlusIcon className="w-8 h-8" />
        </button>
      </div>

      <BottomNavBar activePage={activePage} onNavigate={setActivePage} />

      <ActionBottomSheet
        isOpen={isActionSheetOpen}
        onClose={() => setIsActionSheetOpen(false)}
        onLogGlucose={() => setIsGlucoseModalOpen(true)}
        onLogWeight={() => setIsWeightModalOpen(true)}
        onLogBloodPressure={() => setIsBloodPressureModalOpen(true)}
        onLogMeal={() => setIsMealModalOpen(true)}
        onLogMedication={() => setIsMedicationModalOpen(true)}
      />

      <GlucoseLogModal
        isOpen={isGlucoseModalOpen}
        onClose={() => setIsGlucoseModalOpen(false)}
        onAddReading={addGlucoseReading}
        unit={glucoseUnit}
      />
      <MealLogModal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        onAddMeal={addMeal}
        onAddReading={addGlucoseReading}
        unit={glucoseUnit}
      />
      <MedicationLogModal
        isOpen={isMedicationModalOpen}
        onClose={() => setIsMedicationModalOpen(false)}
        onAddMedication={addMedication}
        userMedications={userMedications}
      />
      <WeightLogModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        onAddReading={addWeightReading}
      />
      <BloodPressureLogModal
        isOpen={isBloodPressureModalOpen}
        onClose={() => setIsBloodPressureModalOpen(false)}
        onAddReading={addBloodPressureReading}
      />
      <MyMedicationsModal
        isOpen={isMyMedicationsModalOpen}
        onClose={() => setIsMyMedicationsModalOpen(false)}
        userMedications={userMedications}
        onSave={saveUserMedication}
        onDelete={deleteUserMedication}
      />
    </div>
  );
};

export default App;