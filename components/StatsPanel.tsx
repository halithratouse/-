import React, { useState, useEffect } from 'react';
import { BatchStats, GroupReport } from '../types';

interface StatsPanelProps {
  stats: BatchStats;
  isProcessing: boolean;
  groupReport: GroupReport | null;
  onStart: () => void;
  onStop: () => void;
  onExport: () => void;
  onClear: () => void;
  onGenerateReport: () => void;
  queueLength: number;
  generatingReport: boolean;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ 
    stats, 
    isProcessing, 
    groupReport,
    onStart, 
    onStop, 
    onExport, 
    onClear, 
    onGenerateReport,
    queueLength,
    generatingReport
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const percentage = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;
  const isFinished = stats.total > 0 && stats.processed === stats.total;

  // Auto-reset confirmation state after 3 seconds if not clicked
  useEffect(() => {
    if (confirmClear) {
        const timer = setTimeout(() => setConfirmClear(false), 3000);
        return () => clearTimeout(timer);
    }
  }, [confirmClear]);

  return (
    <div className="space-y-6 mb-8">
    
      {/* Main Stats Card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          
          {/* Progress Section */}
          <div className="flex-1 w-full">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>处理进度 ({stats.processed}/{stats.total})</span>
              <span>{percentage}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>

          {/* Counters */}
          <div className="flex gap-4">
            <div className="text-center px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="text-2xl font-bold text-yellow-400">{stats.s_count}</div>
              <div className="text-xs text-slate-400 font-bold">S 级 (精选)</div>
            </div>
            <div className="text-center px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="text-2xl font-bold text-purple-400">{stats.a_count}</div>
              <div className="text-xs text-slate-400 font-bold">A 级 (优秀)</div>
            </div>
            <div className="text-center px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
              <div className="text-2xl font-bold text-blue-400">{stats.b_count}</div>
              <div className="text-xs text-slate-400 font-bold">B 级 (达标)</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap justify-center">
            {!isProcessing && queueLength > 0 && (
              <button 
                onClick={onStart}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/30 transition-all active:scale-95 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                开始评级
              </button>
            )}

            {isProcessing && (
              <button 
                onClick={onStop}
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg shadow-lg shadow-red-500/30 transition-all active:scale-95 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
                停止
              </button>
            )}

            <button 
              onClick={onExport}
              disabled={stats.processed === 0}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/30 transition-all active:scale-95 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              导出 CSV
            </button>

            {/* Next Group Button with 2-step confirmation */}
            {confirmClear ? (
               <button 
                  onClick={() => { onClear(); setConfirmClear(false); }}
                  className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg shadow-red-500/30 transition-all active:scale-95 flex items-center gap-2 animate-pulse"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  确定清除?
                </button>
            ) : (
                <button 
                  onClick={() => setConfirmClear(true)}
                  disabled={stats.total === 0 || isProcessing}
                  className="px-6 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg shadow-slate-500/30 transition-all active:scale-95 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  下一组
                </button>
            )}
          </div>
        </div>
      </div>

      {/* Group Report Section */}
      {(isFinished && !groupReport && !generatingReport) && (
        <div className="text-center">
            <button 
                onClick={onGenerateReport}
                className="group relative inline-flex items-center justify-center px-8 py-3 text-lg font-bold text-white transition-all duration-200 bg-gradient-to-r from-pink-600 to-purple-600 rounded-full hover:from-pink-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600 focus:ring-offset-slate-900"
            >
                <span className="absolute inset-0 w-full h-full -mt-1 rounded-full opacity-30 bg-gradient-to-r from-pink-600 to-purple-600 blur-lg group-hover:opacity-50 animate-pulse"></span>
                <span className="relative flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    生成整组客片分析报告
                </span>
            </button>
        </div>
      )}
      
      {generatingReport && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 text-center animate-pulse">
              <div className="inline-block w-12 h-12 mb-4 border-4 border-t-purple-500 border-slate-600 rounded-full animate-spin"></div>
              <p className="text-lg font-medium text-slate-300">象园长正在分析整组数据...</p>
          </div>
      )}

      {groupReport && (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600 rounded-xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <svg className="w-48 h-48 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
            
            <div className="relative z-10">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                    
                    {/* Grade Badge */}
                    <div className="flex-shrink-0 mx-auto md:mx-0">
                        <div className={`w-32 h-32 flex items-center justify-center rounded-full border-4 shadow-[0_0_30px_rgba(0,0,0,0.3)] 
                            ${groupReport.overallGrade === 'S' ? 'bg-yellow-500/20 border-yellow-400 text-yellow-400' : 
                              groupReport.overallGrade === 'A' ? 'bg-purple-500/20 border-purple-400 text-purple-400' : 
                              'bg-blue-500/20 border-blue-400 text-blue-400'}`}>
                            <span className="text-6xl font-black">{groupReport.overallGrade}</span>
                        </div>
                        <p className="text-center mt-3 font-bold text-slate-400 uppercase tracking-widest text-sm">综合评级</p>
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-6">
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                <span className="text-2xl">📋</span> 分析总结
                            </h3>
                            <p className="text-slate-300 leading-relaxed text-lg">{groupReport.summary}</p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-emerald-900/20 border border-emerald-900/50 rounded-lg p-4">
                                <h4 className="font-bold text-emerald-400 mb-2 flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    高光时刻
                                </h4>
                                <ul className="list-disc list-inside text-slate-300 space-y-1 text-sm">
                                    {groupReport.strengths.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>

                            <div className="bg-rose-900/20 border border-rose-900/50 rounded-lg p-4">
                                <h4 className="font-bold text-rose-400 mb-2 flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    改进建议
                                </h4>
                                <ul className="list-disc list-inside text-slate-300 space-y-1 text-sm">
                                    {groupReport.improvements.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default StatsPanel;