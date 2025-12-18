import React from 'react';
import { PhotoData, Rating, ProcessStatus } from '../types';

interface PhotoCardProps {
  photo: PhotoData;
  onRemove: (id: string) => void;
  viewMode: 'grid' | 'list';
}

const PhotoCard: React.FC<PhotoCardProps> = ({ photo, onRemove, viewMode }) => {
  
  const getBorderColor = (rating: Rating, status: ProcessStatus) => {
    if (status === ProcessStatus.Processing) return 'border-blue-500 animate-pulse';
    if (status === ProcessStatus.Error) return 'border-red-500';
    if (status === ProcessStatus.Idle || status === ProcessStatus.Pending) return 'border-slate-700';
    
    switch (rating) {
      case Rating.S: return 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.2)]';
      case Rating.A: return 'border-purple-400';
      case Rating.B: return 'border-slate-600';
      default: return 'border-slate-700';
    }
  };

  const getBadgeColor = (rating: Rating) => {
    switch (rating) {
      case Rating.S: return 'bg-yellow-500 text-yellow-950';
      case Rating.A: return 'bg-purple-500 text-purple-100';
      case Rating.B: return 'bg-slate-600 text-slate-200';
      default: return 'bg-slate-700 text-slate-400';
    }
  };

  const getRatingTooltip = (rating: Rating) => {
    switch (rating) {
      case Rating.S: return "🌟 S级 (大师作)：情绪饱满，光影绝佳，无需修饰";
      case Rating.A: return "✨ A级 (优秀片)：表情自然，构图工整，客户满意";
      case Rating.B: return "📷 B级 (标准片)：记录清晰，姿态常规，质量达标";
      case Rating.Unrated: return "等待 AI 分析中...";
      case Rating.Rejected: return "废片";
      default: return "";
    }
  };

  // Helper to render the badge with tooltip
  const renderBadge = () => (
    <div className="relative group/badge inline-block cursor-help">
      <span className={`text-xs font-bold px-2 py-0.5 rounded shadow-sm ${getBadgeColor(photo.rating)}`}>
        {photo.status === ProcessStatus.Completed ? photo.rating : '...'}
      </span>
      
      {/* Tooltip - Adjusted position based on viewMode inside the render logic mostly, 
          but generic top position works for both usually. */}
      {photo.status === ProcessStatus.Completed && (
        <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg text-xs text-slate-200 shadow-xl opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-30 text-left leading-relaxed">
          {getRatingTooltip(photo.rating)}
          {/* Arrow */}
          <div className="absolute -bottom-1 left-2 w-2 h-2 bg-slate-900 border-r border-b border-slate-700 rotate-45"></div>
        </div>
      )}
    </div>
  );

  // --- LIST VIEW ---
  if (viewMode === 'list') {
    return (
      <div className={`flex items-center gap-4 bg-slate-800/80 p-3 rounded-xl border transition-all hover:bg-slate-800 ${getBorderColor(photo.rating, photo.status)}`}>
        {/* Thumbnail */}
        <div className="relative w-24 h-24 flex-shrink-0 bg-slate-900 rounded-lg overflow-hidden">
          <img 
            src={photo.previewUrl} 
            alt="Thumbnail" 
            className="w-full h-full object-cover"
          />
          {photo.status === ProcessStatus.Processing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div className="flex items-center gap-3">
             {/* Replaced raw span with renderBadge for tooltip support */}
             <div className="relative group/badge cursor-help">
                <span className={`text-sm font-bold px-3 py-1 rounded-md shadow-sm ${getBadgeColor(photo.rating)}`}>
                  {photo.status === ProcessStatus.Completed ? photo.rating : 'Pending'}
                </span>
                {photo.status === ProcessStatus.Completed && (
                  <div className="absolute bottom-full left-0 mb-2 w-52 p-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg text-xs text-slate-200 shadow-xl opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-30">
                    {getRatingTooltip(photo.rating)}
                    <div className="absolute -bottom-1 left-4 w-2 h-2 bg-slate-900 border-r border-b border-slate-700 rotate-45"></div>
                  </div>
                )}
             </div>
             
            <span className="text-slate-300 font-medium truncate text-sm">{photo.file.name}</span>
          </div>
          
          <p className="text-sm text-slate-400 leading-relaxed mt-1">
             {photo.status === ProcessStatus.Completed ? photo.reason : 
              (photo.status === ProcessStatus.Error ? "评级失败" : "等待处理...")}
          </p>
        </div>

        {/* Actions */}
        <button 
          onClick={() => onRemove(photo.id)}
          className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700/50 rounded-lg transition-colors"
          title="移除照片"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    );
  }

  // --- GRID VIEW (Default) ---
  return (
    <div className={`relative group rounded-xl overflow-hidden border-2 bg-slate-800 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${getBorderColor(photo.rating, photo.status)}`}>
      
      {/* Image Thumbnail */}
      <div className="aspect-[3/4] overflow-hidden bg-slate-900 relative">
        <img 
          src={photo.previewUrl} 
          alt="Thumbnail" 
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        
        {/* Loading Overlay */}
        {photo.status === ProcessStatus.Processing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Status Overlay for queued items */}
        {photo.status === ProcessStatus.Pending && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs font-mono text-white bg-black/60 px-2 py-1 rounded backdrop-blur-sm">等待评级</span>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="p-3 bg-slate-800">
        <div className="flex justify-between items-center mb-2">
          {renderBadge()}
          <button 
            onClick={() => onRemove(photo.id)}
            className="text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            title="Remove photo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <p className="text-[10px] text-slate-400 leading-tight line-clamp-2 h-8" title={photo.reason}>
          {photo.status === ProcessStatus.Completed ? photo.reason : photo.file.name}
        </p>
      </div>
    </div>
  );
};

export default PhotoCard;