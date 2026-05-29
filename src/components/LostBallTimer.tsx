import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Timer, Hash, Flag, User, MapPin, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayerShotRecord, TournamentInfo, TimerType } from '../types';
import { calculateTargetTime } from '../utils/paceUtils';

interface LostBallTimerProps {
  onRecordAdded: (record: PlayerShotRecord) => void;
  tournamentInfo?: TournamentInfo;
  hole: string;
  setHole: (hole: string) => void;
  group: string;
  setGroup: (group: string) => void;
  currentTime?: Date;
  updateActiveTimer?: (timer: any) => void;
}

export default function LostBallTimer({ 
  onRecordAdded, 
  tournamentInfo,
  hole,
  setHole,
  group,
  setGroup,
  currentTime,
  updateActiveTimer
}: LostBallTimerProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
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

  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getPlayersByGroup = () => {
    if (tournamentInfo) {
      const g = tournamentInfo.groups.find(g => g.groupNumber === group);
      if (g && g.players.length > 0) return g.players;
    }
    return ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  };

  const players = getPlayersByGroup();

  useEffect(() => {
    if (!isActive && timeLeft === 180) {
      setSelectedPlayer(null);
    }
  }, [group, tournamentInfo, isActive, timeLeft]);

  const syncWithFirestore = (overrideIsActive?: boolean, overrideTimeLeft?: number, isClearing = false) => {
    if (!updateActiveTimer) return;
    if (isClearing) {
      updateActiveTimer(null);
      return;
    }
    const act = overrideIsActive !== undefined ? overrideIsActive : isActive;
    const tl = overrideTimeLeft !== undefined ? overrideTimeLeft : timeLeft;
    
    updateActiveTimer({
      type: TimerType.LOST_BALL,
      hole,
      group,
      playerName: selectedPlayer !== null ? players[selectedPlayer] : `Group ${group}`,
      isActive: act,
      timeLeft: tl,
      limit: 180,
      status: act ? 'running' : (tl < 180 ? 'paused' : 'idle'),
      timestamp: Date.now()
    });
  };

  useEffect(() => {
    if (isActive || (timeLeft < 180 && timeLeft > 0)) {
      syncWithFirestore();
    }
  }, [hole, group, selectedPlayer]);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
      saveSearchRecord();
      if (updateActiveTimer) {
        updateActiveTimer(null); // Clear active timer once completed
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft]);

  const captureLocation = () => {
    const hasSandboxTime = tournamentInfo?.timeOffset !== undefined && tournamentInfo?.timeOffset !== 0;
    if (hasSandboxTime) return; // Disregard all referee geolocation in sandbox mode

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => console.error('Error capturing location:', error),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  const toggleTimer = () => {
    if (!isActive && timeLeft === 180) {
      captureLocation();
    }
    const nextActive = !isActive;
    setIsActive(nextActive);
    syncWithFirestore(nextActive, timeLeft);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(180);
    setLocation(null);
    if (updateActiveTimer) {
      updateActiveTimer(null);
    }
  };

  const saveSearchRecord = (finalTimeLeft?: number) => {
    // Capture state values immediately
    const capturedTime = now.getTime();
    const capturedHole = hole;
    const capturedGroup = group;
    const capturedPlayerName = selectedPlayer !== null ? players[selectedPlayer] : `Group ${capturedGroup}`;
    const tl = finalTimeLeft !== undefined ? finalTimeLeft : timeLeft;
    const capturedTimeTaken = 180 - tl;
    const capturedLat = location?.lat;
    const capturedLon = location?.lon;

    const record: PlayerShotRecord = {
      id: Math.random().toString(36).substr(2, 9),
      type: TimerType.LOST_BALL,
      timestamp: capturedTime,
      hole: capturedHole,
      group: capturedGroup,
      playerName: capturedPlayerName,
      timeTaken: capturedTimeTaken,
      limit: 180,
      latitude: capturedLat,
      longitude: capturedLon
    };
    onRecordAdded(record);
  };

  const handleStop = () => {
    setIsActive(false);
    saveSearchRecord();
    resetTimer();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpired = timeLeft === 0;

  return (
    <div className="flex flex-col h-full p-4 bg-[#111] text-white overflow-y-auto">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold uppercase tracking-widest text-[#FFDD00]">Lost Ball Timer</h2>
        <p className="text-[10px] text-gray-400 uppercase font-bold">Rule 18.2a: 3 Minutes Search Time</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
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

      <div className="mb-4">
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-bold mb-2">
          <User size={12} /> Player
        </label>
        <div className="grid grid-cols-2 gap-2">
          {players.map((p, idx) => (
            <button
              key={p}
              onClick={() => setSelectedPlayer(idx)}
              className={`p-2 rounded-lg text-left transition-all border text-xs font-bold uppercase tracking-tight ${
                selectedPlayer === idx 
                  ? 'bg-[#FFDD00] text-black border-[#FFDD00]' 
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {p.substring(0, 8)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <motion.div 
          initial={false}
          animate={{ 
            scale: isActive ? 1.05 : 1,
            color: isExpired ? '#FF0000' : (timeLeft < 30 ? '#FFDD00' : '#FFFFFF')
          }}
          className="text-8xl sm:text-[10rem] font-black leading-none font-mono mb-8 tabular-nums tracking-tighter"
        >
          {formatTime(timeLeft)}
        </motion.div>

        {location && (
          <div className="mb-4 flex items-center gap-1.5 text-[10px] text-[#FFDD00] font-bold uppercase">
            <MapPin size={12} /> Search Location Captured
          </div>
        )}

        <div className="flex gap-4 sm:gap-8 items-center">
          <button
            onClick={resetTimer}
            className="p-4 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 transition-all border border-zinc-700"
            title="Reset Timer"
          >
            <RotateCcw size={24} />
          </button>

          <button
            onClick={toggleTimer}
            className={`p-10 rounded-full transition-all shadow-xl ${
              isActive 
                ? 'bg-zinc-800 text-white' 
                : 'bg-[#FFDD00] text-black hover:scale-105'
            }`}
            title={isActive ? "Pause Search" : "Start Search"}
          >
            {isActive ? <Pause size={48} /> : <Play size={48} fill="currentColor" />}
          </button>

          <button
            onClick={handleStop}
            disabled={timeLeft === 180}
            className={`p-6 rounded-full transition-all border shadow-lg ${
              timeLeft === 180 
                ? 'bg-zinc-900 border-zinc-800 text-zinc-700 opacity-50 cursor-not-allowed' 
                : 'bg-red-600 border-red-500 text-white hover:bg-red-500'
            }`}
            title="Stop & Record Found Ball"
          >
            <Square size={32} fill="currentColor" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpired && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-red-600 text-white rounded-xl text-center shadow-lg"
          >
            <h3 className="text-xl font-bold uppercase tracking-tighter">Ball Lost</h3>
            <p className="text-xs opacity-90">The 3-minute search period has ended.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
