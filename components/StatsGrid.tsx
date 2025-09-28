import React from 'react';
import { GlucoseReading, WeightReading, BloodPressureReading } from '../types';

interface StatsGridProps {
    readings: GlucoseReading[];
    weightReadings: WeightReading[];
    bloodPressureReadings: BloodPressureReading[];
    unit: 'mg/dL' | 'mmol/L';
}

const StatsGrid: React.FC<StatsGridProps> = ({ readings, weightReadings, bloodPressureReadings, unit }) => {
    const latestGlucose = readings.length > 0 ? readings[0] : null;
    const latestWeight = weightReadings.length > 0 ? weightReadings[0] : null;
    const latestBP = bloodPressureReadings.length > 0 ? bloodPressureReadings[0] : null;

    const get24HourAverage = () => {
        const now = new Date();
        const twentyFourHoursAgo = now.getTime() - (24 * 60 * 60 * 1000);
        const recentReadings = readings.filter(r => new Date(r.timestamp).getTime() > twentyFourHoursAgo);

        if (recentReadings.length === 0) return null;

        const sum = recentReadings.reduce((acc, curr) => acc + curr.value, 0);
        const average = sum / recentReadings.length;
        return unit === 'mmol/L' ? average.toFixed(1) : Math.round(average);
    };
    
    const average = get24HourAverage();

    return (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                <p className="text-sm text-slate-500">Latest Glucose</p>
                {latestGlucose ? (
                    <p className="text-2xl font-bold text-blue-600 mt-1">{latestGlucose.value} <span className="text-lg font-normal">{unit}</span></p>
                ) : (
                    <p className="text-2xl font-bold text-slate-400 mt-1">-</p>
                )}
            </div>
             <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                <p className="text-sm text-slate-500">24h Average</p>
                {average ? (
                    <p className="text-2xl font-bold text-green-600 mt-1">{average} <span className="text-lg font-normal">{unit}</span></p>
                ) : (
                    <p className="text-2xl font-bold text-slate-400 mt-1">-</p>
                )}
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                <p className="text-sm text-slate-500">Latest Weight</p>
                {latestWeight ? (
                    <p className="text-2xl font-bold text-teal-600 mt-1">{latestWeight.value} <span className="text-lg font-normal">{latestWeight.unit}</span></p>
                ) : (
                    <p className="text-2xl font-bold text-slate-400 mt-1">-</p>
                )}
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                <p className="text-sm text-slate-500">Latest BP</p>
                {latestBP ? (
                    <p className="text-2xl font-bold text-indigo-600 mt-1">{latestBP.systolic}/{latestBP.diastolic}</p>
                ) : (
                    <p className="text-2xl font-bold text-slate-400 mt-1">-</p>
                )}
            </div>
        </section>
    );
};

export default StatsGrid;