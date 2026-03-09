import React, { useState } from 'react';

interface Props {
  count: number;
  onConfirm: (deleteFile: boolean) => void;
  onCancel: () => void;
}

const DeleteConfirmationDialog: React.FC<Props> = ({ count, onConfirm, onCancel }) => {
  const [deleteFile, setDeleteFile] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      
      <div className="relative w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">Delete Download{count > 1 ? 's' : ''}</h2>
          </div>

          <p className="text-sm text-gray-400 mb-6 px-1">
            Are you sure you want to remove {count > 1 ? `these ${count} downloads` : 'this download'} from the list?
          </p>

          <label className="flex items-center space-x-3 p-3 bg-white/[0.03] rounded-xl border border-white/5 cursor-pointer hover:bg-white/5 transition-all mb-6 group">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              deleteFile ? 'bg-red-500 border-red-500' : 'border-gray-600 group-hover:border-gray-500'
            }`}>
              {deleteFile && (
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <input 
              type="checkbox" 
              className="hidden" 
              checked={deleteFile} 
              onChange={() => setDeleteFile(!deleteFile)} 
            />
            <div className="flex-1">
              <span className="text-sm font-semibold text-white/90">Delete files from disk</span>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Permanent action — cannot be undone</p>
            </div>
          </label>

          <div className="flex items-center space-x-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-gray-400 transition-all border border-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(deleteFile)}
              className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-bold text-white transition-all shadow-lg shadow-red-500/20 active:scale-95"
            >
              Delete {count > 1 ? `(${count})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationDialog;
