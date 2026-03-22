
export enum Role {
  THERAPIST = 'THERAPIST',
  CLIENT_A = 'CLIENT_A',
  CLIENT_B = 'CLIENT_B',
  OBSERVER = 'OBSERVER' // For desktop whiteboard view
}

export enum Mode {
  DECK = 'deck',
  WHITEBOARD = 'whiteboard'
}

export enum ClientViewMode {
  DECK = 'DECK',
  TRAY = 'TRAY',
  GRID = 'GRID'
}

export enum SessionType {
  SINGLE = 'SINGLE',
  COUPLE = 'COUPLE'
}

export interface Card {
  id: string;
  imageUrl: string;
  title: string;
  rotation: number; // 0, 90, 180, 270 (Base rotation)
}

export type WhiteboardObjectType = 'CARD' | 'IMAGE' | 'STROKE' | 'TEXT' | 'RECT' | 'CIRCLE' | 'ARROW' | 'LINE';

export interface WhiteboardItem {
  id: string;
  type: WhiteboardObjectType;
  content?: string; // URL, ID, or Text content
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation: number;
  points?: number[]; // For strokes and lines
  color?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  createdBy: Role;
  grayscale?: boolean;
}

export interface ClientState {
  id: string;
  role: Role;
  name: string;
  isConnected: boolean;
  isAdmitted: boolean;
  viewMode: ClientViewMode;
  currentCardIndex: number;
  tray: string[]; // Array of Card IDs
  laser: { x: number; y: number; active: boolean } | null;
  laserMode: boolean; // Toggle for laser tool
  cardRotations: Record<string, number>; // Map of Card ID -> Rotation (0, 90, 180, 270)
}

export interface SessionState {
  sessionId: string;
  sessionType: SessionType;
  status: 'WAITING' | 'ACTIVE';
  mode: string;
  clients: Record<string, ClientState>; // Keyed by Role
  deck: Card[];
  deckOrders: Record<string, string[]>; // Keyed by Role, contains array of Card IDs
  whiteboard: {
    items: WhiteboardItem[];
    clientMovementUnlocked: boolean; // Controls smart mouse, card movement, panning, deck
    clientDrawingUnlocked: boolean;  // Controls drawing toolbar and tools
    history: WhiteboardItem[][];
    historyIndex: number;
  };
  lastUpdate: number;
  lastSenderId?: string;
}

export type ActionType = 
  | 'JOIN' 
  | 'ADMIT_CLIENT'
  | 'SET_CLIENT_VIEW'
  | 'START_SESSION' 
  | 'RESET'
  | 'SET_MODE' 
  | 'NEXT_CARD' 
  | 'PREV_CARD' 
  | 'JUMP_TO_CARD' 
  | 'CLIENT_ROTATE'   // Sync client rotation
  | 'ROTATE_CARD'     // Base card rotation (if needed)
  | 'ADD_TO_TRAY' 
  | 'REMOVE_FROM_TRAY'
  | 'UPDATE_LASER'
  | 'TOGGLE_LASER_MODE' 
  | 'IMPORT_TRAY' 
  | 'ADD_WB_ITEM'     
  | 'UPDATE_WB_ITEM'
  | 'MOVE_WB_ITEM'
  | 'ROTATE_WB_ITEM'  
  | 'DELETE_WB_ITEM'  
  | 'CLEAR_WHITEBOARD'
  | 'TOGGLE_CLIENT_WB_ACCESS'
  | 'UNDO_WB'
  | 'REDO_WB'
  | 'SYNC_REQ'
  | 'UPDATE_SETTINGS'
  | 'UPLOAD_DECK'
  | 'DELETE_CARD'
  | 'CLEAR_DECK'
  | 'TOGGLE_LOCK'; 

export interface Action {
  type: ActionType;
  payload?: any;
  sender: Role;
  senderId?: string;
}