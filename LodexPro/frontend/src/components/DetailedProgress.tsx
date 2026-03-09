import React, { useState, useEffect, useMemo } from 'react';
import { models } from '../../wailsjs/go/models';
import { PauseDownload, ResumeDownload, DeleteDownload } from '../../wailsjs/go/main/App';

interface Props {
  task: models.DownloadTask;
  onClose: () => void;
  onDelete?: () => void;
}

const DetailedProgress: React.FC<Props> = ({ task, onClose, onDelete }) => {
  const [activeTab, setActiveTab] = useState('status');

  const progress = useMemo(() => {
    if (!task.total_size) return 0;
    return (task.downloaded_size / task.total_size) * 100;
  }, [task.downloaded_size, task.total_size]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec) return '0 B/s';
    return formatSize(bytesPerSec) + '/s';
  };

  const formatETA = (seconds: number) => {
    if (!seconds || seconds === Infinity) return 'Unknown';
    if (seconds < 0) return 'Calculating...';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full animate-pulse ${task.status === 'DOWNLOADING' ? 'bg-xdm-accent shadow-[0_0_10px_rgba(0,123,255,0.5)]' : 'bg-gray-500'}`} />
            <span className="text-sm font-bold text-white pr-4 truncate max-w-md">
              {Math.floor(progress)}% {task.filename}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-white/5 space-x-6">
          {['status', 'speed', 'options'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-[11px] font-bold uppercase tracking-widest transition-all relative ${
                activeTab === tab ? 'text-xdm-accent' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab === 'status' ? 'Download Status' : tab === 'speed' ? 'Speed Limiter' : 'Post-Action'}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-xdm-accent" />
              )}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'status' && (
            <div className="space-y-6">
              {/* Main Stats Grid */}
              <div className="grid grid-cols-2 gap-y-4 gap-x-8 bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                <div className="space-y-1 col-span-2 pb-2 border-b border-white/5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Address</span>
                    <p className="text-xs text-xdm-accent truncate font-mono">{task.url}</p>
                </div>
                
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</span>
                  <p className="text-sm font-bold text-white">{task.status === 'DOWNLOADING' ? 'Receiving data...' : task.status}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">File Size</span>
                  <p className="text-sm font-bold text-white">{formatSize(task.total_size)}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Downloaded</span>
                  <p className="text-sm font-bold text-white">
                    {formatSize(task.downloaded_size)} <span className="text-xdm-accent ml-1 text-xs">({progress.toFixed(2)}%)</span>
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Transfer Rate</span>
                  <p className="text-sm font-bold text-white">{formatSpeed(task.speed)}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Time Left</span>
                  <p className="text-sm font-bold text-white">{formatETA(task.eta)}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Resume Capability</span>
                  <p className={`text-sm font-bold ${task.total_size > 0 ? 'text-green-500' : 'text-amber-500'}`}>
                    {task.total_size > 0 ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                    <span>Progress</span>
                    <span className="text-white">{progress.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-white/5 border border-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-xdm-accent to-blue-400 shadow-[0_0_15px_rgba(0,123,255,0.3)] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Connection Segments Visualization */}
              {task.segments && task.segments.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">Network Connections ({task.segments.length})</span>
                  <div className="h-4 bg-white/[0.03] border border-white/5 rounded-md flex overflow-hidden p-0.5 space-x-0.5">
                    {task.segments.map((seg, i) => {
                      const segTotal = seg.end_byte - seg.start_byte;
                      const segProgress = segTotal > 0 ? (seg.downloaded_size / segTotal) * 100 : 0;
                      return (
                        <div key={i} className="flex-1 bg-white/5 h-full relative group">
                          <div 
                            className="absolute inset-0 bg-blue-600/60 transition-all duration-500"
                            style={{ width: `${segProgress}%` }}
                          />
                          {/* Segment Dividers (IDM style red lines) */}
                          <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-red-500/30" />
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Detailed Connections Table */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden mt-4">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                <th className="px-4 py-2 border-r border-white/5">N.</th>
                                <th className="px-4 py-2 border-r border-white/5">Downloaded</th>
                                <th className="px-4 py-2">Status</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px]">
                            {task.segments.map((seg, i) => (
                                <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-2 border-r border-white/5 text-gray-500 font-mono">{i + 1}</td>
                                    <td className="px-4 py-2 border-r border-white/5 text-gray-300 font-mono">{formatSize(seg.downloaded_size)}</td>
                                    <td className="px-4 py-2 text-xdm-accent font-medium">{seg.completed ? 'Finished' : 'Receiving data...'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-end space-x-3">
          <button 
            onClick={() => task.status === 'DOWNLOADING' ? PauseDownload(task.id) : ResumeDownload(task.id)}
            className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-all border border-white/10 active:scale-95"
          >
            {task.status === 'DOWNLOADING' ? 'Pause' : 'Resume'}
          </button>
          <button 
            onClick={() => onDelete?.()}
            className="px-6 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold transition-all border border-red-500/20 active:scale-95"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DetailedProgress;
