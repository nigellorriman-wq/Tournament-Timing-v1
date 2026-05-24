export enum TimerType {
  LOST_BALL = 'LOST_BALL',
  SHOT_TIME = 'SHOT_TIME',
  FLAG_IN = 'FLAG_IN'
}

export interface PlayerShotRecord {
  id: string;
  type: TimerType;
  timestamp: number;
  hole: string;
  group: string;
  playerName: string;
  isFirstToPlay?: boolean;
  timeTaken: number; // in seconds or difference in minutes for flag-in
  limit: number; // 50, 40, 180, or target cumulative minutes
  leeway?: number; // 10%
  isSlow?: boolean;
  latitude?: number;
  longitude?: number;
  actualTime?: string; // HH:MM for flag-in
  targetTime?: string; // HH:MM for flag-in
}

export interface HolePace {
  hole: number;
  minutes: number;
}

export interface GroupData {
  groupNumber: string;
  startTime: string; // "HH:MM"
  startingTee: number; // 1 or 10
  players: string[];
  holeTimes?: Record<string, string>; // Map of hole number to target time string "HH:MM"
}

export interface TournamentInfo {
  name: string;
  round: string;
  paceOfPlay: HolePace[];
  groups: GroupData[];
  kmlData?: string;
  timeOffset?: number;
}

export interface SessionData {
  records: PlayerShotRecord[];
  tournament?: {
    name: string;
    round: string;
  };
}
