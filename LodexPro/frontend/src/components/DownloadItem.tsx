import React, { useState, useRef, useEffect } from 'react';
import { models } from '../../wailsjs/go/models';
import { PauseDownload, ResumeDownload, DeleteDownload, OpenFile, OpenFolder, RefreshLink } from '../../wailsjs/go/main/App';

interface Props {
  task: models.DownloadTask;
  selected?: boolean;
  onSelect?: () => void;
  onDelete: () => void;
  onRequestRefresh?: (task: models.DownloadTask) => void;
  onShowDetailed?: (id: string) => void;
}

const DownloadItem: React.FC<Props> = ({ task, selected, onSelect, onDelete, onRequestRefresh, onShowDetailed }) => {
  const [showDetails, setShowDetails] = useState(false);
  const speedHistory = useRef<number[]>([]);
  const progress = task.total_size > 0 ? (task.downloaded_size / task.total_size) * 100 : 0;

  // Track speed history for sparkline
  useEffect(() => {
    if (task.status === 'DOWNLOADING' && task.speed > 10) {
      speedHistory.current = [...speedHistory.current.slice(-19), task.speed];
    }
  }, [task.speed, task.status]);

  // Mini sparkline SVG
  const SparkLine = () => {
    const data = speedHistory.current;
    if (data.length < 2) return null;
    const w = 80, h = 18;
    const max = Math.max(...data);
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (v / max) * (h - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return (
      <svg width={w} height={h} className="inline-block opacity-70" style={{ verticalAlign: 'middle' }}>
        <defs>
          <linearGradient id={`sg-${task.id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#007BFF" />
            <stop offset="100%" stopColor="#00D4FF" />
          </linearGradient>
        </defs>
        <polyline points={pts} fill="none" stroke={`url(#sg-${task.id})`} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 10) return '0 B/s';
    return formatSize(bytesPerSec) + '/s';
  };

  const formatETA = (seconds: number) => {
    if (seconds <= 0 || seconds > 86400 * 30) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleToggle = () => {
    if (task.status === 'DOWNLOADING') {
      PauseDownload(task.id);
    } else {
      ResumeDownload(task.id);
    }
  };

  const handleDelete = () => {
    onDelete();
  };

  return (
    <div onDoubleClick={() => onShowDetailed?.(task.id)} className={`flex items-start space-x-3 bg-white/[0.03] border rounded-2xl p-4 hover:bg-white/[0.06] transition-all duration-300 group cursor-default ${selected ? 'border-xdm-accent/30 bg-xdm-accent/[0.04]' : 'border-white/5'
      }`}>
      {/* Selection Checkbox */}
      <div className={`pt-1 shrink-0 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <input type="checkbox" checked={!!selected} onChange={onSelect}
          className="w-4 h-4 rounded accent-xdm-accent cursor-pointer" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-4 overflow-hidden">
            <div className={`p-2.5 rounded-xl shrink-0 ${task.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400' :
                task.status === 'ERROR' ? 'bg-red-500/10 text-red-400' :
                  task.status === 'QUEUED' ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-xdm-accent/10 text-xdm-accent'
              }`}>
              {task.status === 'COMPLETED' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : task.status === 'QUEUED' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              )}
            </div>
            <div className="truncate">
              <h3 className="text-sm font-semibold text-white/90 truncate group-hover:text-xdm-accent transition-colors leading-tight">{task.filename}</h3>
              <p className="text-[10px] text-gray-500 truncate mt-0.5">{task.url}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 shrink-0">

            {task.status === 'COMPLETED' && (
              <div className="flex space-x-1 mr-2 bg-white/5 p-1 rounded-xl">
                <button
                  onClick={() => OpenFile(task.id)}
                  title="Open File"
                  className="p-1 px-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all text-[10px] font-bold tracking-wider uppercase"
                >
                  Open File
                </button>
                <button
                  onClick={() => OpenFolder(task.id)}
                  title="Open Folder"
                  className="p-1 px-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all text-[10px] font-bold tracking-wider uppercase"
                >
                  Folder
                </button>
              </div>
            )}

            {(task.status === 'PAUSED' || task.status === 'ERROR') && (
              <button
                onClick={() => onRequestRefresh && onRequestRefresh(task)}
                title="Refresh Link"
                className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-xdm-accent transition-all active:scale-90"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            {task.status !== 'COMPLETED' && (
              <button
                onClick={handleToggle}
                className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90"
              >
                {task.status === 'DOWNLOADING' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={handleDelete}
              title="Delete Download"
              className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-red-400 transition-all active:scale-90"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {/* Info toggle */}
            <button onClick={() => onShowDetailed?.(task.id)} title="Detailed Status"
              className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-xdm-accent transition-all active:scale-90">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>

        {task.status !== 'COMPLETED' && (
          <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
            <div
              className={`absolute top-0 left-0 h-full transition-all duration-500 ease-out ${task.status === 'ERROR' ? 'bg-red-500' :
                  task.status === 'QUEUED' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]' :
                    'bg-xdm-accent shadow-[0_0_8px_rgba(0,123,255,0.4)]'
                }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className={`flex items-center justify-between text-[10px] text-gray-500 font-bold tracking-wider uppercase ${task.status === 'COMPLETED' ? 'mt-2' : ''}`}>
          <div className="flex items-center space-x-3">
            {task.status === 'COMPLETED' ? (
              <span className="text-white/40">{formatSize(task.downloaded_size)}</span>
            ) : (
              <>
                <span className="text-white/40">{formatSize(task.downloaded_size)} / {formatSize(task.total_size)}</span>
                <span className={task.status === 'QUEUED' ? 'text-yellow-500/80' : 'text-xdm-accent/80'}>{progress.toFixed(1)}%</span>
              </>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {task.status === 'DOWNLOADING' && (
              <>
                <SparkLine />
                <span className="text-white/60">{formatSpeed(task.speed)}</span>
                <span className="text-white/40">ETA {formatETA(task.eta)}</span>
              </>
            )}
            <span className={`px-2 py-0.5 rounded-md ${task.status === 'COMPLETED' ? 'bg-green-500/10 text-green-500' :
                task.status === 'DOWNLOADING' ? 'bg-xdm-accent/10 text-xdm-accent' :
                  task.status === 'QUEUED' ? 'bg-yellow-500/10 text-yellow-500' :
                    'bg-white/10 text-gray-400'
              }`}>{task.status}</span>
          </div>
        </div>

        {/* Properties Panel */}
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-x-6 gap-y-2 text-[10px]">
            {[
              { label: 'URL', value: task.url },
              { label: 'Save Path', value: task.save_path },
              { label: 'Total Size', value: formatSize(task.total_size) },
              { label: 'Downloaded', value: formatSize(task.downloaded_size) },
              { label: 'Segments', value: task.segments?.length?.toString() || '0' },
              { label: 'Category', value: task.category || 'None' },
              { label: 'Queue', value: task.queue_id || 'main' },
              { label: 'Date Added', value: task.date_created || '--' },
            ].map(row => (
              <div key={row.label} className="flex flex-col">
                <span className="text-gray-600 font-bold uppercase tracking-widest">{row.label}</span>
                <span className="text-gray-400 truncate mt-0.5" title={row.value}>{row.value || '--'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadItem;
