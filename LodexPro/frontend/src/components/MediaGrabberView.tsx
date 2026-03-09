import React, { useState, useEffect } from 'react';
import { models } from '../../wailsjs/go/models';
import { GetMediaList, ClearMediaList, RemoveMediaItem } from '../../wailsjs/go/main/App';
import * as Events from '../../wailsjs/runtime/runtime';

interface Props {
  onDownload: (url: string) => void;
}

const MediaGrabberView: React.FC<Props> = ({ onDownload }) => {
  const [mediaList, setMediaList] = useState<models.MediaItem[]>([]);

  useEffect(() => {
    // Initial load
    GetMediaList().then(setMediaList);

    // Listen for updates
    const off = Events.EventsOn("media-grabber-update", (data: models.MediaItem[]) => {
      setMediaList(data || []);
    });

    return () => off();
  }, []);

  const handleClear = () => {
    if (confirm("Clear all intercepted media?")) {
      ClearMediaList();
    }
  };

  const handleRemove = (id: string) => {
    RemoveMediaItem(id);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0c] animate-in fade-in duration-300">
      <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-white/[0.02] backdrop-blur-xl shrink-0">
        <div className="flex items-center space-x-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Media Grabber</h2>
          <span className="bg-xdm-accent/20 text-xdm-accent text-[10px] font-bold px-2 py-0.5 rounded-full">
            {mediaList.length} Detected
          </span>
        </div>
        <button
          onClick={handleClear}
          disabled={mediaList.length === 0}
          className="text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-red-400 transition-colors disabled:opacity-30"
        >
          Clear All
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
        {mediaList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 opacity-50">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium">No media detected yet</p>
              <p className="text-xs mt-1">Browse videos or audio in your browser to capture them</p>
            </div>
          </div>
        ) : (
          mediaList.map((item) => (
            <div key={item.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.06] transition-all duration-300 group flex items-center justify-between">
              <div className="flex items-center space-x-4 overflow-hidden">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="truncate">
                  <h3 className="text-sm font-semibold text-white/90 truncate leading-tight">{item.filename}</h3>
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">{item.url}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => onDownload(item.url)}
                  className="px-4 py-1.5 bg-xdm-accent hover:bg-blue-600 text-white text-[10px] font-bold rounded-lg transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                  Download
                </button>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-red-400 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MediaGrabberView;
