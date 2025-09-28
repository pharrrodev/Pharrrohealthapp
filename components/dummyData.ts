import { GlucoseReading, Meal, Medication, UserMedication } from '../types';

const now = new Date();

export const initialUserMedications: UserMedication[] = [
    { id: 'um1', name: 'Metformin', dosage: 500, unit: 'mg' },
    { id: 'um2', name: 'Insulin Aspart (NovoRapid)', dosage: 1, unit: 'units' },
    { id: 'um3', name: 'Gliclazide', dosage: 80, unit: 'mg' },
];

export const initialGlucoseReadings: GlucoseReading[] = [
    {
        id: 'g1',
        value: 5.2,
        displayUnit: 'mmol/L',
        context: 'fasting',
        timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
        source: 'manual',
    },
    {
        id: 'g2',
        value: 8.9,
        displayUnit: 'mmol/L',
        context: 'after_meal',
        timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        source: 'voice',
        transcript: 'My sugar was 8.9 after breakfast',
    },
    {
        id: 'g3',
        value: 4.8,
        displayUnit: 'mmol/L',
        context: 'before_meal',
        timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        source: 'manual',
    },
];

export const initialMeals: Meal[] = [
    {
        id: 'm1',
        timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        mealType: 'breakfast',
        foodItems: [{ name: 'Oatmeal with Berries', nutrition: { carbohydrates: 45, calories: 300, protein: 8, fat: 5 } }],
        totalNutrition: { carbohydrates: 45, calories: 300, protein: 8, fat: 5 },
        source: 'manual',
    }
];

export const initialMedications: Medication[] = [
    {
        id: 'med1',
        name: 'Metformin',
        dosage: 500,
        unit: 'mg',
        quantity: 1,
        timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        source: 'manual',
    },
];