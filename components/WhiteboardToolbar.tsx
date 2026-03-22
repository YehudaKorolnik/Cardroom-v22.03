
import React from 'react';
import { Role, WhiteboardItem } from '../types';

export type ToolType = 'hand' | 'select' | 'draw' | 'text' | 'rect' | 'circle' | 'arrow' | 'line' | 'eraser';

interface WhiteboardToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  color: string;
  setColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: (id?: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  isTherapist: boolean;
  clientAccess: boolean;
  onToggleAccess?: () => void;
  isMinimized: boolean;
  setIsMinimized: (minimized: boolean) => void;
  selectedItem: WhiteboardItem | null;
  onToggleGrayscale: (id: string) => void;
  onEditText?: (id: string, currentContent: string) => void;
}

const COLORS = [
  '#000000', '#4b5563', '#ef4444', '#f97316', '#f59e0b', 
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
];

const STROKE_WIDTHS = [2, 4, 8, 12, 20];

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  activeTool,
  setActiveTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  isTherapist,
  clientAccess,
  onToggleAccess,
  isMinimized,
  setIsMinimized,
  selectedItem,
  onToggleGrayscale,
  onEditText
}) => {
  if (isMinimized) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-white/95 backdrop-blur shadow-lg rounded-xl border border-gray-200 pointer-events-auto">
      <button 
        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 mr-1"
        onClick={() => setIsMinimized(true)}
        title="Minimize"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>

      {/* Tools Group */}
      <div className="flex items-center bg-gray-100 rounded-lg p-1">
        <ToolButton 
          active={activeTool === 'hand'} 
          onClick={() => setActiveTool('hand')} 
          title="Card Interaction (Hand)"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'select'} 
          onClick={() => setActiveTool('select')} 
          title="Select/Move"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'draw'} 
          onClick={() => setActiveTool('draw')} 
          title="Freehand Draw"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'text'} 
          onClick={() => setActiveTool('text')} 
          title="Text Tool"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'rect'} 
          onClick={() => setActiveTool('rect')} 
          title="Rectangle"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'circle'} 
          onClick={() => setActiveTool('circle')} 
          title="Circle"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'arrow'} 
          onClick={() => setActiveTool('arrow')} 
          title="Arrow"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 14 0"/><path d="m13 6 6 6-6 6"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'line'} 
          onClick={() => setActiveTool('line')} 
          title="Straight Line"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5"/></svg>}
        />
        <ToolButton 
          active={activeTool === 'eraser'} 
          onClick={() => setActiveTool('eraser')} 
          title="Eraser"
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21Z"/><path d="m22 21-5.9 0"/><path d="m4.5 15.5 10.5-10.5"/></svg>}
        />
      </div>

      {selectedItem && (selectedItem.type === 'CARD' || selectedItem.type === 'IMAGE') && (
        <>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button 
            className={`p-2 rounded-md transition-all flex items-center gap-1.5 ${selectedItem.grayscale ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            onClick={() => onToggleGrayscale(selectedItem.id)}
            title="Toggle Grayscale"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M12 7h5"/><path d="M12 12h5"/><path d="M12 17h5"/></svg>
            <span className="text-[10px] font-bold uppercase">B&W</span>
          </button>
        </>
      )}

      {selectedItem && selectedItem.type === 'TEXT' && onEditText && (
        <>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button 
            className="p-2 rounded-md bg-blue-100 text-blue-600 hover:bg-blue-200 transition-all flex items-center gap-1.5"
            onClick={() => onEditText(selectedItem.id, selectedItem.content || '')}
            title="Edit Text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            <span className="text-[10px] font-bold uppercase">Edit Text</span>
          </button>
        </>
      )}

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Color Picker */}
      <div className="flex items-center gap-1">
        {COLORS.map(c => (
          <button
            key={c}
            className={`w-5 h-5 rounded-full border border-gray-200 transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : 'hover:scale-110'}`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Stroke Width */}
      <div className="flex items-center gap-1">
        {STROKE_WIDTHS.map(w => (
          <button
            key={w}
            className={`flex items-center justify-center w-6 h-6 rounded hover:bg-gray-100 transition-colors ${strokeWidth === w ? 'bg-blue-50 text-blue-600' : 'text-gray-400'}`}
            onClick={() => setStrokeWidth(w)}
          >
            <div className="rounded-full bg-current" style={{ width: Math.max(2, w/2), height: Math.max(2, w/2) }} />
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* History Group */}
      <div className="flex items-center gap-1">
        <button 
          className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-600"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-15 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <button 
          className="p-2 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent text-gray-600"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-15 9 9 0 0 1 6 2.3L21 13"/></svg>
        </button>
        <button 
          className="p-2 rounded hover:bg-red-50 text-red-500 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={() => selectedItem && onClear(selectedItem.id)}
          disabled={!selectedItem || (selectedItem.type !== 'CARD' && selectedItem.type !== 'TEXT')}
          title="Delete Selected Card/Text"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
        <button 
          className="p-2 rounded hover:bg-red-50 text-red-500 transition-colors"
          onClick={() => onClear()}
          title="Clear Whiteboard"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M12 2v20"/><path d="m4.93 4.93 14.14 14.14"/><path d="m4.93 19.07 14.14-14.14"/></svg>
        </button>
      </div>

      {isTherapist && onToggleAccess && (
        <>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${clientAccess ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
            onClick={onToggleAccess}
          >
            <div className={`w-2 h-2 rounded-full ${clientAccess ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {clientAccess ? 'Client Access: ON' : 'Client Access: OFF'}
          </button>
        </>
      )}
    </div>
  );
};

const ToolButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; title: string; activeColor?: string }> = ({ active, onClick, icon, title, activeColor = 'bg-white text-blue-600 shadow-sm' }) => (
  <button
    className={`p-2 rounded-md transition-all ${active ? activeColor : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
    onClick={onClick}
    title={title}
  >
    {icon}
  </button>
);
