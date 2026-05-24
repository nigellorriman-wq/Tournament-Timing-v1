import React, { useState, useEffect } from 'react';
import { Flag, Clock, User, ChevronRight, CheckCircle2, MapPin, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlayerShotRecord, TournamentInfo, TimerType } from '../types';
import { calculateTargetTime, getNextGroupExpected } from '../utils/paceUtils';

interface HoleControlProps {
  onRecordAdded: (record: PlayerShotRecord) => void;
  records: PlayerShotRecord[];
  tournamentInfo?: TournamentInfo;
  selectedHole: string;
  setSelectedHole: (hole: string) => void;
  setActiveGroup: (group: string) => void;
  currentTime?: Date;
}

export const HoleControl: React.FC<HoleControlProps> = ({ 
  onRecordAdded, 
  records, 
  tournamentInfo,
  selectedHole,
  setSelectedHole,
  setActiveGroup,
  currentTime
}) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const now = currentTime || new Date();

  // Automatically select the next group expected at this hole/time when selectedHole changes
  useEffect(() => {
    if (tournamentInfo) {
      const nextGroup = getNextGroupExpected(selectedHole, tournamentInfo, records, now);
      if (nextGroup) {
        setActiveGroup(nextGroup);
      }
    }
  }, [selectedHole, tournamentInfo]);

  if (!tournamentInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#111] text-gray-500">
        <MapPin size={48} className="mb-4 opacity-20" />
        <h3 className="text-lg font-bold">No Tournament Data</h3>
        <p className="text-xs mt-2">Import or setup a tournament to use Hole Control.</p>
      </div>
    );
  }

  const handleRecordFlagIn = (groupNumber: string) => {
    const actualH = now.getHours();
    const actualM = now.getMinutes();
    const actualFormatted = `${actualH.toString().padStart(2, '0')}:${actualM.toString().padStart(2, '0')}`;
    
    const target = calculateTargetTime(groupNumber, selectedHole, tournamentInfo, now);
    const diff = (actualH * 60 + actualM) - (target.date.getHours() * 60 + target.date.getMinutes());
    
    const record: PlayerShotRecord = {
      id: Math.random().toString(36).substr(2, 9),
      type: TimerType.FLAG_IN,
      timestamp: now.getTime(),
      hole: selectedHole,
      group: groupNumber,
      playerName: `Group ${groupNumber}`,
      timeTaken: diff,
      limit: target.minutes,
      actualTime: actualFormatted,
      targetTime: target.time,
      isSlow: diff > 0
    };

    onRecordAdded(record);

    // After recording, find the next available group to set as active
    // We filter out the current group because the update to 'records' prop 
    // might not have propagated through the parent re-render yet for this immediate calculation
    const remainingGroups = availableGroups.filter(g => g.group.groupNumber !== groupNumber);
    if (remainingGroups.length > 0) {
      // Try to find the next expected one among remains
      const nowMs = now.getTime();
      const nextIdx = remainingGroups.findIndex(g => g.pace.date.getTime() >= nowMs);
      const nextGroup = nextIdx === -1 ? remainingGroups[0] : remainingGroups[nextIdx];
      setActiveGroup(nextGroup.group.groupNumber);
    }

    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  // Format names to first 8 characters
  const formatCompactName = (name: string) => {
    if (!name) return '';
    return name.substring(0, 8);
  };

  // Get groups that haven't finished this hole yet, 
  // and only show groups that are "behind" (later than) the most recently finished group.
  const availableGroups = (() => {
    if (!tournamentInfo) return [];
    
    // 1. Get all groups that have recorded a Flag In on this hole
    const finishedRecords = records.filter(r => 
      r.hole === selectedHole && r.type === TimerType.FLAG_IN
    );
    
    // 2. Find the "latest" finished group based on sequence/time
    // Since groupNumber is usually sequential for pace, we find the max group number that finished.
    // However, to be more robust, we look for the latest target time among finished groups.
    let maxFinishedTime = 0;
    finishedRecords.forEach(r => {
      const target = calculateTargetTime(r.group, selectedHole, tournamentInfo, now);
      if (target.date.getTime() > maxFinishedTime) {
        maxFinishedTime = target.date.getTime();
      }
    });

    return tournamentInfo.groups
      .map(g => ({
        group: g,
        pace: calculateTargetTime(g.groupNumber, selectedHole, tournamentInfo, now)
      }))
      // Filter out:
      // - Groups that have already recorded a Flag In
      // - Groups that are "ahead" of someone who has already finished (unless the user wants to see slow/skipped groups - but request says "Only groups behind them")
      .filter(gPace => {
        const hasFinished = records.some(r => 
          r.group === gPace.group.groupNumber && 
          r.hole === selectedHole && 
          r.type === TimerType.FLAG_IN
        );
        if (hasFinished) return false;
        
        // Only show if the group's expected finish is strictly after the latest finished group
        return gPace.pace.date.getTime() >= maxFinishedTime;
      })
      .sort((a, b) => a.pace.date.getTime() - b.pace.date.getTime());
  })();

  const nowMs = now.getTime();
  const globalNextIdx = availableGroups.findIndex(g => g.pace.date.getTime() >= nowMs);
  
  // Pivot the window around the next expected group (showing up to 1 behind and 2 ahead if possible)
  const pivotPoint = globalNextIdx === -1 ? Math.max(0, availableGroups.length - 3) : Math.max(0, globalNextIdx - 1);
  const displayGroups = availableGroups.slice(pivotPoint, pivotPoint + 3);

  return (
    <div className="flex flex-col h-full bg-[#111] text-white">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-[#FFDD00]">
            <MapPin size={20} /> Hole Control
          </h2>
          <p className="text-[10px] text-gray-500 uppercase font-black tracking-tight">On-course group management</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Hash size={14} className="text-[#FFDD00]" />
            <select 
              value={selectedHole}
              onChange={(e) => setSelectedHole(e.target.value)}
              className="bg-transparent font-black text-sm outline-none cursor-pointer"
            >
              {Array.from({ length: 18 }, (_, i) => String(i + 1)).map(n => (
                <option key={n} value={n} className="bg-zinc-900">{n}</option>
              ))}
            </select>
          </div>
          <div className="text-right">
             <div className="text-xs font-black tabular-nums">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
             <div className="text-[8px] text-gray-500 font-bold uppercase">Current Time</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {displayGroups.map((gPace) => {
          const diffMinutes = Math.round((gPace.pace.date.getTime() - nowMs) / 60000);
          const isOverdue = diffMinutes < 0;
          
          // Global index in the full available list to determine relationship
          const globalIdx = availableGroups.findIndex(g => g.group.groupNumber === gPace.group.groupNumber);
          const isNext = globalNextIdx !== -1 && globalIdx === globalNextIdx;
          
          let relationshipLabel = '';
          if (globalNextIdx === -1) relationshipLabel = 'Overdue';
          else if (globalIdx < globalNextIdx) relationshipLabel = 'In Front';
          else if (globalIdx === globalNextIdx) relationshipLabel = 'Next Expected';
          else relationshipLabel = 'Following Behind';

          return (
            <motion.div
              key={gPace.group.groupNumber}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`p-4 rounded-xl border ${
                isNext 
                  ? 'bg-zinc-900/50 border-[#FFDD00]/30 shadow-[0_4px_20px_rgba(255,221,0,0.05)]' 
                  : 'bg-zinc-900/20 border-zinc-800/50'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl font-black text-[#FFDD00]">G{gPace.group.groupNumber}</span>
                    <span className="text-[10px] text-zinc-500 font-bold tabular-nums">@{gPace.group.startTime}</span>
                    {isNext && (
                      <span className={`px-1.5 py-0.5 rounded text-black text-[9px] font-black uppercase ${
                        isOverdue ? 'bg-red-500' : 'bg-[#FFDD00]'
                      }`}>
                        {isOverdue ? 'Overdue' : 'Next Expected'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 font-medium uppercase line-clamp-1 max-w-[200px]">
                    {gPace.group.players.map(p => formatCompactName(p)).join(' • ')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black tabular-nums">{gPace.pace.time}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase">Expected Fin</div>
                </div>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/50 mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={14} className={isOverdue ? 'text-red-500' : 'text-green-500'} />
                  <span className={`text-xs font-black ${isOverdue ? 'text-red-500' : 'text-green-500'}`}>
                    {Math.abs(diffMinutes)}m {isOverdue ? 'Behind' : 'Away'}
                  </span>
                </div>
                <div className="text-[9px] text-zinc-600 font-bold uppercase">
                  {relationshipLabel}
                </div>
              </div>

              <button
                onClick={() => handleRecordFlagIn(gPace.group.groupNumber)}
                className="w-full py-3 bg-[#FFDD00] text-black rounded-lg font-black uppercase text-xs tracking-tighter flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform active:scale-95"
              >
                <Flag size={14} /> Record Hole Out
              </button>
            </motion.div>
          );
        })}

        {displayGroups.length === 0 && (
          <div className="text-center py-12 text-gray-500">
             <p className="text-sm italic">No groups in range for this hole.</p>
          </div>
        )}
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
