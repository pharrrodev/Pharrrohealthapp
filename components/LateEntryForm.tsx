import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GlucoseReading, Meal, Medication, UserMedication, FoodItem, WeightReading, BloodPressureReading } from '../types';
import { 
    analyzeMealPhoto, 
    parseGlucoseReadingFromImage,
    parseGlucoseReadingFromText,
    parseMedicationFromText,
    parseWeightFromText,
    parseWeightFromImage,
    parseBloodPressureFromText,
    parseBloodPressureFromImage
} from '../services/geminiService';
import { CalendarClockIcon, DropletIcon, ForkSpoonIcon, PillIcon, PencilIcon, CameraIcon, MicIcon, UploadIcon, WeightScaleIcon, BloodPressureIcon, SquareIcon } from './Icons';
import Spinner from './Spinner';
// FIX: The 'LiveSession' type is not exported from '@google/genai'. It has been removed.
import { GoogleGenAI, Modality, Blob } from '@google/genai';


interface LateEntryFormProps {
    onAddGlucose: (reading: Omit<GlucoseReading, 'id'>) => void;
    onAddMeal: (meal: Omit<Meal, 'id'>) => void;
    onAddMedication: (medication: Omit<Medication, 'id'>) => void;
    onAddWeight: (reading: Omit<WeightReading, 'id'>) => void;
    onAddBloodPressure: (reading: Omit<BloodPressureReading, 'id'>) => void;
    userMedications: UserMedication[];
    unit: 'mg/dL' | 'mmol/L';
}

// --- Audio Helper Functions ---
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


const formatToLocalDateTimeString = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

type LogType = 'glucose' | 'meal' | 'medication' | 'weight' | 'blood_pressure';

const LateEntryForm: React.FC<LateEntryFormProps> = ({ onAddGlucose, onAddMeal, onAddMedication, onAddWeight, onAddBloodPressure, userMedications, unit }) => {
    const [activeLogType, setActiveLogType] = useState<LogType>('glucose');
    const [timestamp, setTimestamp] = useState(new Date());
    const [showSuccess, setShowSuccess] = useState<string | null>(null);
    const [isDateTimeConfirmed, setIsDateTimeConfirmed] = useState(false);

    // --- General State ---
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const mealFileInputRef = useRef<HTMLInputElement>(null);
    const glucoseFileInputRef = useRef<HTMLInputElement>(null);
    const weightFileInputRef = useRef<HTMLInputElement>(null);
    const bpFileInputRef = useRef<HTMLInputElement>(null);
    const listeningForRef = useRef<LogType | null>(null);

    // Real-time audio state
    // FIX: Use 'any' for the session ref type as a workaround for the removed 'LiveSession' export from the SDK.
    const sessionRef = useRef<any | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const aiRef = useRef<GoogleGenAI | null>(null);

    // --- Glucose states ---
    const [glucoseLogMode, setGlucoseLogMode] = useState<'voice' | 'manual' | 'photo'>('voice');
    const [glucoseVoiceStep, setGlucoseVoiceStep] = useState<'say_reading' | 'confirm'>('say_reading');
    const [glucoseParsedData, setGlucoseParsedData] = useState<{ value: number; context: string } | null>(null);
    const [manualGlucoseValue, setManualGlucoseValue] = useState('');
    const [manualGlucoseContext, setManualGlucoseContext] = useState<GlucoseReading['context']>('random');
    const [glucoseImageFile, setGlucoseImageFile] = useState<File | null>(null);
    const [glucosePreviewUrl, setGlucosePreviewUrl] = useState<string | null>(null);
    const [glucosePhotoStep, setGlucosePhotoStep] = useState<'select_photo' | 'confirm'>('select_photo');
    
    // --- Meal states ---
    const [mealLogMode, setMealLogMode] = useState<'manual' | 'photo'>('manual');
    const [mealDescription, setMealDescription] = useState('');
    const [mealCarbs, setMealCarbs] = useState('');
    const [mealImageFile, setMealImageFile] = useState<File | null>(null);
    const [mealPreviewUrl, setMealPreviewUrl] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<{ foodItems: FoodItem[], totalNutrition: FoodItem['nutrition'] } | null>(null);
    
    // --- Medication states ---
    const [medLogMode, setMedLogMode] = useState<'voice' | 'manual'>('voice');
    const [medVoiceStep, setMedVoiceStep] = useState<'say_medication' | 'confirm'>('say_medication');
    const [medData, setMedData] = useState<{ med: UserMedication | null, quantity: number, transcript: string }>({ med: null, quantity: 0, transcript: '' });
    const [selectedMedId, setSelectedMedId] = useState<string>('');
    const [medQuantity, setMedQuantity] = useState(1);

    // --- Weight states ---
    const [weightLogMode, setWeightLogMode] = useState<'voice' | 'manual' | 'photo'>('voice');
    const [weightVoiceStep, setWeightVoiceStep] = useState<'say_reading' | 'confirm'>('say_reading');
    const [weightParsedData, setWeightParsedData] = useState<{ value: number; unit: 'kg' | 'lbs' } | null>(null);
    const [manualWeightValue, setManualWeightValue] = useState('');
    const [manualWeightUnit, setManualWeightUnit] = useState<'kg' | 'lbs'>('kg');
    const [weightImageFile, setWeightImageFile] = useState<File | null>(null);
    const [weightPreviewUrl, setWeightPreviewUrl] = useState<string | null>(null);
    const [weightPhotoStep, setWeightPhotoStep] = useState<'select_photo' | 'confirm'>('select_photo');
    
    // --- Blood Pressure states ---
    const [bpLogMode, setBpLogMode] = useState<'voice' | 'manual' | 'photo'>('voice');
    const [bpVoiceStep, setBpVoiceStep] = useState<'say_reading' | 'confirm'>('say_reading');
    const [bpParsedData, setBpParsedData] = useState<{ systolic: number; diastolic: number; pulse: number } | null>(null);
    const [manualSystolic, setManualSystolic] = useState('');
    const [manualDiastolic, setManualDiastolic] = useState('');
    const [manualPulse, setManualPulse] = useState('');
    const [bpImageFile, setBpImageFile] = useState<File | null>(null);
    const [bpPreviewUrl, setBpPreviewUrl] = useState<string | null>(null);
    const [bpPhotoStep, setBpPhotoStep] = useState<'select_photo' | 'confirm'>('select_photo');

    
    // --- Voice Parsing Logic ---
    const handleParseGlucose = useCallback(async (textToParse: string) => {
        if (!textToParse) return;
        setIsLoading(true);
        setError('');
        setGlucoseParsedData(null);
        try {
            const result = await parseGlucoseReadingFromText(textToParse);
            if (result) {
                const isValid = unit === 'mmol/L' ? result.value >= 1 && result.value <= 33 : result.value >= 20 && result.value <= 600;
                if (isValid) {
                    setGlucoseParsedData({ value: result.value, context: result.context });
                    setGlucoseVoiceStep('confirm');
                } else setError(`Invalid glucose value: ${result.value}.`);
            } else {
                setError("Couldn't understand the reading. Please try again.");
            }
        } catch (e) { setError('An error occurred during parsing.'); } 
        finally { setIsLoading(false); }
    }, [unit]);

    const processMedicationSpeechResult = useCallback(async (text: string) => {
        setIsLoading(true);
        setError('');
        try {
            const result = await parseMedicationFromText(text, userMedications);
            if (result) {
                setMedData({ med: result.matchedMed, quantity: result.quantity, transcript: text });
                setMedVoiceStep('confirm');
            } else {
                setError(`Could not understand the medication or quantity from "${text}".`);
            }
        } catch (e) { setError('An error occurred.'); } 
        finally { setIsLoading(false); }
    }, [userMedications]);

    const handleParseWeight = useCallback(async (textToParse: string) => {
        if (!textToParse) return;
        setIsLoading(true);
        setError('');
        setWeightParsedData(null);
        try {
            const result = await parseWeightFromText(textToParse);
            if (result) {
                setWeightParsedData(result);
                setWeightVoiceStep('confirm');
            } else {
                setError("Couldn't understand the weight. Please try again.");
            }
        } catch (e) { setError('An error occurred during parsing.'); } 
        finally { setIsLoading(false); }
    }, []);

    const handleParseBloodPressure = useCallback(async (textToParse: string) => {
        if (!textToParse) return;
        setIsLoading(true);
        setError('');
        setBpParsedData(null);
        try {
            const result = await parseBloodPressureFromText(textToParse);
            if (result) {
                setBpParsedData(result);
                setBpVoiceStep('confirm');
            } else {
                setError("Couldn't understand the blood pressure reading. Please try again.");
            }
        } catch (e) { setError('An error occurred during parsing.'); } 
        finally { setIsLoading(false); }
    }, []);

    // --- Real-time Audio Logic ---
    const stopListening = useCallback(async () => {
        const currentListeningFor = listeningForRef.current;
        listeningForRef.current = null;
        setIsListening(false);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            await inputAudioContextRef.current.close();
            inputAudioContextRef.current = null;
        }
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        // Need this to trigger confirm screen
        if (currentTranscript) {
            if (currentListeningFor === 'glucose') handleParseGlucose(currentTranscript);
            else if (currentListeningFor === 'medication') processMedicationSpeechResult(currentTranscript);
            else if (currentListeningFor === 'weight') handleParseWeight(currentTranscript);
            else if (currentListeningFor === 'blood_pressure') handleParseBloodPressure(currentTranscript);
        }

    }, [currentTranscript, handleParseGlucose, processMedicationSpeechResult, handleParseWeight, handleParseBloodPressure]);


    const startListening = useCallback(async (mode: LogType) => {
        if (isListening) return;

        setIsListening(true);
        setError('');
        setCurrentTranscript('');
        listeningForRef.current = mode;

        if (!aiRef.current) {
            aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const sessionPromise = aiRef.current.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        const source = inputAudioContextRef.current.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: async (message) => {
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            setCurrentTranscript(prev => prev + text);
                        }
                    },
                    onerror: (e) => {
                        console.error('Live session error:', e);
                        setError('A real-time connection error occurred.');
                        stopListening();
                    },
                    onclose: () => { /* Connection closed */ },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                },
            });
            sessionRef.current = await sessionPromise;
        } catch (err) {
            console.error('Error starting audio session:', err);
            setError('Could not access the microphone.');
            setIsListening(false);
        }
    }, [isListening, stopListening]);
    
    useEffect(() => {
      return () => {
        stopListening();
      };
    }, [stopListening]);

    useEffect(() => {
        if (!isListening && currentTranscript && listeningForRef.current) {
             const mode = listeningForRef.current;
             listeningForRef.current = null; // Prevent re-triggering
             if (mode === 'glucose') handleParseGlucose(currentTranscript);
             else if (mode === 'medication') processMedicationSpeechResult(currentTranscript);
             else if (mode === 'weight') handleParseWeight(currentTranscript);
             else if (mode === 'blood_pressure') handleParseBloodPressure(currentTranscript);
        }
    }, [isListening, currentTranscript, handleParseGlucose, processMedicationSpeechResult, handleParseWeight, handleParseBloodPressure]);

    // --- General Functions ---
    useEffect(() => {
        if (userMedications.length > 0 && !selectedMedId) {
            setSelectedMedId(userMedications[0].id);
        }
    }, [userMedications, selectedMedId]);
    
    const handleSuccess = (message: string) => {
        setShowSuccess(message);
        setTimeout(() => setShowSuccess(null), 3000);
    };

    // --- Glucose Logic ---
    const resetGlucoseState = () => {
        listeningForRef.current = null;
        setGlucoseParsedData(null);
        setError('');
        setIsLoading(false);
        setGlucoseLogMode('voice');
        setGlucoseVoiceStep('say_reading');
        setManualGlucoseValue('');
        setManualGlucoseContext('random');
        setCurrentTranscript('');
        setGlucoseImageFile(null);
        setGlucosePreviewUrl(null);
        setGlucosePhotoStep('select_photo');
        stopListening();
    };
    
    const handleGlucoseToggleListen = () => {
        if (isListening) {
            stopListening();
        } else {
            resetGlucoseState();
            startListening('glucose');
        }
    };

    const handleVoiceGlucoseSubmit = () => {
        if (!glucoseParsedData) return;
        onAddGlucose({
            value: glucoseParsedData.value,
            displayUnit: unit,
            context: (glucoseParsedData.context.toLowerCase().replace(' ', '_')) as GlucoseReading['context'],
            timestamp: timestamp.toISOString(),
            source: 'voice',
            transcript: currentTranscript
        });
        resetGlucoseState();
        handleSuccess('Glucose reading saved!');
    };

    const handleManualGlucoseSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const value = parseFloat(manualGlucoseValue);
        if (isNaN(value) || manualGlucoseValue.trim() === '') {
            setError('Please enter a valid glucose value.');
            return;
        }
        const isValid = unit === 'mmol/L' ? value >= 1 && value <= 33 : value >= 20 && value <= 600;
        if (!isValid) {
            setError(`Invalid glucose value. Must be between ${unit === 'mmol/L' ? '1 and 33' : '20 and 600'}.`);
            return;
        }
        onAddGlucose({
            value: value,
            displayUnit: unit,
            context: manualGlucoseContext,
            timestamp: timestamp.toISOString(),
            source: 'manual',
        });
        resetGlucoseState();
        handleSuccess('Glucose reading saved!');
    };
    
    const handleGlucoseFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
          setGlucoseImageFile(file);
          setGlucosePreviewUrl(URL.createObjectURL(file));
          setGlucoseParsedData(null);
          setError('');
        }
    };

    const handleGlucosePhotoAnalyze = async () => {
        if (!glucoseImageFile) return;

        setIsLoading(true);
        setError('');
        setGlucoseParsedData(null);

        const reader = new FileReader();
        reader.readAsDataURL(glucoseImageFile);
        reader.onload = async () => {
          try {
            const base64String = (reader.result as string).split(',')[1];
            const result = await parseGlucoseReadingFromImage(base64String, glucoseImageFile.type);
            if (result) {
                const isValid = unit === 'mmol/L' 
                  ? result.value >= 1 && result.value <= 33
                  : result.value >= 20 && result.value <= 600;

                if (isValid) {
                   setGlucoseParsedData({ value: result.value, context: result.context });
                   setGlucosePhotoStep('confirm');
                } else {
                   setError(`Invalid glucose value from image: ${result.value}.`);
                }
            } else {
              setError("Couldn't read the value from the image. Please try another photo.");
            }
          } catch (e) {
            if (e instanceof Error) {
                setError(e.message);
            } else {
                setError('An error occurred during image analysis.');
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

    const handlePhotoGlucoseSubmit = () => {
        if (glucoseParsedData) {
          onAddGlucose({
            value: glucoseParsedData.value,
            displayUnit: unit,
            context: (glucoseParsedData.context.toLowerCase().replace(' ', '_')) as GlucoseReading['context'],
            timestamp: timestamp.toISOString(),
            source: 'photo_analysis',
          });
          resetGlucoseState();
          handleSuccess('Glucose reading saved!');
        }
    };

    // --- Meal Logic ---
    const resetMealState = useCallback(() => {
        setMealDescription('');
        setMealCarbs('');
        setMealImageFile(null);
        setMealPreviewUrl(null);
        setAnalysisResult(null);
        setIsLoading(false);
        setError('');
        stopListening();
    }, [stopListening]);

    useEffect(() => { resetMealState(); }, [mealLogMode, resetMealState]);
    
    const getMealType = (date: Date): Meal['mealType'] => {
        const hour = date.getHours();
        if (hour >= 5 && hour < 11) return 'breakfast';
        if (hour >= 11 && hour < 16) return 'lunch';
        if (hour >= 16 && hour < 21) return 'dinner';
        return 'snack';
    };

    const handleMealFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setMealImageFile(file);
            setMealPreviewUrl(URL.createObjectURL(file));
            setAnalysisResult(null);
            setError('');
        }
    };

    const handleMealAnalyze = async () => {
        if (mealLogMode === 'photo' && mealImageFile) {
            setIsLoading(true);
            setError('');
            const reader = new FileReader();
            reader.readAsDataURL(mealImageFile);
            reader.onload = async () => {
                try {
                    const base64String = (reader.result as string).split(',')[1];
                    const result = await analyzeMealPhoto(base64String, mealImageFile.type);
                    if (result) setAnalysisResult(result);
                    else setError("Couldn't analyze the meal photo.");
                } catch (e) {
                    if (e instanceof Error) {
                        setError(e.message);
                    } else {
                        setError('An error occurred during analysis.');
                    }
                } 
                finally { setIsLoading(false); }
            };
            reader.onerror = () => { setError('Failed to read image file.'); setIsLoading(false); };
        }
    };
    
    const handleMealSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        let mealData: Omit<Meal, 'id' | 'timestamp' | 'mealType'> | null = null;
        switch(mealLogMode) {
            case 'manual':
                const carbsNum = parseInt(mealCarbs, 10) || 0;
                if (!mealDescription.trim()) return;
                mealData = {
                    foodItems: [{ name: mealDescription, nutrition: { carbohydrates: carbsNum, calories: 0, protein: 0, fat: 0 } }],
                    totalNutrition: { carbohydrates: carbsNum, calories: 0, protein: 0, fat: 0 },
                    notes: mealDescription,
                    source: 'manual',
                };
                break;
            case 'photo':
                if (!analysisResult) return;
                mealData = { ...analysisResult, photoUrl: mealPreviewUrl || undefined, source: 'photo_analysis' };
                break;
        }
        if (mealData) {
            onAddMeal({ ...mealData, timestamp: timestamp.toISOString(), mealType: getMealType(timestamp) });
            resetMealState();
            handleSuccess('Meal saved!');
        }
    };

    // --- Medication Logic ---
    const resetMedicationState = () => {
        listeningForRef.current = null;
        setMedLogMode('voice');
        setMedVoiceStep('say_medication');
        setMedData({ med: null, quantity: 0, transcript: '' });
        setError('');
        setIsLoading(false);
        setCurrentTranscript('');
        stopListening();
    };

    const handleMedToggleListen = () => {
        if (isListening) {
            stopListening();
        } else {
            setError('');
            setCurrentTranscript('');
            startListening('medication');
        }
    };
    
    const handleVoiceMedSubmit = () => {
        if (medData.med && medData.quantity > 0) {
            onAddMedication({
                name: medData.med.name,
                dosage: medData.med.dosage,
                unit: medData.med.unit,
                quantity: medData.quantity,
                timestamp: timestamp.toISOString(),
                transcript: medData.transcript,
                source: 'voice',
            });
            resetMedicationState();
            handleSuccess('Medication saved!');
        }
    };

    const handleManualMedSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const selectedMed = userMedications.find(m => m.id === selectedMedId);
        if (selectedMed && medQuantity > 0) {
            onAddMedication({
                name: selectedMed.name,
                dosage: selectedMed.dosage,
                unit: selectedMed.unit,
                quantity: medQuantity,
                timestamp: timestamp.toISOString(),
                source: 'manual',
            });
            setMedQuantity(1);
            handleSuccess('Medication saved!');
        } else {
            setError("Please select a valid medication and quantity.");
        }
    };

    // --- Weight Logic ---
    const resetWeightState = () => {
        listeningForRef.current = null;
        setWeightParsedData(null);
        setError('');
        setIsLoading(false);
        setWeightLogMode('voice');
        setWeightVoiceStep('say_reading');
        setManualWeightValue('');
        setManualWeightUnit('kg');
        setCurrentTranscript('');
        setWeightImageFile(null);
        setWeightPreviewUrl(null);
        setWeightPhotoStep('select_photo');
        stopListening();
    };

    const handleWeightToggleListen = () => {
        if (isListening) stopListening();
        else {
            resetWeightState();
            startListening('weight');
        }
    };

    const handleVoiceWeightSubmit = () => {
        if (!weightParsedData) return;
        onAddWeight({
            ...weightParsedData,
            timestamp: timestamp.toISOString(),
            source: 'voice',
            transcript: currentTranscript
        });
        resetWeightState();
        handleSuccess('Weight reading saved!');
    };

    const handleManualWeightSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const value = parseFloat(manualWeightValue);
        if (isNaN(value) || value <= 0) {
            setError('Please enter a valid weight.');
            return;
        }
        onAddWeight({
            value,
            unit: manualWeightUnit,
            timestamp: timestamp.toISOString(),
            source: 'manual',
        });
        resetWeightState();
        handleSuccess('Weight reading saved!');
    };

    const handleWeightFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setWeightImageFile(file);
            setWeightPreviewUrl(URL.createObjectURL(file));
            setError('');
        }
    };

    const handleWeightPhotoAnalyze = async () => {
        if (!weightImageFile) return;
        setIsLoading(true);
        setError('');
        const reader = new FileReader();
        reader.readAsDataURL(weightImageFile);
        reader.onload = async () => {
            try {
                const base64 = (reader.result as string).split(',')[1];
                const result = await parseWeightFromImage(base64, weightImageFile.type);
                if (result) {
                    setWeightParsedData(result);
                    setWeightPhotoStep('confirm');
                } else {
                    setError("Couldn't read the weight from the image.");
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An error occurred.');
            } finally {
                setIsLoading(false);
            }
        };
        reader.onerror = () => { setIsLoading(false); setError('Failed to read file.'); };
    };

    const handlePhotoWeightSubmit = () => {
        if (!weightParsedData) return;
        onAddWeight({
            ...weightParsedData,
            timestamp: timestamp.toISOString(),
            source: 'photo_analysis',
        });
        resetWeightState();
        handleSuccess('Weight reading saved!');
    };

    // --- Blood Pressure Logic ---
    const resetBpState = () => {
        listeningForRef.current = null;
        setBpParsedData(null);
        setError('');
        setIsLoading(false);
        setBpLogMode('voice');
        setBpVoiceStep('say_reading');
        setManualSystolic('');
        setManualDiastolic('');
        setManualPulse('');
        setCurrentTranscript('');
        setBpImageFile(null);
        setBpPreviewUrl(null);
        setBpPhotoStep('select_photo');
        stopListening();
    };

    const handleBpToggleListen = () => {
        if (isListening) stopListening();
        else {
            resetBpState();
            startListening('blood_pressure');
        }
    };

    const handleVoiceBpSubmit = () => {
        if (!bpParsedData) return;
        onAddBloodPressure({
            ...bpParsedData,
            timestamp: timestamp.toISOString(),
            source: 'voice',
            transcript: currentTranscript
        });
        resetBpState();
        handleSuccess('Blood pressure reading saved!');
    };

    const handleManualBpSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const systolic = parseInt(manualSystolic, 10);
        const diastolic = parseInt(manualDiastolic, 10);
        const pulse = parseInt(manualPulse, 10);
        if (isNaN(systolic) || isNaN(diastolic) || isNaN(pulse) || systolic <= 0 || diastolic <= 0 || pulse <= 0) {
            setError('Please enter valid numbers for all fields.');
            return;
        }
        onAddBloodPressure({
            systolic,
            diastolic,
            pulse,
            timestamp: timestamp.toISOString(),
            source: 'manual',
        });
        resetBpState();
        handleSuccess('Blood pressure reading saved!');
    };

    const handleBpFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setBpImageFile(file);
            setBpPreviewUrl(URL.createObjectURL(file));
            setError('');
        }
    };
    
    const handleBpPhotoAnalyze = async () => {
        if (!bpImageFile) return;
        setIsLoading(true);
        setError('');
        const reader = new FileReader();
        reader.readAsDataURL(bpImageFile);
        reader.onload = async () => {
            try {
                const base64 = (reader.result as string).split(',')[1];
                const result = await parseBloodPressureFromImage(base64, bpImageFile.type);
                if (result) {
                    setBpParsedData(result);
                    setBpPhotoStep('confirm');
                } else {
                    setError("Couldn't read the blood pressure from the image.");
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An error occurred.');
            } finally {
                setIsLoading(false);
            }
        };
        reader.onerror = () => { setIsLoading(false); setError('Failed to read file.'); };
    };

    const handlePhotoBpSubmit = () => {
        if (!bpParsedData) return;
        onAddBloodPressure({
            ...bpParsedData,
            timestamp: timestamp.toISOString(),
            source: 'photo_analysis',
        });
        resetBpState();
        handleSuccess('Blood pressure reading saved!');
    };


    const renderGlucoseContent = () => {
        const renderVoiceContent = () => (
            <div>
                {glucoseVoiceStep === 'say_reading' && (
                    <div className="text-center">
                        <p className="text-slate-600 mb-4">{isListening && listeningForRef.current === 'glucose' ? 'Tap icon to stop recording.' : 'Tap icon and say your glucose reading.'}</p>
                        <button 
                            type="button" 
                            onClick={handleGlucoseToggleListen} 
                            disabled={isLoading} 
                            className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isListening && listeningForRef.current === 'glucose' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:bg-slate-400`}
                        >
                            {isLoading ? <Spinner /> : (isListening && listeningForRef.current === 'glucose' ? <SquareIcon className="w-7 h-7" /> : <MicIcon className="w-8 h-8" />)}
                        </button>
                        <p className="text-slate-700 mt-4 min-h-[24px] px-2">{listeningForRef.current === 'glucose' ? currentTranscript || (isListening ? <span className="text-slate-500">Listening...</span> : '') : ''}</p>

                    </div>
                )}
                {glucoseVoiceStep === 'confirm' && glucoseParsedData && (
                    <div className="p-4 bg-slate-100 rounded-lg">
                        <div className="text-center">
                            <p className="text-slate-600">Is this correct?</p>
                            <p className="text-3xl font-bold text-blue-600 my-2">{glucoseParsedData.value} <span className="text-lg font-normal">{unit}</span></p>
                            <p className="text-slate-500 capitalize">{glucoseParsedData.context.replace('_', ' ')}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button type="button" onClick={resetGlucoseState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">Start Over</button>
                            <button type="button" onClick={handleVoiceGlucoseSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">Confirm & Save</button>
                        </div>
                    </div>
                )}
            </div>
        );
    
        const renderManualContent = () => (
            <form onSubmit={handleManualGlucoseSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="glucose-value" className="block text-sm font-medium text-slate-700">Value ({unit})</label>
                        <input type="number" id="glucose-value" value={manualGlucoseValue} onChange={e => setManualGlucoseValue(e.target.value)} step={unit === 'mmol/L' ? '0.1' : '1'} required className="mt-1 block w-full bg-white text-slate-900 placeholder:text-slate-400 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2" />
                    </div>
                    <div>
                        <label htmlFor="glucose-context" className="block text-sm font-medium text-slate-700">Context</label>
                        <select id="glucose-context" value={manualGlucoseContext} onChange={e => setManualGlucoseContext(e.target.value as GlucoseReading['context'])} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white">
                            <option value="random">Random</option>
                            <option value="fasting">Fasting</option>
                            <option value="before_meal">Before Meal</option>
                            <option value="after_meal">After Meal</option>
                            <option value="bedtime">Bedtime</option>
                        </select>
                    </div>
                </div>
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700 transition-colors">Save Glucose</button>
            </form>
        );
        
        const renderPhotoContent = () => (
            <div>
                {glucosePhotoStep === 'select_photo' && (
                    <div>
                        {!glucosePreviewUrl ? (
                            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button type="button" onClick={() => { glucoseFileInputRef.current?.setAttribute('capture', 'environment'); glucoseFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-blue-500 transition-colors flex flex-col items-center justify-center">
                                    <CameraIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                                    <span>Take Picture</span>
                                </button>
                                <button type="button" onClick={() => { glucoseFileInputRef.current?.removeAttribute('capture'); glucoseFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-blue-500 transition-colors flex flex-col items-center justify-center">
                                    <UploadIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                                    <span>Upload Photo</span>
                                </button>
                                <input type="file" accept="image/*" ref={glucoseFileInputRef} onChange={handleGlucoseFileChange} className="hidden" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <img src={glucosePreviewUrl} alt="Glucose meter preview" className="rounded-lg w-full max-h-48 object-contain" />
                                <button type="button" onClick={handleGlucosePhotoAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 disabled:bg-slate-300 transition-colors flex items-center justify-center">
                                    {isLoading ? <Spinner /> : 'Analyze Reading'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {glucosePhotoStep === 'confirm' && glucoseParsedData && (
                     <div className="mt-4 p-4 bg-slate-100 rounded-lg">
                        <div className="text-center">
                            <p className="text-slate-600">Is this correct?</p>
                            <p className="text-3xl font-bold text-blue-600 my-2">{glucoseParsedData.value} <span className="text-lg font-normal">{unit}</span></p>
                            <p className="text-slate-500 capitalize">{glucoseParsedData.context.replace('_', ' ')}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button type="button" onClick={resetGlucoseState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">
                                Start Over
                            </button>
                            <button type="button" onClick={handlePhotoGlucoseSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    
        return (
            <div>
                <div className="flex justify-center items-center rounded-lg bg-slate-100 p-1 mb-4">
                    <button type="button" onClick={() => { setGlucoseLogMode('voice'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${glucoseLogMode === 'voice' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><MicIcon className="w-4 h-4"/><span>Voice</span></button>
                    <button type="button" onClick={() => { setGlucoseLogMode('manual'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${glucoseLogMode === 'manual' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><PencilIcon className="w-4 h-4"/><span>Manual</span></button>
                    <button type="button" onClick={() => { setGlucoseLogMode('photo'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${glucoseLogMode === 'photo' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><CameraIcon className="w-4 h-4"/><span>Photo</span></button>
                </div>
                {error && !isLoading && <p className="text-red-500 text-center mt-4 text-sm mb-2">{error}</p>}
                {glucoseLogMode === 'voice' && renderVoiceContent()}
                {glucoseLogMode === 'manual' && renderManualContent()}
                {glucoseLogMode === 'photo' && renderPhotoContent()}
            </div>
        );
    };

    const renderMealContent = () => (
        <form onSubmit={handleMealSubmit}>
            <div className="flex justify-center items-center rounded-lg bg-slate-100 p-1 mb-4">
                <button type="button" onClick={() => setMealLogMode('manual')} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${mealLogMode === 'manual' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><PencilIcon className="w-4 h-4"/><span>Manual</span></button>
                <button type="button" onClick={() => setMealLogMode('photo')} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${mealLogMode === 'photo' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><CameraIcon className="w-4 h-4"/><span>Photo</span></button>
            </div>
            {mealLogMode === 'manual' && (
                <div className="space-y-4">
                    <div>
                        <label htmlFor="meal-description" className="block text-sm font-medium text-slate-700">Description</label>
                        <input type="text" id="meal-description" value={mealDescription} onChange={e => setMealDescription(e.target.value)} placeholder="e.g., Chicken salad sandwich" required className="mt-1 block w-full bg-white text-slate-900 placeholder:text-slate-400 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2" />
                    </div>
                    <div>
                        <label htmlFor="meal-carbs" className="block text-sm font-medium text-slate-700">Total Carbs (grams)</label>
                        <input type="number" id="meal-carbs" value={mealCarbs} onChange={e => setMealCarbs(e.target.value)} placeholder="e.g., 45" className="mt-1 block w-full bg-white text-slate-900 placeholder:text-slate-400 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2" />
                    </div>
                    <button type="submit" className="w-full bg-green-600 text-white font-semibold py-2 rounded-md hover:bg-green-700 transition-colors">Save Meal</button>
                </div>
            )}
            {mealLogMode === 'photo' && (
                <div className="space-y-4">
                    {!mealPreviewUrl ? (
                        <div className="grid grid-cols-2 gap-4">
                            <button type="button" onClick={() => { mealFileInputRef.current?.setAttribute('capture', 'environment'); mealFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-500 hover:bg-slate-50 hover:border-green-500 transition-colors flex flex-col items-center justify-center"><CameraIcon className="w-8 h-8 text-slate-400 mb-2" /><span>Take Picture</span></button>
                            <button type="button" onClick={() => { mealFileInputRef.current?.removeAttribute('capture'); mealFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-500 hover:bg-slate-50 hover:border-green-500 transition-colors flex flex-col items-center justify-center"><UploadIcon className="w-8 h-8 text-slate-400 mb-2" /><span>Upload</span></button>
                            <input type="file" accept="image/*" ref={mealFileInputRef} onChange={handleMealFileChange} className="hidden" />
                        </div>
                    ) : <img src={mealPreviewUrl} alt="Meal preview" className="rounded-lg w-full max-h-48 object-contain" />}
                    {mealPreviewUrl && !analysisResult && <button type="button" onClick={handleMealAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700 disabled:bg-slate-300 flex items-center justify-center">{isLoading ? <Spinner /> : 'Analyze Meal'}</button>}
                </div>
            )}
            {error && <p className="text-red-500 text-center text-sm mt-2">{error}</p>}
            {analysisResult && (
                <div className="mt-4 space-y-3">
                    <div>
                        <h3 className="font-semibold text-slate-700 mb-1">Analysis Results</h3>
                        <div className="bg-slate-100 p-3 rounded-lg space-y-1">
                            {analysisResult.foodItems.map((item, index) => (
                            <div key={index} className="flex justify-between text-xs">
                                <span className="text-slate-800">{item.name}</span>
                                <span className="text-slate-500">{item.nutrition.carbohydrates}g carbs</span>
                            </div>
                            ))}
                            <div className="border-t border-slate-300 pt-1 mt-1 flex justify-between font-bold text-sm">
                                <span className="text-slate-800">Total</span>
                                <span className="text-green-600">{analysisResult.totalNutrition.carbohydrates}g carbs</span>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={resetMealState} className="w-full bg-slate-200 text-slate-700 font-semibold py-2 rounded-md hover:bg-slate-300 transition-colors">Start Over</button>
                        <button type="submit" className="w-full bg-green-600 text-white font-semibold py-2 rounded-md hover:bg-green-700 transition-colors">Confirm & Save</button>
                    </div>
                </div>
            )}
        </form>
    );

    const renderMedicationContent = () => {
        const renderVoiceContent = () => (
            <div>
                {medVoiceStep === 'say_medication' && (
                    <div className="text-center">
                        <p className="text-slate-600 mb-4">{isListening && listeningForRef.current === 'medication' ? 'Tap icon to stop.' : 'Tap icon and say medication and quantity.'}</p>
                        <button type="button" onClick={handleMedToggleListen} disabled={isLoading} className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isListening && listeningForRef.current === 'medication' ? 'bg-red-500 text-white' : 'bg-purple-600 text-white hover:bg-purple-700'} disabled:bg-slate-400`}>{isLoading ? <Spinner /> : (isListening && listeningForRef.current === 'medication' ? <SquareIcon className="w-7 h-7" /> : <MicIcon className="w-8 h-8" />)}</button>
                        <p className="text-slate-700 mt-4 min-h-[24px] px-2">{listeningForRef.current === 'medication' ? currentTranscript || (isListening ? <span className="text-slate-500">Listening...</span> : <span className="text-slate-400">e.g., "1 pill of Metformin"</span>) : ''}</p>
                    </div>
                )}
                {medVoiceStep === 'confirm' && medData.med && (
                    <div className="p-4 bg-slate-100 rounded-lg">
                        <div className="text-center">
                            <p className="text-slate-600">Is this correct?</p>
                            <p className="text-xl font-bold text-slate-800 my-2">{medData.med.name}</p>
                            <p className="text-2xl font-bold text-purple-600">{medData.quantity} <span className="text-lg font-normal">x {medData.med.dosage}{medData.med.unit}</span></p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button type="button" onClick={resetMedicationState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">Start Over</button>
                            <button type="button" onClick={handleVoiceMedSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">Confirm & Save</button>
                        </div>
                    </div>
                )}
                {error && <p className="text-red-500 text-center mt-4">{error}</p>}
            </div>
        );

        const renderManualContent = () => (
             <form onSubmit={handleManualMedSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="med-select" className="block text-sm font-medium text-slate-700">Medication</label>
                        <select id="med-select" value={selectedMedId} onChange={e => setSelectedMedId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white">
                            {userMedications.map(med => <option key={med.id} value={med.id}>{med.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="med-quantity" className="block text-sm font-medium text-slate-700">Quantity</label>
                        <input type="number" id="med-quantity" value={medQuantity} onChange={e => setMedQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))} min="1" className="mt-1 block w-full bg-white text-slate-900 placeholder:text-slate-400 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2" />
                    </div>
                </div>
                 {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <button type="submit" className="w-full bg-purple-600 text-white font-semibold py-2 rounded-md hover:bg-purple-700 transition-colors">Save Medication</button>
            </form>
        );
        
        return (
            <div>
                <div className="flex justify-center items-center rounded-lg bg-slate-100 p-1 mb-4">
                    <button type="button" onClick={() => { setMedLogMode('voice'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${medLogMode === 'voice' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><MicIcon className="w-4 h-4"/><span>Voice</span></button>
                    <button type="button" onClick={() => { setMedLogMode('manual'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${medLogMode === 'manual' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><PencilIcon className="w-4 h-4"/><span>Manual</span></button>
                </div>
                {userMedications.length > 0 ? (medLogMode === 'voice' ? renderVoiceContent() : renderManualContent()) : <p className="text-center text-slate-500">Please add medications in settings first.</p>}
            </div>
        );
    }
    
    const renderWeightContent = () => {
        const renderVoiceContent = () => (
            <div>
                {weightVoiceStep === 'say_reading' && (
                    <div className="text-center">
                        <p className="text-slate-600 mb-4">{isListening && listeningForRef.current === 'weight' ? 'Tap icon to stop.' : 'Tap icon and say your weight.'}</p>
                        <button type="button" onClick={handleWeightToggleListen} disabled={isLoading} className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isListening && listeningForRef.current === 'weight' ? 'bg-red-500 text-white' : 'bg-teal-600 text-white hover:bg-teal-700'} disabled:bg-slate-400`}>{isLoading ? <Spinner /> : (isListening && listeningForRef.current === 'weight' ? <SquareIcon className="w-7 h-7" /> : <MicIcon className="w-8 h-8" />)}</button>
                        <p className="text-slate-700 mt-4 min-h-[24px] px-2">{listeningForRef.current === 'weight' ? currentTranscript || (isListening ? <span className="text-slate-500">Listening...</span> : '') : ''}</p>
                    </div>
                )}
                {weightVoiceStep === 'confirm' && weightParsedData && (
                    <div className="p-4 bg-slate-100 rounded-lg">
                        <div className="text-center">
                            <p className="text-slate-600">Is this correct?</p>
                            <p className="text-3xl font-bold text-teal-600 my-2">{weightParsedData.value} <span className="text-lg font-normal">{weightParsedData.unit}</span></p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button type="button" onClick={resetWeightState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">Start Over</button>
                            <button type="button" onClick={handleVoiceWeightSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">Confirm & Save</button>
                        </div>
                    </div>
                )}
            </div>
        );

        const renderManualContent = () => (
            <form onSubmit={handleManualWeightSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="weight-value" className="block text-sm font-medium text-slate-700">Weight</label>
                        <input type="number" id="weight-value" value={manualWeightValue} onChange={e => setManualWeightValue(e.target.value)} step="0.1" required className="mt-1 block w-full bg-white text-slate-900 rounded-md border-slate-300 p-2" />
                    </div>
                    <div>
                        <label htmlFor="weight-unit" className="block text-sm font-medium text-slate-700">Unit</label>
                        <select id="weight-unit" value={manualWeightUnit} onChange={e => setManualWeightUnit(e.target.value as 'kg' | 'lbs')} className="mt-1 block w-full rounded-md border-slate-300 p-2 bg-white">
                            <option value="kg">kg</option>
                            <option value="lbs">lbs</option>
                        </select>
                    </div>
                </div>
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <button type="submit" className="w-full bg-teal-600 text-white font-semibold py-2 rounded-md hover:bg-teal-700">Save Weight</button>
            </form>
        );

        const renderPhotoContent = () => (
            <div>
                {weightPhotoStep === 'select_photo' && (
                    <div>
                        {!weightPreviewUrl ? (
                             <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button type="button" onClick={() => { weightFileInputRef.current?.setAttribute('capture', 'environment'); weightFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-teal-500 transition-colors flex flex-col items-center justify-center"><CameraIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" /><span>Take Picture</span></button>
                                <button type="button" onClick={() => { weightFileInputRef.current?.removeAttribute('capture'); weightFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-teal-500 transition-colors flex flex-col items-center justify-center"><UploadIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" /><span>Upload Photo</span></button>
                                <input type="file" accept="image/*" ref={weightFileInputRef} onChange={handleWeightFileChange} className="hidden" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <img src={weightPreviewUrl} alt="Weight scale preview" className="rounded-lg w-full max-h-48 object-contain" />
                                <button type="button" onClick={handleWeightPhotoAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 disabled:bg-slate-300 flex items-center justify-center">{isLoading ? <Spinner /> : 'Analyze Weight'}</button>
                            </div>
                        )}
                    </div>
                )}
                {weightPhotoStep === 'confirm' && weightParsedData && (
                     <div className="p-4 bg-slate-100 rounded-lg">
                        <div className="text-center">
                            <p className="text-slate-600">Is this correct?</p>
                            <p className="text-3xl font-bold text-teal-600 my-2">{weightParsedData.value} <span className="text-lg font-normal">{weightParsedData.unit}</span></p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button type="button" onClick={resetWeightState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">Start Over</button>
                            <button type="button" onClick={handlePhotoWeightSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">Confirm & Save</button>
                        </div>
                    </div>
                )}
            </div>
        );

        return (
            <div>
                <div className="flex justify-center items-center rounded-lg bg-slate-100 p-1 mb-4">
                    <button type="button" onClick={() => { setWeightLogMode('voice'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${weightLogMode === 'voice' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><MicIcon className="w-4 h-4"/><span>Voice</span></button>
                    <button type="button" onClick={() => { setWeightLogMode('manual'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${weightLogMode === 'manual' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><PencilIcon className="w-4 h-4"/><span>Manual</span></button>
                    <button type="button" onClick={() => { setWeightLogMode('photo'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${weightLogMode === 'photo' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><CameraIcon className="w-4 h-4"/><span>Photo</span></button>
                </div>
                {error && !isLoading && <p className="text-red-500 text-center mt-4 text-sm mb-2">{error}</p>}
                {weightLogMode === 'voice' && renderVoiceContent()}
                {weightLogMode === 'manual' && renderManualContent()}
                {weightLogMode === 'photo' && renderPhotoContent()}
            </div>
        );
    };

    const renderBloodPressureContent = () => {
         const renderVoiceContent = () => (
            <div>
                {bpVoiceStep === 'say_reading' && (
                    <div className="text-center">
                        <p className="text-slate-600 mb-4">{isListening && listeningForRef.current === 'blood_pressure' ? 'Tap icon to stop.' : 'Tap icon and say your reading.'}</p>
                        <button type="button" onClick={handleBpToggleListen} disabled={isLoading} className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isListening && listeningForRef.current === 'blood_pressure' ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'} disabled:bg-slate-400`}>{isLoading ? <Spinner /> : (isListening && listeningForRef.current === 'blood_pressure' ? <SquareIcon className="w-7 h-7" /> : <MicIcon className="w-8 h-8" />)}</button>
                        <p className="text-slate-700 mt-4 min-h-[24px] px-2">{listeningForRef.current === 'blood_pressure' ? currentTranscript || (isListening ? <span className="text-slate-500">Listening...</span> : '') : ''}</p>
                    </div>
                )}
                {bpVoiceStep === 'confirm' && bpParsedData && (
                    <div className="p-4 bg-slate-100 rounded-lg">
                        <div className="text-center">
                            <p className="text-slate-600">Is this correct?</p>
                            <p className="text-3xl font-bold text-indigo-600 my-2">{bpParsedData.systolic} / {bpParsedData.diastolic} <span className="text-lg font-normal">mmHg</span></p>
                            <p className="text-slate-500">Pulse: {bpParsedData.pulse} bpm</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button type="button" onClick={resetBpState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">Start Over</button>
                            <button type="button" onClick={handleVoiceBpSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">Confirm & Save</button>
                        </div>
                    </div>
                )}
            </div>
        );
        
        const renderManualContent = () => (
             <form onSubmit={handleManualBpSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label htmlFor="bp-sys" className="block text-sm font-medium text-slate-700">Systolic</label>
                        <input type="number" id="bp-sys" value={manualSystolic} onChange={e => setManualSystolic(e.target.value)} required className="mt-1 block w-full p-2 bg-white border-slate-300 rounded-md" />
                    </div>
                    <div>
                        <label htmlFor="bp-dia" className="block text-sm font-medium text-slate-700">Diastolic</label>
                        <input type="number" id="bp-dia" value={manualDiastolic} onChange={e => setManualDiastolic(e.target.value)} required className="mt-1 block w-full p-2 bg-white border-slate-300 rounded-md" />
                    </div>
                    <div>
                        <label htmlFor="bp-pulse" className="block text-sm font-medium text-slate-700">Pulse</label>
                        <input type="number" id="bp-pulse" value={manualPulse} onChange={e => setManualPulse(e.target.value)} required className="mt-1 block w-full p-2 bg-white border-slate-300 rounded-md" />
                    </div>
                </div>
                 {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <button type="submit" className="w-full bg-indigo-600 text-white font-semibold py-2 rounded-md hover:bg-indigo-700">Save Blood Pressure</button>
            </form>
        );

        const renderPhotoContent = () => (
            <div>
                 {bpPhotoStep === 'select_photo' && (
                    <div>
                        {!bpPreviewUrl ? (
                             <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button type="button" onClick={() => { bpFileInputRef.current?.setAttribute('capture', 'environment'); bpFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-indigo-500 transition-colors flex flex-col items-center justify-center"><CameraIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" /><span>Take Picture</span></button>
                                <button type="button" onClick={() => { bpFileInputRef.current?.removeAttribute('capture'); bpFileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-indigo-500 transition-colors flex flex-col items-center justify-center"><UploadIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" /><span>Upload Photo</span></button>
                                <input type="file" accept="image/*" ref={bpFileInputRef} onChange={handleBpFileChange} className="hidden" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <img src={bpPreviewUrl} alt="Blood pressure monitor preview" className="rounded-lg w-full max-h-48 object-contain" />
                                <button type="button" onClick={handleBpPhotoAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 disabled:bg-slate-300 flex items-center justify-center">{isLoading ? <Spinner /> : 'Analyze Reading'}</button>
                            </div>
                        )}
                    </div>
                )}
                {bpPhotoStep === 'confirm' && bpParsedData && (
                     <div className="p-4 bg-slate-100 rounded-lg">
                        <div className="text-center">
                            <p className="text-slate-600">Is this correct?</p>
                            <p className="text-3xl font-bold text-indigo-600 my-2">{bpParsedData.systolic} / {bpParsedData.diastolic} <span className="text-lg font-normal">mmHg</span></p>
                            <p className="text-slate-500">Pulse: {bpParsedData.pulse} bpm</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button type="button" onClick={resetBpState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">Start Over</button>
                            <button type="button" onClick={handlePhotoBpSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">Confirm & Save</button>
                        </div>
                    </div>
                )}
            </div>
        );

        return (
            <div>
                 <div className="flex justify-center items-center rounded-lg bg-slate-100 p-1 mb-4">
                    <button type="button" onClick={() => { setBpLogMode('voice'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${bpLogMode === 'voice' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><MicIcon className="w-4 h-4"/><span>Voice</span></button>
                    <button type="button" onClick={() => { setBpLogMode('manual'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${bpLogMode === 'manual' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><PencilIcon className="w-4 h-4"/><span>Manual</span></button>
                    <button type="button" onClick={() => { setBpLogMode('photo'); setError(''); }} className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center space-x-2 transition-colors ${bpLogMode === 'photo' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}><CameraIcon className="w-4 h-4"/><span>Photo</span></button>
                </div>
                {error && !isLoading && <p className="text-red-500 text-center mt-4 text-sm mb-2">{error}</p>}
                {bpLogMode === 'voice' && renderVoiceContent()}
                {bpLogMode === 'manual' && renderManualContent()}
                {bpLogMode === 'photo' && renderPhotoContent()}
            </div>
        );
    };

    const logTypesConfig: { type: LogType; icon: React.FC<React.SVGProps<SVGSVGElement>>; label: string; colorClass: string; }[] = [
        { type: 'glucose', icon: DropletIcon, label: 'Glucose', colorClass: 'text-blue-600' },
        { type: 'weight', icon: WeightScaleIcon, label: 'Weight', colorClass: 'text-teal-600' },
        { type: 'blood_pressure', icon: BloodPressureIcon, label: 'BP', colorClass: 'text-indigo-600' },
        { type: 'meal', icon: ForkSpoonIcon, label: 'Meal', colorClass: 'text-green-600' },
        { type: 'medication', icon: PillIcon, label: 'Meds', colorClass: 'text-purple-600' },
    ];


    return (
        <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm">
            <h2 className="text-xl font-semibold text-slate-700 mb-4">Add a Past Entry</h2>
            
            {!isDateTimeConfirmed ? (
                <>
                    <div className="mb-4">
                        <label htmlFor="late-entry-datetime" className="block text-sm font-medium text-slate-700 mb-1">Step 1: Select Date and Time</label>
                        <input
                            type="datetime-local"
                            id="late-entry-datetime"
                            value={formatToLocalDateTimeString(timestamp)}
                            onChange={(e) => {
                                const newDate = new Date(e.target.value);
                                if (!isNaN(newDate.getTime())) setTimestamp(newDate);
                            }}
                            className="w-full bg-white text-slate-900 placeholder:text-slate-400 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                        />
                    </div>
                    <button
                        onClick={() => setIsDateTimeConfirmed(true)}
                        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 transition-colors mt-4"
                    >
                        Confirm Date & Time
                    </button>
                </>
            ) : (
                <>
                    <div className="flex justify-between items-center mb-4 bg-slate-50 p-3 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-slate-700">Logging for:</p>
                            <p className="font-semibold text-blue-600">
                                {timestamp.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, {timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <button 
                            onClick={() => setIsDateTimeConfirmed(false)}
                            className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors"
                        >
                            Change
                        </button>
                    </div>

                    <p className="block text-sm font-medium text-slate-700 mb-2">Step 2: Choose and add your entry</p>
                    
                    {/* Segmented Control */}
                    <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-100 p-1 mb-4">
                        {logTypesConfig.map(({ type, icon: Icon, label, colorClass }) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setActiveLogType(type)}
                                className={`w-full flex flex-col items-center justify-center py-2 rounded-md text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                                    activeLogType === type
                                        ? 'bg-white shadow-sm'
                                        : 'bg-transparent hover:bg-slate-200'
                                }`}
                            >
                                <Icon className={`w-6 h-6 mb-1 transition-colors ${
                                    activeLogType === type ? colorClass : 'text-slate-500'
                                }`} />
                                <span className={`text-xs font-semibold transition-colors ${
                                    activeLogType === type ? 'text-slate-800' : 'text-slate-600'
                                }`}>
                                    {label}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Content Area */}
                    <div className="mt-4 min-h-[350px]">
                        {activeLogType === 'glucose' && renderGlucoseContent()}
                        {activeLogType === 'weight' && renderWeightContent()}
                        {activeLogType === 'blood_pressure' && renderBloodPressureContent()}
                        {activeLogType === 'meal' && renderMealContent()}
                        {activeLogType === 'medication' && renderMedicationContent()}
                    </div>


                    {showSuccess && (
                        <div className="mt-4 p-3 bg-green-100 text-green-700 font-semibold rounded-lg text-center animate-fade-in-up">
                            {showSuccess}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default LateEntryForm;