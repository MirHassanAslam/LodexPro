import React, { useState, useEffect } from 'react';
import { models } from '../../wailsjs/go/models';
import { GetQueues, SaveQueue, DeleteQueue, StartQueue, StopQueue, GetDownloads } from '../../wailsjs/go/main/App';

interface Props {
  onClose: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const QueueIcon: React.FC<{ isDefault: boolean }> = ({ isDefault }) => (
  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDefault ? 'bg-xdm-accent/20' : 'bg-purple-500/20'}`}>
    {isDefault ? (
      <svg className="w-4 h-4 text-xdm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )}
  </div>
);

const SchedulerView: React.FC<Props> = ({ onClose }) => {
  const [queues, setQueues] = useState<models.DownloadQueue[]>([]);
  const [selectedId, setSelectedId] = useState('main');
  const [activeTab, setActiveTab] = useState<'schedule' | 'files'>('schedule');
  const [queuedDownloads, setQueuedDownloads] = useState<models.DownloadTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [editedQueue, setEditedQueue] = useState<models.DownloadQueue | null>(null);

  useEffect(() => {
    loadQueues();
  }, []);

  useEffect(() => {
    if (activeTab === 'files') {
      loadFiles();
      const interval = setInterval(() => loadFiles(), 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, selectedId]);

  const loadQueues = async () => {
    try {
      const qs = await GetQueues();
      setQueues(qs || []);
      if (qs && qs.length > 0) {
        const found = qs.find(q => q.id === selectedId) || qs[0];
        setSelectedId(found.id);
        setEditedQueue({ ...found });
      }
    } catch (e) { }
  };

  const loadFiles = async (id?: string) => {
    const qid = id ?? selectedId;
    try {
      const all = await GetDownloads();
      // Only show non-completed tasks in the queue view
      setQueuedDownloads(
        (all || []).filter(t => t.queue_id === qid && t.status !== 'COMPLETED')
      );
    } catch (e) { }
  };

  const handleSelectQueue = (id: string) => {
    setSelectedId(id);
    const q = queues.find(q => q.id === id);
    if (q) setEditedQueue({ ...q });
    if (activeTab === 'files') loadFiles(id);
  };

  const handleNewQueue = async () => {
    const name = prompt('Enter new queue name:');
    if (!name) return;
    const newQ: models.DownloadQueue = {
      id: '', name, is_default: false, max_concurrent: 2,
      speed_limit_kbps: 0,
      start_time: '', stop_time: '', is_scheduled: false,
      days_of_week: [], task_ids: [],
    } as any;
    try {
      await SaveQueue(newQ);
      await loadQueues();
    } catch (e) { }
  };

  const handleDeleteQueue = async () => {
    if (!selectedId || selectedId === 'main') return;
    if (!confirm('Delete this queue? Downloads will be moved to Main queue.')) return;
    try {
      await DeleteQueue(selectedId);
      setSelectedId('main');
      await loadQueues();
    } catch (e) { }
  };

  const handleApply = async () => {
    if (!editedQueue) return;
    setSaving(true);
    try {
      await SaveQueue(editedQueue);
      await loadQueues();
      onClose(); // Close after successful apply
    } catch (e) {
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    if (!editedQueue) return;
    const days = editedQueue.days_of_week || [];
    const newDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    setEditedQueue({ ...editedQueue, days_of_week: newDays });
  };

  const selectedQueue = queues.find(q => q.id === selectedId);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatETA = (secs: number) => {
    if (!secs || secs <= 0) return '--';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-[#161616] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Title bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-xdm-accent/10 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-xdm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-white">Queue Manager</h2>
            {selectedQueue && (
              <span className="text-sm text-gray-400">— {selectedQueue.name}</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex h-[520px]">
          {/* Left sidebar - Queues list */}
          <div className="w-52 border-r border-white/5 flex flex-col bg-white/[0.01]">
            <div className="px-3 py-3 text-[9px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5">Queues</div>
            <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
              {queues.map(q => (
                <button
                  key={q.id}
                  onClick={() => handleSelectQueue(q.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center space-x-2.5 transition-all ${selectedId === q.id
                      ? 'bg-xdm-accent/10 border-l-2 border-xdm-accent'
                      : 'hover:bg-white/5 border-l-2 border-transparent'
                    }`}
                >
                  <QueueIcon isDefault={q.is_default} />
                  <span className={`text-xs truncate ${selectedId === q.id ? 'text-white font-semibold' : 'text-gray-400'}`}>{q.name}</span>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-white/5 flex space-x-2">
              <button
                onClick={handleNewQueue}
                className="flex-1 px-2 py-1.5 rounded-lg bg-xdm-accent/10 hover:bg-xdm-accent/20 text-xdm-accent text-[10px] font-bold transition-all"
              >
                + New
              </button>
              <button
                onClick={handleDeleteQueue}
                disabled={selectedId === 'main'}
                className="flex-1 px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tabs */}
            <div className="flex border-b border-white/5 px-4 pt-2 space-x-1">
              {(['schedule', 'files'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all capitalize ${activeTab === tab
                      ? 'bg-xdm-accent/10 text-xdm-accent border-b-2 border-xdm-accent'
                      : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                  {tab === 'schedule' ? 'Schedule' : 'Files in the Queue'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              {activeTab === 'schedule' && editedQueue && (
                <div className="space-y-5">
                  {/* Concurrent downloads */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                      Max Concurrent Downloads
                    </label>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-gray-400">Download</span>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={editedQueue.max_concurrent}
                        onChange={e => setEditedQueue({ ...editedQueue, max_concurrent: parseInt(e.target.value) || 1 })}
                        className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-xdm-accent/50"
                      />
                      <span className="text-xs text-gray-400">files at the same time</span>
                    </div>
                  </div>

                  {/* Speed Limit */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                      Queue Speed Limit
                    </label>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-gray-400">Limit to</span>
                      <input
                        type="number"
                        min={0}
                        step={128}
                        value={editedQueue.speed_limit_kbps ?? 0}
                        onChange={e => setEditedQueue({ ...editedQueue, speed_limit_kbps: parseInt(e.target.value) || 0 })}
                        className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-xdm-accent/50"
                      />
                      <span className="text-xs text-gray-400">KB/s</span>
                      {(editedQueue.speed_limit_kbps ?? 0) > 0 ? (
                        <span className="text-[10px] text-xdm-accent font-bold bg-xdm-accent/10 px-2 py-0.5 rounded-full">
                          {editedQueue.speed_limit_kbps! >= 1024
                            ? `${(editedQueue.speed_limit_kbps! / 1024).toFixed(1)} MB/s`
                            : `${editedQueue.speed_limit_kbps} KB/s`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-600 font-bold">Unlimited (uses global limit)</span>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-600 mt-2">Set to 0 to fall back to the global speed limit in Settings.</p>
                  </div>

                  {/* Schedule toggle */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <div
                        onClick={() => setEditedQueue({ ...editedQueue, is_scheduled: !editedQueue.is_scheduled })}
                        className={`w-10 h-5 rounded-full transition-colors relative ${editedQueue.is_scheduled ? 'bg-xdm-accent' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editedQueue.is_scheduled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </div>
                      <span className="text-sm font-bold text-white">Enable Scheduling</span>
                    </label>

                    {editedQueue.is_scheduled && (
                      <div className="space-y-4 pt-1">
                        {/* Start time */}
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-gray-400 font-medium">Start download at</label>
                          <input
                            type="time"
                            value={editedQueue.start_time || ''}
                            onChange={e => setEditedQueue({ ...editedQueue, start_time: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-xdm-accent/50"
                          />
                        </div>

                        {/* Stop time */}
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-gray-400 font-medium">Stop download at</label>
                          <input
                            type="time"
                            value={editedQueue.stop_time || ''}
                            onChange={e => setEditedQueue({ ...editedQueue, stop_time: e.target.value })}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-xdm-accent/50"
                          />
                        </div>

                        {/* Days of week */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Active Days</label>
                          <div className="flex space-x-1.5">
                            {DAYS.map((day, idx) => {
                              const isActive = editedQueue.days_of_week?.includes(idx);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => toggleDay(idx)}
                                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${isActive
                                      ? 'bg-xdm-accent text-white shadow-[0_0_8px_rgba(0,123,255,0.4)]'
                                      : 'bg-white/5 text-gray-500 hover:bg-white/10'
                                    }`}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Post-download action */}
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-3">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      When Queue Finishes
                    </label>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-3 cursor-pointer" onClick={() =>
                        setEditedQueue({ ...editedQueue, post_action: editedQueue.post_action ? '' : 'shutdown' })
                      }>
                        <div className={`w-10 h-5 rounded-full transition-colors relative ${editedQueue.post_action ? 'bg-orange-500' : 'bg-white/10'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editedQueue.post_action ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </div>
                        <span className={`text-sm font-bold ${editedQueue.post_action ? 'text-orange-400' : 'text-gray-400'}`}>
                          Turn off computer when done
                        </span>
                      </label>

                      {editedQueue.post_action && (
                        <select
                          value={editedQueue.post_action || 'shutdown'}
                          onChange={e => setEditedQueue({ ...editedQueue, post_action: e.target.value })}
                          className="bg-[#222] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500/50 ml-4"
                        >
                          <option value="shutdown">Shut down</option>
                          <option value="sleep">Sleep</option>
                          <option value="hibernate">Hibernate</option>
                        </select>
                      )}
                    </div>
                    {editedQueue.post_action && (
                      <p className="text-[10px] text-orange-400/60">
                        ⚠ A confirmation dialog will appear before the action executes, giving you 10 seconds to cancel.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-400">
                      {queuedDownloads.length} active file(s) in queue
                    </span>
                    <button
                      onClick={() => loadFiles()}
                      className="text-[10px] text-xdm-accent hover:text-blue-300 font-bold transition-all"
                    >
                      Refresh
                    </button>
                  </div>

                  {queuedDownloads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500 space-y-3 opacity-60">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-sm">No files in this queue</p>
                      <p className="text-xs">Add downloads and select this queue</p>
                    </div>
                  ) : (
                    <div className="border border-white/5 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/[0.02]">
                            <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">File Name</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Size</th>
                            <th className="text-right px-3 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                            <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">ETA</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queuedDownloads.map(t => {
                            const pct = t.total_size > 0 ? ((t.downloaded_size / t.total_size) * 100).toFixed(1) : '0';
                            return (
                              <tr key={t.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all">
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-white/80 truncate max-w-[180px]">{t.filename}</div>
                                  <div className="w-full bg-white/5 rounded-full h-0.5 mt-1.5">
                                    <div className="bg-xdm-accent h-0.5 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right text-gray-400 whitespace-nowrap">{formatSize(t.total_size)}</td>
                                <td className="px-3 py-3 text-right">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${t.status === 'DOWNLOADING' ? 'bg-xdm-accent/10 text-xdm-accent' :
                                      t.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400' :
                                        t.status === 'PAUSED' ? 'bg-yellow-500/10 text-yellow-400' :
                                          t.status === 'ERROR' ? 'bg-red-500/10 text-red-400' :
                                            'bg-white/5 text-gray-400'
                                    }`}>{t.status}</span>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatETA(t.eta)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/5 bg-white/[0.01]">
              <div className="flex space-x-2">
                <button
                  onClick={() => StartQueue(selectedId)}
                  className="px-4 py-2 rounded-xl bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-bold transition-all active:scale-95 flex items-center space-x-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Start Now</span>
                </button>
                <button
                  onClick={() => StopQueue(selectedId)}
                  className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all active:scale-95 flex items-center space-x-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" />
                  </svg>
                  <span>Stop</span>
                </button>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-bold transition-all"
                >
                  Close
                </button>
                <button
                  onClick={handleApply}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-xdm-accent hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchedulerView;
