
import React, { useState, useRef } from 'react';
import { SessionState, Action, Role, Mode, SessionType, Card, ClientState, ClientViewMode } from '../types';
import { Button } from './Button';
import { Whiteboard } from './Whiteboard';

const ClientNameInput = ({ role, name, updateName }: { role: Role, name: string, updateName: (role: Role, name: string) => void }) => {
  const [localName, setLocalName] = useState(name);
  const [isFocused, setIsFocused] = useState(false);
  
  React.useEffect(() => {
    if (!isFocused) {
      setLocalName(name);
    }
  }, [name, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
    updateName(role, e.target.value);
  };

  return (
    <input 
      className="w-full border rounded px-2 py-1 text-sm focus:border-primary outline-none"
      value={localName}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  );
};

interface TherapistDashboardProps {
  state: SessionState;
  sendAction: (action: Action) => void;
}

export const TherapistDashboard: React.FC<TherapistDashboardProps> = ({ state, sendAction }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // UI State for processing images
  const [wbMinimized, setWbMinimized] = useState(true);
  const [localLaserPos, setLocalLaserPos] = useState<{x: number, y: number, targetRole: string} | null>(null);
  const myState = state.clients[Role.THERAPIST];
  const throttleRef = useRef<Record<string, number>>({});

  const setCurrentMode = (mode: string) => {
    sendAction({ type: 'SET_MODE', payload: mode, sender: Role.THERAPIST });
  };

  const throttle = (key: string, callback: () => void, limit: number) => {
    const now = Date.now();
    if (!throttleRef.current[key] || now - throttleRef.current[key] >= limit) {
      callback();
      throttleRef.current[key] = now;
    }
  };

  const getClientCard = (role: Role) => {
    const client = state.clients[role];
    if (!client) return null;
    const deckOrder = state.deckOrders[role];
    if (!deckOrder) return null;
    const cardId = deckOrder[client.currentCardIndex];
    return state.deck.find(c => c.id === cardId);
  };

  const handleImportTray = (role: Role) => {
    const client = state.clients[role];
    const trayCards = client.tray.map(id => state.deck.find(c => c.id === id)).filter(c => !!c);
    
    const cardWidth = 200;
    const cardHeight = 300;
    const spacing = 20;
    const CANVAS_SIZE = 2000;
    const maxCols = Math.floor(CANVAS_SIZE / (cardWidth + spacing));
    const cols = Math.min(trayCards.length, maxCols);
    const rows = Math.ceil(trayCards.length / maxCols);
    
    const gridWidth = cols * cardWidth + Math.max(0, cols - 1) * spacing;
    const gridHeight = rows * cardHeight + Math.max(0, rows - 1) * spacing;
    
    const offsetX = (CANVAS_SIZE - gridWidth) / 2;
    const offsetY = (CANVAS_SIZE - gridHeight) / 2;

    const newItems = trayCards.map((card, i) => {
      if (!card) return null;
      const clientRotation = client.cardRotations[card.id] || 0;
      const colIndex = i % maxCols;
      const rowIndex = Math.floor(i / maxCols);
      
      const x = offsetX + colIndex * (cardWidth + spacing);
      const y = offsetY + rowIndex * (cardHeight + spacing);
      const rotation = (card.rotation + clientRotation) % 360;

      return {
        id: `wb-${Date.now()}-${i}-${Math.random().toString(36).substr(2,5)}`,
        type: 'CARD',
        content: card.imageUrl,
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        rotation,
        createdBy: Role.THERAPIST
      };
    }).filter(item => !!item);

    sendAction({ type: 'IMPORT_TRAY', payload: { items: newItems }, sender: Role.THERAPIST });
  };

  const copyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?session=${state.sessionId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to compress images before sending over PeerJS
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 800px (Good balance for quality vs speed)
          const MAX_SIZE = 800;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG 70% quality
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsProcessing(true);
      const files = Array.from(e.target.files) as File[];
      const newCards: Card[] = [];

      try {
        // Process sequentially to avoid memory spikes
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const compressedBase64 = await compressImage(file);
          newCards.push({
            id: `custom-${Date.now()}-${i}`,
            title: file.name,
            imageUrl: compressedBase64,
            rotation: 0
          });
        }
        
        sendAction({ type: 'UPLOAD_DECK', payload: newCards, sender: Role.THERAPIST });
      } catch (err) {
        console.error("Error processing images", err);
        alert("Failed to process some images.");
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const updateClientName = (role: string, name: string) => {
    sendAction({ 
      type: 'UPDATE_SETTINGS', 
      payload: { names: { [role]: name } }, 
      sender: Role.THERAPIST 
    });
  };

  const forceClientView = (role: Role, cardId: string) => {
    sendAction({ type: 'JUMP_TO_CARD', payload: { targetRole: role, cardId }, sender: Role.THERAPIST });
  };

  const handleDragStart = (e: React.DragEvent, card: Card) => {
    e.dataTransfer.setData('application/cardroom-card', JSON.stringify(card));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getLaserColor = (r: Role) => {
    switch (r) {
      case Role.THERAPIST: return '#3b82f6'; // Blue
      case Role.CLIENT_A: return '#f43f5e';   // Rose
      case Role.CLIENT_B: return '#10b981';   // Emerald
      default: return '#f43f5e';
    }
  };

  // Handle Therapist Laser Logic for Deck Mode
  const handleTherapistMouseMove = (e: React.MouseEvent, rotation: number, targetRole: string) => {
    if (myState?.laserMode && state.mode === 'deck') {
       const rect = e.currentTarget.getBoundingClientRect();
       
       // Get center of the card in screen space
       const centerX = rect.left + rect.width / 2;
       const centerY = rect.top + rect.height / 2;

       // Vector from center to pointer
       const dx = e.clientX - centerX;
       const dy = e.clientY - centerY;

       // Inverse rotate the vector to get coordinates relative to the unrotated card
       const angleRad = (-rotation * Math.PI) / 180;
       const nx = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
       const ny = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

       // Get original dimensions (unrotated)
       const cardWidth = (e.currentTarget as HTMLElement).offsetWidth;
       const cardHeight = (e.currentTarget as HTMLElement).offsetHeight;

       // Map back to 0-1 coordinates relative to the card's top-left
       let x = (nx + cardWidth / 2) / cardWidth;
       let y = (ny + cardHeight / 2) / cardHeight;
       
       if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          setLocalLaserPos({ x, y, targetRole });
          throttle('therapist-laser', () => {
            sendAction({ type: 'UPDATE_LASER', payload: { x, y, active: true }, sender: Role.THERAPIST });
          }, 30);
       }
    }
  };

  const handleTherapistMouseLeave = () => {
     if (myState?.laserMode) {
        setLocalLaserPos(null);
        sendAction({ type: 'UPDATE_LASER', payload: { active: false }, sender: Role.THERAPIST });
     }
  };

  return (
    <div className="h-screen h-[100dvh] min-h-[100dvh] w-full flex bg-gray-100 overflow-hidden font-sans text-gray-800">
      
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col shadow-lg z-20 flex-shrink-0 h-full">
        <div className="p-4 border-b bg-teal-50">
          <h1 className="text-xl font-bold text-primary">Cardroom Host</h1>
          <div className="flex items-center justify-between mt-2">
             <span className="text-xs font-mono bg-white border px-2 py-1 rounded text-gray-600 select-all">
               ID: {state.sessionId}
             </span>
             <Button size="sm" variant="secondary" className="text-xs h-7" onClick={copyLink}>
               {copied ? 'Copied!' : 'Copy Link'}
             </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          {/* Config */}
          <div className="p-4 border-b">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configuration</h3>
            
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4 relative">
              {state.status === 'ACTIVE' && <div className="absolute inset-0 bg-white/50 cursor-not-allowed z-10" title="Cannot change mode during active session" />}
              <button 
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${state.sessionType === SessionType.SINGLE ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                onClick={() => sendAction({ type: 'UPDATE_SETTINGS', payload: { sessionType: SessionType.SINGLE }, sender: Role.THERAPIST })}
              >
                Single
              </button>
              <button 
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-all ${state.sessionType === SessionType.COUPLE ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                onClick={() => sendAction({ type: 'UPDATE_SETTINGS', payload: { sessionType: SessionType.COUPLE }, sender: Role.THERAPIST })}
              >
                Couple
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Client A Name</label>
                <ClientNameInput 
                  role={Role.CLIENT_A}
                  name={state.clients[Role.CLIENT_A].name}
                  updateName={updateClientName}
                />
              </div>
              {state.sessionType === SessionType.COUPLE && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Client B Name</label>
                  <ClientNameInput 
                    role={Role.CLIENT_B}
                    name={state.clients[Role.CLIENT_B].name}
                    updateName={updateClientName}
                  />
                </div>
              )}
            </div>
            
            {state.clients[Role.OBSERVER].isConnected && (
              <div className="mt-4 p-2 bg-teal-50 border border-teal-100 rounded-lg flex items-center justify-between">
                <span className="text-xs font-medium text-teal-700 flex items-center">
                  <span className="w-2 h-2 bg-teal-500 rounded-full mr-2 animate-pulse" />
                  Computer View Connected
                </span>
              </div>
            )}
          </div>

          {/* Waiting Room */}
          {(Object.values(state.clients) as ClientState[]).some(c => c.isConnected && !c.isAdmitted && c.role !== Role.THERAPIST) && (
            <div className="p-4 border-b bg-amber-50">
              <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3">Waiting Room</h3>
              <div className="space-y-2">
                {(Object.values(state.clients) as ClientState[]).filter(c => c.isConnected && !c.isAdmitted && c.role !== Role.THERAPIST).map(client => (
                  <div key={client.role} className="flex items-center justify-between bg-white p-2 rounded border border-amber-200 shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-700">{client.name}</span>
                      <span className="text-[10px] text-gray-500 uppercase">{client.role.replace('_', ' ')}</span>
                    </div>
                    <Button 
                      size="sm" 
                      className="h-7 text-xs px-3 bg-green-600 hover:bg-green-700" 
                      onClick={() => sendAction({ type: 'ADMIT_CLIENT', payload: { role: client.role }, sender: Role.THERAPIST })}
                    >
                      Admit
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

           {/* Live Trays */}
           <div className="p-4 space-y-4 border-b">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Live Trays</h3>
            {[Role.CLIENT_A, Role.CLIENT_B].map((role) => {
              if (state.sessionType === SessionType.SINGLE && role === Role.CLIENT_B) return null;
              const client = state.clients[role as Role];
              return (
                <div key={role} className="bg-slate-50 p-3 rounded-lg border">
                  <div className="flex justify-between items-center mb-2">
                    <span className={`font-semibold text-sm ${role === Role.CLIENT_A ? 'text-amber-600' : 'text-pink-600'}`}>
                      {client.name}
                      {client.viewMode !== ClientViewMode.DECK && (
                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full uppercase tracking-tighter font-bold animate-pulse">
                          Viewing {client.viewMode}
                        </span>
                      )}
                    </span>
                    <span className="text-xs bg-white px-2 py-0.5 rounded border">
                      {client.tray.length} cards
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {client.tray.map(cardId => {
                      const card = state.deck.find(c => c.id === cardId);
                      if (!card) return null;
                      const rot = client.cardRotations[cardId] || 0;
                      const displayRot = (card.rotation || 0) + rot;

                      return (
                        <div 
                          key={cardId} 
                          className="w-full aspect-square bg-white rounded shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-300 flex items-center justify-center p-1 overflow-hidden"
                          title="Drag to Whiteboard or Click to Show"
                          draggable
                          onDragStart={(e) => handleDragStart(e, card)}
                          onClick={() => forceClientView(role as Role, cardId)}
                        >
                          <img 
                            src={card.imageUrl} 
                            className="max-w-full max-h-full object-contain transition-transform duration-300 rounded"
                            style={{ transform: `rotate(${displayRot}deg)` }}
                          />
                        </div>
                      )
                    })}
                  </div>
                  {client.tray.length === 0 && <span className="text-xs text-gray-400 block text-center py-2 italic">Empty Tray</span>}
                  {client.tray.length > 0 && (
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => handleImportTray(role as Role)}>
                        Import All
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Deck Management */}
          <div className="p-4 pb-20">
             <div className="flex justify-between items-center mb-3">
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Card Deck ({state.deck.length})</h3>
               <div className="space-x-1">
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    multiple 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                 />
                 <button className="text-xs text-blue-600 hover:underline" onClick={() => fileInputRef.current?.click()}>
                   {isProcessing ? 'Processing...' : 'Upload'}
                 </button>
                 <span className="text-gray-300">|</span>
                 <button className="text-xs text-red-600 hover:underline" onClick={() => sendAction({ type: 'CLEAR_DECK', sender: Role.THERAPIST })}>Clear</button>
               </div>
             </div>
             <div className="grid grid-cols-3 gap-2">
                {state.deck.map(card => (
                  <div 
                    key={card.id} 
                    className="aspect-square relative group bg-gray-100 rounded border hover:border-blue-400 transition-colors cursor-grab active:cursor-grabbing flex items-center justify-center p-1"
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                  >
                     <img src={card.imageUrl} className="w-full h-full object-contain bg-white" alt="thumbnail" />
                     <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity z-10">
                        <button onClick={() => forceClientView(Role.CLIENT_A, card.id)} className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded w-16 hover:bg-amber-500">Show A</button>
                        {state.sessionType === SessionType.COUPLE && (
                          <button onClick={() => forceClientView(Role.CLIENT_B, card.id)} className="text-[10px] bg-pink-600 text-white px-2 py-0.5 rounded w-16 hover:bg-pink-500">Show B</button>
                        )}
                     </div>
                     <button 
                        className="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 z-20 hover:bg-red-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendAction({ type: 'DELETE_CARD', payload: { id: card.id }, sender: Role.THERAPIST });
                        }}
                     >
                       ×
                     </button>
                  </div>
                ))}
             </div>
             {state.deck.length === 0 && <div className="text-center text-xs text-gray-400 italic mt-4">No cards uploaded</div>}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 mt-auto">
          <Button className="w-full" variant="danger" onClick={() => sendAction({ type: 'RESET', sender: Role.THERAPIST })}>
            Reset Session
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm z-10">
          <div className="flex space-x-4">
            <Button 
              variant={state.mode === 'deck' ? 'primary' : 'secondary'}
              onClick={() => sendAction({ type: 'SET_MODE', payload: 'deck', sender: Role.THERAPIST })}
            >
              Deck View
            </Button>
            <Button 
              variant={state.mode === 'whiteboard' ? 'primary' : 'secondary'}
              onClick={() => setCurrentMode('whiteboard')}
            >
              Whiteboard
            </Button>
          </div>
          
          <div className="flex items-center space-x-4">
             {/* Consistent Spotlight Button */}
             <button 
               className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm ${myState?.laserMode ? 'bg-green-600 text-white border-green-600 ring-2 ring-green-200' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
               onClick={() => sendAction({ type: 'TOGGLE_LASER_MODE', sender: Role.THERAPIST })}
               title="Toggle Spotlight"
             >
                {/* Pointing Hand Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><line x1="6" y1="6" x2="18" y2="6"/><line x1="12" y1="12" x2="12" y2="12"/></svg>
             </button>

            {state.mode === 'whiteboard' && (
              <div className="flex items-center space-x-2">
                <button 
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm ${!wbMinimized ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => setWbMinimized(!wbMinimized)}
                  title={wbMinimized ? "Show Whiteboard Tools" : "Hide Whiteboard Tools"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <Button 
                 variant={!state.whiteboard.clientMovementUnlocked ? 'danger' : 'secondary'}
                 onClick={() => sendAction({ type: 'TOGGLE_LOCK', sender: Role.THERAPIST })}
                >
                  {!state.whiteboard.clientMovementUnlocked ? 'Unlock Clients' : 'Lock Clients'}
                </Button>
              </div>
            )}
            <div className={`text-sm font-medium px-3 py-1 rounded ${state.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {state.status === 'WAITING' ? 'Waiting for Start' : 'Session Active'}
            </div>
            {state.status === 'WAITING' && (
               <Button onClick={() => {
                 sendAction({ type: 'START_SESSION', sender: Role.THERAPIST });
                 sendAction({ type: 'SET_MODE', payload: 'deck', sender: Role.THERAPIST });
               }}>
                 Start Session
               </Button>
            )}
          </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 bg-gray-200 relative overflow-hidden">
          <div className="h-full flex items-center justify-center p-8 gap-8 relative">
            {[Role.CLIENT_A, Role.CLIENT_B].map(role => {
               if (state.sessionType === SessionType.SINGLE && role === Role.CLIENT_B) return null;
               const card = getClientCard(role as Role);
               const client = state.clients[role as Role];
               
               const clientRot = (card && client.cardRotations) ? (client.cardRotations[card.id] || 0) : 0;
               const totalRotation = (card?.rotation || 0) + clientRot;

               return (
                 <div key={role} className="flex flex-col items-center h-full max-h-[600px] w-auto aspect-[9/19]">
                   <div 
                     className={`relative w-full h-full rounded-2xl shadow-xl bg-white flex flex-col overflow-hidden border-4 ${role === Role.CLIENT_A ? 'border-amber-400' : 'border-pink-400'}`}
                     style={{ cursor: myState?.laserMode ? 'crosshair' : 'default' }}
                   >
                      {card ? (
                        <div className="flex-1 relative bg-gray-50 p-2 flex items-center justify-center min-w-0 min-h-0">
                           <div 
                             className="w-full aspect-square flex items-center justify-center relative min-w-0 min-h-0"
                             style={{ transform: `rotate(${totalRotation}deg)` }}
                           >
                             <div 
                               className="relative inline-flex max-w-full max-h-full min-w-0 min-h-0"
                               onMouseMove={(e) => handleTherapistMouseMove(e, totalRotation, role)}
                               onMouseLeave={handleTherapistMouseLeave}
                               onTouchStart={(e) => {
                                 if (myState?.laserMode) {
                                   e.preventDefault();
                                   const touch = e.touches[0];
                                   handleTherapistMouseMove({ clientX: touch.clientX, clientY: touch.clientY, currentTarget: e.currentTarget } as any, totalRotation, role);
                                 }
                               }}
                               onTouchMove={(e) => {
                                 if (myState?.laserMode) {
                                   e.preventDefault();
                                   const touch = e.touches[0];
                                   handleTherapistMouseMove({ clientX: touch.clientX, clientY: touch.clientY, currentTarget: e.currentTarget } as any, totalRotation, role);
                                 }
                               }}
                               onTouchEnd={(e) => {
                                 if (myState?.laserMode) {
                                   e.preventDefault();
                                   handleTherapistMouseLeave();
                                 }
                               }}
                             >
                               <img 
                                 src={card.imageUrl} 
                                 className="max-w-full max-h-full min-w-0 min-h-0 object-contain shadow-md bg-white transition-transform duration-300 pointer-events-none"
                               />
                               
                               {/* LASERS INSIDE ROTATED CONTAINER */}
                               {(Object.values(state.clients) as ClientState[]).map((c) => {
                                  if (!c.laser || !c.laser.active || c.role === Role.THERAPIST) return null;
                                  const color = getLaserColor(c.role);
                                  return (
                                    <div 
                                      key={c.id}
                                      className="absolute w-4 h-4 rounded-full z-50 transition-all duration-75 pointer-events-none"
                                      style={{
                                        backgroundColor: color,
                                        boxShadow: `0 0 15px 4px ${color}`,
                                        mixBlendMode: 'multiply',
                                        left: `${c.laser!.x * 100}%`,
                                        top: `${c.laser!.y * 100}%`,
                                        transform: 'translate(-50%, -50%)'
                                      }}
                                    />
                                  )
                               })}
                               
                               {/* Local Laser */}
                               {localLaserPos && localLaserPos.targetRole === role && (
                                 <div 
                                   className="absolute w-4 h-4 rounded-full z-50 pointer-events-none"
                                   style={{
                                     backgroundColor: getLaserColor(Role.THERAPIST),
                                     boxShadow: `0 0 15px 4px ${getLaserColor(Role.THERAPIST)}`,
                                     mixBlendMode: 'multiply',
                                     left: `${localLaserPos.x * 100}%`,
                                     top: `${localLaserPos.y * 100}%`,
                                     transform: 'translate(-50%, -50%)'
                                   }}
                                 />
                               )}
                             </div>
                           </div>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-center px-4">No Card</span>
                      )}
                      
                      {!client.isConnected && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-red-500 font-bold z-50">
                          Disconnected
                        </div>
                      )}
                   </div>
                   <h3 className="mt-4 font-bold text-gray-700 flex items-center">
                      {client.name}
                      {client.viewMode !== ClientViewMode.DECK && (
                        <span className="ml-2 text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase animate-pulse">
                          {client.viewMode}
                        </span>
                      )}
                    </h3>
                   <p className="text-sm text-gray-500">Card {client.currentCardIndex + 1}</p>
                 </div>
               );
            })}
          </div>

          {/* Whiteboard Overlay */}
          <Whiteboard 
            items={state.whiteboard.items}
            clients={state.clients}
            currentUserRole={Role.THERAPIST}
            clientMovementUnlocked={state.whiteboard.clientMovementUnlocked}
            clientDrawingUnlocked={state.whiteboard.clientDrawingUnlocked}
            isLaserMode={myState?.laserMode}
            mode={state.mode}
            onMoveItem={(id, x, y) => sendAction({ type: 'MOVE_WB_ITEM', payload: { id, x, y }, sender: Role.THERAPIST })}
            onLaserMove={(x, y, active) => {
              throttle('therapist-wb-laser', () => {
                sendAction({ type: 'UPDATE_LASER', payload: { x, y, active }, sender: Role.THERAPIST });
              }, 30);
            }}
            sendAction={sendAction}
            historyIndex={state.whiteboard.historyIndex}
            historyLength={state.whiteboard.history.length}
            isMinimized={wbMinimized}
            setIsMinimized={setWbMinimized}
          />
        </div>
      </div>
    </div>
  );
};
