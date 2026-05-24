import React, { useState, useEffect } from 'react';
import { Flag, Hash, Clock, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayerShotRecord, TournamentInfo, TimerType } from '../types';
import { calculateTargetTime, getNextGroupExpected } from '../utils/paceUtils';

interface FlagInTimerProps {
  onRecordAdded: (record: PlayerShotRecord) => void;
  records?: PlayerShotRecord[];
  tournamentInfo?: TournamentInfo;
  hole: string;
  setHole: (hole: string) => void;
  group: string;
  setGroup: (group: string) => void;
  currentTime?: Date;
}

export const FlagInTimer: React.FC<FlagInTimerProps> = ({ 
  onRecordAdded, 
  records = [],
  tournamentInfo,
  hole,
  setHole,
  group,
  setGroup,
  currentTime
}) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const now = currentTime || new Date();

  // Automatically select the next group expected at this hole/time when hole changes
  useEffect(() => {
    if (tournamentInfo) {
      const nextGroup = getNextGroupExpected(hole, tournamentInfo, records, now);
      if (nextGroup) {
        setGroup(nextGroup);
      }
    }
  }, [hole, tournamentInfo]);

  // Format names to first 8 characters
  const formatCompactName = (name: string) => {
    if (!name) return '';
    return name.substring(0, 8);
  };

  const handleRecordFlagIn = () => {
    // Rounded to the last completed minute
    const actualH = now.getHours();
    const actualM = now.getMinutes();
    const actualFormatted = `${actualH.toString().padStart(2, '0')}:${actualM.toString().padStart(2, '0')}`;
    
    const target = calculateTargetTime(group, hole, tournamentInfo, now);
    const [targetH, targetM] = target.time.split(':').map(Number);
    
    // Calculate difference in minutes
    const actualMinutesTotal = actualH * 60 + actualM;
    const targetMinutesTotal = targetH * 60 + targetM;
    const diff = actualMinutesTotal - targetMinutesTotal;

    const record: PlayerShotRecord = {
      id: Math.random().toString(36).substr(2, 9),
      type: TimerType.FLAG_IN,
      timestamp: now.getTime(),
      hole,
      group,
      playerName: `Group ${group}`,
      timeTaken: diff,
      limit: target.minutes,
      actualTime: actualFormatted,
      targetTime: target.time,
      isSlow: diff > 0
    };

    onRecordAdded(record);

    // After recording, try to advance to the next group in the tournament
    if (tournamentInfo && tournamentInfo.groups) {
      const currentIndex = tournamentInfo.groups.findIndex(g => g.groupNumber === group);
      if (currentIndex !== -1 && currentIndex < tournamentInfo.groups.length - 1) {
        setGroup(tournamentInfo.groups[currentIndex + 1].groupNumber);
      }
    }

    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const targetInfo = calculateTargetTime(group, hole, tournamentInfo, now);

  return (
    <div className="flex flex-col h-full p-4 bg-[#111] text-white overflow-y-auto">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold uppercase tracking-widest text-[#FFDD00]">Flag-In Record</h2>
        <p className="text-[10px] text-gray-400 uppercase font-bold">Record group completion of a hole</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-black mb-1.5">
            <Hash size={12} className="text-[#FFDD00]" /> Hole
          </label>
          <select 
            value={hole} 
            onChange={(e) => setHole(e.target.value)}
            className="w-full bg-transparent text-xl font-black outline-none cursor-pointer appearance-none"
          >
            {Array.from({ length: 18 }, (_, i) => String(i + 1)).map(n => (
              <option key={n} value={n} className="bg-zinc-900">{n}</option>
            ))}
          </select>
        </div>
        <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase font-black mb-1.5">
            <Flag size={12} className="text-[#FFDD00]" /> Group
          </label>
          <select 
            value={group} 
            onChange={(e) => setGroup(e.target.value)}
            className="w-full bg-transparent text-xl font-black outline-none cursor-pointer appearance-none"
          >
            {tournamentInfo && tournamentInfo.groups.length > 0 ? (
              tournamentInfo.groups.map(g => {
                const target = calculateTargetTime(g.groupNumber, hole, tournamentInfo, now);
                return (
                  <option key={g.groupNumber} value={g.groupNumber} className="bg-zinc-900">
                    G{g.groupNumber} (@{g.startTime} → {target.time}) - {g.players.map(p => formatCompactName(p)).join(', ')}
                  </option>
                );
              })
            ) : (
              Array.from({ length: 50 }, (_, i) => String(i + 1)).map(n => (
                <option key={n} value={n} className="bg-zinc-900">G{n}</option>
              ))
            )}
          </select>
        </div>
      </div>

      <div className="bg-black/40 p-4 rounded-xl border border-zinc-800/50 mb-8">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-zinc-900 rounded-lg">
            <Clock size={16} className="text-[#FFDD00]" />
          </div>
          <div className="flex-1 flex flex-col items-center">
            <h4 className="text-[10px] text-gray-500 uppercase font-black tracking-widest leading-none mb-1 text-center">Required Time of Finish</h4>
            <div className="flex items-baseline gap-4">
              <div className={`text-4xl font-black tabular-nums leading-tight ${
                (() => {
                  const nowMs = now.getTime();
                  const targetMs = targetInfo.date.getTime();
                  const diffMin = (nowMs - targetMs) / 60000;
                  if (diffMin <= 0) return 'text-green-500';
                  if (diffMin <= 3) return 'text-amber-500';
                  return 'text-red-500';
                })()
              }`}>
                {targetInfo.time}
              </div>
              <div className={`text-2xl font-black tabular-nums ${
                (() => {
                  const nowMs = now.getTime();
                  const targetMs = targetInfo.date.getTime();
                  const diffMs = nowMs - targetMs;
                  const diffMin = diffMs / 60000;
                  if (diffMin <= 0) return 'text-green-500';
                  if (diffMin <= 3) return 'text-amber-500';
                  return 'text-red-500';
                })()
              }`}>
                {(() => {
                  const nowMs = now.getTime();
                  const targetMs = targetInfo.date.getTime();
                  const diffMs = Math.abs(nowMs - targetMs);
                  const mins = Math.floor(diffMs / 60000);
                  const secs = Math.floor((diffMs % 60000) / 1000);
                  return `${nowMs > targetMs ? '+' : '-'}${mins}:${secs.toString().padStart(2, '0')}`;
                })()}
              </div>
            </div>
            <p className="text-[9px] text-gray-400 text-center uppercase font-bold mt-1">
              (Cumulative Pace: {targetInfo.minutes} mins)
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <button
          onClick={handleRecordFlagIn}
          className="group relative flex flex-col items-center justify-center p-12 bg-[#FFDD00] text-black rounded-full shadow-[0_0_30px_rgba(255,221,0,0.2)] hover:scale-105 active:scale-95 transition-all w-48 h-48"
        >
          <Flag size={48} className="mb-2" />
          <span className="text-sm font-black uppercase tracking-tighter">Record Flag-In</span>
          
          <div className="absolute inset-0 rounded-full border-4 border-black/10 scale-90 group-hover:scale-100 transition-transform"></div>
        </button>

        <p className="mt-8 text-[11px] text-gray-500 font-bold uppercase text-center max-w-[200px]">
          Press when the group's flag is placed in the hole. Time will be rounded to the last completed minute.
        </p>
      </div>

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute bottom-24 left-4 right-4 p-4 bg-green-600 text-white rounded-xl flex items-center gap-3 shadow-xl z-50"
          >
            <CheckCircle2 size={24} />
            <div>
              <p className="text-xs font-black uppercase">Flag-In Recorded</p>
              <p className="text-[10px] opacity-90">Timing history has been updated.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
