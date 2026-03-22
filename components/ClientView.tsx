
import React, { useState, useEffect, useRef } from 'react';
import { Card, Role, Action, Mode, SessionState, ClientState, ClientViewMode } from '../types';
import { Button } from './Button';
import { Whiteboard } from './Whiteboard';

interface ClientViewProps {
  role: Role;
  state: SessionState;
  sendAction: (action: Action) => void;
}

export const ClientView: React.FC<ClientViewProps> = ({ role, state, sendAction }) => {
  const [showTray, setShowTray] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showEndToast, setShowEndToast] = useState(false);
  const [wbMinimized, setWbMinimized] = useState(true);
  const throttleRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let mode = ClientViewMode.DECK;
    if (showTray) mode = ClientViewMode.TRAY;
    else if (showGrid) mode = ClientViewMode.GRID;
    
    sendAction({ type: 'SET_CLIENT_VIEW', payload: mode, sender: role });
  }, [showTray, showGrid, role]);

  const throttle = (key: string, callback: () => void, limit: number) => {
    const now = Date.now();
    if (!throttleRef.current[key] || now - throttleRef.current[key] >= limit) {
      callback();
      throttleRef.current[key] = now;
    }
  };
  
  // Local Laser State for Immediate Feedback (Deck Mode)
  const [localLaserPos, setLocalLaserPos] = useState<{x: number, y: number} | null>(null);
  // isDraggingRef is only for Non-Laser mode (swiping)
  const startPosRef = useRef<{x:number, y:number} | null>(null);
  
  const myClientState = state.clients[role];
  const deckOrder = state.deckOrders[role] || [];
  const currentCardId = deckOrder[myClientState?.currentCardIndex || 0];
  const currentCard = state.deck.find(c => c.id === currentCardId);
  
  const isInTray = myClientState?.tray.includes(currentCard?.id || '');

  // --- COLORS & STYLES ---
  const getLaserColor = (r: Role) => {
    switch (r) {
      case Role.THERAPIST: return '#3b82f6'; // Blue
      case Role.CLIENT_A: return '#f43f5e';   // Rose
      case Role.CLIENT_B: return '#10b981';   // Emerald
      default: return '#f43f5e';
    }
  };

  // --- ROTATION LOGIC ---
  const serverRotation = currentCardId && myClientState?.cardRotations ? (myClientState.cardRotations[currentCardId] || 0) : 0;
  const [localRotation, setLocalRotation] = useState(serverRotation);
  const [lastSyncedCardId, setLastSyncedCardId] = useState<string | null>(null);
  const [naturalDims, setNaturalDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (currentCardId !== lastSyncedCardId) {
      setLocalRotation(serverRotation);
      setLastSyncedCardId(currentCardId);
    }
  }, [currentCardId, serverRotation, lastSyncedCardId]);

  const handleRotate = () => {
    if (myClientState.laserMode || !currentCardId) return;
    
    // Monotonic increase to prevent backward spin
    const newRotation = localRotation + 90;
    setLocalRotation(newRotation); 
    
    sendAction({ 
      type: 'CLIENT_ROTATE', 
      payload: { cardId: currentCardId, rotation: newRotation },
      sender: role 
    });
  };

  // --- FADING CONTROLS ---
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetControlsTimer = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (state.mode === 'deck' && !showGrid && !showTray) { 
        setControlsVisible(false);
      }
    }, 3000);
  };

  useEffect(() => {
    resetControlsTimer();
    window.addEventListener('touchstart', resetControlsTimer);
    window.addEventListener('mousedown', resetControlsTimer);
    window.addEventListener('mousemove', resetControlsTimer);
    window.addEventListener('click', resetControlsTimer);
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      window.removeEventListener('touchstart', resetControlsTimer);
      window.removeEventListener('mousedown', resetControlsTimer);
      window.removeEventListener('mousemove', resetControlsTimer);
      window.removeEventListener('click', resetControlsTimer);
    };
  }, [state.mode, showGrid, showTray]);

  // --- NAVIGATION ---
  const handleNext = () => {
    const isLast = myClientState.currentCardIndex >= deckOrder.length - 1;
    if (isLast) {
      setShowEndToast(true);
      setTimeout(() => {
        setShowEndToast(false);
        sendAction({ type: 'JUMP_TO_CARD', payload: { cardIndex: 0 }, sender: role });
      }, 2000);
    } else {
      sendAction({ type: 'NEXT_CARD', sender: role });
    }
  };

  const handlePrev = () => {
    if (myClientState.currentCardIndex > 0) {
      sendAction({ type: 'PREV_CARD', sender: role });
    }
  };

  // --- LASER LOGIC (DECK MODE) ---
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const cardImageRef = useRef<HTMLImageElement>(null);

  // Common Laser Update Logic
  const updateLaserFromTouch = (clientX: number, clientY: number) => {
    if (!cardImageRef.current) return;
    const rect = cardImageRef.current.getBoundingClientRect();
    
    // Subtract the image's top-left corner from the touch coordinates
    const touchX = clientX - rect.left;
    const touchY = clientY - rect.top;

    // Get center of the bounding box
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Vector from center to pointer
    const dx = touchX - centerX;
    const dy = touchY - centerY;

    // Inverse rotate the vector to get coordinates relative to the unrotated card
    // totalRotation is the current visual rotation of the card
    const angleRad = (-totalRotation * Math.PI) / 180;
    const nx = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
    const ny = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

    // Get original dimensions (unrotated)
    // offsetWidth/Height are the layout dimensions before CSS transforms
    const cardWidth = cardImageRef.current.offsetWidth;
    const cardHeight = cardImageRef.current.offsetHeight;

    // Map back to 0-1 coordinates relative to the card's top-left
    let x = (nx + cardWidth / 2) / cardWidth;
    let y = (ny + cardHeight / 2) / cardHeight;
    
    // Clamp to 0-1 to ensure we don't send coordinates outside the card
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // Update local visual immediately
    setLocalLaserPos({ x, y });

    // Broadcast to server
    throttle('client-laser', () => {
      sendAction({ 
        type: 'UPDATE_LASER', 
        payload: { x, y, active: true }, 
        sender: role 
      });
    }, 30);
  };

  const hideLaser = () => {
    setLocalLaserPos(null);
    sendAction({ type: 'UPDATE_LASER', payload: { active: false }, sender: role });
  };

  // TOUCH HANDLERS
  const handleTouchStart = (e: React.TouchEvent) => {
    if (myClientState.laserMode) {
      if (e.cancelable) e.preventDefault();
      // Trigger update immediately on touch start so laser appears under finger instantly
      updateLaserFromTouch(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (myClientState.laserMode) {
      if (e.cancelable) e.preventDefault();
      updateLaserFromTouch(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (myClientState.laserMode) {
      hideLaser();
    } else {
      // Swipe Logic
      if (!startPosRef.current) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startPosRef.current.x - endX;
      const diffY = startPosRef.current.y - endY;
      
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal Swipe
        if (diffX > 50) {
          handleNext();
        } else if (diffX < -50) {
          handlePrev();
        }
      }
      startPosRef.current = null;
    }
  };

  // MOUSE HANDLERS (For Desktop & Testing)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (myClientState.laserMode) {
      // e.preventDefault();
      updateLaserFromTouch(e.clientX, e.clientY);
    } else {
      startPosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (myClientState.laserMode) {
      // Hover logic - always update if mode is on
      updateLaserFromTouch(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (myClientState.laserMode) {
      // Do NOT turn off laser on mouse up, allows persistent pointing
    } else {
      if (!startPosRef.current) return;
      const endX = e.clientX;
      const endY = e.clientY;
      const diffX = startPosRef.current.x - endX;
      const diffY = startPosRef.current.y - endY;
      
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal Swipe simulation
        if (diffX > 50) {
          handleNext();
        } else if (diffX < -50) {
          handlePrev();
        }
      }
      startPosRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (myClientState.laserMode) {
      hideLaser();
    }
  };

  const handleJumpToCard = (index: number) => {
    sendAction({ type: 'JUMP_TO_CARD', payload: { cardIndex: index }, sender: role });
    setShowTray(false);
    setShowGrid(false);
  };

  // --- RENDER HELPERS ---
  const renderLaser = (client: ClientState) => {
    if (client.role === role) return null; // Do not render self from server state (use local)
    if (!client.laser || !client.laser.active) return null;
    const color = getLaserColor(client.role);
    return (
      <div 
        key={client.id}
        className="absolute w-6 h-6 rounded-full z-50 pointer-events-none"
        style={{ 
          left: `${client.laser.x * 100}%`, 
          top: `${client.laser.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          backgroundColor: color,
          boxShadow: `0 0 15px 4px ${color}`,
          mixBlendMode: 'multiply' 
        }}
      />
    );
  };

  // Waiting Room
  if (state.status === 'WAITING') {
    return (
      <div className="flex flex-col items-center justify-center h-screen h-[100dvh] min-h-[100dvh] bg-white p-6 text-center">
        <h1 className="text-2xl font-bold text-primary mb-2">Welcome, {myClientState.name}</h1>
        <p className="text-gray-500 mb-2">
          Waiting for therapist to start the session...
        </p>
        <p className="text-xs text-gray-400 mb-8">Please stay on this page.</p>
        <div className="animate-pulse w-12 h-12 rounded-full bg-teal-100"></div>
      </div>
    );
  }

  // --- DECK MODE ---
  const totalRotation = (currentCard?.rotation || 0) + localRotation;
  const isRotated = totalRotation % 180 !== 0;

  return (
    <div className="h-screen h-[100dvh] min-h-[100dvh] w-full bg-gray-50 flex flex-col relative overflow-hidden">
      
      {/* Connection Overlay */}
      {!myClientState.isConnected && (
           <div className="absolute inset-0 bg-black/50 z-[100] flex flex-col items-center justify-center text-white backdrop-blur-sm pointer-events-auto">
             <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
             <span className="font-bold">Reconnecting...</span>
           </div>
      )}

      {/* Top Bar */}
      <div className={`absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/90 to-transparent flex items-start justify-end px-4 pt-4 z-50 transition-opacity duration-500 pointer-events-none ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex space-x-3 pointer-events-auto">
             {state.mode === 'whiteboard' && state.whiteboard.clientDrawingUnlocked && (
               <button 
                 className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border shadow-sm ${wbMinimized ? 'bg-white text-blue-600 border-gray-200' : 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200'}`}
                 onClick={() => setWbMinimized(!wbMinimized)}
                 title={wbMinimized ? "Show Whiteboard Tools" : "Hide Whiteboard Tools"}
               >
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
               </button>
             )}
             {/* Laser Toggle */}
             <button 
               className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border shadow-sm ${myClientState.laserMode ? "bg-green-600 text-white border-green-600 ring-2 ring-green-200" : "bg-white text-gray-600 border-gray-200"}`}
               onClick={() => sendAction({ type: 'TOGGLE_LASER_MODE', sender: role })}
               title="Toggle Spotlight"
             >
               {/* Pointing Hand Icon */}
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><line x1="6" y1="6" x2="18" y2="6"/><line x1="12" y1="12" x2="12" y2="12"/></svg>
             </button>
             
             {/* Grid View */}
             <button 
               className="w-12 h-12 rounded-full flex items-center justify-center bg-white text-gray-600 border border-gray-200 shadow-sm active:scale-95 transition-transform"
               onClick={() => setShowGrid(true)}
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
             </button>

             {/* Tray Open */}
             <button 
               className="w-12 h-12 rounded-full flex items-center justify-center bg-white text-gray-600 border border-gray-200 shadow-sm active:scale-95 transition-transform relative"
               onClick={() => setShowTray(true)}
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
               {myClientState.tray.length > 0 && (
                 <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                   {myClientState.tray.length}
                 </span>
               )}
             </button>
        </div>
      </div>

      {/* Main Card Area - Flexible Container */}
      <div className="flex-1 bg-gray-100/50 relative overflow-hidden">
        
        {/* Responsive Container - Limited by both width and height to prevent mobile cropping */}
        <div 
          className="absolute transition-transform duration-300 ease-in-out"
          style={{ 
            touchAction: myClientState.laserMode ? 'none' : 'auto', 
            cursor: myClientState.laserMode ? 'none' : 'default',
            transform: `translate(-50%, -50%) rotate(${totalRotation}deg)`,
            left: '50%',
            top: '50%',
            maxWidth: isRotated ? '85vh' : '90vw',
            maxHeight: isRotated ? '90vw' : '85vh',
            width: naturalDims.w ? `min(${naturalDims.w}px, calc(${isRotated ? '90vw' : '85vh'} * ${naturalDims.w / naturalDims.h}))` : 'auto',
            height: naturalDims.h ? `min(${naturalDims.h}px, calc(${isRotated ? '85vh' : '90vw'} / ${naturalDims.w / naturalDims.h}))` : 'auto',
            aspectRatio: naturalDims.w ? `${naturalDims.w} / ${naturalDims.h}` : 'auto'
          }}
          ref={cardContainerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleRotate}
        >
          {currentCard ? (
            <>
              <img 
                ref={cardImageRef}
                src={currentCard.imageUrl} 
                alt="Therapy Card" 
                onLoad={(e) => setNaturalDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="block w-full h-full pointer-events-none select-none"
              />
              
              {/* Render Server Lasers */}
              {state.mode === 'deck' && (Object.values(state.clients) as ClientState[]).map(client => renderLaser(client))}

              {/* Render Local Laser (Deck Mode) */}
              {state.mode === 'deck' && localLaserPos && (
                <div 
                  className="absolute w-6 h-6 rounded-full z-50 pointer-events-none"
                  style={{ 
                    left: `${localLaserPos.x * 100}%`, 
                    top: `${localLaserPos.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: getLaserColor(role),
                    boxShadow: `0 0 15px 4px ${getLaserColor(role)}`,
                    mixBlendMode: 'multiply' 
                  }}
                />
              )}
            </>
          ) : (
            <div className="text-gray-400 text-sm p-20">End of Deck</div>
          )}
        </div>

        {/* End Toast */}
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-8 py-4 rounded-xl backdrop-blur-md transition-all duration-300 pointer-events-none z-50 text-center ${showEndToast ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <p className="font-bold text-lg">End of Deck</p>
          <p className="text-sm text-gray-300">Returning to start...</p>
        </div>
      </div>

      {/* Bottom Controls (Consistent Circular Buttons) */}
      <div className={`absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white via-white/90 to-transparent px-8 flex items-center justify-between z-50 pb-8 transition-opacity duration-500 pointer-events-none ${controlsVisible && state.mode !== 'whiteboard' ? 'opacity-100' : 'opacity-0'}`}>
        
        {/* Prev */}
        <button 
          className={`${controlsVisible && state.mode !== 'whiteboard' ? 'pointer-events-auto' : 'pointer-events-none'} w-16 h-16 rounded-full bg-white text-gray-600 border border-gray-200 shadow-lg flex items-center justify-center active:scale-95 transition-transform hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed`}
          onClick={handlePrev}
          disabled={myClientState.currentCardIndex === 0}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>

        {/* Tray/Heart */}
        <button 
          onClick={() => sendAction({ type: isInTray ? 'REMOVE_FROM_TRAY' : 'ADD_TO_TRAY', sender: role })}
          className={`${controlsVisible && state.mode !== 'whiteboard' ? 'pointer-events-auto' : 'pointer-events-none'} w-20 h-20 rounded-full shadow-xl flex items-center justify-center transition-all transform active:scale-95 border-4 ${isInTray ? 'bg-rose-600 border-rose-100 text-white' : 'bg-white border-gray-100 text-gray-400 hover:text-rose-400'}`}
        >
           {isInTray ? (
             <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
           ) : (
             <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
           )}
        </button>

        {/* Next */}
        <button 
          className={`${controlsVisible && state.mode !== 'whiteboard' ? 'pointer-events-auto' : 'pointer-events-none'} w-16 h-16 rounded-full bg-white text-gray-600 border border-gray-200 shadow-lg flex items-center justify-center active:scale-95 transition-transform hover:bg-gray-50`}
          onClick={handleNext}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Whiteboard Overlay */}
      <Whiteboard 
        items={state.whiteboard.items}
        clients={state.clients}
        currentUserRole={role}
        clientMovementUnlocked={state.whiteboard.clientMovementUnlocked}
        clientDrawingUnlocked={state.whiteboard.clientDrawingUnlocked}
        isLaserMode={myClientState.laserMode}
        mode={state.mode}
        onMoveItem={(id, x, y) => sendAction({ type: 'MOVE_WB_ITEM', payload: { id, x, y }, sender: role })}
        onLaserMove={(x, y, active) => {
          throttle('client-wb-laser', () => {
            sendAction({ type: 'UPDATE_LASER', payload: { x, y, active }, sender: role });
          }, 30);
        }}
        sendAction={sendAction}
        historyIndex={state.whiteboard.historyIndex}
        historyLength={state.whiteboard.history.length}
        isMinimized={wbMinimized}
        setIsMinimized={setWbMinimized}
      />

      {/* Tray Drawer */}
      <div className={`absolute inset-0 bg-white z-50 transition-transform duration-300 ease-in-out ${showTray ? 'translate-y-0' : 'translate-y-full'}`}>
         <div className="h-full flex flex-col">
            <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 bg-white">
               <span className="text-gray-800 font-bold text-lg">My Tray</span>
               <button className="px-4 py-2 rounded-full bg-gray-100 text-gray-600 font-medium" onClick={() => setShowTray(false)}>Close</button>
            </div>
             <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 content-start bg-gray-50">
               {myClientState.tray.map((cardId) => {
                 const card = state.deck.find(c => c.id === cardId);
                 const cardIndex = deckOrder.indexOf(cardId);
                 if(!card) return null;
                 const rot = myClientState.cardRotations[cardId] || 0;
                 const totalRot = rot + card.rotation;

                 return (
                   <div 
                    key={cardId} 
                    className="relative group rounded-lg transition-all bg-white border border-gray-200 shadow-sm flex items-center justify-center" 
                     style={{ aspectRatio: '1 / 1' }}
                    onClick={() => handleJumpToCard(cardIndex)}
                   >
                       {/* Remove Button */}
                       <button 
                         className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10 hover:bg-red-600 transition-colors"
                         onClick={(e) => {
                           e.stopPropagation();
                           sendAction({ type: 'REMOVE_FROM_TRAY', payload: { cardId }, sender: role });
                         }}
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                       </button>

                       <div className="w-full h-full flex items-center justify-center p-2">
                        <img 
                          src={card.imageUrl} 
                          className="max-w-full max-h-full object-contain transition-transform duration-300" 
                          style={{ transform: `rotate(${totalRot}deg)` }}
                          alt="Tray card"
                        />
                       </div>
                   </div>
                 )
               })}
            </div>
         </div>
      </div>

      {/* Grid View */}
      <div className={`absolute inset-0 bg-white z-50 transition-transform duration-300 ease-in-out ${showGrid ? 'translate-y-0' : 'translate-y-full'}`}>
         <div className="h-full flex flex-col">
            <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 bg-white">
               <span className="text-gray-800 font-bold text-lg">All Cards</span>
               <button className="px-4 py-2 rounded-full bg-gray-100 text-gray-600 font-medium" onClick={() => setShowGrid(false)}>Close</button>
            </div>
             <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 content-start bg-gray-50">
               {deckOrder.map((cardId, index) => {
                 const card = state.deck.find(c => c.id === cardId);
                 if(!card) return null;
                 const rot = myClientState.cardRotations[cardId] || 0;
                 const isCurrent = index === myClientState.currentCardIndex;
                 const totalRot = rot + card.rotation;

                 return (
                   <div 
                      key={cardId} 
                      className={`relative group rounded-lg transition-all bg-white border border-gray-200 shadow-sm flex items-center justify-center ${isCurrent ? 'ring-4 ring-teal-500 ring-offset-2' : ''}`} 
                      style={{ aspectRatio: '1 / 1' }}
                      onClick={() => handleJumpToCard(index)}
                    >
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <img 
                          src={card.imageUrl} 
                          className="max-w-full max-h-full object-contain transition-transform duration-300" 
                          style={{ transform: `rotate(${totalRot}deg)` }}
                          alt="Card"
                        />
                      </div>
                   </div>
                 )
               })}
            </div>
         </div>
      </div>

    </div>
  );
};
