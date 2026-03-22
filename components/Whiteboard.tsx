
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Arrow, Image as KonvaImage, Transformer } from 'react-konva';
import { WhiteboardItem, Role, ClientState, Action, WhiteboardObjectType, Mode } from '../types';
import { WhiteboardToolbar, ToolType } from './WhiteboardToolbar';
import useImage from 'use-image';
import Konva from 'konva';

interface WhiteboardProps {
  items: WhiteboardItem[];
  clients: Record<string, ClientState>;
  currentUserRole: Role;
  clientMovementUnlocked: boolean;
  clientDrawingUnlocked: boolean;
  isLaserMode: boolean;
  mode: string;
  onMoveItem: (itemId: string, x: number, y: number) => void;
  onLaserMove: (x: number, y: number, active: boolean) => void;
  sendAction: (action: Action) => void;
  historyIndex: number;
  historyLength: number;
  isMinimized: boolean;
  setIsMinimized: (minimized: boolean) => void;
}

const CANVAS_SIZE = 2000;

const WBImage: React.FC<{ item: WhiteboardItem; isSelected: boolean; onSelect: () => void; onDragEnd: (e: any) => void; onTransformEnd?: (e: any) => void; draggable: boolean; onMouseEnter?: (e: any) => void; onMouseLeave?: (e: any) => void }> = ({ item, isSelected, onSelect, onDragEnd, onTransformEnd, draggable, onMouseEnter, onMouseLeave }) => {
  const [img] = useImage(item.content || '');
  const shapeRef = useRef<Konva.Image>(null);

  useEffect(() => {
    if (shapeRef.current && img) {
      if (item.grayscale) {
        shapeRef.current.cache();
        shapeRef.current.filters([Konva.Filters.Grayscale]);
      } else {
        shapeRef.current.clearCache();
        shapeRef.current.filters([]);
      }
      shapeRef.current.getLayer()?.batchDraw();
    }
  }, [item.grayscale, img]);

  return (
    <KonvaImage
      ref={shapeRef}
      id={item.id}
      image={img}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      rotation={item.rotation}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
};

export const Whiteboard: React.FC<WhiteboardProps> = ({
  items,
  clients,
  currentUserRole,
  clientMovementUnlocked,
  clientDrawingUnlocked,
  isLaserMode,
  mode,
  onMoveItem,
  onLaserMove,
  sendAction,
  historyIndex,
  historyLength,
  isMinimized,
  setIsMinimized
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [color, setColor] = useState('#3b82f6');
  const [strokeWidth, setStrokeWidth] = useState(4);
  
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [tempItem, setTempItem] = useState<WhiteboardItem | null>(null);
  const [isHoveringItem, setIsHoveringItem] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [localLaserPos, setLocalLaserPos] = useState<{x: number, y: number} | null>(null);

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextContent, setEditingTextContent] = useState<string>('');
  const [confirmClear, setConfirmClear] = useState(false);

  const isTherapist = currentUserRole === Role.THERAPIST;
  const hasDrawingAccess = isTherapist || clientDrawingUnlocked;
  const hasMovementAccess = isTherapist || clientMovementUnlocked;
  const isWhiteboardMode = mode === 'whiteboard';

  const prevMovementUnlockedRef = useRef(clientMovementUnlocked);
  const prevDrawingUnlockedRef = useRef(clientDrawingUnlocked);

  useEffect(() => {
    const wasMovementLocked = !prevMovementUnlockedRef.current;
    const wasDrawingLocked = !prevDrawingUnlockedRef.current;
    
    // If transitioning from locked to unlocked OR from no access to access
    if (!isTherapist && ((wasMovementLocked && clientMovementUnlocked) || (wasDrawingLocked && clientDrawingUnlocked))) {
      setActiveTool('select');
    }
    
    prevMovementUnlockedRef.current = clientMovementUnlocked;
    prevDrawingUnlockedRef.current = clientDrawingUnlocked;
  }, [clientMovementUnlocked, clientDrawingUnlocked, isTherapist]);

  const selectedItem = useMemo(() => items.find(i => i.id === selectedItemId) || null, [items, selectedItemId]);

  // Update dimensions to fill container
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const stageX = dimensions.width / 2 - CANVAS_SIZE / 2;
  const stageY = dimensions.height / 2 - CANVAS_SIZE / 2;

  const getPointerPos = (e: any) => {
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return null;
    
    return {
      x: (pointerPosition.x - stagePos.x) / stageScale - stageX,
      y: (pointerPosition.y - stagePos.y) / stageScale - stageY
    };
  };

  const handleZoom = (delta: number) => {
    setStageScale(prev => Math.min(Math.max(0.1, prev + delta), 5));
  };

  const handleResetZoom = () => {
    setStageScale(1);
    setStagePos({ x: 0, y: 0 });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/cardroom-card');
    if (!data) return;

    try {
      const card = JSON.parse(data);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Calculate position relative to stage
      const x = (e.clientX - rect.left - stagePos.x) / stageScale - stageX;
      const y = (e.clientY - rect.top - stagePos.y) / stageScale - stageY;

      const newItem: WhiteboardItem = {
        id: `wb-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: 'CARD',
        content: card.imageUrl,
        x: x - 100, // Center card on drop point
        y: y - 150,
        width: 200,
        height: 300,
        rotation: card.rotation || 0,
        createdBy: currentUserRole
      };

      sendAction({ type: 'ADD_WB_ITEM', payload: { item: newItem }, sender: currentUserRole });
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const handleMouseDown = (e: any) => {
    if (isLaserMode) {
      const pos = getPointerPos(e);
      if (!pos) return;
      setLocalLaserPos(pos);
      onLaserMove(pos.x, pos.y, true);
      return;
    }

    const pos = getPointerPos(e);
    if (!pos) return;

    if (activeTool === 'select' || activeTool === 'hand') {
      if (!hasMovementAccess && activeTool === 'hand') return;
      if (!hasDrawingAccess && activeTool === 'select') return;

      const clickedOnEmpty = e.target === e.target.getStage();
      if (clickedOnEmpty) {
        setSelectedItemId(null);
      }
      return;
    }

    if (!hasDrawingAccess) return;

    if (activeTool === 'eraser') return;

    const id = `wb-${Date.now()}-${Math.random()}`;
    const isLineOrArrow = activeTool === 'line' || activeTool === 'arrow';
    let newItem: WhiteboardItem = {
      id,
      type: activeTool === 'draw' ? 'STROKE' : (activeTool.toUpperCase() as WhiteboardObjectType),
      x: (activeTool === 'draw' || isLineOrArrow) ? 0 : pos.x,
      y: (activeTool === 'draw' || isLineOrArrow) ? 0 : pos.y,
      rotation: 0,
      color,
      strokeWidth,
      createdBy: currentUserRole,
      points: [pos.x, pos.y]
    };

    if (activeTool === 'text') {
      newItem.content = 'Double click to edit';
      newItem.width = 150;
      newItem.height = 30;
      newItem.color = '#000000';
      newItem.fontSize = 22;
      newItem.fontWeight = 'normal';
      newItem.fontFamily = 'Arial';
    } else if (['rect', 'circle', 'arrow', 'line'].includes(activeTool)) {
      newItem.width = 0;
      newItem.height = 0;
      if (isLineOrArrow) {
        newItem.points = [pos.x, pos.y, pos.x, pos.y];
      }
    }

    setTempItem(newItem);
  };

  const handleMouseMove = (e: any) => {
    if (isLaserMode) {
      const pos = getPointerPos(e);
      if (!pos) return;
      setLocalLaserPos(pos);
      onLaserMove(pos.x, pos.y, true);
      return;
    }

    const pos = getPointerPos(e);
    if (!pos) return;

    if (!tempItem) return;

    if (tempItem.type === 'STROKE') {
      setTempItem({
        ...tempItem,
        points: [...(tempItem.points || []), pos.x, pos.y]
      });
    } else if (['RECT', 'CIRCLE', 'ARROW', 'LINE'].includes(tempItem.type)) {
      if (tempItem.type === 'RECT' || tempItem.type === 'CIRCLE') {
        setTempItem({
          ...tempItem,
          width: pos.x - tempItem.x,
          height: pos.y - tempItem.y
        });
      } else {
        // For LINE and ARROW, x and y are 0, so points are absolute
        setTempItem({
          ...tempItem,
          points: [tempItem.points![0], tempItem.points![1], pos.x, pos.y]
        });
      }
    }
  };

  const handleMouseUp = () => {
    if (isLaserMode) {
      return;
    }
    if (tempItem) {
      sendAction({
        type: 'ADD_WB_ITEM',
        payload: { item: tempItem },
        sender: currentUserRole
      });
      
      if (tempItem.type === 'TEXT') {
        setEditingTextId(tempItem.id);
        setEditingTextContent(tempItem.content || '');
      }
      
      setTempItem(null);
    }
  };

  const handleItemClick = (id: string, type: string) => {
    if (activeTool === 'eraser') {
      if (!hasDrawingAccess) return;
      if (type !== 'CARD' && type !== 'IMAGE' && type !== 'TEXT') {
        sendAction({ type: 'DELETE_WB_ITEM', payload: { id }, sender: currentUserRole });
      }
      return;
    }
    if (activeTool === 'select') {
      if (type === 'CARD' && !hasMovementAccess) return;
      if (type !== 'CARD' && !hasDrawingAccess) return;
      setSelectedItemId(id);
    }
  };

  const getLaserColor = (role: Role) => {
    switch (role) {
      case Role.THERAPIST: return '#ef4444'; // Red
      case Role.CLIENT_A: return '#3b82f6';   // Blue
      case Role.CLIENT_B: return '#8b5cf6';   // Purple
      case Role.OBSERVER: return '#10b981';  // Green
      default: return '#6b7280';
    }
  };

  const handleDragEnd = (id: string, e: any) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    if (item.type === 'CARD' && !hasMovementAccess) return;
    if (item.type !== 'CARD' && !hasDrawingAccess) return;
    
    sendAction({
      type: 'UPDATE_WB_ITEM',
      payload: {
        id,
        updates: {
          x: e.target.x(),
          y: e.target.y()
        }
      },
      sender: currentUserRole
    });
  };

  const handleTransformEnd = (id: string, e: any) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    if (item.type === 'CARD' && !hasMovementAccess) return;
    if (item.type !== 'CARD' && !hasDrawingAccess) return;

    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale to 1 and apply to width/height
    node.scaleX(1);
    node.scaleY(1);

    const updates: any = {
      x: node.x(),
      y: node.y(),
      width: Math.max(5, node.width() * scaleX),
      height: Math.max(5, node.height() * scaleY),
      rotation: node.rotation()
    };

    if (item.type === 'TEXT') {
      updates.fontSize = (node as Konva.Text).fontSize();
      delete updates.height; // Let text height auto-calculate
    }

    sendAction({
      type: 'UPDATE_WB_ITEM',
      payload: {
        id,
        updates
      },
      sender: currentUserRole
    });
  };

  const handleTextDblClick = (id: string, currentContent: string) => {
    if (!hasDrawingAccess) return;
    setEditingTextId(id);
    setEditingTextContent(currentContent);
  };

  const handleToggleGrayscale = (id: string) => {
    if (!hasDrawingAccess) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    sendAction({
      type: 'UPDATE_WB_ITEM',
      payload: {
        id,
        updates: { grayscale: !item.grayscale }
      },
      sender: currentUserRole
    });
  };

  const renderItem = (item: WhiteboardItem, isSelected: boolean) => {
    const isDraggable = activeTool === 'select' && (item.type === 'CARD' ? hasMovementAccess : hasDrawingAccess);

    const commonProps = {
      key: item.id,
      id: item.id,
      x: item.x,
      y: item.y,
      rotation: item.rotation,
      stroke: item.color,
      strokeWidth: item.strokeWidth,
      draggable: isDraggable,
      onMouseEnter: () => setIsHoveringItem(true),
      onMouseLeave: () => setIsHoveringItem(false),
      onClick: () => handleItemClick(item.id, item.type),
      onTap: () => handleItemClick(item.id, item.type),
      onDragEnd: (e: any) => handleDragEnd(item.id, e),
      onTransformEnd: (e: any) => handleTransformEnd(item.id, e),
    };

    switch (item.type) {
      case 'STROKE':
        return <Line {...commonProps} points={item.points} lineCap="round" lineJoin="round" tension={0.5} />;
      case 'RECT':
        return <Rect {...commonProps} width={item.width} height={item.height} />;
      case 'CIRCLE':
        return <Circle {...commonProps} radius={Math.sqrt(Math.pow(item.width || 0, 2) + Math.pow(item.height || 0, 2)) / 2} />;
      case 'ARROW':
        return <Arrow {...commonProps} points={item.points} fill={item.color} />;
      case 'LINE':
        return <Line {...commonProps} points={item.points} />;
      case 'TEXT':
        return (
          <Text 
            {...commonProps} 
            strokeEnabled={false}
            text={item.content} 
            width={item.width}
            fontSize={item.fontSize || 22} 
            fontFamily={item.fontFamily || 'Arial'}
            fontStyle={item.fontWeight === 'normal' || item.fontWeight === 400 ? 'normal' : 'bold'}
            fill={item.color} 
            onDblClick={() => handleTextDblClick(item.id, item.content || '')}
            onDblTap={() => handleTextDblClick(item.id, item.content || '')}
            onTransform={(e) => {
              const node = e.target as Konva.Text;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              
              node.width(Math.max(5, node.width() * scaleX));
              
              if (Math.abs(scaleY - 1) > 0.001) {
                node.fontSize(Math.max(5, node.fontSize() * scaleY));
              }
              
              node.scaleX(1);
              node.scaleY(1);
            }}
          />
        );
      case 'CARD':
      case 'IMAGE':
        return <WBImage item={item} isSelected={isSelected} onSelect={() => handleItemClick(item.id, item.type)} onDragEnd={(e) => handleDragEnd(item.id, e)} onTransformEnd={(e) => handleTransformEnd(item.id, e)} draggable={commonProps.draggable} onMouseEnter={commonProps.onMouseEnter} onMouseLeave={commonProps.onMouseLeave} />;
      default:
        return null;
    }
  };

  // Determine if the whiteboard should capture pointer events
  const isInteracting = (hasMovementAccess || hasDrawingAccess) && isWhiteboardMode;

  const getCursor = () => {
    if (isLaserMode) return 'none';
    if (activeTool === 'hand') return 'grab';
    if (!isInteracting) return 'default';
    if (activeTool === 'eraser') return 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0ibTcgMjEtNC4zLTQuM2MtMS0xLTEtMi41IDAtMy40bDkuNi05LjZjMS0xIDIuNS0xIDMuNCAwbDUuNiA1LjZjMSAxIDEgMi41IDAgMy40TDEzIDIxWiIvPjxwYXRoIGQ9Im0yMiAyMS01LjkgMCIvPjxwYXRoIGQ9Im00LjUgMTUuNSAxMC41LTEwLjUiLz48L3N2Zz4=") 0 24, auto';
    if (activeTool === 'draw') return 'crosshair';
    if (activeTool === 'select' && isHoveringItem) return 'move';
    return 'default';
  };

  return (
    <div 
      ref={containerRef} 
      className={`absolute inset-0 z-40 overflow-hidden touch-none transition-opacity duration-300 ${isWhiteboardMode ? 'pointer-events-auto bg-white opacity-100' : 'pointer-events-none bg-transparent opacity-0'}`}
      style={{ cursor: getCursor() }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Toolbar Overlay - Only visible in Whiteboard mode */}
      {isWhiteboardMode && hasDrawingAccess && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <WhiteboardToolbar 
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            color={color}
            setColor={setColor}
            strokeWidth={strokeWidth}
            setStrokeWidth={setStrokeWidth}
            onUndo={() => sendAction({ type: 'UNDO_WB', sender: currentUserRole })}
            onRedo={() => sendAction({ type: 'REDO_WB', sender: currentUserRole })}
            onClear={(id?: string) => {
              if (id) {
                sendAction({ type: 'DELETE_WB_ITEM', payload: { id }, sender: currentUserRole });
                setSelectedItemId(null);
              } else {
                setConfirmClear(true);
              }
            }}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < historyLength - 1}
            isTherapist={isTherapist}
            clientAccess={clientDrawingUnlocked}
            onToggleAccess={() => sendAction({ type: 'TOGGLE_CLIENT_WB_ACCESS', sender: Role.THERAPIST })}
            isMinimized={isMinimized}
            setIsMinimized={setIsMinimized}
            selectedItem={selectedItem}
            onToggleGrayscale={handleToggleGrayscale}
            onEditText={handleTextDblClick}
          />
        </div>
      )}

      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        x={stagePos.x + stageX * stageScale}
        y={stagePos.y + stageY * stageScale}
        scaleX={stageScale}
        scaleY={stageScale}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isLaserMode) {
            setLocalLaserPos(null);
            onLaserMove(0, 0, false);
          }
        }}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={(e) => {
          if (isLaserMode) {
            setLocalLaserPos(null);
            onLaserMove(0, 0, false);
          }
          handleMouseUp();
        }}
        draggable={activeTool === 'select' || activeTool === 'hand'}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setStagePos({ x: e.target.x() - stageX * stageScale, y: e.target.y() - stageY * stageScale });
          }
        }}
        style={{ backgroundColor: 'transparent' }}
      >
        <Layer>
          {items.map((item) => renderItem(item, selectedItemId === item.id))}
          {tempItem && renderItem(tempItem, false)}

          {selectedItemId && (hasMovementAccess || hasDrawingAccess) && activeTool === 'select' && (
            <Transformer
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox;
                return newBox;
              }}
              anchorSize={8}
              borderStroke="#3b82f6"
              anchorStroke="#3b82f6"
              anchorCornerRadius={2}
              ref={(node) => {
                if (node && selectedItemId) {
                  const stage = node.getStage();
                  const selectedNode = stage.findOne('#' + selectedItemId);
                  if (selectedNode) node.nodes([selectedNode]);
                }
              }}
            />
          )}

          {/* Lasers */}
          {isWhiteboardMode && Object.values(clients).map(client => {
            if (!client.laser?.active || client.role === currentUserRole) return null;
            return (
              <Circle 
                key={client.id}
                x={client.laser.x}
                y={client.laser.y}
                radius={10}
                fill={getLaserColor(client.role)}
                opacity={0.6}
                shadowBlur={10}
                shadowColor={getLaserColor(client.role)}
              />
            );
          })}

          {/* Local Laser */}
          {isWhiteboardMode && isLaserMode && localLaserPos && (
            <Circle 
              x={localLaserPos.x}
              y={localLaserPos.y}
              radius={10}
              fill={getLaserColor(currentUserRole)}
              opacity={0.8}
              shadowColor={getLaserColor(currentUserRole)}
              shadowBlur={15}
            />
          )}
        </Layer>
      </Stage>
      {/* Zoom Controls */}
      {isWhiteboardMode && (
        <div className="absolute bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-auto">
          <button 
            className="w-10 h-10 bg-white shadow-md rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 border border-gray-200"
            onClick={() => handleZoom(0.1)}
            title="Zoom In"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button 
            className="w-10 h-10 bg-white shadow-md rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 border border-gray-200"
            onClick={() => handleZoom(-0.1)}
            title="Zoom Out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button 
            className="w-10 h-10 bg-white shadow-md rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-50 border border-gray-200"
            onClick={handleResetZoom}
            title="Reset Zoom"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <div className="bg-white/80 backdrop-blur px-2 py-1 rounded text-[10px] font-mono text-center border border-gray-200">
            {Math.round(stageScale * 100)}%
          </div>
        </div>
      )}

      {/* Text Edit Modal */}
      {editingTextId && (
        <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center pointer-events-auto">
          <div className="bg-white p-6 rounded-xl shadow-xl w-96 max-w-[90vw]">
            <h3 className="text-lg font-bold mb-4">Edit Text</h3>
            <textarea
              className="w-full border border-gray-300 rounded p-2 mb-4 min-h-[100px] outline-none focus:ring-2 focus:ring-blue-500"
              value={editingTextContent}
              onChange={(e) => setEditingTextContent(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button 
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                onClick={() => setEditingTextId(null)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => {
                  sendAction({
                    type: 'UPDATE_WB_ITEM',
                    payload: {
                      id: editingTextId,
                      updates: { content: editingTextContent }
                    },
                    sender: currentUserRole
                  });
                  setEditingTextId(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Clear Modal */}
      {confirmClear && (
        <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center pointer-events-auto">
          <div className="bg-white p-6 rounded-xl shadow-xl w-96 max-w-[90vw] text-center">
            <h3 className="text-lg font-bold mb-2">Clear Whiteboard?</h3>
            <p className="text-gray-600 mb-6">This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button 
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded border border-gray-200"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => {
                  sendAction({ type: 'CLEAR_WHITEBOARD', sender: currentUserRole });
                  setConfirmClear(false);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
