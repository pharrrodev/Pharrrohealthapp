import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WeightReading } from '../types';
import { parseWeightFromText, parseWeightFromImage } from '../services/geminiService';
import { MicIcon, XIcon, PencilIcon, CameraIcon, UploadIcon, WeightScaleIcon, SquareIcon } from './Icons';
import Spinner from './Spinner';
import { GoogleGenAI, Modality, Blob } from '@google/genai';

interface WeightLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddReading: (reading: Omit<WeightReading, 'id'>) => void;
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

const WeightLogModal: React.FC<WeightLogModalProps> = ({ isOpen, onClose, onAddReading }) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'manual' | 'photo'>('voice');
  const [parsedData, setParsedData] = useState<{ value: number; unit: 'kg' | 'lbs' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Voice state
  const [voiceStep, setVoiceStep] = useState<'say_reading' | 'confirm'>('say_reading');
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const sessionRef = useRef<any | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);

  // Manual state
  const [manualValue, setManualValue] = useState('');
  const [manualUnit, setManualUnit] = useState<'kg' | 'lbs'>('kg');
  
  // Photo state
  const [photoStep, setPhotoStep] = useState<'select_photo' | 'confirm'>('select_photo');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParseText = useCallback(async (textToParse: string) => {
    if (!textToParse) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await parseWeightFromText(textToParse);
      if (result) {
        setParsedData(result);
        setVoiceStep('confirm');
      } else {
        setError("Couldn't understand the weight. Please try again.");
      }
    } catch (e) {
      setError('An error occurred during parsing.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    if (!aiRef.current) aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY! });
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
                    scriptProcessor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        sessionPromise.then((session) => session.sendRealtimeInput({ media: createBlob(inputData) }));
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current.destination);
                },
                onmessage: async (message) => {
                    if (message.serverContent?.inputTranscription) {
                        setTranscript(prev => prev + message.serverContent.inputTranscription.text);
                    }
                },
                onerror: (e) => { console.error(e); setError('A connection error occurred.'); stopListening(); },
                onclose: () => {},
            },
            config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {} },
        });
        sessionRef.current = await sessionPromise;
    } catch (err) {
        console.error(err);
        setError('Could not access microphone.');
        setIsListening(false);
    }
  }, [isListening, stopListening]);

  useEffect(() => { return () => { stopListening(); }; }, [stopListening]);

  useEffect(() => {
    if (!isListening && transcript) handleParseText(transcript);
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
    setManualUnit('kg');
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

  const handleVoiceSubmit = () => {
    if (parsedData) {
      onAddReading({ ...parsedData, timestamp: new Date().toISOString(), source: 'voice', transcript });
      onClose();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valueNum = parseFloat(manualValue);
    if (isNaN(valueNum) || valueNum <= 0) {
      setError('Please enter a valid weight.');
      return;
    }
    onAddReading({ value: valueNum, unit: manualUnit, timestamp: new Date().toISOString(), source: 'manual' });
    onClose();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError('');
    }
  };

  const handlePhotoAnalyze = async () => {
    if (!imageFile) return;
    setIsLoading(true);
    setError('');
    const reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        const result = await parseWeightFromImage(base64String, imageFile.type);
        if (result) {
          setParsedData(result);
          setPhotoStep('confirm');
        } else {
          setError("Couldn't read the value from the image.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred during analysis.');
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => { setError('Failed to read file.'); setIsLoading(false); };
  };

  const handlePhotoSubmit = () => {
    if (parsedData) {
      onAddReading({ ...parsedData, timestamp: new Date().toISOString(), source: 'photo_analysis' });
      onClose();
    }
  };

  if (!isOpen) return null;

  const renderVoiceContent = () => (
    <div className="min-h-[220px]">
      {voiceStep === 'say_reading' && (
        <div className="text-center py-4 flex flex-col items-center">
          <p className="text-slate-600 mb-4">{isListening ? 'Tap icon to stop recording.' : 'Tap icon and say your weight, like "85 kilograms".'}</p>
          <button onClick={() => isListening ? stopListening() : startListening()} disabled={isLoading} className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-red-500' : 'bg-teal-600 hover:bg-teal-700'} text-white disabled:bg-slate-400`}>
            {isLoading ? <Spinner /> : (isListening ? <SquareIcon className="w-7 h-7" /> : <MicIcon className="w-8 h-8" />)}
          </button>
          <p className="text-slate-700 mt-4 min-h-[48px] px-2">{transcript || (isListening ? <span className="text-slate-500">Listening...</span> : '')}</p>
        </div>
      )}
      {voiceStep === 'confirm' && parsedData && (
        <div className="mt-4 p-4 bg-slate-100 rounded-lg">
          <div className="text-center">
            <p className="text-slate-600">Is this correct?</p>
            <p className="text-3xl font-bold text-teal-600 my-2">{parsedData.value} <span className="text-lg font-normal">{parsedData.unit}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <button onClick={resetVoiceState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300">Start Over</button>
            <button onClick={handleVoiceSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700">Confirm & Save</button>
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
          <label htmlFor="weight-value" className="block text-sm font-medium text-slate-700">Weight</label>
          <input type="number" id="weight-value" value={manualValue} onChange={e => setManualValue(e.target.value)} step="0.1" required className="mt-1 block w-full bg-white text-slate-900 rounded-md border-slate-300 shadow-sm p-2" />
        </div>
        <div>
          <label htmlFor="weight-unit" className="block text-sm font-medium text-slate-700">Unit</label>
          <select id="weight-unit" value={manualUnit} onChange={e => setManualUnit(e.target.value as 'kg' | 'lbs')} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm p-2 bg-white">
            <option value="kg">kg</option>
            <option value="lbs">lbs</option>
          </select>
        </div>
      </div>
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      <button type="submit" className="w-full bg-teal-600 text-white font-semibold py-3 rounded-md hover:bg-teal-700">Save Log</button>
    </form>
  );

  const renderPhotoContent = () => (
    <div className="min-h-[220px] pt-4">
      {photoStep === 'select_photo' && (
        <div>
          {!previewUrl ? (
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => { fileInputRef.current?.setAttribute('capture', 'environment'); fileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-teal-500 flex flex-col items-center justify-center"><CameraIcon className="w-10 h-10 text-slate-400 mb-2" /><span>Take Picture</span></button>
              <button onClick={() => { fileInputRef.current?.removeAttribute('capture'); fileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-teal-500 flex flex-col items-center justify-center"><UploadIcon className="w-10 h-10 text-slate-400 mb-2" /><span>Upload Photo</span></button>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>
          ) : (
            <div className="space-y-4">
              <img src={previewUrl} alt="Weight scale preview" className="rounded-lg w-full max-h-48 object-contain" />
              <button onClick={handlePhotoAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md hover:bg-blue-700 disabled:bg-slate-300 flex items-center justify-center">{isLoading ? <Spinner /> : 'Analyze Weight'}</button>
            </div>
          )}
        </div>
      )}
      {photoStep === 'confirm' && parsedData && (
        <div className="mt-4 p-4 bg-slate-100 rounded-lg">
          <div className="text-center">
            <p className="text-slate-600">Is this correct?</p>
            <p className="text-3xl font-bold text-teal-600 my-2">{parsedData.value} <span className="text-lg font-normal">{parsedData.unit}</span></p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <button onClick={resetPhotoState} className="w-full bg-slate-200 text-slate-700 font-semibold py-3 rounded-md hover:bg-slate-300">Start Over</button>
            <button onClick={handlePhotoSubmit} className="w-full bg-green-600 text-white font-semibold py-3 rounded-md hover:bg-green-700">Confirm & Save</button>
          </div>
        </div>
      )}
      {error && <p className="text-red-500 text-center mt-4">{error}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"><XIcon className="w-6 h-6" /></button>
        <div className="flex items-center space-x-3 mb-4">
          <WeightScaleIcon className="w-7 h-7 text-teal-600" />
          <h2 className="text-2xl font-bold text-slate-800">Log Weight</h2>
        </div>
        <div className="flex border-b border-slate-200 mb-2">
          <button onClick={() => { setActiveTab('voice'); resetManualState(); resetPhotoState(); }} className={`px-4 py-2 text-sm font-medium flex items-center space-x-2 ${activeTab === 'voice' ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500'}`}><MicIcon className="w-4 h-4" /><span>Voice</span></button>
          <button onClick={() => { setActiveTab('manual'); resetVoiceState(); resetPhotoState(); }} className={`px-4 py-2 text-sm font-medium flex items-center space-x-2 ${activeTab === 'manual' ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500'}`}><PencilIcon className="w-4 h-4" /><span>Manual</span></button>
          <button onClick={() => { setActiveTab('photo'); resetVoiceState(); resetManualState(); }} className={`px-4 py-2 text-sm font-medium flex items-center space-x-2 ${activeTab === 'photo' ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500'}`}><CameraIcon className="w-4 h-4" /><span>Photo</span></button>
        </div>
        {activeTab === 'voice' && renderVoiceContent()}
        {activeTab === 'manual' && renderManualContent()}
        {activeTab === 'photo' && renderPhotoContent()}
      </div>
    </div>
  );
};

export default WeightLogModal;