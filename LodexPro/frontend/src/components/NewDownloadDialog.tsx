import React, { useState, useEffect, useMemo } from 'react';
import { SelectFolder, FetchVideoMetadata, GetQueues } from '../../wailsjs/go/main/App';
import { models } from '../../wailsjs/go/models';

interface Props {
  onAdd: (url: string, filename: string, savePath: string, formatId: string, queueId: string, startNow: boolean) => void;
  onCancel: () => void;
  initialUrl?: string;
}

type DialogTab = 'url' | 'batch';

const NewDownloadDialog: React.FC<Props> = ({ onAdd, onCancel, initialUrl = '' }) => {
  const [dialogTab, setDialogTab] = useState<DialogTab>('url');
  const [url, setUrl] = useState(initialUrl);
  const [filename, setFilename] = useState('');
  const [savePath, setSavePath] = useState('C:\\Downloads');
  const [loading, setLoading] = useState(false);
  const [isYoutube, setIsYoutube] = useState(false);
  const [formats, setFormats] = useState<any[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('best');
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [queues, setQueues] = useState<models.DownloadQueue[]>([]);
  const [showQueueDropdown, setShowQueueDropdown] = useState(false);

  // Batch pattern state
  const [batchPattern, setBatchPattern] = useState('');
  const [batchMode, setBatchMode] = useState<'number' | 'letter'>('number');
  const [batchFrom, setBatchFrom] = useState(1);
  const [batchTo, setBatchTo] = useState(10);
  const [batchLetterFrom, setBatchLetterFrom] = useState('a');
  const [batchLetterTo, setBatchLetterTo] = useState('z');
  const [batchPadding, setBatchPadding] = useState(0);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');

  // URL list: from direct input or batch generation
  const urlList = useMemo(() => {
    if (dialogTab === 'url') {
      return url.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    }
    // Batch pattern generation
    if (!batchPattern.includes('*')) return [];
    const urls: string[] = [];
    if (batchMode === 'number') {
      for (let i = batchFrom; i <= batchTo; i++) {
        const padded = batchPadding > 0 ? String(i).padStart(batchPadding, '0') : String(i);
        urls.push(batchPattern.replace('*', padded));
      }
    } else {
      const start = batchLetterFrom.charCodeAt(0);
      const end = batchLetterTo.charCodeAt(0);
      for (let i = start; i <= end; i++) {
        urls.push(batchPattern.replace('*', String.fromCharCode(i)));
      }
    }
    return urls;
  }, [dialogTab, url, batchPattern, batchMode, batchFrom, batchTo, batchLetterFrom, batchLetterTo, batchPadding]);

  const isBatch = urlList.length > 1;

  useEffect(() => {
    GetQueues().then(qs => {
      if (qs && qs.length > 0) setQueues(qs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const isYt = urlList.some(u => u.includes('youtube.com') || u.includes('youtu.be'));
    setIsYoutube(isYt);
    if (!isYt) setFormats([]);
  }, [urlList]);

  const handleFetchMetadata = async () => {
    if (!url) return;
    setFetchingMeta(true);
    try {
      const meta = await FetchVideoMetadata(url);
      setFilename(meta.title + '.mp4');
      if (meta.formats && meta.formats.length > 0) {
        const validFormats = meta.formats.filter((f: any) => f.vcodec !== 'none').reverse();
        setFormats(validFormats);
        if (validFormats.length > 0) setSelectedFormat('bestvideo+bestaudio/best');
      }
    } catch (err) {
      console.error("Failed to fetch metadata:", err);
    } finally {
      setFetchingMeta(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await SelectFolder();
      if (selected) setSavePath(selected);
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  };

  const handleSubmitNow = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlList.length > 0 && savePath) {
      setLoading(true);
      urlList.forEach((u) => {
        const nameToUse = isBatch ? '' : filename;
        const formatToUse = (u.includes('youtube.com') || u.includes('youtu.be')) ? selectedFormat : '';
        onAdd(u, nameToUse, savePath, formatToUse, 'main', true);
      });
    }
  };

  const handleSubmitLater = (queueId: string) => {
    if (urlList.length > 0 && savePath) {
      setLoading(true);
      urlList.forEach((u) => {
        const nameToUse = isBatch ? '' : filename;
        const formatToUse = (u.includes('youtube.com') || u.includes('youtu.be')) ? selectedFormat : '';
        onAdd(u, nameToUse, savePath, formatToUse, queueId, false);
      });
    }
    setShowQueueDropdown(false);
  };

  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-6">
          {/* Header + Tab Toggle */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center space-x-2 text-white">
              <svg className="w-5 h-5 text-xdm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Download</span>
            </h2>
            <div className="flex bg-white/[0.03] rounded-lg p-0.5">
              {(['url', 'batch'] as DialogTab[]).map(tab => (
                <button key={tab} type="button" onClick={() => setDialogTab(tab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    dialogTab === tab ? 'bg-xdm-accent text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}>
                  {tab === 'url' ? 'URL' : 'Batch'}
                </button>
              ))}
            </div>
          </div>
          
          <form onSubmit={handleSubmitNow} className="space-y-4">
            {/* URL Tab */}
            {dialogTab === 'url' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Download URL(s) — one per line for batch</label>
                  <div className="flex space-x-2 items-start">
                    <textarea
                      autoFocus
                      rows={isBatch ? 4 : 1}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={"https://example.com/file.zip\nhttps://example.com/video.mp4"}
                      className="flex-1 w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-xdm-accent/50 focus:bg-white/10 transition-all font-sans resize-none custom-scrollbar"
                    />
                    {isYoutube && (
                      <button type="button" onClick={handleFetchMetadata} disabled={fetchingMeta}
                        className="px-4 py-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 text-xdm-accent font-bold text-xs transition-all active:scale-95 disabled:opacity-50">
                        {fetchingMeta ? '...' : 'Formats'}
                      </button>
                    )}
                  </div>
                </div>

                {isYoutube && formats.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Format</label>
                    <select value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-xdm-accent/50 transition-all">
                      <option className="bg-[#1a1a1a]" value="bestvideo+bestaudio/best">Best Quality (Auto)</option>
                      {formats.map((f, idx) => (
                        <option className="bg-[#1a1a1a]" key={idx} value={f.format_id}>
                          {f.resolution || f.format_id} {f.ext ? `(${f.ext})` : ''} - {f.vcodec !== 'none' ? 'Video' : 'Audio'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!isBatch && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Save As</label>
                    <input type="text" value={filename} onChange={(e) => setFilename(e.target.value)}
                      placeholder="Leave blank for automatic name"
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-xdm-accent/50 transition-all" />
                  </div>
                )}
              </>
            )}

            {/* Batch Pattern Tab */}
            {dialogTab === 'batch' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">URL Pattern — use * as wildcard</label>
                  <input type="text" autoFocus value={batchPattern}
                    onChange={e => setBatchPattern(e.target.value)}
                    placeholder="https://example.com/image_*.jpg"
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-xdm-accent/50 transition-all" />
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex bg-white/[0.03] rounded-lg p-0.5">
                    {(['number', 'letter'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setBatchMode(m)}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                          batchMode === m ? 'bg-xdm-accent text-white' : 'text-gray-500 hover:text-gray-300'
                        }`}>
                        {m === 'number' ? '123' : 'ABC'}
                      </button>
                    ))}
                  </div>

                  {batchMode === 'number' ? (
                    <div className="flex items-center space-x-2 flex-1">
                      <input type="number" value={batchFrom} onChange={e => setBatchFrom(+e.target.value)}
                        className="w-20 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-xdm-accent/50" />
                      <span className="text-gray-600 text-xs">to</span>
                      <input type="number" value={batchTo} onChange={e => setBatchTo(+e.target.value)}
                        className="w-20 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-xdm-accent/50" />
                      <span className="text-gray-600 text-xs">pad</span>
                      <input type="number" min={0} max={6} value={batchPadding} onChange={e => setBatchPadding(+e.target.value)}
                        className="w-16 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-xdm-accent/50" />
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 flex-1">
                      <select value={batchLetterFrom} onChange={e => setBatchLetterFrom(e.target.value)}
                        className="bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                        {letters.map(l => <option key={l} className="bg-[#1a1a1a]">{l}</option>)}
                      </select>
                      <span className="text-gray-600 text-xs">to</span>
                      <select value={batchLetterTo} onChange={e => setBatchLetterTo(e.target.value)}
                        className="bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                        {letters.map(l => <option key={l} className="bg-[#1a1a1a]">{l}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Preview */}
                {urlList.length > 0 && (
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 max-h-28 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Preview</span>
                      <span className="text-[10px] font-bold text-xdm-accent">{urlList.length} files</span>
                    </div>
                    <div className="space-y-0.5">
                      {urlList.slice(0, 5).map((u, i) => (
                        <p key={i} className="text-[11px] text-gray-400 truncate">{u}</p>
                      ))}
                      {urlList.length > 5 && (
                        <p className="text-[11px] text-gray-600">... and {urlList.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Save Path (shared) */}
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 ml-1">Save Path</label>
              <div className="flex space-x-2">
                <input type="text" readOnly value={savePath}
                  className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm text-white/50 focus:outline-none" />
                <button type="button" onClick={handleSelectFolder}
                  className="p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 text-xdm-accent transition-all active:scale-90">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Advanced Options (collapsible) */}
            <button type="button" onClick={() => setShowAdvanced(a => !a)}
              className="flex items-center space-x-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors">
              <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Advanced Options</span>
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 bg-white/[0.02] rounded-xl p-3 border border-white/5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Username</label>
                  <input type="text" value={authUser} onChange={e => setAuthUser(e.target.value)}
                    placeholder="HTTP Auth"
                    className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-xdm-accent/50" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Password</label>
                  <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-xdm-accent/50" />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button type="button" onClick={onCancel}
                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-white transition-all">
                Cancel
              </button>
              
              {/* Queue dropdown */}
              <div className="relative flex-1">
                <button type="button" disabled={loading || urlList.length === 0}
                  onClick={() => setShowQueueDropdown(v => !v)}
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-sm font-bold text-gray-300 transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Queue</span>
                  <svg className={`w-3 h-3 transition-transform ${showQueueDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showQueueDropdown && (
                  <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#222] border border-white/10 rounded-xl shadow-xl overflow-hidden z-20">
                    <div className="px-3 py-2 text-[9px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5">Select Queue</div>
                    {queues.length === 0 ? (
                      <div className="px-4 py-2 text-xs text-gray-500">No queues found</div>
                    ) : (
                      queues.map(q => (
                        <button key={q.id} type="button" onClick={() => handleSubmitLater(q.id)}
                          className="w-full text-left px-4 py-2.5 hover:bg-xdm-accent/10 text-sm text-white transition-all flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${q.is_default ? 'bg-xdm-accent' : 'bg-purple-400'}`} />
                          <span className="truncate">{q.name}</span>
                          {q.is_default && <span className="text-[9px] text-xdm-accent/60 font-bold shrink-0">DEFAULT</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button type="submit" disabled={loading || urlList.length === 0}
                className={`flex-1 px-4 py-3 rounded-xl bg-xdm-accent hover:bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {loading ? 'Adding...' : `Start${isBatch ? ` (${urlList.length})` : ''}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewDownloadDialog;
