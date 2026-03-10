import React, { useState, useEffect, useMemo, useRef } from 'react';
import { models } from '../../wailsjs/go/models';
import { PauseDownload, ResumeDownload, OpenFile, OpenFolder } from '../../wailsjs/go/main/App';

interface Props {
  task: models.DownloadTask;
  speedHistory: number[];
  onClose: () => void;
  onDelete?: () => void;
}

const MAX_SPARKLINE = 30;

const DetailedProgress: React.FC<Props> = ({ task, speedHistory, onClose, onDelete }) => {
  const [activeTab, setActiveTab] = useState('status');

  const progress = useMemo(() => {
    if (!task.total_size) return 0;
    return (task.downloaded_size / task.total_size) * 100;
  }, [task.downloaded_size, task.total_size]);


  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
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

  // Segment state helpers
  const getSegmentState = (seg: models.Segment) => {
    if (seg.completed) return 'completed';
    if (seg.downloaded_size > 0) return 'active';
    return 'pending';
  };

  const segmentBarColor = (seg: models.Segment) => {
    const state = getSegmentState(seg);
    if (state === 'completed') return 'bg-emerald-500';
    if (state === 'active') return 'bg-gradient-to-r from-blue-500 to-cyan-400';
    return 'bg-white/5';
  };

  const segmentRowColor = (seg: models.Segment) => {
    const state = getSegmentState(seg);
    if (state === 'completed') return 'text-emerald-400';
    if (state === 'active') return 'text-blue-400';
    return 'text-gray-600';
  };

  const segmentLabel = (seg: models.Segment) => {
    const state = getSegmentState(seg);
    if (state === 'completed') return '✓ Complete';
    if (state === 'active') return '⬇ Downloading';
    return '— Waiting';
  };

  // Sparkline SVG
  const SparkLine: React.FC<{ data: number[]; width?: number; height?: number }> = ({
    data, width = 200, height = 40,
  }) => {
    if (data.length < 2) return <span className="text-[10px] text-gray-600">Building chart…</span>;
    const max = Math.max(...data);
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * (height - 4);
      return `${x},${y}`;
    });
    return (
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#007BFF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#007BFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke="url(#spGradLine)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="spGradLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#007BFF" />
            <stop offset="100%" stopColor="#00D4FF" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <polyline
          points={`0,${height} ${pts.join(' ')} ${width},${height}`}
          fill="url(#spGrad)"
          stroke="none"
        />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
        {/* Title Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${task.status === 'DOWNLOADING' ? 'bg-xdm-accent shadow-[0_0_10px_rgba(0,123,255,0.5)] animate-pulse' : task.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-gray-500'}`} />
            <span className="text-sm font-bold text-white pr-4 truncate max-w-md">
              {Math.floor(progress)}% — {task.filename}
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
          {['status', 'graph', 'segments'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-[11px] font-bold uppercase tracking-widest transition-all relative ${activeTab === tab ? 'text-xdm-accent' : 'text-gray-500 hover:text-gray-300'
                }`}
            >
              {tab === 'status' ? 'Status' : tab === 'graph' ? 'Speed Graph' : 'Connections'}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-xdm-accent" />}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar min-h-[300px]">
          {/* STATUS TAB */}
          {activeTab === 'status' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-y-4 gap-x-8 bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                <div className="space-y-1 col-span-2 pb-2 border-b border-white/5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Address</span>
                  <p className="text-xs text-xdm-accent truncate font-mono">{task.url}</p>
                </div>
                {[
                  { label: 'Status', value: task.status === 'DOWNLOADING' ? 'Receiving data…' : task.status, accent: task.status === 'COMPLETED' ? 'text-emerald-400' : task.status === 'ERROR' ? 'text-red-400' : 'text-white' },
                  { label: 'File Size', value: formatSize(task.total_size), accent: 'text-white' },
                  { label: 'Downloaded', value: `${formatSize(task.downloaded_size)} (${progress.toFixed(2)}%)`, accent: 'text-xdm-accent' },
                  { label: 'Transfer Rate', value: formatSpeed(task.speed), accent: 'text-white' },
                  { label: 'Time Left', value: formatETA(task.eta), accent: 'text-white' },
                  { label: 'Resume Capable', value: task.total_size > 0 ? 'Yes' : 'No', accent: task.total_size > 0 ? 'text-emerald-400' : 'text-amber-400' },
                  { label: 'Segments', value: `${task.segments?.length || 0} connections`, accent: 'text-white' },
                  { label: 'Queue', value: task.queue_id || 'main', accent: 'text-white' },
                ].map(({ label, value, accent }) => (
                  <div key={label} className="space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
                    <p className={`text-sm font-bold ${accent}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">
                  <span>Progress</span>
                  <span className="text-white">{progress.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-white/5 border border-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 shadow-[0_0_15px_rgba(0,123,255,0.3)] ${task.status === 'COMPLETED'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-xdm-accent to-blue-400'
                      }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SPEED GRAPH TAB */}
          {activeTab === 'graph' && (
            <div className="space-y-4">
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Live Transfer Rate</span>
                  <span className="text-sm font-bold text-xdm-accent">{formatSpeed(task.speed)}</span>
                </div>
                <div className="w-full h-[120px] flex items-end">
                  <SparkLine data={speedHistory} width={580} height={120} />
                </div>
                <div className="flex justify-between mt-2 text-[9px] text-gray-600 font-mono">
                  <span>oldest</span>
                  <span>now</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Current', value: formatSpeed(task.speed) },
                  { label: 'Peak', value: formatSpeed(Math.max(...speedHistory, 0)) },
                  { label: 'ETA', value: formatETA(task.eta) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</p>
                    <p className="text-sm font-bold text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SEGMENTS TAB */}
          {activeTab === 'segments' && (
            <div className="space-y-4">
              {task.segments && task.segments.length > 0 ? (
                <>
                  {/* Visual segment bar */}
                  <div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Connection Map ({task.segments.length} threads)</span>
                    <div className="h-5 bg-white/[0.03] border border-white/5 rounded-lg flex overflow-hidden mt-2 p-0.5 gap-0.5">
                      {task.segments.map((seg, i) => {
                        const segTotal = seg.end_byte - seg.start_byte;
                        const segPct = segTotal > 0 ? (seg.downloaded_size / segTotal) * 100 : 0;
                        const state = getSegmentState(seg);
                        return (
                          <div key={i} className="flex-1 bg-white/5 h-full relative rounded-sm overflow-hidden">
                            <div
                              className={`absolute inset-y-0 left-0 transition-all duration-500 ${segmentBarColor(seg)} ${state === 'active' ? 'animate-pulse' : ''}`}
                              style={{ width: `${Math.max(segPct, state === 'completed' ? 100 : 0)}%` }}
                            />
                            {/* Divider */}
                            <div className="absolute right-0 top-0 bottom-0 w-px bg-black/40" />
                          </div>
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-2">
                      {[['bg-emerald-500', 'Complete'], ['bg-blue-500', 'Active'], ['bg-white/10', 'Waiting']].map(([cls, label]) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
                          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Connections Table */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                          <th className="px-4 py-2 border-r border-white/5 w-10">#</th>
                          <th className="px-4 py-2 border-r border-white/5">Downloaded</th>
                          <th className="px-4 py-2 border-r border-white/5">Progress</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px]">
                        {task.segments.map((seg, i) => {
                          const segTotal = seg.end_byte - seg.start_byte;
                          const segPct = segTotal > 0 ? ((seg.downloaded_size / segTotal) * 100).toFixed(0) : '0';
                          return (
                            <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-2.5 border-r border-white/5 text-gray-600 font-mono">{i + 1}</td>
                              <td className="px-4 py-2.5 border-r border-white/5 text-gray-300 font-mono">{formatSize(seg.downloaded_size)}</td>
                              <td className="px-4 py-2.5 border-r border-white/5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${segmentBarColor(seg)}`}
                                      style={{ width: `${seg.completed ? 100 : segPct}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] font-mono text-gray-500 w-7 text-right">{seg.completed ? 100 : segPct}%</span>
                                </div>
                              </td>
                              <td className={`px-4 py-2.5 font-semibold ${segmentRowColor(seg)}`}>{segmentLabel(seg)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-gray-600">
                  <p className="text-sm">No segment data available</p>
                  <p className="text-xs mt-1">YouTube downloads use a single connection</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {task.status === 'COMPLETED' && (
              <>
                <button
                  onClick={() => OpenFile(task.id)}
                  className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold transition-all border border-emerald-500/20 active:scale-95"
                >
                  Open File
                </button>
                <button
                  onClick={() => OpenFolder(task.id)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold transition-all border border-white/10 active:scale-95"
                >
                  Open Folder
                </button>
              </>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {task.status !== 'COMPLETED' && (
              <button
                onClick={() => task.status === 'DOWNLOADING' ? PauseDownload(task.id) : ResumeDownload(task.id)}
                className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-all border border-white/10 active:scale-95"
              >
                {task.status === 'DOWNLOADING' ? '⏸ Pause' : '▶ Resume'}
              </button>
            )}
            <button
              onClick={() => onDelete?.()}
              className="px-5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold transition-all border border-red-500/20 active:scale-95"
            >
              Delete
            </button>
            <button onClick={onClose} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 transition-all border border-white/10 active:scale-95">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailedProgress;
