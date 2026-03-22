import React, { useState, useEffect, useRef, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { INITIAL_STATE } from './constants';
import { CommsManager } from './services/comms';
import { Action, Role, SessionState, Mode, WhiteboardItem, SessionType } from './types';
import { TherapistDashboard } from './components/TherapistDashboard';
import { ClientView } from './components/ClientView';
import { Button } from './components/Button';

// --- REDUCER ---
function sessionReducer(state: SessionState, action: Action): SessionState {
  const updateState = (nextState: any): SessionState => ({
    ...nextState,
    lastSenderId: action.senderId,
    lastUpdate: Date.now()
  });

  switch (action.type) {
    case 'JOIN':
      const clientRole = action.sender as string;
      const { name } = action.payload || {};
      if (state.clients[clientRole]) {
        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [clientRole]: { 
              ...state.clients[clientRole], 
              isConnected: true,
              isAdmitted: clientRole === Role.THERAPIST, // Therapist is always admitted
              name: name || state.clients[clientRole].name 
            }
          }
        });
      }
      return state;

    case 'ADMIT_CLIENT':
      const roleToAdmit = action.payload.role as string;
      if (state.clients[roleToAdmit]) {
        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [roleToAdmit]: {
              ...state.clients[roleToAdmit],
              isAdmitted: true
            }
          }
        });
      }
      return state;

    case 'SET_CLIENT_VIEW':
      const senderRole = action.sender as string;
      if (state.clients[senderRole]) {
        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [senderRole]: {
              ...state.clients[senderRole],
              viewMode: action.payload
            }
          }
        });
      }
      return state;

    case 'START_SESSION':
      // Randomize Deck Order SEPARATELY for each client
      const allCardIds = state.deck.map(c => c.id);
      
      const shuffle = (array: string[]) => [...array].sort(() => Math.random() - 0.5);
      
      const deckOrderA = shuffle(allCardIds);
      const deckOrderB = shuffle(allCardIds);
      
      // Also randomize base rotation for the deck items themselves (optional, affects global deck state)
      const shuffledDeck = state.deck.map(card => ({
          ...card,
          rotation: ([0, 90, 180, 270][Math.floor(Math.random() * 4)])
      }));
      
      return updateState({ 
        ...state, 
        status: 'ACTIVE',
        deck: shuffledDeck,
        deckOrders: {
           [Role.CLIENT_A]: deckOrderA,
           [Role.CLIENT_B]: deckOrderB
        },
        // Reset client indices and rotation maps on start, BUT PRESERVE CONNECTION STATUS
        clients: {
          ...state.clients,
          [Role.CLIENT_A]: { 
            ...state.clients[Role.CLIENT_A], 
            currentCardIndex: 0, 
            cardRotations: {} 
          },
          [Role.CLIENT_B]: { 
            ...state.clients[Role.CLIENT_B], 
            currentCardIndex: 0, 
            cardRotations: {} 
          },
        }
      });

    case 'RESET':
      return updateState({ ...INITIAL_STATE, sessionId: state.sessionId, sessionType: state.sessionType }); 

    case 'SET_MODE':
      return updateState({ ...state, mode: action.payload });

    case 'TOGGLE_LOCK': {
      return updateState({ 
        ...state, 
        whiteboard: {
          ...state.whiteboard,
          clientMovementUnlocked: !state.whiteboard.clientMovementUnlocked
        }
      });
    }

    case 'TOGGLE_CLIENT_WB_ACCESS': {
      return updateState({
        ...state,
        whiteboard: {
          ...state.whiteboard,
          clientDrawingUnlocked: !state.whiteboard.clientDrawingUnlocked
        }
      });
    }

    case 'CLEAR_WHITEBOARD':
      {
        const newItems: WhiteboardItem[] = [];
        const newHistory = state.whiteboard.history.slice(0, state.whiteboard.historyIndex + 1);
        newHistory.push(newItems);
        return updateState({
          ...state,
          whiteboard: {
            ...state.whiteboard,
            items: newItems,
            history: newHistory,
            historyIndex: newHistory.length - 1
          }
        });
      }

    case 'UNDO_WB':
      {
        const newIndex = Math.max(0, state.whiteboard.historyIndex - 1);
        return updateState({
          ...state,
          whiteboard: {
            ...state.whiteboard,
            items: state.whiteboard.history[newIndex],
            historyIndex: newIndex
          }
        });
      }

    case 'REDO_WB':
      {
        const newIndex = Math.min(state.whiteboard.history.length - 1, state.whiteboard.historyIndex + 1);
        return updateState({
          ...state,
          whiteboard: {
            ...state.whiteboard,
            items: state.whiteboard.history[newIndex],
            historyIndex: newIndex
          }
        });
      }

    case 'UPDATE_SETTINGS':
      const { sessionType, names } = action.payload;
      let updatedClients = { ...state.clients };
      
      if (names) {
        Object.keys(names).forEach(key => {
          if (updatedClients[key]) {
            updatedClients[key] = { ...updatedClients[key], name: names[key] };
          }
        });
      }

      if (state.status === 'ACTIVE' && sessionType) {
        return updateState({ ...state, clients: updatedClients });
      }

      return updateState({ 
        ...state, 
        sessionType: sessionType || state.sessionType,
        clients: updatedClients
      });

    case 'UPLOAD_DECK':
      // When uploading new cards, append them to the deck.
      const newDeck = [...state.deck, ...action.payload];
      // We should add these new IDs to the end of existing orders so clients can see them
      const newIds = action.payload.map((c: any) => c.id);
      return updateState({ 
         ...state, 
         deck: newDeck,
         deckOrders: {
            [Role.CLIENT_A]: [...(state.deckOrders[Role.CLIENT_A] || []), ...newIds],
            [Role.CLIENT_B]: [...(state.deckOrders[Role.CLIENT_B] || []), ...newIds],
         }
      });
    
    case 'CLEAR_DECK':
      return updateState({ ...state, deck: [], deckOrders: { [Role.CLIENT_A]: [], [Role.CLIENT_B]: [] } });

    case 'DELETE_CARD':
      const filteredDeck = state.deck.filter(c => c.id !== action.payload.id);
      return updateState({ 
         ...state, 
         deck: filteredDeck,
         deckOrders: {
            [Role.CLIENT_A]: (state.deckOrders[Role.CLIENT_A] || []).filter(id => id !== action.payload.id),
            [Role.CLIENT_B]: (state.deckOrders[Role.CLIENT_B] || []).filter(id => id !== action.payload.id),
         }
      });

    case 'CLIENT_ROTATE':
      {
        const { cardId, rotation } = action.payload;
        const client = state.clients[action.sender as string];
        if (!client) return state;
        
        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { 
              ...client, 
              cardRotations: {
                ...client.cardRotations,
                [cardId]: rotation
              }
            }
          }
        });
      }

    case 'NEXT_CARD':
      {
        const client = state.clients[action.sender as string];
        if (!client) return state;
        const order = state.deckOrders[action.sender] || [];
        const newIndex = Math.min(order.length - 1, client.currentCardIndex + 1);
        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, currentCardIndex: newIndex } // Rotation preserved in cardRotations map
          }
        });
      }

    case 'PREV_CARD':
      {
        const client = state.clients[action.sender as string];
        if (!client) return state;
        const newIndex = Math.max(0, client.currentCardIndex - 1);
        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, currentCardIndex: newIndex } // Rotation preserved
          }
        });
      }

    case 'JUMP_TO_CARD':
      {
        const { targetRole, cardId, cardIndex } = action.payload;
        const roleToUpdate = targetRole || action.sender;
        if (!state.clients[roleToUpdate]) return state;

        const order = state.deckOrders[roleToUpdate] || [];
        
        let index = -1;
        if (typeof cardIndex === 'number') {
          index = cardIndex;
        } else {
          index = order.findIndex(id => id === cardId);
        }
        
        if (index === -1) return state;

        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [roleToUpdate]: { ...state.clients[roleToUpdate], currentCardIndex: index } // Rotation preserved
          }
        });
      }

    case 'ADD_TO_TRAY':
      {
        const client = state.clients[action.sender as string];
        const order = state.deckOrders[action.sender] || [];
        const cardId = order[client.currentCardIndex];
        
        if (!cardId) return state;

        let newTray = client.tray;
        if (!newTray.includes(cardId)) {
           newTray = [...newTray, cardId];
        }

        // Auto-advance to next card after adding to tray
        const nextIndex = Math.min(order.length - 1, client.currentCardIndex + 1);

        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, tray: newTray, currentCardIndex: nextIndex }
          }
        });
      }

    case 'REMOVE_FROM_TRAY':
      {
        const client = state.clients[action.sender as string];
        const order = state.deckOrders[action.sender] || [];
        const cardIdToRemove = action.payload?.cardId || order[client.currentCardIndex];
        
        return updateState({
          ...state,
          clients: {
            ...state.clients,
            [action.sender]: { ...client, tray: client.tray.filter(id => id !== cardIdToRemove) }
          }
        });
      }

    case 'UPDATE_LASER':
      return updateState({
        ...state,
        clients: {
          ...state.clients,
          [action.sender]: { ...state.clients[action.sender], laser: action.payload }
        }
      });

    case 'TOGGLE_LASER_MODE':
      return updateState({
        ...state,
        clients: {
          ...state.clients,
          [action.sender]: { ...state.clients[action.sender], laserMode: !state.clients[action.sender].laserMode }
        }
      });

    case 'IMPORT_TRAY':
      {
         const { items } = action.payload;
         return updateState({
           ...state,
           mode: 'whiteboard',
           whiteboard: {
             ...state.whiteboard,
             items: [...state.whiteboard.items, ...items]
           }
         });
      }

    case 'ADD_WB_ITEM':
      {
         const { item } = action.payload;
         const newItems = [...state.whiteboard.items, item];
         const newHistory = state.whiteboard.history.slice(0, state.whiteboard.historyIndex + 1);
         newHistory.push(newItems);
         if (newHistory.length > 50) newHistory.shift();
         
         return updateState({
            ...state,
            whiteboard: {
              ...state.whiteboard,
              items: newItems,
              history: newHistory,
              historyIndex: newHistory.length - 1
            }
         })
      }

    case 'UPDATE_WB_ITEM':
      {
        const { id, updates } = action.payload;
        const newItems = state.whiteboard.items.map(item => 
          item.id === id ? { ...item, ...updates } : item
        );
        // We don't necessarily push to history for every update (like dragging)
        // unless it's a discrete change like text or color
        const shouldPushHistory = action.payload.pushHistory;
        
        let newWhiteboard = { ...state.whiteboard, items: newItems };
        
        if (shouldPushHistory) {
          const newHistory = state.whiteboard.history.slice(0, state.whiteboard.historyIndex + 1);
          newHistory.push(newItems);
          if (newHistory.length > 50) newHistory.shift();
          newWhiteboard.history = newHistory;
          newWhiteboard.historyIndex = newHistory.length - 1;
        }

        return updateState({
          ...state,
          whiteboard: newWhiteboard
        });
      }

    case 'MOVE_WB_ITEM':
      {
        const { id, x, y } = action.payload;
        return updateState({
          ...state,
          whiteboard: {
            ...state.whiteboard,
            items: state.whiteboard.items.map(item => 
              item.id === id ? { ...item, x, y } : item
            )
          }
        });
      }
    
    case 'ROTATE_WB_ITEM':
      {
        const { id } = action.payload;
        const newItems = state.whiteboard.items.map(item => 
          item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item
        );
        const newHistory = state.whiteboard.history.slice(0, state.whiteboard.historyIndex + 1);
        newHistory.push(newItems);
        
        return updateState({
           ...state,
           whiteboard: {
             ...state.whiteboard,
             items: newItems,
             history: newHistory,
             historyIndex: newHistory.length - 1
           }
        });
      }

    case 'DELETE_WB_ITEM':
      {
        const { id } = action.payload;
        const newItems = state.whiteboard.items.filter(item => item.id !== id);
        const newHistory = state.whiteboard.history.slice(0, state.whiteboard.historyIndex + 1);
        newHistory.push(newItems);

        return updateState({
           ...state,
           whiteboard: {
             ...state.whiteboard,
             items: newItems,
             history: newHistory,
             historyIndex: newHistory.length - 1
           }
        });
      }

    default:
      return state;
  }
}

// --- HOOKS FOR LOGIC ---

const useHostSession = () => {
  // Initialize state with persisted Session ID if available
  const [state, setState] = useState<SessionState>(() => {
    const savedId = sessionStorage.getItem('cardroom_host_id');
    const sessionId = savedId || Math.random().toString(36).substring(2, 8).toUpperCase();
    if (!savedId) sessionStorage.setItem('cardroom_host_id', sessionId);
    
    return { ...INITIAL_STATE, sessionId };
  });

  const stateRef = useRef(state);
  const comms = useRef<CommsManager | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // Pass sessionId to CommsManager so it can register as a Peer with a specific ID
    comms.current = new CommsManager(
      Role.THERAPIST,
      stateRef.current.sessionId,
      (action) => {
        const newState = sessionReducer(stateRef.current, action);
        stateRef.current = newState;
        setState(newState);
        
        // Optimization: Broadcast the action instead of the full state for high-frequency updates
        const highFreqActions = ['MOVE_WB_ITEM', 'UPDATE_LASER', 'CLIENT_ROTATE', 'ROTATE_WB_ITEM', 'TOGGLE_LASER_MODE'];
        if (highFreqActions.includes(action.type)) {
          comms.current?.broadcastAction(action);
        } else {
          comms.current?.broadcastState(newState);
        }
      },
      undefined,
      // On Connect (Host) - no specific action needed immediately besides logging
      () => console.log("Host Peer Ready") 
    );
    // Initial broadcast after delay just in case
    setTimeout(() => comms.current?.broadcastState(stateRef.current), 500);
    return () => comms.current?.cleanup();
  }, []); // Only run once on mount

  const sendAction = (action: Action) => {
    const actionWithId = { ...action, senderId: comms.current?.clientId };
    const newState = sessionReducer(stateRef.current, actionWithId);
    stateRef.current = newState;
    setState(newState);
    
    // Optimization: For high-frequency or structural updates with small payloads, broadcast the action instead of the full state
    // This drastically reduces payload size (bytes vs megabytes)
    const highFreqActions = [
      'MOVE_WB_ITEM', 'UPDATE_LASER', 'CLIENT_ROTATE', 'ROTATE_WB_ITEM', 
      'TOGGLE_LASER_MODE', 'SET_MODE', 'ADD_WB_ITEM', 'DELETE_WB_ITEM', 
      'IMPORT_TRAY', 'TOGGLE_LOCK', 'NEXT_CARD', 'PREV_CARD', 'JUMP_TO_CARD',
      'ADD_TO_TRAY', 'REMOVE_FROM_TRAY', 'UPDATE_WB_ITEM', 'UNDO_WB', 'REDO_WB',
      'CLEAR_WHITEBOARD', 'TOGGLE_CLIENT_WB_ACCESS'
    ];
    if (highFreqActions.includes(action.type)) {
      comms.current?.broadcastAction(actionWithId);
    } else {
      comms.current?.broadcastState(newState);
    }
  };

  return { state, sendAction };
};

const useClientSession = (role: Role, initialName?: string, sessionId?: string) => {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const comms = useRef<CommsManager | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    comms.current = new CommsManager(
      role,
      sessionId,
      (action) => {
        // Apply incoming actions from other users locally
        if (action.senderId !== comms.current?.clientId) {
          setState(prev => sessionReducer(prev, action));
        }
      },
      (newState) => {
        // Skip updates that originated from this client to avoid double-render jumps
        if (newState.lastSenderId === comms.current?.clientId) {
          return;
        }
        setState(newState);
      },
      // onConnect Callback: Fires exactly when PeerJS connection opens
      () => {
        console.log(`[${role}] Connection open! Sending JOIN.`);
        comms.current?.sendAction({ type: 'JOIN', sender: role, payload: { name: initialName } });
      }
    );

    return () => comms.current?.cleanup();
  }, [role, initialName, sessionId]);

  // Keep the "sticky" connection logic as a backup for network hiccups
  useEffect(() => {
    if (state.clients[role] && !state.clients[role].isConnected && sessionId && comms.current) {
       const timer = setTimeout(() => {
          console.log(`[${role}] Detected disconnection, attempting re-join...`);
          // Only send if we think we might be connected but state says otherwise
          comms.current?.sendAction({ type: 'JOIN', sender: role, payload: { name: initialName } });
       }, 3000);
       return () => clearTimeout(timer);
    }
  }, [state.clients[role]?.isConnected, role, initialName, sessionId]);

  const sendAction = (action: Action) => {
    if (!comms.current) return;
    const actionWithId = { ...action, senderId: comms.current.clientId };
    
    // Optimistic Update: Apply locally immediately for smooth UI
    const newState = sessionReducer(state, actionWithId);
    setState(newState);
    
    // Sync to Host
    comms.current.sendAction(actionWithId);
  };

  return { state, sendAction };
};


// --- COMPONENTS ---

const SystemTestView: React.FC = () => {
  const host = useHostSession();
  const clientA = useClientSession(Role.CLIENT_A, "Client A (Test)", host.state.sessionId);
  const clientB = useClientSession(Role.CLIENT_B, "Client B (Test)", host.state.sessionId);

  return (
    <div className="flex h-screen h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-gray-900">
      {/* Left: Host (50% width) */}
      <div className="w-1/2 border-r border-gray-700 h-full">
        <TherapistDashboard state={host.state} sendAction={host.sendAction} />
      </div>

      {/* Right: Clients (50% width, stacked vertically) */}
      <div className="w-1/2 flex flex-col h-full">
        
        {/* Client A View */}
        <div className={`relative w-full border-b border-gray-700 bg-gray-50 ${host.state.sessionType === SessionType.COUPLE ? 'h-1/2' : 'h-full'}`}>
          <div className="absolute top-0 left-0 bg-amber-600 text-white text-xs px-2 py-1 z-50 rounded-br font-bold">Client A (Mobile)</div>
          <div className="h-full w-full">
             <ClientView role={Role.CLIENT_A} state={clientA.state} sendAction={clientA.sendAction} />
          </div>
        </div>

        {/* Client B View (Only in Couple Mode) */}
        {host.state.sessionType === SessionType.COUPLE && (
          <div className="relative w-full h-1/2 bg-gray-50">
            <div className="absolute top-0 left-0 bg-pink-600 text-white text-xs px-2 py-1 z-50 rounded-br font-bold">Client B (Mobile)</div>
             <div className="h-full w-full">
                <ClientView role={Role.CLIENT_B} state={clientB.state} sendAction={clientB.sendAction} />
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const JoinScreen: React.FC<{ initialSessionId?: string; onJoin: (sessionId: string, role: Role, name: string) => void; onCancel?: () => void }> = ({ initialSessionId = '', onJoin, onCancel }) => {
  const [name, setName] = useState('');
  const [sessionId, setSessionId] = useState(initialSessionId);
  
  return (
    <div className="h-screen h-[100dvh] min-h-[100dvh] w-full flex flex-col items-center justify-center bg-surface p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-primary mb-2">Join Session</h1>
        
        {initialSessionId ? (
          <p className="text-gray-500 text-sm mb-6">Session ID: <span className="font-mono bg-gray-100 px-1 rounded">{initialSessionId}</span></p>
        ) : (
          <input 
            type="text" 
            placeholder="Enter Session ID" 
            className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 focus:ring-2 focus:ring-primary outline-none font-mono uppercase"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value.toUpperCase())}
          />
        )}
        
        <input 
          type="text" 
          placeholder="Enter your name" 
          className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 focus:ring-2 focus:ring-primary outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <p className="text-xs text-gray-400 mb-3 text-left">I am joining as...</p>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
             <Button 
               variant="secondary" 
               onClick={() => name && sessionId && onJoin(sessionId, Role.CLIENT_A, name)}
               disabled={!name || !sessionId}
             >
               Client A
             </Button>
             <Button 
               variant="secondary" 
               onClick={() => name && sessionId && onJoin(sessionId, Role.CLIENT_B, name)}
               disabled={!name || !sessionId}
             >
               Client B
             </Button>
          </div>
          <Button 
            variant="secondary" 
            className="w-full border-dashed border-2 hover:bg-gray-50"
            onClick={() => name && sessionId && onJoin(sessionId, Role.OBSERVER, name)}
            disabled={!name || !sessionId}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Computer Login (Whiteboard Only)
          </Button>
          {onCancel && (
            <Button variant="ghost" className="w-full mt-2" onClick={onCancel}>
              Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [role, setRole] = useState<Role | 'TEST' | null>(null);
  const [joinName, setJoinName] = useState<string>('');
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [showClientMenu, setShowClientMenu] = useState(false);

  const handleTherapistClick = () => {
    setShowPasswordPrompt(true);
    setIsVerified(false);
    setPasswordError(false);
    setPasswordInput('');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'remotetherapy') {
      setIsVerified(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session) {
      setPendingSessionId(session);
    }
  }, []);
  
  const NormalHostView = () => {
    const { state, sendAction } = useHostSession();
    return <TherapistDashboard state={state} sendAction={sendAction} />;
  };

  const NormalClientView = ({ r }: { r: Role }) => {
    // Pass the pendingSessionId to the hook
    const { state, sendAction } = useClientSession(r, joinName, pendingSessionId!);
    return <ClientView role={r} state={state} sendAction={sendAction} />;
  };

  if (pendingSessionId && !role) {
    return (
      <JoinScreen 
        initialSessionId={pendingSessionId} 
        onJoin={(sid, r, n) => {
          setPendingSessionId(sid);
          setJoinName(n);
          setRole(r);
        }} 
      />
    );
  }

  if (!role) {
    if (showClientMenu) {
      return (
        <JoinScreen 
          onJoin={(sid, r, n) => {
            setPendingSessionId(sid);
            setJoinName(n);
            setRole(r);
          }}
          onCancel={() => setShowClientMenu(false)}
        />
      );
    }

    if (showPasswordPrompt) {
      const hasPreviousSession = !!sessionStorage.getItem('cardroom_host_id');

      return (
        <div className="h-screen h-[100dvh] min-h-[100dvh] w-full flex flex-col items-center justify-center bg-surface p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
            {!isVerified ? (
              <>
                <h1 className="text-2xl font-bold text-primary mb-4">
                  Therapist Login
                </h1>
                <p className="text-gray-500 text-sm mb-6">
                  Enter the access code to manage your sessions.
                </p>
                
                <form onSubmit={handlePasswordSubmit}>
                  <input 
                    type="password" 
                    placeholder="Access Code" 
                    autoFocus
                    className={`w-full border rounded-lg px-4 py-3 mb-2 outline-none transition-all ${passwordError ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:ring-2 focus:ring-primary'}`}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError(false);
                    }}
                  />
                  {passwordError && <p className="text-red-500 text-xs mb-4">Incorrect access code. Please try again.</p>}
                  
                  <div className="flex flex-col gap-2 mt-4">
                    <Button type="submit" className="w-full">
                      Verify & Enter
                    </Button>
                    <Button variant="ghost" type="button" onClick={() => setShowPasswordPrompt(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-primary mb-4">
                  Session Manager
                </h1>
                <p className="text-gray-500 text-sm mb-8">
                  Choose how you would like to proceed.
                </p>
                
                <div className="flex flex-col gap-3">
                  {hasPreviousSession && (
                    <Button 
                      className="w-full h-14 text-lg" 
                      onClick={() => {
                        setRole(Role.THERAPIST);
                        setShowPasswordPrompt(false);
                      }}
                    >
                      Resume Previous Session
                    </Button>
                  )}
                  <Button 
                    variant={hasPreviousSession ? "secondary" : "primary"}
                    className="w-full h-14 text-lg" 
                    onClick={() => {
                      sessionStorage.removeItem('cardroom_host_id');
                      setRole(Role.THERAPIST);
                      setShowPasswordPrompt(false);
                    }}
                  >
                    Start New Session
                  </Button>
                  <Button variant="ghost" className="mt-2" onClick={() => setIsVerified(false)}>
                    Back
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen h-[100dvh] min-h-[100dvh] w-full flex flex-col items-center justify-center bg-surface p-4 relative">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-primary mb-2">Cardroom</h1>
          <p className="text-gray-500 mb-8">Select your role to join the session.</p>
          
          <div className="space-y-3">
            <Button className="w-full h-14 text-lg" onClick={handleTherapistClick}>
              Enter as Therapist
            </Button>
            <Button variant="secondary" className="w-full h-14 text-lg" onClick={() => setShowClientMenu(true)}>
              Enter as Client
            </Button>
          </div>
        </div>

        {/* Subtle Test Mode Button */}
        <button 
          onClick={() => setRole('TEST')}
          className="absolute bottom-4 right-4 text-[10px] text-gray-300 hover:text-gray-500 transition-colors flex items-center gap-1 opacity-50 hover:opacity-100"
          title="Launch System Test Mode"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          Test Mode
        </button>
      </div>
    );
  }

  if (role === 'TEST') {
    return <SystemTestView />;
  }

  return (
    <React.StrictMode>
      {role === Role.THERAPIST ? (
        <NormalHostView />
      ) : (
        <NormalClientView r={role} />
      )}
    </React.StrictMode>
  );
};

export default App;