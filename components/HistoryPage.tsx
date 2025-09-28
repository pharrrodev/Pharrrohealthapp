import React from 'react';
import LateEntryForm from './LateEntryForm';
import { GlucoseReading, Meal, Medication, UserMedication, WeightReading, BloodPressureReading } from '../types';

interface HistoryPageProps {
    onAddGlucose: (reading: Omit<GlucoseReading, 'id'>) => void;
    onAddMeal: (meal: Omit<Meal, 'id'>) => void;
    onAddMedication: (medication: Omit<Medication, 'id'>) => void;
    onAddWeight: (reading: Omit<WeightReading, 'id'>) => void;
    onAddBloodPressure: (reading: Omit<BloodPressureReading, 'id'>) => void;
    userMedications: UserMedication[];
    unit: 'mg/dL' | 'mmol/L';
}

const HistoryPage: React.FC<HistoryPageProps> = (props) => {
    return (
        <div className="h-full overflow-y-auto">
            <LateEntryForm {...props} />
        </div>
    );
};

export default HistoryPage;