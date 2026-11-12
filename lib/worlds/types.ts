export type WorldId = 'boucles' | 'plis' | 'veilleurs';
export type Point = {x:number;y:number};
export type RunPhase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type UnitState = 'queued' | 'walking' | 'waiting' | 'riding' | 'saved' | 'lost';

export interface RouteNode extends Point {
  id:string;
  kind?:'spawn'|'goal'|'weight'|'wait'|'checkpoint';
  checkpointLabel?:string;
  /** Weight stations hold their occupants until their counterweight is latched. */
  deviceId?:string;
  capacity?:number;
  arrivalTrigger?:{deviceId:string;mode:number;minVisitors:number};
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
  terrain?:'solid'|'platform';
  /** A clearly marked scout passage; reservations count before arrival. */
  maxPassages?:number;
  /** A visible local linkage moves this supporting deck. Two drivers carry
   * independent leaves which must physically meet before anyone can enter. */
  mechanism?:{drivers:string[];restAngle:number};
}

export interface DeviceDefinition extends Point {
  id:string;
  kind:'splitter'|'counterweight'|'wind'|'latch'|'lift'|'pendulum'|'gate';
  label:string;
  description:string;
  modes:string[];
  initialMode:number;
  requiredLoad?:number;
  width?:number;
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
  playerControlled?:boolean;
  activationNodeId?:string;
  autoCloseAfter?:number;
  holdOpenDeviceId?:string;
  mechanics?:{
    travel?:number;
    mass?:number;
    driveForce?:number;
    damping?:number;
    /** Effective rotational inertia relative to a point mass on its rod. */
    inertia?:number;
    automaticRatchet?:boolean;
    wind?:{source:Point;target:Point;direction:Point;range:number;cone:number;radius:number};
  };
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
  inkBudget?:number;
  objectives?:WorldObjective[];
  sectors?:WorldSector[];
  revision?:number;
  /** Previous coordinates retained only to carry an existing expedition into
   * a newly authored scene without resetting its decisions or companions. */
  previousGeometry?:WorldGeometry;
  acts?:WorldAct[];
  /** Present on a resolved act, so helpers never resolve it a second time. */
  actKey?:string;
  actNumber?:number;
  journeyActCount?:number;
}

export type WorldGeometry=Pick<WorldLevel,'width'|'height'|'creatureHeight'|'nodes'|'edges'|'devices'|'drawings'|'inkBudget'>
  &Partial<Pick<WorldLevel,'pace'>>&{revision:number};

export interface WorldSector {id:string;x:number;width:number;name:string;style?:WorldId}
export interface StageProgress {
  sectorIndex:number;sectorNumber:number;sectorCount:number;sectorName:string;
  furthestX:number;rearmostX:number;progress:number;
  checkpoint:{id:string;x:number;y:number;name:string}|null;
  saved:number;lost:number;remaining:number;decisions:number;
}

export type ObjectiveCondition =
  | {kind:'drawing';id:string}
  | {kind:'device';gate:Gate}
  | {kind:'visitors';nodeId:string;count:number}
  | {kind:'arrivals'};
export interface WorldObjective {id:string;label:string;conditions:ObjectiveCondition[]}
export type WorldAct = Pick<WorldLevel,'description'|'objective'|'nodes'|'edges'|'devices'|'drawings'|'hints'|'masteryInk'|'masteryGoal'>
  & Partial<Pick<WorldLevel,'masteryDevices'|'objectives'|'inkBudget'|'pace'|'spawn'|'goal'|'spawnInterval'>>
  & {key:string;title:string};

export interface ActResult {
  index:number;
  key:string;
  saved:number;
  lost:number;
  lostIds:number[];
  time:number;
  inkUsed:number;
  mastered:boolean;
}

export interface DeviceStatus {
  id:string;label:string;description:string;stateLabel:string;
  load:number;requiredLoad:number|null;progress:number;
  actionable:boolean;nextMode:number|null;actionLabel:string;reason:string;
  modes:Array<{mode:number;label:string;enabled:boolean;reason:string}>;
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
  /** Allocated at boarding; surviving IDs need not be consecutive. */
  formationSlot?:number|null;
  /** Stable pose/voice variation, independent of frame rate. */
  variant:number;
}

export interface DeviceState {
  mode:number;
  progress:number;
  load:number;
  released?:number;
  /** Velocity is measured in normalized travel per second; rotor angles and
   * pendulum angles are radians. Optional only for earlier V3 saves. */
  velocity?:number;
  rotorAngle?:number;
  rotorVelocity?:number;
  receivedForce?:number;
  angle?:number;
  angularVelocity?:number;
  /** Preserves an earlier saved plate contact while adopting the new travel. */
  anchorOffset?:number;
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
  version:3;
  mechanicsRevision?:number;
  /** Missing in the original continuous-world saves, whose geometry is 3. */
  geometryRevision?:number;
  /** Keeps already drawn spans if reprojection exceeds the new ink budget.
   * This never increases the ink available for a new gesture. */
  migratedInkLimit?:number;
  autoCheckpointId:string|null;
  checkpoint?:RunSnapshot|null;
  levelId:WorldId;
  actIndex:number;
  actResults:ActResult[];
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
  visits:Record<string,number[]>;
  passages:Record<string,number[]>;
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
  | {type:'erase';id?:string}
  | {type:'advanceAct'}
  | {type:'restart'}
  | {type:'checkpoint'}
  | {type:'retry'};

export type ActionResult = {ok:boolean;message:string;drawingId?:string};
