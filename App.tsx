import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PhotoData, Rating, ProcessStatus, BatchStats, GroupReport } from './types';
import { ratePhotoWithGemini, generateGroupReport } from './services/geminiService';
import PhotoCard from './components/PhotoCard';
import StatsPanel from './components/StatsPanel';

// Constants
const MAX_CONCURRENCY = 5; 

// Helper to check API Key existence safely (Updated to check LocalStorage)
const checkApiKey = (): boolean => {
  // 0. Try LocalStorage
  if (typeof window !== 'undefined') {
    if (localStorage.getItem("GEMINI_API_KEY")) return true;
  }

  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) return true;
  } catch (e) {}
  
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.REACT_APP_API_KEY) return true;
    if (process.env.API_KEY) return true;
  }
  return false;
};

const App: React.FC = () => {
  // 1. Hooks (State & Refs) - MUST be at the top level
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [groupReport, setGroupReport] = useState<GroupReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [manualKey, setManualKey] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef<Set<string>>(new Set());

  // 2. Effects
  // Check key on mount
  useEffect(() => {
    setHasApiKey(checkApiKey());
  }, []);

  // Processing Logic Effect
  useEffect(() => {
    if (!isProcessing) {
        processingRef.current.clear();
        return;
    }
    
    const processQueue = async () => {
        const currentProcessing = photos.filter(p => p.status === ProcessStatus.Processing);
        const currentPending = photos.filter(p => p.status === ProcessStatus.Pending);

        if (currentProcessing.length === 0 && currentPending.length === 0) {
            setIsProcessing(false);
            return;
        }

        const slotsFree = MAX_CONCURRENCY - currentProcessing.length;
        
        if (slotsFree > 0 && currentPending.length > 0) {
            const nextBatch = currentPending.slice(0, slotsFree);
            
            setPhotos(prev => prev.map(p => 
                nextBatch.find(n => n.id === p.id) ? { ...p, status: ProcessStatus.Processing } : p
            ));
            
            nextBatch.forEach(photo => {
                if (processingRef.current.has(photo.id)) return;
                processingRef.current.add(photo.id);

                ratePhotoWithGemini(photo.file).then(result => {
                    setPhotos(prev => prev.map(p => {
                        if (p.id !== photo.id) return p;
                        return { ...p, rating: result.rating, reason: result.reason, status: ProcessStatus.Completed };
                    }));
                }).catch(() => {
                   setPhotos(prev => prev.map(p => {
                        if (p.id !== photo.id) return p;
                        return { ...p, status: ProcessStatus.Error, reason: "Network error" };
                    }));
                }).finally(() => {
                    processingRef.current.delete(photo.id);
                });
            });
        }
    };

    const interval = setInterval(processQueue, 1000);
    return () => clearInterval(interval);
  }, [photos, isProcessing]);


  // 3. Derived State & Helpers
  const stats: BatchStats = {
    total: photos.length,
    processed: photos.filter(p => p.status === ProcessStatus.Completed || p.status === ProcessStatus.Error).length,
    s_count: photos.filter(p => p.rating === Rating.S).length,
    a_count: photos.filter(p => p.rating === Rating.A).length,
    b_count: photos.filter(p => p.rating === Rating.B).length,
  };

  const pendingCount = photos.filter(p => p.status === ProcessStatus.Pending).length;

  const handleSaveKey = () => {
      if (!manualKey.trim()) return;
      if (!manualKey.trim().startsWith("AIza")) {
          alert("Key 格式似乎不正确。通常以 'AIza' 开头。");
          return;
      }
      localStorage.setItem("GEMINI_API_KEY", manualKey.trim());
      setHasApiKey(true);
      setManualKey('');
  };

  const handleClearKey = () => {
      if(confirm("确定要退出并清除密钥吗？")) {
        localStorage.removeItem("GEMINI_API_KEY");
        setHasApiKey(checkApiKey()); 
      }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files) as File[];
      const newPhotos: PhotoData[] = newFiles.map(file => ({
        id: uuidv4(),
        file,
        previewUrl: URL.createObjectURL(file),
        rating: Rating.Unrated,
        reason: "",
        status: ProcessStatus.Pending
      }));
      setPhotos(prev => [...prev, ...newPhotos]);
      setGroupReport(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleClearAll = () => {
    if (photos.length === 0) return;
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setGroupReport(null);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExport = () => {
    const headers = ["FileName", "Rating", "Critique"];
    const rows = photos.map(p => [
      `"${p.file.name}"`, 
      p.rating === Rating.Unrated ? "Pending" : p.rating, 
      `"${p.reason.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `chimelong_ratings_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateReport = async () => {
      setGeneratingReport(true);
      try {
          const sReasons = photos.filter(p => p.rating === Rating.S).map(p => p.reason);
          const bReasons = photos.filter(p => p.rating === Rating.B).map(p => p.reason);
          const report = await generateGroupReport(stats, sReasons, bReasons);
          setGroupReport(report);
      } catch (e) {
          console.error("Failed to generate report", e);
          alert("生成报告失败，请重试");
      } finally {
          setGeneratingReport(false);
      }
  };


  // --- MODE 1: ONE-STEP LOGIN SCREEN (Shown when no key) ---
  if (!hasApiKey) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-100">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center space-y-8 relative overflow-hidden">
                
                {/* Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>

                {/* Logo Area */}
                <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 bg-slate-950 rounded-2xl flex items-center justify-center border border-slate-800 shadow-inner">
                         <img 
                            src="/logo.png" 
                            alt="Logo" 
                            className="w-12 h-12 object-contain filter invert opacity-80"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <span className="text-3xl font-black tracking-tighter" style={{display: 'none'}}>R</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">象园长跟拍评级系统</h1>
                        <p className="text-slate-500 text-sm mt-1">AI 驱动的专业旅拍筛选工具</p>
                    </div>
                </div>

                {/* The "One Step" Input */}
                <div className="text-left space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">请输入 Google API Key</label>
                    <div className="relative group">
                        <input 
                            type="password"
                            value={manualKey}
                            onChange={(e) => setManualKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-mono"
                        />
                    </div>
                    <p className="text-xs text-slate-500 px-1">
                        密钥将仅存储在您的本地浏览器中，安全无忧。
                    </p>
                </div>

                <button 
                    onClick={handleSaveKey}
                    disabled={!manualKey}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 text-lg"
                >
                    进入系统
                </button>
            </div>
            
            <p className="mt-8 text-slate-600 text-xs">
                没有密钥？<a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-indigo-500 hover:text-indigo-400 underline">去 Google 免费申请一个</a>
            </p>
        </div>
      );
  }

  // --- MODE 2: MAIN APP (Shown when key exists) ---
  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-12 font-sans text-slate-100">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="mb-10 flex flex-col md:flex-row justify-between items-end border-b border-slate-800 pb-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left w-full md:w-auto">
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative bg-slate-950 rounded-lg p-2 border border-slate-800">
                    <img src="/logo.png" alt="ROKRIO" className="h-16 w-auto object-contain filter invert brightness-200 opacity-90" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </div>
            </div>
            <div className="flex flex-col justify-center h-full pt-1">
              <h1 className="text-3xl font-extrabold text-white tracking-tight">象园长跟拍评级系统</h1>
              <p className="text-slate-400 text-sm mt-1">专注长隆旅拍 · 氛围感与情绪捕捉</p>
            </div>
          </div>
          
          <div className="mt-6 md:mt-0 flex flex-col items-end gap-2 w-full md:w-auto justify-center md:justify-end">
             <button onClick={handleClearKey} className="text-xs text-slate-500 hover:text-red-400 underline mb-2">
                退出 / 切换 Key
             </button>
             <div className="flex gap-4">
                <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  导入新照片 ({photos.length})
                </button>
            </div>
          </div>
        </header>

        {/* Main Content Areas */}
        <StatsPanel 
            stats={stats} 
            isProcessing={isProcessing}
            groupReport={groupReport}
            generatingReport={generatingReport}
            onStart={() => setIsProcessing(true)}
            onStop={() => setIsProcessing(false)}
            onExport={handleExport}
            onClear={handleClearAll}
            onGenerateReport={handleGenerateReport}
            queueLength={pendingCount}
        />

        {photos.length > 0 && (
            <div className="mb-6 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-slate-300">
                    照片列表 <span className="text-slate-500 text-sm font-normal ml-2">(共 {photos.length} 张)</span>
                </h2>
                <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex gap-1">
                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    </button>
                    <button onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                </div>
            </div>
        )}

        {photos.length === 0 && (
          <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-700 rounded-2xl h-96 flex flex-col items-center justify-center text-slate-500 hover:border-indigo-500 hover:text-indigo-400 hover:bg-slate-900/50 transition-all cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-xl font-medium">点击或拖拽照片至此处</p>
            <p className="text-sm mt-2 opacity-70">支持 JPG, PNG, WebP</p>
          </div>
        )}

        <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" : "flex flex-col gap-3 max-w-4xl mx-auto"}>
          {photos.map(photo => (
            <PhotoCard key={photo.id} photo={photo} onRemove={handleRemovePhoto} viewMode={viewMode} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;