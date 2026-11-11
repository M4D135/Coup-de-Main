export type WorldId = 'boucles' | 'plis' | 'veilleurs';
export type Point = {x:number;y:number};
export type RunPhase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type UnitState = 'queued' | 'walking' | 'waiting' | 'riding' | 'saved' | 'lost';

export interface RouteNode extends Point {
  id:string;
  kind?:'spawn'|'goal'|'weight'|'wait';
  /** Weight stations hold their occupants until their counterweight is latched. */
  deviceId?:string;
  capacity?:number;
}

export interface Gate {
  deviceId:string;
  mode?:number;
  notMode?:number;
  minProgress?:number;
  minLoad?:number;
}

export interface RouteEdge {
  id:string;
  from:string;
  to:string;
  path:Point[];
  kind:'ground'|'drawn'|'lift'|'hazard';
  drawingId?:string;
  deviceId?:string;
  gates?:Gate[];
  /** Only routes selected at the fork are considered. */
  route?:{deviceId:string;mode:number};
  priority?:number;
  capacity?:number;
  hidden?:boolean;
}

export interface DeviceDefinition extends Point {
  id:string;
  kind:'splitter'|'counterweight'|'wind'|'latch'|'lift'|'pendulum'|'gate';
  label:string;
  description:string;
  modes:string[];
  initialMode:number;
  requiredLoad?:number;
  /** Mechanical interlocks apply at this device, never as arbitrary exit locks. */
  gates?:Gate[];
  weightNodes?:string[];
  lockDeviceId?:string;
  powerDeviceId?:string;
  duration?:number;
  pivot?:Point;
  length?:number;
  radius?:number;
  phase?:number;
  low?:Point;
  high?:Point;
}

export interface DrawingDefinition {
  id:string;
  label:string;
  from:Point;
  to:Point;
  /** A forgiving corridor retains a deliberate arch without accepting arbitrary scribbles. */
  corridor:number;
  inkLimit:number;
  hint:string;
  suggested:Point[];
}

export interface WorldPalette {
  ink:string;
  paper:string;
  accent:string;
  glow:string;
}

export interface WorldLevel {
  id:WorldId;
  name:string;
  stageName:string;
  description:string;
  objective:string;
  number:number;
  width:number;
  height:number;
  total:number;
  rescueTarget:number;
  spawn:string;
  goal:string;
  palette:WorldPalette;
  nodes:RouteNode[];
  edges:RouteEdge[];
  devices:DeviceDefinition[];
  drawings:DrawingDefinition[];
  hints:string[];
  creatureHeight:number;
  spawnInterval:number;
  pace:number;
  masteryInk:number;
  /** The third star is an explicit stage challenge, never an undisclosed retry penalty. */
  masteryGoal:string;
  masteryDevices?:Gate[];
}

export interface Creature extends Point {
  id:number;
  state:UnitState;
  direction:-1|1;
  nodeId:string;
  edgeId:string|null;
  distance:number;
  walkTime:number;
  waitTime:number;
  savedAt:number|null;
  lostAt:number|null;
  fallVelocity:number;
  /** A changed junction can call stranded companions back along their actual path. */
  returning:boolean;
  returnEdges:string[];
  /** Stable pose/voice variation, independent of frame rate. */
  variant:number;
}

export interface DeviceState {
  mode:number;
  progress:number;
  load:number;
}

export interface DrawnRoute {
  points:Point[];
  inkLength:number;
  createdAt:number;
}

export interface ActiveStroke {
  drawingId:string;
  points:Point[];
  reversed:boolean;
}

export type GameEvent = {
  type:'spawn'|'step'|'wait'|'draw'|'device'|'saved'|'lost'|'win'|'retry'|'undo';
  x?:number;
  y?:number;
  unitId?:number;
  deviceId?:string;
};

export type EditSnapshot = {
  drawings:Record<string,DrawnRoute>;
  modes:Record<string,number>;
};

export interface RunSnapshot {
  version:1;
  levelId:WorldId;
  phase:RunPhase;
  time:number;
  speed:1|2;
  units:Creature[];
  devices:Record<string,DeviceState>;
  drawings:Record<string,DrawnRoute>;
  spawned:number;
  saved:number;
  lost:number;
  nextSpawn:number;
  accumulator:number;
  edits:number;
  retries:number;
}

export interface WorldRun extends RunSnapshot {
  activeStroke:ActiveStroke|null;
  history:EditSnapshot[];
  events:GameEvent[];
  message:string;
  checkpoint:RunSnapshot|null;
}

export type GameAction =
  | {type:'start'}
  | {type:'pause';paused?:boolean}
  | {type:'speed';value?:1|2}
  | {type:'device';id:string;mode?:number}
  | {type:'undo'}
  | {type:'restart'}
  | {type:'checkpoint'}
  | {type:'retry'};

export type ActionResult = {ok:boolean;message:string;drawingId?:string};
