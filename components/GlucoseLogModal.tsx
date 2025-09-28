import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GlucoseReading } from '../types';
import { parseGlucoseReadingFromText, parseGlucoseReadingFromImage } from '../services/geminiService';
import { MicIcon, XIcon, DropletIcon, PencilIcon, CameraIcon, UploadIcon, SquareIcon } from './Icons';
import Spinner from './Spinner';
// FIX: The 'LiveSession' type is not exported from '@google/genai'. It has been removed.
import { GoogleGenAI, Modality, Blob } from '@google/genai';

interface GlucoseLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddReading: (reading: Omit<GlucoseReading, 'id'>) => void;
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

const GlucoseLogModal: React.FC<GlucoseLogModalProps> = ({ isOpen, onClose, onAddReading, unit }) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'manual' | 'photo'>('voice');

  // Shared state
  const [parsedData, setParsedData] = useState<{ value: number; context: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Voice state
  const [voiceStep, setVoiceStep] = useState<'say_reading' | 'confirm'>('say_reading');
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  
  // Real-time audio state
  // FIX: Use 'any' for the session ref type as a workaround for the removed 'LiveSession' export from the SDK.
  const sessionRef = useRef<any | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);

  // Manual state
  const [manualValue, setManualValue] = useState('');
  const [manualContext, setManualContext] = useState<GlucoseReading['context']>('random');
  
  // Photo state
  const [photoStep, setPhotoStep] = useState<'select_photo' | 'confirm'>('select_photo');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const handleParseText = useCallback(async (textToParse: string) => {
    if (!textToParse) return;
    
    setIsLoading(true);
    setError('');
    setParsedData(null);
    try {
      const result = await parseGlucoseReadingFromText(textToParse);
      if (result) {
        const isValid = unit === 'mmol/L' 
          ? result.value >= 1 && result.value <= 33
          : result.value >= 20 && result.value <= 600;

        if (isValid) {
           setParsedData({ value: result.value, context: result.context });
           setVoiceStep('confirm');
        } else {
           setError(`Invalid glucose value: ${result.value}. Must be between ${unit === 'mmol/L' ? '1 and 33' : '20 and 600'}.`);
        }
      } else {
        setError("Couldn't understand the reading. Please try saying it again.");
      }
    } catch (e) {
      setError('An error occurred during parsing.');
    } finally {
      setIsLoading(false);
    }
  }, [unit]);

  const stopListening = useCallback(async () => {
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
  }, []);

  const startListening = useCallback(async () => {
    if (isListening) return;
    resetVoiceState();
    setIsListening(true);
    setError('');
    setTranscript('');

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
                        setTranscript(prev => prev + text);
                    }
                },
                onerror: (e) => {
                    console.error('Live session error:', e);
                    setError('A real-time connection error occurred.');
                    stopListening();
                },
                onclose: () => {
                   // Connection closed
                },
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
  }, [isListening]);


  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);


  // When listening stops, if we have a transcript, parse it.
  useEffect(() => {
      if (!isListening && transcript) {
          handleParseText(transcript);
      }
  }, [isListening, transcript, handleParseText]);

  const resetVoiceState = useCallback(() => {
    setVoiceStep('say_reading');
    setTranscript('');
    setParsedData(null);
    setError('');
    setIsLoading(false);
    stopListening();
  }, [stopListening]);

  const resetManualState = useCallback(() => {
    setManualValue('');
    setManualContext('random');
    setError('');
  }, []);
  
  const resetPhotoState = useCallback(() => {
    setPhotoStep('select_photo');
    setImageFile(null);
    setPreviewUrl(null);
    setParsedData(null);
    setError('');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetVoiceState();
      resetManualState();
      resetPhotoState();
      setActiveTab('voice');
    }
  }, [isOpen, resetVoiceState, resetManualState, resetPhotoState]);

  const handleToggleListen = () => {
      if (isListening) {
          stopListening();
      } else {
          startListening();
      }
  };

  const handleVoiceSubmit = () => {
    if (parsedData) {
      onAddReading({
        value: parsedData.value,
        displayUnit: unit,
        context: (parsedData.context.toLowerCase().replace(' ', '_')) as GlucoseReading['context'],
        timestamp: new Date().toISOString(),
        transcript: transcript,
        source: 'voice',
      });
      onClose();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const valueNum = parseFloat(manualValue);
    if (isNaN(valueNum) || manualValue.trim() === '') {
        setError('Please enter a valid number for the glucose value.');
        return;
    }

    const isValid = unit === 'mmol/L' 
      ? valueNum >= 1 && valueNum <= 33
      : valueNum >= 20 && valueNum <= 600;

    if (!isValid) {
        setError(`Invalid value. Must be between ${unit === 'mmol/L' ? '1 and 33' : '20 and 600'}.`);
        return;
    }

    onAddReading({
        value: valueNum,
        displayUnit: unit,
        context: manualContext,
        timestamp: new Date().toISOString(),
        source: 'manual',
    });
    onClose();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setParsedData(null);
      setError('');
    }
  };

  const handlePhotoAnalyze = async () => {
    if (!imageFile) return;

    setIsLoading(true);
    setError('');
    setParsedData(null);

    const reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        const result = await parseGlucoseReadingFromImage(base64String, imageFile.type);
        if (result) {
            const isValid = unit === 'mmol/L' 
              ? result.value >= 1 && result.value <= 33
              : result.value >= 20 && result.value <= 600;

            if (isValid) {
               setParsedData({ value: result.value, context: result.context });
               setPhotoStep('confirm');
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

  const handlePhotoSubmit = () => {
    if (parsedData) {
      onAddReading({
        value: parsedData.value,
        displayUnit: unit,
        context: (parsedData.context.toLowerCase().replace(' ', '_')) as GlucoseReading['context'],
        timestamp: new Date().toISOString(),
        source: 'photo_analysis',
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  const renderVoiceContent = () => (
    <div className="min-h-[220px]">
        {voiceStep === 'say_reading' && (
            <div className="text-center py-4 flex flex-col items-center">
                <p className="text-slate-600 mb-4">
                    {isListening 
                        ? 'Tap the icon below to stop recording.' 
                        : 'Tap the mic and say your reading, like "7.8 after dinner".'}
                </p>
                <button 
                    onClick={handleToggleListen}
                    disabled={isLoading}
                    className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-red-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:bg-slate-400`}
                >
                    {isLoading ? <Spinner /> : (isListening ? <SquareIcon className="w-7 h-7" /> : <MicIcon className="w-8 h-8" />)}
                </button>
                <p className="text-slate-700 mt-4 min-h-[48px] px-2">{transcript || (isListening ? <span className="text-slate-500">Listening...</span> : '')}</p>
            </div>
        )}
        {voiceStep === 'confirm' && parsedData && (
            <div className="mt-4 p-4 bg-slate-100 rounded-lg">
                <div className="text-center">
                    <p className="text-slate-600">Is this correct?</p>
                    <p className="text-3xl font-bold text-blue-600 my-2">{parsedData.value} <span className="text-lg font-normal">{unit}</span></p>
                    <p className="text-slate-500 capitalize">{parsedData.context.replace('_', ' ')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-6">
                    <button onClick={resetVoiceState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">
                        Start Over
                    </button>
                    <button onClick={handleVoiceSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">
                        Confirm & Save
                    </button>
                </div>
            </div>
        )}
        {error && <p className="text-red-500 text-center mt-4">{error}</p>}
    </div>
  );

  const renderManualContent = () => (
    <form onSubmit={handleManualSubmit} className="space-y-4 pt-4 min-h-[220px]">
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label htmlFor="glucose-value" className="block text-sm font-medium text-slate-700">Value ({unit})</label>
                <input 
                    type="number" 
                    id="glucose-value" 
                    value={manualValue} 
                    onChange={e => setManualValue(e.target.value)}
                    step={unit === 'mmol/L' ? '0.1' : '1'}
                    required 
                    className="mt-1 block w-full bg-white text-slate-900 placeholder:text-slate-400 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2" 
                />
            </div>
            <div>
                <label htmlFor="glucose-context" className="block text-sm font-medium text-slate-700">Context</label>
                <select 
                    id="glucose-context" 
                    value={manualContext} 
                    onChange={e => setManualContext(e.target.value as GlucoseReading['context'])} 
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md bg-white"
                >
                    <option value="random">Random</option>
                    <option value="fasting">Fasting</option>
                    <option value="before_meal">Before Meal</option>
                    <option value="after_meal">After Meal</option>
                    <option value="bedtime">Bedtime</option>
                </select>
            </div>
        </div>
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 transition-colors">
            Save Log
        </button>
    </form>
  );

  const renderPhotoContent = () => (
    <div className="min-h-[220px] pt-4">
        {photoStep === 'select_photo' && (
            <div>
                {!previewUrl ? (
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button onClick={() => { fileInputRef.current?.setAttribute('capture', 'environment'); fileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-blue-500 transition-colors flex flex-col items-center justify-center">
                            <CameraIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                            <span>Take Picture</span>
                        </button>
                        <button onClick={() => { fileInputRef.current?.removeAttribute('capture'); fileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 hover:bg-slate-50 hover:border-blue-500 transition-colors flex flex-col items-center justify-center">
                            <UploadIcon className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                            <span>Upload Photo</span>
                        </button>
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <img src={previewUrl} alt="Glucose meter preview" className="rounded-lg w-full max-h-48 object-contain" />
                        <button onClick={handlePhotoAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 disabled:bg-slate-300 transition-colors flex items-center justify-center">
                            {isLoading ? <Spinner /> : 'Analyze Reading'}
                        </button>
                    </div>
                )}
            </div>
        )}
        {photoStep === 'confirm' && parsedData && (
             <div className="mt-4 p-4 bg-slate-100 rounded-lg">
                <div className="text-center">
                    <p className="text-slate-600">Is this correct?</p>
                    <p className="text-3xl font-bold text-blue-600 my-2">{parsedData.value} <span className="text-lg font-normal">{unit}</span></p>
                    <p className="text-slate-500 capitalize">{parsedData.context.replace('_', ' ')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-6">
                    <button onClick={resetPhotoState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300 transition-colors">
                        Start Over
                    </button>
                    <button onClick={handlePhotoSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700 transition-colors">
                        Confirm & Save
                    </button>
                </div>
            </div>
        )}
        {error && <p className="text-red-500 text-center mt-4">{error}</p>}
    </div>
  );


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-700">
          <XIcon className="w-6 h-6" />
        </button>
        <div className="flex items-center space-x-3 mb-4">
            <DropletIcon className="w-7 h-7 text-blue-600" />
            <h2 className="text-2xl font-bold text-slate-800">Log Glucose</h2>
        </div>
        
        <div className="flex border-b border-slate-200 mb-2">
            <button onClick={() => { setActiveTab('voice'); resetManualState(); resetPhotoState(); }} className={`px-4 py-2 text-sm font-medium flex items-center space-x-2 ${activeTab === 'voice' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <MicIcon className="w-4 h-4" />
                <span>Voice</span>
            </button>
            <button onClick={() => { setActiveTab('manual'); resetVoiceState(); resetPhotoState(); }} className={`px-4 py-2 text-sm font-medium flex items-center space-x-2 ${activeTab === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <PencilIcon className="w-4 h-4" />
                <span>Manual</span>
            </button>
            <button onClick={() => { setActiveTab('photo'); resetVoiceState(); resetManualState(); }} className={`px-4 py-2 text-sm font-medium flex items-center space-x-2 ${activeTab === 'photo' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <CameraIcon className="w-4 h-4" />
                <span>Photo</span>
            </button>
        </div>

        {activeTab === 'voice' && renderVoiceContent()}
        {activeTab === 'manual' && renderManualContent()}
        {activeTab === 'photo' && renderPhotoContent()}
      </div>
    </div>
  );
};

export default GlucoseLogModal;