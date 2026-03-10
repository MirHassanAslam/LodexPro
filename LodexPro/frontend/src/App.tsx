import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import DownloadItem from './components/DownloadItem';
import NewDownloadDialog from './components/NewDownloadDialog';
import SchedulerView from './components/SchedulerView';
import { models } from '../wailsjs/go/models';
import * as Events from '../wailsjs/runtime/runtime';
import { AddDownload, GetDownloads, CheckDependencies, ReadClipboard, OpenInBrowser, RefreshLink, ResumeDownload, PauseDownload, DeleteDownload, GetConfig, CheckForUpdates, InstallDependency, ExportDownloads, ImportDownloads, GetVersion, RegisterBrowserExtension, GetExtensionInfo, PackageExtension } from '../wailsjs/go/main/App';
import SettingsView from './components/SettingsView';
import MediaGrabberView from './components/MediaGrabberView';
import CompletionNotification from './components/CompletionNotification';
import DetailedProgress from './components/DetailedProgress';
import DeleteConfirmationDialog from './components/DeleteConfirmationDialog';

type StatusTab = 'all' | 'active' | 'completed';
type SortKey = 'name' | 'size' | 'date' | 'status';
type SortDir = 'asc' | 'desc';

function App() {
  const [downloads, setDownloads] = useState<models.DownloadTask[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [interceptedUrl, setInterceptedUrl] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [deps, setDeps] = useState<{ [key: string]: boolean }>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [clipboardMonitoring, setClipboardMonitoring] = useState(false);
  const [activeTab, setActiveTab] = useState<StatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailedTaskId, setDetailedTaskId] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string> | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{ available: boolean; latest: string; url: string } | null>(null);
  const [installingDep, setInstallingDep] = useState<string | null>(null);
  const [depProgress, setDepProgress] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Ref for clipboard to avoid dependency hell
  const lastClipboardRef = React.useRef('');
  const refreshingTaskRef = React.useRef<models.DownloadTask | null>(null);
  const [refreshingTask, setRefreshingTaskState] = useState<models.DownloadTask | null>(null);
  // Speed history map persists across DetailedProgress open/close cycles
  const speedHistoryMap = React.useRef<Map<string, number[]>>(new Map());
  const [appVersion, setAppVersion] = useState('v2.0.0');

  const setRefreshingTask = (task: models.DownloadTask | null) => {
    refreshingTaskRef.current = task;
    setRefreshingTaskState(task);
  };

  // Play a soft completion chime using Web Audio API (no audio file needed)
  const playCompletionSound = () => {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      gain.connect(ctx.destination);
      // Two-tone chime: 880Hz then 1100Hz
      [880, 1100].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.5);
      });
    } catch { }
  };

  useEffect(() => {
    // Load initial downloads
    let interval: any;
    if (clipboardMonitoring) {
      interval = setInterval(async () => {
        try {
          const text = await ReadClipboard();
          if (text && text !== lastClipboardRef.current) {
            lastClipboardRef.current = text;

            if (refreshingTaskRef.current) {
              // We are waiting for a refresh!
              handleAddRefresh(refreshingTaskRef.current.id, text);
            } else {
              setInterceptedUrl(text);
              setIsAdding(true);
            }
          }
        } catch (e) {
          // Ignore
        }
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [clipboardMonitoring]);

  useEffect(() => {
    GetDownloads().then(data => { setDownloads(data || []); });
    CheckDependencies().then(setDeps);
    GetVersion().then(setAppVersion);

    // Load saved config and apply settings that the frontend manages
    GetConfig().then(cfg => {
      if (cfg) setClipboardMonitoring(cfg.monitor_clipboard);
    });

    // Check for updates after a short delay (non-blocking)
    setTimeout(() => {
      CheckForUpdates().then(info => {
        if (info?.available) setUpdateInfo({ available: true, latest: info.latest, url: info.url });
      }).catch(() => { });
    }, 4000);

    // Listen for dependency install progress
    const depOff = Events.EventsOn('dependency-progress', (data: any) => {
      setDepProgress(Math.round((data.progress || 0) * 100));
      if (data.done) {
        setInstallingDep(null);
        setDepProgress(0);
        CheckDependencies().then(setDeps);
      }
    });

    // Listen for progress updates
    const progressOff = Events.EventsOn("download-progress", (data: models.DownloadTask) => {
      setDownloads(prev => {
        const index = prev.findIndex(d => d.id === data.id);
        const oldStatus = index !== -1 ? prev[index].status : null;

        // Piece 3: Play sound when transition to COMPLETED
        if (data.status === 'COMPLETED' && oldStatus !== 'COMPLETED' && oldStatus !== null) {
          playCompletionSound();
        }

        // Piece 4: Accumulate speed history
        if (data.status === 'DOWNLOADING') {
          const history = speedHistoryMap.current.get(data.id) || [];
          const newHistory = [...history.slice(-59), data.speed]; // Keep last 60 points
          speedHistoryMap.current.set(data.id, newHistory);
        } else if (data.status === 'COMPLETED' || data.status === 'ERROR') {
          // Cleanup history for finished tasks
          // speedHistoryMap.current.delete(data.id); 
        }

        if (index === -1) return [data, ...prev];
        const newDownloads = [...prev];
        newDownloads[index] = data;
        return newDownloads;
      });
    });

    // Listen for new intercepted downloads
    const interceptOff = Events.EventsOn("new-download-request", (data: any) => {
      console.log("New download request:", data);
      if (data.url) {
        if (refreshingTaskRef.current) {
          handleAddRefresh(refreshingTaskRef.current.id, data.url);
        } else {
          setInterceptedUrl(data.url);
          setIsAdding(true);
        }
      }
    });

    const avOff = Events.EventsOn("antivirus-scan-result", (data: any) => {
      if (data.result.status === 'INFECTED') {
        alert("🚨 THREAT DETECTED!\n\nFile: " + data.result.file_path + "\n\nThe file may be malicious. Please check with your antivirus.");
      }
    });

    return () => {
      progressOff();
      interceptOff();
      depOff();
      avOff();
    };
  }, []);

  const handleAddDownload = (url: string, filename: string, savePath: string, formatId: string = '', queueId: string = 'main', startNow: boolean = true) => {
    AddDownload(url, filename, savePath, formatId, queueId, startNow).then((task: models.DownloadTask) => {
      setDownloads(prev => [task, ...prev]);
      setIsAdding(false);
      setInterceptedUrl('');
      if (startNow) {
        setDetailedTaskId(task.id);
      }
    }).catch(err => {
      console.error("Failed to add download:", err);
      setIsAdding(false);
      setInterceptedUrl('');
    });
  };

  const handleAddRefresh = (id: string, newUrl: string) => {
    RefreshLink(id, newUrl).then(() => {
      ResumeDownload(id);
      setRefreshingTask(null);
    }).catch(err => {
      console.error("Failed to refresh:", err);
      alert("Failed to refresh link: " + err);
    });
  };

  const removeTaskFromState = (id: string) => {
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  // O(n) filter pipeline: category → status tab → search → sort
  const processedDownloads = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    let result = downloads;

    // Category filter
    if (activeCategory !== 'all') {
      result = result.filter(d => d.category === activeCategory);
    }

    // Status tab filter
    if (activeTab === 'active') {
      result = result.filter(d => d.status !== 'COMPLETED');
    } else if (activeTab === 'completed') {
      result = result.filter(d => d.status === 'COMPLETED');
    }

    // Search filter
    if (searchLower) {
      result = result.filter(d => d.filename.toLowerCase().includes(searchLower));
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * a.filename.localeCompare(b.filename);
        case 'size': return dir * ((a.total_size || 0) - (b.total_size || 0));
        case 'date': return dir * ((a.date_created || '').localeCompare(b.date_created || ''));
        case 'status': return dir * (a.status || '').localeCompare(b.status || '');
        default: return 0;
      }
    });

    return result;
  }, [downloads, activeCategory, activeTab, searchQuery, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = processedDownloads.map(d => d.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const bulkPause = () => selectedIds.forEach(id => PauseDownload(id));
  const bulkResume = () => selectedIds.forEach(id => ResumeDownload(id));

  const handleConfirmDelete = async (deleteFiles: boolean) => {
    if (!deletingIds) return;

    // Batch process to avoid hanging UI
    const ids = Array.from(deletingIds);
    setDeletingIds(null);
    setSelectedIds(new Set());

    // Use for...of to process sequentially but without blocking the main thread
    for (const id of ids) {
      try {
        await DeleteDownload(id, deleteFiles);
        removeTaskFromState(id);
      } catch (err) {
        console.error(`Failed to delete ${id}:`, err);
      }
    }
  };

  const statusTabs: { id: StatusTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: downloads.filter(d => activeCategory === 'all' || d.category === activeCategory).length },
    { id: 'active', label: 'In Progress', count: downloads.filter(d => d.status !== 'COMPLETED' && (activeCategory === 'all' || d.category === activeCategory)).length },
    { id: 'completed', label: 'Completed', count: downloads.filter(d => d.status === 'COMPLETED' && (activeCategory === 'all' || d.category === activeCategory)).length },
  ];

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '';

  return (
    <div className="flex h-screen bg-xdm-dark text-white overflow-hidden font-sans selection:bg-xdm-accent/30 relative">
      <Sidebar
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Dep install progress overlay */}
      {installingDep && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[#141414] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <p className="text-sm font-bold text-white mb-1">Installing {installingDep}…</p>
            <p className="text-xs text-gray-400 mb-4">Downloading from official source</p>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded-full transition-all duration-300" style={{ width: `${depProgress}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-right">{depProgress}%</p>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsView
          onClose={() => setShowSettings(false)}
          clipboardMonitoring={clipboardMonitoring}
          setClipboardMonitoring={setClipboardMonitoring}
        />
      )}

      {showScheduler && (
        <SchedulerView onClose={() => setShowScheduler(false)} />
      )}

      {refreshingTask && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-[#1a1a1a] border border-xdm-accent/50 rounded-2xl shadow-[0_0_30px_rgba(0,123,255,0.2)] overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                <svg className="w-8 h-8 text-xdm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white mb-2">LodexPro is waiting...</h2>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                Copy the new download address for <strong>{refreshingTask.filename}</strong> or start the download again in your browser. LodexPro will automatically capture it and resume your download.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => OpenInBrowser(refreshingTask.url)}
                  className="px-6 py-2.5 rounded-xl bg-xdm-accent hover:bg-blue-600 text-sm font-bold text-white transition-all w-full shadow-[0_0_15px_rgba(0,123,255,0.3)]"
                >
                  Open Original Page in Browser
                </button>
                <button
                  onClick={() => setRefreshingTask(null)}
                  className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-gray-400 transition-all w-full"
                >
                  Stop Waiting / Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdding && (
        <NewDownloadDialog
          initialUrl={interceptedUrl}
          onAdd={handleAddDownload}
          onCancel={() => {
            setIsAdding(false);
            setInterceptedUrl('');
          }}
        />
      )}

      <CompletionNotification />

      {detailedTaskId && (
        <DetailedProgress
          task={downloads.find(d => d.id === detailedTaskId)!}
          speedHistory={speedHistoryMap.current.get(detailedTaskId) || []}
          onClose={() => setDetailedTaskId(null)}
          onDelete={() => {
            setDeletingIds(new Set([detailedTaskId]));
            setDetailedTaskId(null);
          }}
        />
      )}

      {deletingIds && (
        <DeleteConfirmationDialog
          count={deletingIds.size}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingIds(null)}
        />
      )}

      {activeCategory === 'media-grabber' ? (
        <MediaGrabberView onDownload={(url) => {
          setInterceptedUrl(url);
          setIsAdding(true);
        }} />
      ) : (
        <main className="flex-1 flex flex-col min-w-0 bg-[#0c0c0c]">
          {/* Header Row 1: Title + Actions */}
          <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-white/[0.02] backdrop-blur-xl shrink-0">
            <div className="flex items-center space-x-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
                {activeCategory === 'all' ? 'Downloads' : activeCategory}
              </h2>
              <span className="text-[10px] font-bold text-gray-600 bg-white/5 px-2 py-0.5 rounded-lg">
                {appVersion}
              </span>
              {/* Update available banner */}
              {updateInfo?.available && (
                <div className="flex items-center space-x-2 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-lg">
                  <span className="text-[10px] font-bold text-green-400">⬆ v{updateInfo.latest} available</span>
                  <button onClick={() => OpenInBrowser(updateInfo.url)} className="text-[10px] font-bold text-green-300 hover:text-green-100 underline">Download</button>
                  <button onClick={() => setUpdateInfo(null)} className="text-gray-600 hover:text-gray-400 text-xs leading-none">✕</button>
                </div>
              )}
              {Object.values(deps).some(v => !v) && (
                <div className="flex items-center space-x-1.5 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg cursor-pointer hover:bg-amber-500/20 transition-all"
                  title="Click to auto-install missing tools">
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-[10px] font-medium text-amber-500/80">
                    {Object.entries(deps).filter(([_, v]) => !v).map(([k]) => k).join(', ')} missing —{' '}
                    <span className="underline" onClick={() => {
                      const missing = Object.entries(deps).filter(([_, v]) => !v).map(([k]) => k);
                      if (missing.length > 0) {
                        const dep = missing[0];
                        setInstallingDep(dep);
                        setDepProgress(0);
                        InstallDependency(dep).catch(() => setInstallingDep(null));
                      }
                    }}>Install</span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                disabled={isExporting}
                onClick={() => {
                  setIsExporting(true);
                  ExportDownloads()
                    .finally(() => setIsExporting(false));
                }}
                title="Export Downloads"
                className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95 border border-white/5 disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>{isExporting ? 'Working...' : 'Export'}</span>
              </button>

              <button
                disabled={isImporting}
                onClick={() => {
                  setIsImporting(true);
                  ImportDownloads().then(n => {
                    if (n > 0) GetDownloads().then(data => setDownloads(data || []));
                  }).finally(() => setIsImporting(false));
                }}
                title="Import Downloads"
                className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95 border border-white/5 disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${isImporting ? 'animate-bounce' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                </svg>
                <span>{isImporting ? 'Working...' : 'Import'}</span>
              </button>

              <button
                disabled={isRegistering}
                onClick={() => {
                  setIsRegistering(true);
                  RegisterBrowserExtension()
                    .then(() => alert("Native host registered! Extension is in legacy_code/browser_extension"))
                    .catch(e => alert("Error: " + e))
                    .finally(() => setIsRegistering(false));
                }}
                title="Install Browser Extension"
                className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95 border border-white/5 disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${isRegistering ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{isRegistering ? 'Working...' : 'Extension'}</span>
              </button>

              <button
                disabled={isZipping}
                onClick={() => {
                  setIsZipping(true);
                  PackageExtension()
                    .then(path => path && alert("Extension zipped successfully to: " + path))
                    .catch(e => alert("Error: " + e))
                    .finally(() => setIsZipping(false));
                }}
                title="Package Extension as ZIP"
                className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95 border border-white/5 disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${isZipping ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span>{isZipping ? 'Zipping...' : 'Zip'}</span>
              </button>
              <button onClick={() => setShowScheduler(true)} title="Queue Manager"
                className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95 border border-white/5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Scheduler</span>
              </button>

              <button onClick={() => setIsAdding(true)}
                className="flex items-center space-x-1.5 bg-xdm-accent hover:bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>New Download</span>
              </button>
            </div>
          </header>

          {/* Header Row 2: Tabs + Search + Sort */}
          <div className="flex items-center justify-between px-6 py-2 border-b border-white/5 bg-white/[0.01] shrink-0">
            {/* Status Tabs */}
            <div className="flex items-center space-x-1 bg-white/[0.03] rounded-lg p-0.5">
              {statusTabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === tab.id
                    ? 'bg-xdm-accent text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-300'
                    }`}>
                  {tab.label}
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-white/5'
                    }`}>{tab.count}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              {/* Search */}
              <div className="relative">
                <svg className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search files..."
                  className="w-48 bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-xdm-accent/40 transition-all" />
              </div>

              {/* Sort Buttons */}
              <div className="flex items-center space-x-0.5 bg-white/[0.03] rounded-lg p-0.5">
                {([['name', 'Name'], ['size', 'Size'], ['date', 'Date'], ['status', 'Status']] as [SortKey, string][]).map(([key, label]) => (
                  <button key={key} onClick={() => toggleSort(key)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${sortKey === key ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'
                      }`}>
                    {label} {sortIcon(key)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between px-6 py-2 border-b border-xdm-accent/20 bg-xdm-accent/5 shrink-0 animate-in slide-in-from-top duration-200">
              <div className="flex items-center space-x-2">
                <input type="checkbox" checked={processedDownloads.length > 0 && processedDownloads.every(d => selectedIds.has(d.id))}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded accent-xdm-accent" />
                <span className="text-xs font-bold text-xdm-accent">{selectedIds.size} selected</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button onClick={bulkResume} className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] font-bold rounded-lg transition-all">
                  ▶ Resume All
                </button>
                <button onClick={bulkPause} className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-lg transition-all">
                  ⏸ Pause All
                </button>
                <button onClick={() => setDeletingIds(new Set(selectedIds))} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg transition-all">
                  ✕ Delete
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
            {processedDownloads.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 opacity-50">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-medium">{searchQuery ? 'No matching downloads' : 'No downloads'}</p>
                  <p className="text-xs mt-1">{searchQuery ? 'Try a different search term' : 'Add a link or wait for browser interception'}</p>
                </div>
              </div>
            ) : (
              processedDownloads.map(task => (
                <DownloadItem
                  key={task.id}
                  task={task}
                  selected={selectedIds.has(task.id)}
                  onSelect={() => toggleSelect(task.id)}
                  onDelete={() => setDeletingIds(new Set([task.id]))}
                  onRequestRefresh={(t) => setRefreshingTask(t)}
                  onShowDetailed={(id) => setDetailedTaskId(id)}
                />
              ))
            )}
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
