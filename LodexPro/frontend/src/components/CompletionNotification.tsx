import React, { useState, useEffect } from 'react';
import { models } from '../../wailsjs/go/models';
import * as Events from '../../wailsjs/runtime/runtime';
import { OpenFile, OpenFolder } from '../../wailsjs/go/main/App';

const CompletionNotification: React.FC = () => {
  const [completeTask, setCompleteTask] = useState<models.DownloadTask | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const off = Events.EventsOn("download-complete-notification", (task: models.DownloadTask) => {
      setCompleteTask(task);
      setVisible(true);
      
      // Auto-hide after 15 seconds if no action taken
      const timer = setTimeout(() => {
        setVisible(false);
      }, 15000);
      
      return () => clearTimeout(timer);
    });

    return () => off();
  }, []);

  if (!completeTask || !visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-96 animate-in slide-in-from-right-10 fade-in duration-500">
      <div className="relative overflow-hidden bg-[#1a1a1a]/95 backdrop-blur-xl border border-xdm-accent/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col p-5">
        {/* Progress gradient bar at top for flair */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-xdm-accent to-blue-400" />
        
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center shrink-0 border border-green-500/20">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-sm font-bold text-white mb-1 uppercase tracking-wider opacity-60">Download Complete</h3>
            <p className="text-sm font-semibold text-white/90 truncate pr-4">
              {completeTask.filename}
            </p>
            <p className="text-xs text-gray-400 mt-1">Your file is ready for use.</p>
          </div>

          <button 
            onClick={() => setVisible(false)}
            className="text-gray-500 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center space-x-3 mt-5">
          <button
            onClick={() => {
              OpenFile(completeTask.id);
              setVisible(false);
            }}
            className="flex-1 px-4 py-2.5 bg-xdm-accent hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center justify-center space-x-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Open File</span>
          </button>
          
          <button
            onClick={() => {
              OpenFolder(completeTask.id);
              setVisible(false);
            }}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-xl transition-all border border-white/10 flex items-center justify-center space-x-2"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>Open Folder</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompletionNotification;
