import React from 'react';
import { BarChart2, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PlayerShotRecord, TournamentInfo, TimerType } from '../types';

interface HoleTimingsProps {
  records: PlayerShotRecord[];
  tournamentInfo?: TournamentInfo;
}

export const HoleTimings: React.FC<HoleTimingsProps> = ({ records, tournamentInfo }) => {
  const holes = Array.from({ length: 18 }, (_, i) => String(i + 1));
  const groups = tournamentInfo && tournamentInfo.groups
    ? tournamentInfo.groups.map(g => g.groupNumber)
    : Array.from(new Set(records.map(r => r.group))).sort((a, b) => Number(a) - Number(b));

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center bg-[#111]">
        <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
          <BarChart2 size={32} className="text-zinc-700" />
        </div>
        <h3 className="text-lg font-bold text-gray-400">No Timings Recorded</h3>
        <p className="text-xs mt-2">Start timing players to see the hole-by-hole summary here.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#111] text-white">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-xl font-bold flex items-center gap-2 text-[#FFDD00]">
          <Activity size={20} /> Hole by Hole Timings
        </h2>
        <p className="text-xs text-gray-500 mt-1 uppercase font-black tracking-tight">Summary of timings per group across all holes</p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-black z-20">
              <tr>
                <th className="p-3 text-left bg-zinc-900 border-r border-b border-zinc-800 sticky left-0 z-30">
                  <div className="text-[10px] text-gray-500 uppercase font-black">Group \ Hole</div>
                </th>
                {holes.map(h => (
                  <th key={h} className="p-3 text-center bg-zinc-900 border-b border-zinc-800 font-black text-xs min-w-[60px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(gId => (
                <tr key={gId}>
                  <td className="p-3 bg-zinc-900 border-r border-b border-zinc-800 sticky left-0 z-10 font-black text-[#FFDD00]">
                    G{gId}
                  </td>
                  {holes.map(hId => {
                    const holeRecords = records.filter(r => r.group === gId && r.hole === hId && r.type === TimerType.SHOT_TIME);
                    const slowCount = holeRecords.filter(r => r.isSlow).length;
                    const totalShots = holeRecords.length;
                    const avgTime = totalShots > 0 
                      ? Math.round(holeRecords.reduce((sum, r) => sum + r.timeTaken, 0) / totalShots)
                      : 0;
                    const hasSearch = records.some(r => r.group === gId && r.hole === hId && r.type === TimerType.LOST_BALL);
                    const flagInRecord = records.find(r => r.group === gId && r.hole === hId && r.type === TimerType.FLAG_IN);

                    if (totalShots === 0 && !hasSearch && !flagInRecord) {
                      return <td key={hId} className="p-3 border-b border-zinc-800 bg-zinc-950/20"></td>;
                    }

                    return (
                      <td key={hId} className="p-2 border-b border-zinc-800 text-center align-middle">
                        <div className="flex flex-col items-center gap-0.5">
                          {flagInRecord && (
                            <div className={`text-[9px] font-black tabular-nums px-1 rounded mb-0.5 ${
                              flagInRecord.isSlow ? 'bg-red-500 text-white' : 'bg-green-600 text-white'
                            }`}>
                              {flagInRecord.timeTaken > 0 ? '+' : ''}{flagInRecord.timeTaken}
                            </div>
                          )}
                          {totalShots > 0 && (
                            <div className={`text-[10px] font-black tabular-nums transition-colors ${
                              slowCount > 0 ? 'text-red-500' : 'text-green-500'
                            }`}>
                              {avgTime}s
                            </div>
                          )}
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: totalShots }).map((_, i) => (
                              <div key={i} className={`w-1 h-1 rounded-full ${
                                holeRecords[i].isSlow ? 'bg-red-500' : 'bg-green-500'
                              }`}></div>
                            ))}
                          </div>
                          {hasSearch && (
                             <div className="w-1 h-1 bg-[#FFDD00] rounded-full shadow-[0_0_2px_#FFDD00]"></div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-3 bg-zinc-900 border-t border-zinc-800 grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
           <div className="w-2 h-2 bg-green-600 rounded"></div>
           Normal Shots
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
           <div className="w-2 h-2 bg-red-500 rounded"></div>
           Slow Shots
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500">
           <div className="w-2 h-2 bg-[#FFDD00] rounded-full"></div>
           Lost Ball Search
        </div>
      </div>
    </div>
  );
};
