import React, { useState, useRef, useEffect } from 'react';
import { Meal, GlucoseReading, FoodItem } from '../types';
import { analyzeMealPhoto } from '../services/geminiService';
import { CameraIcon, UploadIcon, XIcon } from './Icons';
import Spinner from './Spinner';

interface MealLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMeal: (meal: Omit<Meal, 'id'>) => Meal;
  onAddReading: (reading: Omit<GlucoseReading, 'id'>) => void;
  unit: 'mg/dL' | 'mmol/L';
}

const MealLogModal: React.FC<MealLogModalProps> = ({ isOpen, onClose, onAddMeal, onAddReading, unit }) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{ foodItems: FoodItem[], totalNutrition: FoodItem['nutrition'] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [logPostMealGlucose, setLogPostMealGlucose] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setImageFile(null);
      setPreviewUrl(null);
      setAnalysisResult(null);
      setIsLoading(false);
      setError('');
      setLogPostMealGlucose(false);
    }
  }, [isOpen]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAnalysisResult(null);
      setError('');
    }
  };

  const handleAnalyze = async () => {
    if (!imageFile) return;

    setIsLoading(true);
    setError('');
    setAnalysisResult(null);

    const reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        const result = await analyzeMealPhoto(base64String, imageFile.type);
        if (result) {
          setAnalysisResult(result);
        } else {
          setError("Couldn't analyze the meal photo. Please try another image.");
        }
      } catch (e) {
        if (e instanceof Error) {
            setError(e.message);
        } else {
            setError('An error occurred during analysis.');
        }
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read the image file.');
      setIsLoading(false);
    };
  };

  const handleSubmit = () => {
    if (!analysisResult) return;
    
    const mealTimestamp = new Date();

    const newMeal = onAddMeal({
      timestamp: mealTimestamp.toISOString(),
      photoUrl: previewUrl || undefined,
      foodItems: analysisResult.foodItems,
      totalNutrition: analysisResult.totalNutrition,
      mealType: getMealType(mealTimestamp),
      source: 'photo_analysis',
    });

    if (logPostMealGlucose) {
      // Create a placeholder reading 2 hours later
      const postMealTime = new Date(mealTimestamp.getTime() + 2 * 60 * 60 * 1000);
      onAddReading({
        value: 0, // Placeholder value
        displayUnit: unit,
        context: 'after_meal',
        timestamp: postMealTime.toISOString(),
        source: 'meal_correlation',
        relatedMealId: newMeal.id,
        notes: 'Enter post-meal reading'
      });
    }

    onClose();
  };

  const getMealType = (date: Date): Meal['mealType'] => {
    const hour = date.getHours();
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 21) return 'dinner';
    return 'snack';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-700">
          <XIcon className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Log Meal</h2>
        
        {!previewUrl ? (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => {
                fileInputRef.current?.setAttribute('capture', 'environment');
                fileInputRef.current?.click();
            }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-blue-500 transition-colors flex flex-col items-center justify-center">
                <CameraIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <span>Take Picture</span>
            </button>
            <button onClick={() => {
                fileInputRef.current?.removeAttribute('capture');
                fileInputRef.current?.click();
            }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-blue-500 transition-colors flex flex-col items-center justify-center">
                <UploadIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <span>Upload Photo</span>
            </button>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        </div>
        ) : (
          <div className="mb-4">
            <img src={previewUrl} alt="Meal preview" className="rounded-lg w-full max-h-64 object-contain" />
          </div>
        )}

        {previewUrl && !analysisResult && (
          <button onClick={handleAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 disabled:bg-slate-300 transition-colors flex items-center justify-center">
            {isLoading ? <Spinner /> : 'Analyze Meal'}
          </button>
        )}
        
        {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
        
        {analysisResult && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="font-semibold text-slate-700 mb-2">Analysis Results</h3>
              <div className="bg-slate-100 p-4 rounded-lg space-y-2">
                {analysisResult.foodItems.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-slate-800">{item.name}</span>
                    <span className="text-slate-500">{item.nutrition.carbohydrates}g carbs</span>
                  </div>
                ))}
                <div className="border-t border-slate-300 pt-2 mt-2 flex justify-between font-bold">
                  <span className="text-slate-800">Total</span>
                  <span className="text-blue-600">{analysisResult.totalNutrition.carbohydrates}g carbs</span>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <input type="checkbox" id="log-glucose" checked={logPostMealGlucose} onChange={(e) => setLogPostMealGlucose(e.target.checked)} className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
              <label htmlFor="log-glucose" className="ml-2 block text-sm text-slate-700">Remind me to log post-meal glucose in 2 hours</label>
            </div>

            <button onClick={handleSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">
              Confirm and Save Meal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MealLogModal;
