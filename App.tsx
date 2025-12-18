import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PhotoData, Rating, ProcessStatus, BatchStats, GroupReport } from './types';
import { ratePhoto, generateGroupReport, validateApiKey } from './services/geminiService';
import PhotoCard from './components/PhotoCard';
import StatsPanel from './components/StatsPanel';

// Constants
const MAX_CONCURRENCY = 4; 

const App: React.FC = () => {
  // State
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [groupReport, setGroupReport] = useState<GroupReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Auth State
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  
  // Login UI State
  const [inputKey, setInputKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef<Set<string>>(new Set());

  // Restore Session
  useEffect(() => {
    const savedKey = localStorage.getItem("API_KEY");
    if (savedKey) {
        setApiKey(savedKey);
        setHasApiKey(true);
    }
  }, []);

  // Processing Queue
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

                ratePhoto(photo.file, apiKey).then(result => {
                    setPhotos(prev => prev.map(p => {
                        if (p.id !== photo.id) return p;
                        return { ...p, rating: result.rating, reason: result.reason, status: ProcessStatus.Completed };
                    }));
                }).catch(() => {
                   setPhotos(prev => prev.map(p => {
                        if (p.id !== photo.id) return p;
                        return { ...p, status: ProcessStatus.Error, reason: "Failed" };
                    }));
                }).finally(() => {
                    processingRef.current.delete(photo.id);
                });
            });
        }
    };

    const interval = setInterval(processQueue, 1000);
    return () => clearInterval(interval);
  }, [photos, isProcessing, apiKey]);


  // Stats
  const stats: BatchStats = {
    total: photos.length,
    processed: photos.filter(p => p.status === ProcessStatus.Completed || p.status === ProcessStatus.Error).length,
    s_count: photos.filter(p => p.rating === Rating.S).length,
    a_count: photos.filter(p => p.rating === Rating.A).length,
    b_count: photos.filter(p => p.rating === Rating.B).length,
  };

  const pendingCount = photos.filter(p => p.status === ProcessStatus.Pending).length;

  // Handlers
  const handleLogin = async (skipCheck = false) => {
      // Auto-clean input: remove quotes, spaces, newlines
      const cleanKey = inputKey.replace(/['"\s\n]/g, '').trim();
      
      if (!cleanKey) return;

      if (!cleanKey.startsWith("AIza")) {
          setErrorMsg("Key 格式错误：必须以 'AIza' 开头。请检查是否复制完整。");
          return;
      }

      setIsVerifying(true);
      setErrorMsg('');

      if (!skipCheck) {
          const res = await validateApiKey(cleanKey);
          if (!res.valid) {
              setIsVerifying(false);
              setErrorMsg(res.error || "验证失败");
              return;
          }
      }

      localStorage.setItem("API_KEY", cleanKey);
      setApiKey(cleanKey);
      setHasApiKey(true);
      setIsVerifying(false);
  };

  const handleLogout = () => {
      if(confirm("确定退出?")) {
          localStorage.removeItem("API_KEY");
          setHasApiKey(false);
          setApiKey('');
          setInputKey('');
          setPhotos([]);
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
        const p = prev.find(item => item.id === id);
        if (p) URL.revokeObjectURL(p.previewUrl);
        return prev.filter(item => item.id !== id);
    });
  };

  const handleGenerateReport = async () => {
      setGeneratingReport(true);
      try {
          const sReasons = photos.filter(p => p.rating === Rating.S).map(p => p.reason);
          const bReasons = photos.filter(p => p.rating === Rating.B).map(p => p.reason);
          const report = await generateGroupReport(stats, sReasons, bReasons, apiKey);
          setGroupReport(report);
      } catch (e) {
          console.error(e);
          alert("报告生成失败");
      } finally {
          setGeneratingReport(false);
      }
  };

  // --- LOGIN SCREEN (PURE GEMINI) ---
  if (!hasApiKey) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-100">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl space-y-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-white">象园长跟拍评级</h1>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        <span className="text-xs text-indigo-300 font-medium">Powered by Gemini 3 Flash</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 ml-1">Google API Key</label>
                        <input 
                            type="text" 
                            value={inputKey}
                            onChange={(e) => { setInputKey(e.target.value); setErrorMsg(''); }}
                            disabled={isVerifying}
                            placeholder="粘贴 AIzaSy... 开头的密钥"
                            className={`w-full bg-slate-950 border-2 rounded-xl px-4 py-3 text-white focus:outline-none transition-all font-mono text-sm ${errorMsg ? 'border-red-500' : 'border-slate-800 focus:border-indigo-500'}`}
                        />
                        {errorMsg ? (
                             <div className="text-xs text-red-400 px-1 font-bold mt-1 bg-red-900/20 p-2 rounded">
                                ❌ {errorMsg}
                             </div>
                        ) : (
                             <div className="flex justify-between px-1 text-xs text-slate-500">
                                <span>密钥仅保存在本地</span>
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-indigo-400 hover:underline">没有 Key? 去申请 &rarr;</a>
                             </div>
                        )}
                    </div>
                </div>

                <div className="space-y-3">
                    {!errorMsg ? (
                        <button 
                            onClick={() => handleLogin(false)}
                            disabled={!inputKey || isVerifying}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isVerifying ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    连接验证中...
                                </>
                            ) : "进入系统"}
                        </button>
                    ) : (
                         <div className="space-y-2 animate-fadeIn">
                             <button 
                                onClick={() => handleLogin(false)}
                                disabled={isVerifying}
                                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-all"
                             >
                                重试连接
                             </button>
                             <button 
                                onClick={() => handleLogin(true)}
                                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                ⚠️ 忽略报错，强制进入系统
                            </button>
                            <p className="text-[10px] text-center text-slate-500">
                                * 如果您确定 Key 是正确的，只是因为网络/VPN原因连接失败，请点击强制进入。
                            </p>
                         </div>
                    )}
                </div>

                <div className="pt-4 border-t border-slate-800/50">
                    <button 
                        onClick={() => setShowHelp(!showHelp)}
                        className="w-full text-center text-xs text-slate-500 hover:text-indigo-400 underline transition-colors flex items-center justify-center gap-1"
                    >
                        {showHelp ? '收起教程' : '❓ 还是进不去？点我看教程'}
                    </button>

                    {showHelp && (
                        <div className="mt-4 text-left bg-slate-800/50 p-4 rounded-xl text-sm text-slate-300 space-y-2 border border-slate-700/50 animate-fadeIn">
                            <h3 className="font-bold text-white text-xs mb-2">💡 常见问题解决</h3>
                            <ul className="list-disc list-inside space-y-2 text-xs text-slate-400">
                                <li>
                                    <strong className="text-yellow-500">最常见原因：</strong> 网络问题。
                                    <span className="block pl-4 mt-0.5 text-slate-500">
                                        Google 在国内无法直接访问。请确保开启了 VPN，并且开启了<span className="text-white">“全局模式”</span>(Global Mode)。
                                    </span>
                                </li>
                                <li>
                                    <strong>Key 复制错了：</strong>
                                    <span className="block pl-4 mt-0.5 text-slate-500">
                                        请检查复制时有没有多复制空格。系统会自动清除空格，但建议您重新复制一遍。
                                    </span>
                                </li>
                                <li>
                                    <strong>强制进入：</strong>
                                    <span className="block pl-4 mt-0.5 text-slate-500">
                                        如果您确信 Key 没问题，只是验证超时，请点击红色的“强制进入”按钮。
                                    </span>
                                </li>
                            </ul>
                            <div className="mt-2 pt-2 border-t border-slate-700/50">
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="block text-center text-xs text-indigo-400 border border-indigo-500/30 rounded py-2 hover:bg-indigo-500/10">
                                    重新去 Google 申请一个新 Key
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      );
  }

  // --- MAIN APP ---
  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-12 font-sans text-slate-100">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex justify-between items-center border-b border-slate-800 pb-6">
            <div className="flex items-center gap-4">
                 <img src="/logo.png" className="h-12 w-auto filter invert opacity-80" onError={(e) => e.currentTarget.style.display='none'} />
                 <div>
                    <h1 className="text-2xl font-bold text-white">象园长跟拍评级</h1>
                    <p className="text-slate-400 text-sm">Gemini 3 Flash • 智能视觉分析</p>
                 </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
                <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-red-400 underline">退出登录</button>
                <div className="flex gap-3">
                    <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                    <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow-lg flex items-center gap-2">
                        <span>+</span> 导入照片
                    </button>
                </div>
            </div>
        </header>

        <StatsPanel 
            stats={stats} 
            isProcessing={isProcessing}
            groupReport={groupReport}
            generatingReport={generatingReport}
            onStart={() => setIsProcessing(true)}
            onStop={() => setIsProcessing(false)}
            onExport={handleExport}
            onClear={() => { setPhotos([]); setGroupReport(null); setIsProcessing(false); }}
            onGenerateReport={handleGenerateReport}
            queueLength={pendingCount}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {photos.map(photo => (
                <PhotoCard key={photo.id} photo={photo} onRemove={handleRemovePhoto} viewMode={viewMode} />
            ))}
        </div>
      </div>
    </div>
  );

  function handleExport() {
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
      link.setAttribute("download", `ratings_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }
};

export default App;