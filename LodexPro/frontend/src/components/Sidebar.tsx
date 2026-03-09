import React from 'react';

interface Props {
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  onSettingsClick: () => void;
}

const Sidebar: React.FC<Props> = ({ activeCategory, onSelectCategory, onSettingsClick }) => {
  const categories = [
    { id: 'all', name: 'All Downloads', icon: 'M4 6h16M4 12h16M4 18h16' },
    { id: 'compressed', name: 'Compressed', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: 'documents', name: 'Documents', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'music', name: 'Music', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
    { id: 'video', name: 'Video', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { id: 'programs', name: 'Programs', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    { id: 'media-grabber', name: 'Media Grabber', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z' },
  ];

  return (
    <div className="w-64 h-full bg-xdm-dark border-r border-white/10 flex flex-col p-4 shadow-2xl">
      <h1 className="text-3xl font-bold text-white mb-10 px-2 tracking-tight flex items-center space-x-3">
        <div className="w-11 h-11 bg-gradient-to-br from-xdm-accent to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 active:scale-95 transition-transform cursor-pointer">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
          </svg>
        </div>
        <span>Lodex<span className="text-xdm-accent">Pro</span></span>
      </h1>
      <nav className="space-y-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
              activeCategory === cat.id ? 'bg-xdm-accent text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className={`w-5 h-5 ${activeCategory === cat.id ? 'text-white' : 'group-hover:text-xdm-accent'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cat.icon} />
            </svg>
            <span>{cat.name}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto space-y-1">
        <button 
          onClick={onSettingsClick}
          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
