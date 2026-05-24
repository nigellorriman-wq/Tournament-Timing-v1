import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, User, Hash, Flag, ChevronRight, AlertTriangle, CheckCircle, Pause, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayerShotRecord, TournamentInfo, TimerType } from '../types';
import { calculateTargetTime } from '../utils/paceUtils';

interface ShotTimerProps {
  onRecordAdded: (record: PlayerShotRecord) => void;
  records: PlayerShotRecord[];
  tournamentInfo?: TournamentInfo;
  hole: string;
  setHole: (hole: string) => void;
  group: string;
  setGroup: (group: string) => void;
  currentTime?: Date;
  updateActiveTimer?: (timer: any) => void;
}

export default function ShotTimer({ 
  onRecordAdded, 
  records, 
  tournamentInfo,
  hole,
  setHole,
  group,
  setGroup,
  currentTime,
  updateActiveTimer
}: ShotTimerProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [isFirstToPlay, setIsFirstToPlay] = useState(false);
  const now = currentTime || new Date();

  // Automatically select the most likely group when the component mounts or hole changes
  useEffect(() => {
    if (tournamentInfo && tournamentInfo.groups.length > 0) {
      // Calculate target times for all groups at this hole
      const groupProximity = tournamentInfo.groups.map(g => {
        const pace = calculateTargetTime(g.groupNumber, hole, tournamentInfo, now);
        const diff = Math.abs(pace.date.getTime() - now.getTime());
        return { group: g, diff };
      });

      // Find group closest to current time
      const closest = groupProximity.sort((a, b) => a.diff - b.diff)[0];
      if (closest) {
        setGroup(closest.group.groupNumber);
      }
    }
  }, [hole, tournamentInfo]);

  // Update clock every minute for pace calculation was moved to App.tsx

  const getPlayersByGroup = () => {
    if (tournamentInfo) {
      const g = tournamentInfo.groups.find(g => g.groupNumber === group);
      if (g && g.players.length > 0) return g.players;
    }
    return ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  };

  const [players, setPlayers] = useState(getPlayersByGroup());

  // States: 'idle', 'countdown', 'running', 'paused', 'finished'
  const [status, setStatus] = useState<'idle' | 'countdown' | 'running' | 'paused' | 'finished'>('idle');
  const [countdown, setCountdown] = useState(3);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset selected player when group changes and update names
  useEffect(() => {
    setSelectedPlayer(null);
    setPlayers(getPlayersByGroup());
  }, [group, tournamentInfo]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (status === 'countdown') {
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setStatus('running');
            return 3;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (status === 'running') {
      interval = setInterval(() => {
        setTimer((prev) => prev + 0.1);
      }, 100);
    }

    return () => clearInterval(interval);
  }, [status]);

  const syncWithFirestore = (overrideStatus?: string, overrideTimer?: number, isClearing = false) => {
    if (!updateActiveTimer) return;
    if (isClearing) {
      updateActiveTimer(null);
      return;
    }
    const currentStatus = overrideStatus || status;
    const currentTimer = overrideTimer !== undefined ? overrideTimer : timer;
    
    if (currentStatus === 'countdown' || currentStatus === 'running' || currentStatus === 'paused') {
      updateActiveTimer({
        type: TimerType.SHOT_TIME,
        hole,
        group,
        playerName: selectedPlayer !== null ? players[selectedPlayer] : 'Unknown Player',
        isActive: currentStatus === 'running',
        timeTaken: currentTimer,
        limit: isFirstToPlay ? 50 : 40,
        status: currentStatus,
        timestamp: Date.now() - (currentStatus === 'running' ? currentTimer * 1000 : 0)
      });
    } else {
      updateActiveTimer(null);
    }
  };

  useEffect(() => {
    syncWithFirestore();
  }, [status, hole, group, selectedPlayer, isFirstToPlay]);

  const handleStart = () => {
    if (selectedPlayer === null) return;
    setTimer(0);
    setCountdown(3);
    setStatus('countdown');
  };

  const handleTogglePause = () => {
    if (status === 'running') {
      setStatus('paused');
      syncWithFirestore('paused', timer);
    } else if (status === 'paused') {
      setStatus('running');
      syncWithFirestore('running', timer);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setTimer(0);
    setCountdown(3);
    if (updateActiveTimer) {
      updateActiveTimer(null);
    }
  };

  const handleStop = () => {
    if (status !== 'running' && status !== 'paused') return;
    setStatus('finished');
    if (updateActiveTimer) {
      updateActiveTimer(null);
    }
    
    // Get location and save record
    const limit = isFirstToPlay ? 50 : 40;
    
    const saveRecord = (lat?: number, lon?: number) => {
      const record: PlayerShotRecord = {
        id: Math.random().toString(36).substr(2, 9),
        type: TimerType.SHOT_TIME,
        timestamp: now.getTime(),
        hole,
        group,
        playerName: players[selectedPlayer!],
        isFirstToPlay,
        timeTaken: timer,
        limit,
        leeway: limit * 0.1,
        isSlow: timer > (limit * 1.1),
        latitude: lat,
        longitude: lon
      };
      onRecordAdded(record);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          saveRecord(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error('Geolocation error:', error);
          saveRecord(); // Save without location if it fails
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      saveRecord();
    }
  };

  const handleNewShot = () => {
    setStatus('idle');
    setTimer(0);
  };

  const currentLimit = isFirstToPlay ? 50 : 40;
  const isOverTime = timer > currentLimit;

  return (
    <div className="p-3 flex flex-col h-full bg-[#111] text-white overflow-y-auto">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-zinc-900 p-2 px-3 rounded-lg border border-zinc-800">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-bold mb-1">
            <Hash size={12} /> Hole
          </label>
          <select 
            value={hole} 
            onChange={(e) => setHole(e.target.value)}
            className="w-full bg-transparent text-lg font-bold outline-none cursor-pointer"
          >
            {Array.from({ length: 18 }, (_, i) => String(i + 1)).map(n => (
              <option key={n} value={n} className="bg-zinc-900">{n}</option>
            ))}
          </select>
        </div>
        <div className="bg-zinc-900 p-2 px-3 rounded-lg border border-zinc-800">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-bold mb-1">
            <Flag size={12} /> Group
          </label>
          <select 
            value={group} 
            onChange={(e) => setGroup(e.target.value)}
            className="w-full bg-transparent text-lg font-bold outline-none cursor-pointer"
          >
            {tournamentInfo && tournamentInfo.groups.length > 0 ? (
              tournamentInfo.groups.map(g => {
                const target = calculateTargetTime(g.groupNumber, hole, tournamentInfo, now);
                return (
                  <option key={g.groupNumber} value={g.groupNumber} className="bg-zinc-900">
                    G{g.groupNumber} (@{g.startTime} → {target.time})
                  </option>
                );
              })
            ) : (
              Array.from({ length: 50 }, (_, i) => String(i + 1)).map(n => (
                <option key={n} value={n} className="bg-zinc-900">{n}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Tournament Pace Indicator */}
      {tournamentInfo && (
        <div className="mb-3">
          {(() => {
            const currentGroup = tournamentInfo.groups.find(g => g.groupNumber === group);
            if (!currentGroup) return null;

            // Calculate target time
            const [startH, startM] = currentGroup.startTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            
            let totalMinutes = 0;
            const currentHoleNum = Number(hole);
            const paceMap = new Map(tournamentInfo.paceOfPlay.map(p => [p.hole, p.minutes]));

            // Sequence of holes to sum
            let holeSeq: number[] = [];
            if (currentGroup.startingTee === 1) {
              for (let h = 1; h <= currentHoleNum; h++) holeSeq.push(h);
            } else {
              // Started on 10
              for (let h = 10; h <= 18; h++) {
                holeSeq.push(h);
                if (h === currentHoleNum) break;
              }
              if (currentHoleNum < 10) {
                for (let h = 1; h <= currentHoleNum; h++) holeSeq.push(h);
              }
            }

            totalMinutes = holeSeq.reduce((sum, h) => sum + (paceMap.get(h) || 0), 0);
            const targetTotalMinutes = startMinutes + totalMinutes;
            const currentDayMinutes = now.getHours() * 60 + now.getMinutes();
            const diff = targetTotalMinutes - currentDayMinutes;

            const targetH = Math.floor(targetTotalMinutes / 60) % 24;
            const targetM = targetTotalMinutes % 60;
            const timeStr = `${targetH.toString().padStart(2, '0')}:${targetM.toString().padStart(2, '0')}`;

            return (
              <div className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                diff < 0 ? 'bg-red-950/30 border-red-900/50' : 'bg-green-950/30 border-green-900/50'
              }`}>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-black tracking-tight">Group Pace Status</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-lg font-black ${diff < 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {diff < 0 ? `${Math.abs(diff)}m Behind` : `${diff}m Allotted`}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-500 uppercase font-black">Hole {hole} Target</div>
                  <div className="text-lg font-black text-gray-300 tabular-nums">{timeStr}</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="mb-3">
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-bold mb-2">
          <User size={12} /> Target Player
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {players.map((p, idx) => {
            const playerHoleHistory = records.filter(
              r => r.playerName === p && r.hole === hole && r.group === group && r.type === TimerType.SHOT_TIME
            );

            return (
              <button
                key={p}
                onClick={() => setSelectedPlayer(idx)}
                className={`p-2.5 rounded-lg text-left transition-all border min-h-[60px] flex flex-col justify-between ${
                  selectedPlayer === idx 
                    ? 'bg-[#FFDD00] text-black border-[#FFDD00]' 
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-tight">{p}</div>
                {playerHoleHistory.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {playerHoleHistory.map((rec) => (
                      <span 
                        key={rec.id} 
                        className={`text-[11px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          rec.isSlow 
                            ? 'bg-white text-red-600' 
                            : (selectedPlayer === idx ? 'bg-zinc-800 text-white' : 'bg-zinc-800 text-gray-400')
                        }`}
                      >
                        {rec.timeTaken.toFixed(0)}s
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 p-2 px-3 bg-zinc-900 rounded-lg border border-zinc-800">
        <span className="text-xs font-bold text-gray-300">First to play?</span>
        <button 
          onClick={() => setIsFirstToPlay(!isFirstToPlay)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            isFirstToPlay ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-gray-400'
          }`}
        >
          {isFirstToPlay ? '50s Limit' : '40s Limit'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative min-h-[220px]">
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.button
              key="btn-start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              disabled={selectedPlayer === null}
              onClick={handleStart}
              className={`w-48 h-48 rounded-full flex flex-col items-center justify-center gap-2 shadow-2xl transition-all ${
                selectedPlayer === null ? 'bg-zinc-800 text-gray-600' : 'bg-[#FFDD00] text-black hover:scale-105'
              }`}
            >
              <Play size={64} fill="black" />
              <span className="font-black uppercase tracking-tighter">Ready</span>
            </motion.button>
          )}

          {status === 'countdown' && (
            <motion.div
              key="countdown"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 1 }}
              className="text-8xl font-black text-[#FFDD00]"
            >
              {countdown}
            </motion.div>
          )}

          {(status === 'running' || status === 'paused') && (
            <motion.div
              key="timer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center w-full"
            >
              <div className={`text-8xl font-black tabular-nums transition-colors ${
                status === 'paused' ? 'text-zinc-600' : (isOverTime ? 'text-red-500' : 'text-white')
              }`}>
                {timer.toFixed(1)}
              </div>
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-8">
                {status === 'paused' ? 'Timer Paused' : 'Seconds taken'}
              </div>

              <div className="flex items-center gap-6">
                <button
                  onClick={handleReset}
                  className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700 hover:bg-zinc-700 transition-all"
                  title="Reset"
                >
                  <RotateCcw size={24} className="text-gray-400" />
                </button>

                <button
                  onClick={handleStop}
                  className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:bg-red-500 transition-all"
                  title="Stop and Record"
                >
                  <Square size={36} fill="white" className="text-white" />
                </button>

                <button
                  onClick={handleTogglePause}
                  className={`w-16 h-16 rounded-full flex items-center justify-center border transition-all ${
                    status === 'paused' 
                      ? 'bg-[#FFDD00] border-[#FFDD00] text-black' 
                      : 'bg-zinc-800 border-zinc-700 text-gray-400 hover:bg-zinc-700'
                  }`}
                  title={status === 'paused' ? 'Resume' : 'Pause'}
                >
                  {status === 'paused' ? <Play size={24} fill="black" /> : <Pause size={24} fill="currentColor" />}
                </button>
              </div>
            </motion.div>
          )}

          {status === 'finished' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center p-5 bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-[280px]"
            >
              <div className="mb-2">
                {timer <= currentLimit * 1.1 ? (
                  <CheckCircle size={40} className="text-green-500 mx-auto" />
                ) : (
                  <AlertTriangle size={40} className="text-red-500 mx-auto" />
                )}
              </div>
              <h3 className="text-xl font-bold mb-0.5">
                {timer.toFixed(1)}s Recorded
              </h3>
              <p className="text-[10px] text-gray-500 mb-3">
                Limit: {currentLimit}s (+{ (currentLimit * 0.1).toFixed(1) }s)
              </p>
              
              <div className={`w-full p-2.5 rounded-lg mb-4 flex items-center justify-center gap-2 text-xs font-bold ${
                timer > currentLimit * 1.1 ? 'bg-white text-red-600 shadow-md' : 'bg-green-950 text-green-500'
              }`}>
                {timer > currentLimit * 1.1 ? 'SLOW PLAY' : 'IN TIME'}
              </div>

              <button
                onClick={handleNewShot}
                className="w-full py-3 bg-[#FFDD00] text-black text-sm font-bold rounded-lg flex items-center justify-center gap-2"
              >
                Track Next Shot <ChevronRight size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
