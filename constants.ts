import { Card, SessionState, Mode, Role, SessionType, ClientViewMode } from './types';

import { deck as BUILT_IN_DECK } from './deck';
export const INITIAL_DECK: Card[] = BUILT_IN_DECK;

export const INITIAL_STATE: SessionState = {
  sessionId: 'DEMO-123',
  sessionType: SessionType.SINGLE, // Changed default to SINGLE
  status: 'WAITING',
  mode: 'deck',
  clients: {
    [Role.CLIENT_A]: { id: 'client-a', role: Role.CLIENT_A, name: 'Client A', isConnected: false, isAdmitted: false, viewMode: ClientViewMode.DECK, currentCardIndex: 0, tray: [], laser: null, laserMode: false, cardRotations: {} },
    [Role.CLIENT_B]: { id: 'client-b', role: Role.CLIENT_B, name: 'Client B', isConnected: false, isAdmitted: false, viewMode: ClientViewMode.DECK, currentCardIndex: 0, tray: [], laser: null, laserMode: false, cardRotations: {} },
    [Role.THERAPIST]: { id: 'therapist', role: Role.THERAPIST, name: 'Therapist', isConnected: true, isAdmitted: true, viewMode: ClientViewMode.DECK, currentCardIndex: 0, tray: [], laser: null, laserMode: false, cardRotations: {} },
    [Role.OBSERVER]: { id: 'observer', role: Role.OBSERVER, name: 'Computer View', isConnected: false, isAdmitted: false, viewMode: ClientViewMode.DECK, currentCardIndex: 0, tray: [], laser: null, laserMode: false, cardRotations: {} },
  },
  deck: INITIAL_DECK,
  deckOrders: {
    [Role.CLIENT_A]: [],
    [Role.CLIENT_B]: [],
  },
  whiteboard: {
    items: [],
    clientMovementUnlocked: false,
    clientDrawingUnlocked: false,
    history: [[]],
    historyIndex: 0,
  },
  lastUpdate: Date.now(),
};