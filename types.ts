export interface GlucoseReading {
  id: string;
  value: number;
  displayUnit: 'mg/dL' | 'mmol/L';
  context: 'fasting' | 'before_meal' | 'after_meal' | 'random' | 'bedtime';
  timestamp: string; // ISO string
  transcript?: string;
  source: 'voice' | 'manual' | 'device' | 'meal_correlation' | 'photo_analysis';
  relatedMealId?: string;
  notes?: string;
}

export interface WeightReading {
    id: string;
    value: number;
    unit: 'kg' | 'lbs';
    timestamp: string; // ISO string
    source: 'voice' | 'manual' | 'photo_analysis';
    transcript?: string;
    notes?: string;
}

export interface BloodPressureReading {
    id: string;
    systolic: number;
    diastolic: number;
    pulse: number;
    timestamp: string; // ISO string
    source: 'voice' | 'manual' | 'photo_analysis';
    transcript?: string;
    notes?: string;
}

export interface FoodItem {
  name: string;
  nutrition: {
    carbohydrates: number;
    calories: number;
    protein: number;
    fat: number;
  };
}

export interface Meal {
  id: string;
  timestamp: string; // ISO string
  photoUrl?: string;
  foodItems: FoodItem[];
  totalNutrition: {
    carbohydrates: number;
    calories: number;
    protein: number;
    fat: number;
  };
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  notes?: string;
  transcript?: string;
  source: 'photo_analysis' | 'manual' | 'voice';
}

export interface Medication {
  id: string;
  name: string;
  dosage: number;
  unit: string; // e.g., 'mg'
  quantity: number; // e.g., number of pills
  timestamp: string; // ISO string
  transcript?: string;
  source: 'voice' | 'manual';
  notes?: string;
}

// New type for user's pre-configured medication list
export interface UserMedication {
  id: string;
  name: string;
  dosage: number;
  unit: string;
}

export type LogEntry = 
  | (GlucoseReading & { type: 'glucose' }) 
  | (Meal & { type: 'meal' })
  | (Medication & { type: 'medication' })
  | (WeightReading & { type: 'weight' })
  | (BloodPressureReading & { type: 'blood_pressure' });