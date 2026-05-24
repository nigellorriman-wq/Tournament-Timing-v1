import React from 'react';
import { Download, Trash2, History, Clock, User, Hash, MapPin, Timer, LayoutGrid, Flag } from 'lucide-react';
import { PlayerShotRecord, TimerType, TournamentInfo } from '../types';
import { exportToPDF } from '../services/pdfService';

interface SessionHistoryProps {
  records: PlayerShotRecord[];
  onClear: () => void;
  tournamentInfo?: TournamentInfo;
}

export default function SessionHistory({ records, onClear, tournamentInfo }: SessionHistoryProps) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
        <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
          <History size={40} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No Records Yet</h3>
        <p>Recorded times will appear here as you officiating the session.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#111]">
      <div className="p-3 flex items-center justify-between border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-bold text-white leading-none">Session History</h2>
          <p className="text-[9px] text-[#FFDD00] uppercase tracking-widest font-bold mt-1">
            {records.length} Record{records.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-6">
          <button
            onClick={() => exportToPDF(records, tournamentInfo)}
            className="p-2 px-3 bg-[#FFDD00] text-black rounded-lg hover:opacity-90 transition-all font-bold text-xs flex items-center gap-1.5"
          >
            <Download size={14} /> PDF
          </button>
          <button
            onClick={onClear}
            className="p-2 bg-zinc-800 text-red-500 rounded-lg hover:bg-zinc-700 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {records.slice().reverse().map((record) => (
          <div 
            key={record.id}
            className={`p-2.5 rounded-lg bg-zinc-900 border-l-2 ${
              record.type === TimerType.LOST_BALL 
                ? 'border-[#FFDD00]' 
                : (record.type === TimerType.FLAG_IN 
                    ? (record.isSlow ? 'border-red-500' : 'border-green-500')
                    : (record.isSlow ? 'border-red-500' : 'border-green-500'))
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 font-mono text-[9px] text-gray-500">
                  <Clock size={10} /> {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                {record.latitude && record.longitude && (
                  <div className="flex items-center gap-0.5 font-mono text-[9px] text-gray-400">
                    <MapPin size={9} className="text-[#FFDD00]" />
                    {record.latitude.toFixed(3)}, {record.longitude.toFixed(3)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase flex items-center gap-1 ${
                  record.type === TimerType.LOST_BALL 
                    ? 'bg-zinc-800 text-[#FFDD00]' 
                    : (record.type === TimerType.FLAG_IN 
                        ? (record.isSlow ? 'bg-red-950 text-red-500' : 'bg-green-950 text-green-500')
                        : (record.isSlow ? 'bg-white text-red-600 shadow-sm' : 'bg-green-950 text-green-500'))
                }`}>
                  {record.type === TimerType.LOST_BALL ? <Timer size={8} /> : (record.type === TimerType.FLAG_IN ? <Flag size={8} /> : <LayoutGrid size={8} />)}
                  {record.type === TimerType.LOST_BALL 
                    ? 'Search' 
                    : (record.type === TimerType.FLAG_IN ? 'Pace' : (record.isSlow ? 'Slow' : 'OK'))}
                </div>
              </div>
            </div>
            
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm font-bold text-white leading-tight">{record.playerName}</div>
                <div className="flex items-center gap-2 text-[9px] text-gray-500 mt-0.5 uppercase font-bold">
                  <span className="flex items-center gap-0.5"><Hash size={9} /> {record.hole}</span>
                  <span className="flex items-center gap-0.5"><User size={9} /> G{record.group}</span>
                </div>
                {record.type === TimerType.FLAG_IN && (
                  <div className="text-[9px] text-gray-500 font-bold uppercase mt-1">
                    T: {record.targetTime} • A: {record.actualTime}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className={`text-xl font-black leading-none ${
                   record.type === TimerType.FLAG_IN 
                    ? (record.isSlow ? 'text-red-500' : 'text-green-500') 
                    : 'text-[#FFDD00]'
                }`}>
                  {record.type === TimerType.LOST_BALL 
                    ? `${Math.floor(record.timeTaken / 60)}:${(record.timeTaken % 60).toString().padStart(2, '0')}` 
                    : (record.type === TimerType.FLAG_IN 
                        ? `${record.timeTaken >= 0 ? '+' : ''}${record.timeTaken}`
                        : `${record.timeTaken.toFixed(1)}s`)}
                </div>
                <div className="text-[9px] text-gray-500 uppercase font-bold mt-0.5 tabular-nums">
                  {record.type === TimerType.LOST_BALL 
                    ? 'Limit: 3m' 
                    : (record.type === TimerType.FLAG_IN ? 'Diff (Mins)' : `Limit: ${record.limit}s`)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
