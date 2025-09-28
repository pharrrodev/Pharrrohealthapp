import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BloodPressureReading } from '../types';
import { parseBloodPressureFromText, parseBloodPressureFromImage } from '../services/geminiService';
import { MicIcon, XIcon, PencilIcon, CameraIcon, UploadIcon, BloodPressureIcon, SquareIcon } from './Icons';
import Spinner from './Spinner';
import { GoogleGenAI, Modality, Blob } from '@google/genai';

interface BloodPressureLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddReading: (reading: Omit<BloodPressureReading, 'id'>) => void;
}

// Audio helper functions
function encode(bytes: Uint8Array) { let b = ''; bytes.forEach(B=>b+=String.fromCharCode(B)); return btoa(b); }
function createBlob(d: Float32Array): Blob { let i=new Int16Array(d.length); d.forEach((v,k)=>i[k]=v*32768); return {data: encode(new Uint8Array(i.buffer)), mimeType: 'audio/pcm;rate=16000'};}

const BloodPressureLogModal: React.FC<BloodPressureLogModalProps> = ({ isOpen, onClose, onAddReading }) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'manual' | 'photo'>('voice');
  const [parsedData, setParsedData] = useState<{ systolic: number; diastolic: number; pulse: number } | null>(null);
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
  const [manualSystolic, setManualSystolic] = useState('');
  const [manualDiastolic, setManualDiastolic] = useState('');
  const [manualPulse, setManualPulse] = useState('');
  
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
      const result = await parseBloodPressureFromText(textToParse);
      if (result) {
        setParsedData(result);
        setVoiceStep('confirm');
      } else {
        setError("Couldn't understand the reading. Please try again.");
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
      streamRef.current.getTracks().forEach(t => t.stop());
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
                    const sp = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = sp;
                    sp.onaudioprocess = (e) => sessionPromise.then((s) => s.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }));
                    source.connect(sp);
                    sp.connect(inputAudioContextRef.current.destination);
                },
                onmessage: async (m) => {
                    if (m.serverContent?.inputTranscription) setTranscript(p => p + m.serverContent.inputTranscription.text);
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
  useEffect(() => { if (!isListening && transcript) handleParseText(transcript); }, [isListening, transcript, handleParseText]);

  const resetVoiceState = useCallback(() => {
    setVoiceStep('say_reading');
    setTranscript('');
    setParsedData(null);
    setError('');
    setIsLoading(false);
    stopListening();
  }, [stopListening]);

  const resetManualState = () => { setManualSystolic(''); setManualDiastolic(''); setManualPulse(''); setError(''); };
  const resetPhotoState = () => { setPhotoStep('select_photo'); setImageFile(null); setPreviewUrl(null); setParsedData(null); setError(''); setIsLoading(false); };
  useEffect(() => { if (!isOpen) { resetVoiceState(); resetManualState(); resetPhotoState(); setActiveTab('voice'); } }, [isOpen, resetVoiceState]);

  const handleVoiceSubmit = () => { if (parsedData) { onAddReading({ ...parsedData, timestamp: new Date().toISOString(), source: 'voice', transcript }); onClose(); }};
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sys = parseInt(manualSystolic), dia = parseInt(manualDiastolic), pul = parseInt(manualPulse);
    if (isNaN(sys) || isNaN(dia) || isNaN(pul) || sys <= 0 || dia <= 0 || pul <= 0) {
      setError('Please enter valid numbers for all fields.');
      return;
    }
    onAddReading({ systolic: sys, diastolic: dia, pulse: pul, timestamp: new Date().toISOString(), source: 'manual' });
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) {setImageFile(f); setPreviewUrl(URL.createObjectURL(f)); setError('');}};
  const handlePhotoAnalyze = async () => {
    if (!imageFile) return;
    setIsLoading(true); setError('');
    const reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const result = await parseBloodPressureFromImage(base64, imageFile.type);
        if (result) { setParsedData(result); setPhotoStep('confirm'); } 
        else { setError("Couldn't read the value from the image."); }
      } catch (e) { setError(e instanceof Error ? e.message : 'An error occurred.'); } 
      finally { setIsLoading(false); }
    };
    reader.onerror = () => { setError('Failed to read file.'); setIsLoading(false); };
  };

  const handlePhotoSubmit = () => { if (parsedData) { onAddReading({ ...parsedData, timestamp: new Date().toISOString(), source: 'photo_analysis' }); onClose(); }};

  if (!isOpen) return null;

  const renderVoiceContent = () => (
    <div className="min-h-[220px]">
      {voiceStep === 'say_reading' && (
        <div className="text-center py-4 flex flex-col items-center">
          <p className="text-slate-600 mb-4">{isListening ? 'Tap icon to stop recording.' : 'Tap icon and say "120 over 80, pulse 65".'}</p>
          <button onClick={() => isListening ? stopListening() : startListening()} disabled={isLoading} className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-red-500' : 'bg-indigo-600 hover:bg-indigo-700'} text-white disabled:bg-slate-400`}>
            {isLoading ? <Spinner /> : (isListening ? <SquareIcon className="w-7 h-7" /> : <MicIcon className="w-8 h-8" />)}
          </button>
          <p className="text-slate-700 mt-4 min-h-[48px] px-2">{transcript || (isListening ? <span className="text-slate-500">Listening...</span> : '')}</p>
        </div>
      )}
      {voiceStep === 'confirm' && parsedData && (
        <div className="mt-4 p-4 bg-slate-100 rounded-lg">
          <div className="text-center">
            <p className="text-slate-600">Is this correct?</p>
            <p className="text-3xl font-bold text-indigo-600 my-2">{parsedData.systolic} / {parsedData.diastolic} <span className="text-lg font-normal">mmHg</span></p>
            <p className="text-slate-500">Pulse: {parsedData.pulse} bpm</p>
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
      <div className="grid grid-cols-3 gap-3">
        <div><label htmlFor="bp-sys" className="block text-sm font-medium text-slate-700">Systolic</label><input type="number" id="bp-sys" value={manualSystolic} onChange={e=>setManualSystolic(e.target.value)} required className="mt-1 w-full bg-white p-2 border-slate-300 rounded-md" /></div>
        <div><label htmlFor="bp-dia" className="block text-sm font-medium text-slate-700">Diastolic</label><input type="number" id="bp-dia" value={manualDiastolic} onChange={e=>setManualDiastolic(e.target.value)} required className="mt-1 w-full bg-white p-2 border-slate-300 rounded-md" /></div>
        <div><label htmlFor="bp-pulse" className="block text-sm font-medium text-slate-700">Pulse</label><input type="number" id="bp-pulse" value={manualPulse} onChange={e=>setManualPulse(e.target.value)} required className="mt-1 w-full bg-white p-2 border-slate-300 rounded-md" /></div>
      </div>
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      <button type="submit" className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-md hover:bg-indigo-700">Save Log</button>
    </form>
  );

  const renderPhotoContent = () => (
    <div className="min-h-[220px] pt-4">
      {photoStep === 'select_photo' && (
        <div>
          {!previewUrl ? (
            <div className="grid grid-cols-2 gap-4"><button type="button" onClick={() => { fileInputRef.current?.setAttribute('capture', 'environment'); fileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center hover:border-indigo-500"><CameraIcon className="w-10 h-10 text-slate-400 mb-2" /><span>Take Picture</span></button><button type="button" onClick={() => { fileInputRef.current?.removeAttribute('capture'); fileInputRef.current?.click(); }} className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center hover:border-indigo-500"><UploadIcon className="w-10 h-10 text-slate-400 mb-2" /><span>Upload Photo</span></button><input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" /></div>
          ) : (
            <div className="space-y-4"><img src={previewUrl} alt="BP Monitor Preview" className="rounded-lg w-full max-h-48 object-contain" /><button onClick={handlePhotoAnalyze} disabled={isLoading} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-md flex justify-center items-center">{isLoading ? <Spinner /> : 'Analyze Reading'}</button></div>
          )}
        </div>
      )}
      {photoStep === 'confirm' && parsedData && (
        <div className="mt-4 p-4 bg-slate-100 rounded-lg">
          <div className="text-center">
            <p className="text-slate-600">Is this correct?</p>
            <p className="text-3xl font-bold text-indigo-600 my-2">{parsedData.systolic} / {parsedData.diastolic} <span className="text-lg font-normal">mmHg</span></p>
            <p className="text-slate-500">Pulse: {parsedData.pulse} bpm</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6"><button onClick={resetPhotoState} className="w-full bg-slate-200 text-slate-700 py-3 rounded-md">Start Over</button><button onClick={handlePhotoSubmit} className="w-full bg-green-600 text-white py-3 rounded-md">Confirm & Save</button></div>
        </div>
      )}
      {error && <p className="text-red-500 text-center mt-4">{error}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"><XIcon className="w-6 h-6" /></button>
        <div className="flex items-center space-x-3 mb-4"><BloodPressureIcon className="w-7 h-7 text-indigo-600" /><h2 className="text-2xl font-bold">Log Blood Pressure</h2></div>
        <div className="flex border-b border-slate-200 mb-2">
          <button onClick={()=>{setActiveTab('voice'); resetManualState(); resetPhotoState();}} className={`px-4 py-2 text-sm flex items-center space-x-2 ${activeTab==='voice'?'border-b-2 border-indigo-600 text-indigo-600':'text-slate-500'}`}><MicIcon className="w-4 h-4"/><span>Voice</span></button>
          <button onClick={()=>{setActiveTab('manual'); resetVoiceState(); resetPhotoState();}} className={`px-4 py-2 text-sm flex items-center space-x-2 ${activeTab==='manual'?'border-b-2 border-indigo-600 text-indigo-600':'text-slate-500'}`}><PencilIcon className="w-4 h-4"/><span>Manual</span></button>
          <button onClick={()=>{setActiveTab('photo'); resetVoiceState(); resetManualState();}} className={`px-4 py-2 text-sm flex items-center space-x-2 ${activeTab==='photo'?'border-b-2 border-indigo-600 text-indigo-600':'text-slate-500'}`}><CameraIcon className="w-4 h-4"/><span>Photo</span></button>
        </div>
        {activeTab === 'voice' && renderVoiceContent()}
        {activeTab === 'manual' && renderManualContent()}
        {activeTab === 'photo' && renderPhotoContent()}
      </div>
    </div>
  );
};

export default BloodPressureLogModal;