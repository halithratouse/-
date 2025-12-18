import React, { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PhotoData, Rating, ProcessStatus, BatchStats, GroupReport } from './types';
import { ratePhotoWithGemini, generateGroupReport } from './services/geminiService';
import PhotoCard from './components/PhotoCard';
import StatsPanel from './components/StatsPanel';

// Constants
// Increased to 5 as requested. 
// Note: High concurrency may hit API rate limits; built-in retry logic in geminiService handles this.
const MAX_CONCURRENCY = 5; 

const App: React.FC = () => {
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [groupReport, setGroupReport] = useState<GroupReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // New view mode state
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Calculate statistics
  const stats: BatchStats = {
    total: photos.length,
    processed: photos.filter(p => p.status === ProcessStatus.Completed || p.status === ProcessStatus.Error).length,
    s_count: photos.filter(p => p.rating === Rating.S).length,
    a_count: photos.filter(p => p.rating === Rating.A).length,
    b_count: photos.filter(p => p.rating === Rating.B).length,
  };

  const pendingCount = photos.filter(p => p.status === ProcessStatus.Pending).length;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      // Explicitly cast to File[] to avoid 'unknown' type inference issues
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
      setGroupReport(null); // Reset report when adding new photos
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      return prev.filter(p => p.id !== id);
    });
  };

  const handleClearAll = () => {
    // UI confirmation is now handled in StatsPanel.
    // We simply execute the clearing logic here.
    if (photos.length === 0) return;
    
    // Cleanup memory
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setGroupReport(null);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExport = () => {
    // Generate CSV
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
  
  // Revised Processing Logic
  // We use a robust queue system with a useEffect that watches the lists.
  
  // Track ongoing operations to avoid duplicates
  const processingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isProcessing) {
        processingRef.current.clear();
        return;
    }

    const processQueue = async () => {
        // 1. Check if we need to schedule new items
        const currentProcessing = photos.filter(p => p.status === ProcessStatus.Processing);
        const currentPending = photos.filter(p => p.status === ProcessStatus.Pending);

        // If nothing left to do
        if (currentProcessing.length === 0 && currentPending.length === 0) {
            setIsProcessing(false);
            return;
        }

        // 2. Launch new tasks if slots available
        const slotsFree = MAX_CONCURRENCY - currentProcessing.length;
        
        if (slotsFree > 0 && currentPending.length > 0) {
            const nextBatch = currentPending.slice(0, slotsFree);
            
            // Mark as processing in state
            setPhotos(prev => prev.map(p => 
                nextBatch.find(n => n.id === p.id) 
                ? { ...p, status: ProcessStatus.Processing } 
                : p
            ));
            
            // Initiate API calls
            nextBatch.forEach(photo => {
                if (processingRef.current.has(photo.id)) return;
                processingRef.current.add(photo.id);

                ratePhotoWithGemini(photo.file).then(result => {
                    setPhotos(prev => prev.map(p => {
                        if (p.id !== photo.id) return p;
                        return {
                            ...p,
                            rating: result.rating,
                            reason: result.reason,
                            status: ProcessStatus.Completed
                        };
                    }));
                }).catch(() => {
                   setPhotos(prev => prev.map(p => {
                        if (p.id !== photo.id) return p;
                        return {
                            ...p,
                            status: ProcessStatus.Error,
                            reason: "Network error"
                        };
                    }));
                }).finally(() => {
                    processingRef.current.delete(photo.id);
                });
            });
        }
    };

    // Run the loop
    const interval = setInterval(processQueue, 1000); // Check every 1s
    return () => clearInterval(interval);

  }, [photos, isProcessing]);


  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-12 font-sans text-slate-100">
      <div className="max-w-7xl mx-auto">
        
        {/* Header with Logo */}
        <header className="mb-10 flex flex-col md:flex-row justify-between items-end border-b border-slate-800 pb-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left w-full md:w-auto">
            
            {/* Logo Container - Assumes logo.png is in public folder or user replaces src */}
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative bg-slate-950 rounded-lg p-2 border border-slate-800">
                    {/* INVERT FILTER added to make black logo white */}
                    <img 
                        src="/logo.png" 
                        alt="ROKRIO 象园长跟拍" 
                        className="h-16 w-auto object-contain filter invert brightness-200 opacity-90"
                        onError={(e) => {
                            // Fallback if image not found to text
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                     {/* Fallback text if logo fails to load (user has not added file yet) */}
                     <span className="hidden text-2xl font-black tracking-tighter" style={{display: 'none'}}>ROKRIO</span>
                </div>
            </div>

            <div className="flex flex-col justify-center h-full pt-1">
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                象园长跟拍评级系统
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                专注长隆旅拍 · 氛围感与情绪捕捉 · 智能筛选助手
              </p>
            </div>
          </div>
          
          <div className="mt-6 md:mt-0 flex gap-4 w-full md:w-auto justify-center md:justify-end">
             <input 
              type="file" 
              multiple 
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              导入新照片 ({photos.length})
            </button>
          </div>
        </header>

        {/* Stats & Controls */}
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

        {/* View Toggles & Content Area */}
        {photos.length > 0 && (
            <div className="mb-6 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-slate-300">
                    照片列表 <span className="text-slate-500 text-sm font-normal ml-2">(共 {photos.length} 张)</span>
                </h2>
                
                {/* View Switcher */}
                <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex gap-1">
                    <button 
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        title="网格视图"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                    </button>
                    <button 
                         onClick={() => setViewMode('list')}
                         className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                         title="列表视图 (详细)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
            </div>
        )}

        {/* Empty State */}
        {photos.length === 0 && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 rounded-2xl h-96 flex flex-col items-center justify-center text-slate-500 hover:border-indigo-500 hover:text-indigo-400 hover:bg-slate-900/50 transition-all cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xl font-medium">点击或拖拽照片至此处</p>
            <p className="text-sm mt-2 opacity-70">支持 JPG, PNG, WebP (建议单次 50-100 张)</p>
          </div>
        )}

        {/* Photo List / Grid */}
        <div className={viewMode === 'grid' 
            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" 
            : "flex flex-col gap-3 max-w-4xl mx-auto"
        }>
          {photos.map(photo => (
            <PhotoCard 
              key={photo.id} 
              photo={photo} 
              onRemove={handleRemovePhoto} 
              viewMode={viewMode}
            />
          ))}
        </div>
        
        {/* Footer info */}
        {photos.length > 0 && (
           <div className="mt-12 text-center text-slate-600 text-xs pb-8">
             <p>AI 评级仅供参考，请以人工复核为准。</p>
             <p className="mt-1">Powered by Google Gemini Vision</p>
           </div>
        )}

      </div>
    </div>
  );
};

export default App;