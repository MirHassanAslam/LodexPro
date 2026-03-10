import React, { useState, useEffect } from 'react';
import { GetConfig, SaveConfig, SetSpeedLimit, SetAutoStart, IsAutoStartEnabled, SelectFolder, CheckForUpdates } from '../../wailsjs/go/main/App';

interface Props {
  onClose: () => void;
  clipboardMonitoring: boolean;
  setClipboardMonitoring: (val: boolean) => void;
}

interface AppConfig {
  max_segments: number;
  network_timeout: number;
  max_retry: number;
  retry_delay: number;
  max_parallel_downloads: number;
  speed_limit_kbps: number;
  default_download_folder: string;
  file_conflict_mode: string;
  temp_dir: string;
  category_folders: { [key: string]: string };
  start_download_automatically: boolean;
  show_completion_dialog: boolean;
  monitor_clipboard: boolean;
  run_on_logon: boolean;
  keep_pc_awake: boolean;
  blocked_hosts: string[];
  run_command_after_completion: boolean;
  after_completion_command: string;
  scan_with_antivirus: boolean;
  antivirus_executable: string;
  antivirus_args: string;
  virustotal_api_key: string;
  proxy_mode: string;
  proxy_host: string;
  proxy_port: number;
  proxy_user: string;
  proxy_pass: string;
}

const Toggle: React.FC<{ checked: boolean; onChange: () => void; color?: string }> = ({ checked, onChange, color = 'xdm-accent' }) => (
  <label className="relative inline-flex items-center cursor-pointer shrink-0">
    <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
    <div className={`w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${checked ? (color === 'xdm-accent' ? 'peer-checked:bg-xdm-accent' : `peer-checked:bg-${color}`) : ''}`}></div>
  </label>
);

const SectionHeader: React.FC<{ icon: string; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center space-x-3 mb-5">
    <div className="p-2 bg-xdm-accent/10 rounded-lg">
      <svg className="w-5 h-5 text-xdm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
    </div>
    <div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const SettingsView: React.FC<Props> = ({ onClose, clipboardMonitoring, setClipboardMonitoring }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [blockedHostInput, setBlockedHostInput] = useState('');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    GetConfig().then((cfg: any) => {
      setConfig(cfg);
    });
    IsAutoStartEnabled().then((val: boolean) => setAutoStart(val));
  }, []);

  const updateConfig = (updates: Partial<AppConfig>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      config.monitor_clipboard = clipboardMonitoring;
      await SaveConfig(config);
      if (config.run_on_logon !== autoStart) {
        await SetAutoStart(config.run_on_logon);
        setAutoStart(config.run_on_logon);
      }
    } catch (e) {
      console.error('Failed to save config:', e);
    }
    setSaving(false);
  };

  const handleSelectFolder = async (key: string) => {
    try {
      const path = await SelectFolder();
      if (path) {
        if (key === 'default_download_folder') {
          updateConfig({ default_download_folder: path });
        } else if (key.startsWith('cat_')) {
          const cat = key.replace('cat_', '');
          updateConfig({ category_folders: { ...config!.category_folders, [cat]: path } });
        }
      }
    } catch (e) { /* user cancelled */ }
  };

  const addBlockedHost = () => {
    if (!config || !blockedHostInput.trim()) return;
    const hosts = [...(config.blocked_hosts || []), blockedHostInput.trim()];
    updateConfig({ blocked_hosts: hosts });
    setBlockedHostInput('');
  };

  const removeBlockedHost = (index: number) => {
    if (!config) return;
    const hosts = config.blocked_hosts.filter((_, i) => i !== index);
    updateConfig({ blocked_hosts: hosts });
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await CheckForUpdates();
      setUpdateInfo(info);
      if (!info.available) {
        alert("LodexPro is up to date (Version " + info.current + ")");
      }
    } catch (e) {
      console.error('Failed to check update:', e);
    }
    setCheckingUpdate(false);
  };

  const getSpeedDisplay = (kbps: number) => {
    if (kbps === 0) return 'Unlimited';
    if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
    return `${kbps} KB/s`;
  };

  if (!config) return (
    <div className="absolute inset-0 bg-[#0c0c0c] z-40 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-xdm-accent border-t-transparent rounded-full" />
    </div>
  );

  const tabs = [
    { id: 'general', label: 'General', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { id: 'engine', label: 'Engine', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'folders', label: 'Folders', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { id: 'network', label: 'Network', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
    { id: 'system', label: 'System', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z' },
  ];

  return (
    <div className="absolute inset-0 bg-[#0c0c0c] z-40 flex flex-col animate-in fade-in duration-300">
      <header className="h-16 flex items-center px-8 border-b border-white/5 bg-white/[0.02] backdrop-blur-xl shrink-0">
        <button onClick={onClose} className="mr-4 p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h2 className="text-xl font-bold tracking-tight text-white flex-1">Settings</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-xdm-accent hover:bg-xdm-accent/80 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Tabs */}
        <div className="w-48 border-r border-white/5 p-4 space-y-1 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-xdm-accent text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <>
                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M15 12a3 3 0 11-6 0 3 3 0 016 0z" title="Behavior" subtitle="General download behavior" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">Show Download Complete Dialog</p>
                        <p className="text-xs text-gray-500 mt-0.5">Show a dialog when each download finishes</p>
                      </div>
                      <Toggle checked={config.show_completion_dialog} onChange={() => updateConfig({ show_completion_dialog: !config.show_completion_dialog })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">Start Download Automatically</p>
                        <p className="text-xs text-gray-500 mt-0.5">Skip the new download dialog for browser-intercepted links</p>
                      </div>
                      <Toggle checked={config.start_download_automatically} onChange={() => updateConfig({ start_download_automatically: !config.start_download_automatically })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">Smart Clipboard Sniffer</p>
                        <p className="text-xs text-gray-500 mt-0.5">Detect copy-pasted URLs and offer to download</p>
                      </div>
                      <Toggle checked={clipboardMonitoring} onChange={() => setClipboardMonitoring(!clipboardMonitoring)} color="purple-500" />
                    </div>
                  </div>
                </section>

                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" title="File Conflict" subtitle="What to do when a file already exists" />
                  <div className="flex space-x-3">
                    {[
                      { mode: 'autorename', label: 'Auto Rename', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
                      { mode: 'overwrite', label: 'Overwrite', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' }
                    ].map(item => (
                      <button
                        key={item.mode}
                        onClick={() => updateConfig({ file_conflict_mode: item.mode })}
                        className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border ${config.file_conflict_mode === item.mode
                            ? 'bg-xdm-accent/10 border-xdm-accent/30 text-xdm-accent'
                            : 'bg-white/[0.03] border-white/5 text-gray-400 hover:bg-white/5'
                          }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                        </svg>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* ENGINE TAB */}
            {activeTab === 'engine' && (
              <>
                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M13 10V3L4 14h7v7l9-11h-7z" title="Performance" subtitle="Download engine configuration" />
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Maximum Parallel Segments</label>
                      <div className="flex items-center space-x-4">
                        <input type="range" min="1" max="32" value={config.max_segments}
                          onChange={(e) => updateConfig({ max_segments: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-xdm-accent" />
                        <span className="text-sm font-bold text-white w-8 text-center bg-white/5 py-1 rounded">{config.max_segments}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Max Parallel Downloads</label>
                      <div className="flex items-center space-x-4">
                        <input type="range" min="1" max="10" value={config.max_parallel_downloads}
                          onChange={(e) => updateConfig({ max_parallel_downloads: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-xdm-accent" />
                        <span className="text-sm font-bold text-white w-8 text-center bg-white/5 py-1 rounded">{config.max_parallel_downloads}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">Maximum downloads running simultaneously across all queues</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Global Speed Limiter</label>
                      <div className="flex items-center space-x-4">
                        <input type="range" min="0" max="10240" step="256" value={config.speed_limit_kbps}
                          onChange={(e) => updateConfig({ speed_limit_kbps: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-red-500" />
                        <span className="text-sm font-bold text-white w-24 text-center bg-white/5 py-1 rounded">
                          {getSpeedDisplay(config.speed_limit_kbps)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Network Timeout (seconds)</label>
                      <div className="flex items-center space-x-4">
                        <input type="range" min="5" max="120" value={config.network_timeout}
                          onChange={(e) => updateConfig({ network_timeout: parseInt(e.target.value) })}
                          className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-xdm-accent" />
                        <span className="text-sm font-bold text-white w-12 text-center bg-white/5 py-1 rounded">{config.network_timeout}s</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" title="Auto-Retry" subtitle="Retry failed downloads automatically" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Max Retries</label>
                      <input type="number" min="0" max="50" value={config.max_retry}
                        onChange={(e) => updateConfig({ max_retry: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-xdm-accent/50" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Retry Delay (sec)</label>
                      <input type="number" min="1" max="300" value={config.retry_delay}
                        onChange={(e) => updateConfig({ retry_delay: parseInt(e.target.value) || 5 })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-xdm-accent/50" />
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* FOLDERS TAB */}
            {activeTab === 'folders' && (
              <>
                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" title="Default Download Folder" />
                  <div className="flex items-center space-x-3">
                    <input type="text" value={config.default_download_folder} readOnly placeholder="System Downloads folder"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none" />
                    <button onClick={() => handleSelectFolder('default_download_folder')}
                      className="px-4 py-2.5 bg-xdm-accent/10 hover:bg-xdm-accent/20 text-xdm-accent rounded-xl text-sm font-medium transition-all">
                      Browse
                    </button>
                  </div>
                </section>

                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    title="Category Folders" subtitle="Auto-sort downloads by file type into separate folders" />
                  <div className="space-y-3">
                    {[
                      { key: 'documents', label: 'Documents', exts: '.pdf, .doc, .xlsx', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', bgCls: 'bg-blue-500/10', textCls: 'text-blue-400' },
                      { key: 'music', label: 'Music', exts: '.mp3, .flac, .aac', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3', bgCls: 'bg-purple-500/10', textCls: 'text-purple-400' },
                      { key: 'video', label: 'Video', exts: '.mp4, .mkv, .avi', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', bgCls: 'bg-rose-500/10', textCls: 'text-rose-400' },
                      { key: 'compressed', label: 'Compressed', exts: '.zip, .rar, .7z', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', bgCls: 'bg-amber-500/10', textCls: 'text-amber-400' },
                      { key: 'programs', label: 'Programs', exts: '.exe, .msi', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', bgCls: 'bg-emerald-500/10', textCls: 'text-emerald-400' },
                    ].map(cat => (
                      <div key={cat.key} className="flex items-center space-x-3">
                        <div className="w-36 shrink-0 flex items-center space-x-2.5">
                          <div className={`p-1.5 rounded-lg ${cat.bgCls}`}>
                            <svg className={`w-4 h-4 ${cat.textCls}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.icon} />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm text-white font-medium">{cat.label}</p>
                            <p className="text-[10px] text-gray-600">{cat.exts}</p>
                          </div>
                        </div>
                        <input type="text" readOnly
                          value={config.category_folders?.[cat.key] || ''}
                          placeholder="Uses default folder"
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none" />
                        <button onClick={() => handleSelectFolder(`cat_${cat.key}`)}
                          className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-medium transition-all">
                          Browse
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* NETWORK TAB */}
            {activeTab === 'network' && (
              <>
                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829"
                    title="Blocked Hosts" subtitle="Downloads from these hosts will be ignored by the interceptor" />
                  <div className="flex items-center space-x-2 mb-3">
                    <input type="text" value={blockedHostInput} onChange={(e) => setBlockedHostInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addBlockedHost()}
                      placeholder="e.g. update.microsoft.com"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-xdm-accent/50" />
                    <button onClick={addBlockedHost}
                      className="px-4 py-2.5 bg-xdm-accent hover:bg-xdm-accent/80 text-white rounded-xl text-sm font-bold transition-all">
                      Add
                    </button>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                    {(config.blocked_hosts || []).map((host, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/[0.03] px-3 py-2 rounded-lg">
                        <span className="text-xs text-gray-300 font-mono">{host}</span>
                        <button onClick={() => removeBlockedHost(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    title="Proxy" subtitle="Route downloads through a proxy server" />
                  <div className="space-y-4">
                    <div className="flex space-x-3">
                      {['none', 'system', 'manual'].map(mode => (
                        <button key={mode} onClick={() => updateConfig({ proxy_mode: mode })}
                          className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${config.proxy_mode === mode
                              ? 'bg-xdm-accent/10 border-xdm-accent/30 text-xdm-accent'
                              : 'bg-white/[0.03] border-white/5 text-gray-400 hover:bg-white/5'
                            }`}>
                          {mode === 'none' ? 'Direct' : mode === 'system' ? 'System' : 'Manual'}
                        </button>
                      ))}
                    </div>
                    {config.proxy_mode === 'manual' && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Host</label>
                          <input type="text" value={config.proxy_host} onChange={(e) => updateConfig({ proxy_host: e.target.value })}
                            placeholder="proxy.example.com"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-xdm-accent/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Port</label>
                          <input type="number" value={config.proxy_port} onChange={(e) => updateConfig({ proxy_port: parseInt(e.target.value) || 0 })}
                            placeholder="8080"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-xdm-accent/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Username (optional)</label>
                          <input type="text" value={config.proxy_user} onChange={(e) => updateConfig({ proxy_user: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-xdm-accent/50" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Password (optional)</label>
                          <input type="password" value={config.proxy_pass} onChange={(e) => updateConfig({ proxy_pass: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-xdm-accent/50" />
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {/* SYSTEM TAB */}
            {activeTab === 'system' && (
              <>
                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
                    title="System Integration" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">Start on Login</p>
                        <p className="text-xs text-gray-500 mt-0.5">Launch LodexPro when Windows starts</p>
                      </div>
                      <Toggle checked={config.run_on_logon} onChange={() => updateConfig({ run_on_logon: !config.run_on_logon })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-medium">Keep PC Awake</p>
                        <p className="text-xs text-gray-500 mt-0.5">Prevent sleep/hibernate when downloads are active</p>
                      </div>
                      <Toggle checked={config.keep_pc_awake} onChange={() => updateConfig({ keep_pc_awake: !config.keep_pc_awake })} />
                    </div>
                  </div>
                </section>

                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    title="Run Command After Download" subtitle="Execute a custom command when each download finishes" />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-white font-medium">Enable</p>
                      <Toggle checked={config.run_command_after_completion} onChange={() => updateConfig({ run_command_after_completion: !config.run_command_after_completion })} />
                    </div>
                    {config.run_command_after_completion && (
                      <input type="text" value={config.after_completion_command} onChange={(e) => updateConfig({ after_completion_command: e.target.value })}
                        placeholder='e.g. echo "Download complete!"'
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-xdm-accent/50" />
                    )}
                  </div>
                </section>

                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    title="Antivirus Scan" subtitle="Scan completed downloads with your antivirus" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-white font-medium">Auto-Scan on Completion</p>
                      <Toggle checked={config.scan_with_antivirus} onChange={() => updateConfig({ scan_with_antivirus: !config.scan_with_antivirus })} />
                    </div>
                    {config.scan_with_antivirus && (
                      <div className="space-y-4 pt-2 border-t border-white/5">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Executable Path</label>
                            <input type="text" value={config.antivirus_executable} onChange={(e) => updateConfig({ antivirus_executable: e.target.value })}
                              placeholder="e.g. defender or C:\Path\To\AV.exe"
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-xdm-accent/50" />
                            <p className="text-[9px] text-gray-600 mt-1">Use 'defender' for Windows Defender</p>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Arguments</label>
                            <input type="text" value={config.antivirus_args} onChange={(e) => updateConfig({ antivirus_args: e.target.value })}
                              placeholder="e.g. /scan"
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-xdm-accent/50" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">VirusTotal API Key (Optional)</label>
                          <input type="password" value={config.virustotal_api_key} onChange={(e) => updateConfig({ virustotal_api_key: e.target.value })}
                            placeholder="Enables cloud scanning"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-xdm-accent/50" />
                          <p className="text-[9px] text-gray-600 mt-1">Get a free key from virustotal.com for extra security.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                  <SectionHeader icon="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" title="Updates" subtitle="Check for the latest version of LodexPro" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium">LodexPro Version</p>
                      <p className="text-xs text-gray-500 mt-0.5">Current version: {config.current_version || '2.0.0'}</p>
                    </div>
                    <button onClick={handleCheckUpdate} disabled={checkingUpdate}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50">
                      {checkingUpdate ? 'Checking...' : 'Check for Updates'}
                    </button>
                  </div>
                  {updateInfo?.available && (
                    <div className="mt-4 p-4 bg-xdm-accent/10 border border-xdm-accent/20 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 rounded-full bg-xdm-accent animate-pulse" />
                        <span className="text-xs text-xdm-accent font-bold">New version {updateInfo.latest} is available!</span>
                      </div>
                      <a href={updateInfo.url} target="_blank" rel="noreferrer"
                        className="px-3 py-1 bg-xdm-accent text-white text-[10px] font-bold rounded-lg hover:bg-blue-600 transition-colors">
                        Download Now
                      </a>
                    </div>
                  )}
                </section>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
