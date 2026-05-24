import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, X, Check, FileText, Trophy, Calendar, FileType, Sparkles, Loader2, Map as MapIcon, Clock } from 'lucide-react';
import { TournamentInfo, HolePace, GroupData } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface TournamentSetupProps {
  onSetupComplete: (data: TournamentInfo) => void;
  currentInfo?: TournamentInfo;
}

export const TournamentSetup: React.FC<TournamentSetupProps> = ({ onSetupComplete, currentInfo }) => {
  const [name, setName] = useState(currentInfo?.name || '');
  const [round, setRound] = useState(currentInfo?.round || '');
  const [paceData, setPaceData] = useState<HolePace[]>(currentInfo?.paceOfPlay || []);
  const [groups, setGroups] = useState<GroupData[]>(currentInfo?.groups || []);
  const [kmlData, setKmlData] = useState<string>(currentInfo?.kmlData || '');
  const [sandboxTime, setSandboxTime] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const normalizeTime = (timeStr: string): string => {
    if (!timeStr) return "00:00";
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return timeStr;
    let h = parseInt(match[1]);
    const m = match[2];
    const mer = match[3]?.toUpperCase();

    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;

    return `${h.toString().padStart(2, '0')}:${m.padStart(2, '0')}`;
  };

  const handlePaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          const parsed = results.data
            .filter((row: any) => {
              const hasHole = 'Hole' in row || 'hole' in row;
              const hasMin = 'Time' in row || 'time' in row || 'Minutes' in row || 'minutes' in row || 'Mins' in row || 'mins' in row;
              return hasHole && hasMin;
            })
            .map((row: any) => ({
              hole: Number(row.Hole || row.hole),
              minutes: Number(row.Time || row.time || row.Minutes || row.minutes || row.Mins || row.mins)
            }))
            .filter(item => !isNaN(item.hole) && !isNaN(item.minutes));
          
          if (parsed.length > 0) {
            setPaceData(parsed);
          } else {
            alert('No valid Pace of Play data found. Check your CSV headers (Hole, Time).');
          }
        }
      });
    }
  };

  const handleGroupsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          const parsed: GroupData[] = results.data
            .filter((row: any) => {
              const hasGroup = 'GROUP NO' in row || 'Group' in row || 'group' in row;
              const hasTime = 'TIME' in row || 'StartTime' in row || 'startTime' in row || 'Time' in row || 'time' in row;
              return hasGroup && hasTime;
            })
            .map((row: any) => {
              const g = row['GROUP NO'] || row.Group || row.group;
              const st = row.TIME || row.StartTime || row.startTime || row.Time || row.time;
              const tee = row['Start Tee'] || row.Tee || row.tee || 1;
              const p1 = row['PLAYER 1'] || row.Player1 || row.player1;
              const p2 = row['PLAYER 2'] || row.Player2 || row.player2;
              const p3 = row['PLAYER 3'] || row.Player3 || row.player3;
              const p4 = row['PLAYER 4'] || row.Player4 || row.player4;
              
              const holeTimes: Record<string, string> = {};
              Object.keys(row).forEach(key => {
                const holeMatch = key.toLowerCase().match(/^hole\s*(\d+)$/);
                if (holeMatch) {
                  const hNum = holeMatch[1];
                  const timeVal = row[key];
                  if (timeVal) {
                    holeTimes[hNum] = normalizeTime(String(timeVal));
                  }
                }
              });

              return {
                groupNumber: String(g),
                startTime: normalizeTime(st),
                startingTee: Number(tee),
                players: [p1, p2, p3, p4].filter(p => p !== undefined && p !== null && String(p).trim() !== '') as string[],
                holeTimes
              };
            });
          
          if (parsed.length > 0) {
            setGroups(parsed);
          } else {
            alert('No valid Group data found. Check your CSV headers (TIME, GROUP NO, PLAYER 1...).');
          }
        }
      });
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Data,
              },
            },
            {
              text: "Extract tournament information from this golf start list. Include tournament name, round number, group numbers, start times, starting tees, players (full names), and pace of play (minutes per hole for holes 1-18)."
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              round: { type: Type.STRING },
              paceOfPlay: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    hole: { type: Type.NUMBER },
                    minutes: { type: Type.NUMBER },
                  },
                  required: ["hole", "minutes"],
                },
              },
              groups: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    groupNumber: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    startingTee: { type: Type.NUMBER },
                    players: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ["groupNumber", "startTime", "players"],
                },
              },
            },
            required: ["name", "round", "paceOfPlay", "groups"],
          }
        }
      });

      const parsed = JSON.parse(result.text || '{}');
      if (parsed.name) setName(parsed.name);
      if (parsed.round) setRound(String(parsed.round));
      if (parsed.paceOfPlay) setPaceData(parsed.paceOfPlay);
      if (parsed.groups) {
        setGroups(parsed.groups.map((g: any) => ({
          ...g,
          startTime: normalizeTime(g.startTime)
        })));
      }
    } catch (error) {
      console.error("PDF Parsing Error:", error);
      alert(error instanceof Error ? error.message : "Failed to parse PDF. Please try again or use CSV imports.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleKmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setKmlData(text);
      };
      reader.readAsText(file);
    }
  };

  const isComplete = name && round && paceData.length > 0 && groups.length > 0;

  return (
    <div className="p-4 bg-[#111] text-white flex flex-col h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-[#FFDD00]">
          <Trophy size={20} /> Tournament Setup
        </h2>
        <p className="text-gray-500 text-xs mt-1">Import pace of play and starting draw records.</p>
      </div>

      <div className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 focus-within:border-[#FFDD00] transition-colors">
            <label className="text-[10px] text-gray-500 uppercase font-black mb-1 block">Tournament Name</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Masters"
              className="w-full bg-transparent outline-none font-bold text-sm"
            />
          </div>
          <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 focus-within:border-[#FFDD00] transition-colors">
            <label className="text-[10px] text-gray-500 uppercase font-black mb-1 block">Round Number</label>
            <input 
              value={round}
              onChange={(e) => setRound(e.target.value)}
              placeholder="e.g. 1"
              className="w-full bg-transparent outline-none font-bold text-sm"
            />
          </div>
        </div>

        {/* PDF Import (New Option) */}
        <div className={`p-4 rounded-xl border-2 border-dashed transition-all ${isParsing ? 'border-[#FFDD00] bg-[#FFDD00]/5' : (groups.length > 0 && paceData.length > 0 ? 'bg-green-950/20 border-green-900/50' : 'bg-zinc-900/30 border-zinc-800')}`}>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold flex items-center gap-2">
              <Sparkles size={14} className="text-[#FFDD00]" /> AI PDF Import (Express Setup)
            </label>
            {groups.length > 0 && paceData.length > 0 && <Check size={14} className="text-green-500" />}
          </div>
          <p className="text-[10px] text-gray-500 mb-3">Upload a full start list PDF. Gemini will extract all info automatically.</p>
          <label className={`flex items-center gap-2 px-4 py-2 bg-[#FFDD00] hover:bg-[#ffe533] transition-colors rounded text-[10px] font-black text-black cursor-pointer w-fit ${isParsing ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {isParsing ? <Loader2 size={12} className="animate-spin" /> : <FileType size={12} />}
            {isParsing ? 'Analyzing Document...' : 'Import from PDF'}
            {!isParsing && <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />}
          </label>
        </div>

        <div className="flex items-center gap-2 py-2">
          <div className="flex-1 h-[1px] bg-zinc-800"></div>
          <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">OR USE CSV</span>
          <div className="flex-1 h-[1px] bg-zinc-800"></div>
        </div>

        {/* CSV Imports */}
        <div className="space-y-3">
          <div className={`p-4 rounded-xl border-2 border-dashed transition-all ${paceData.length > 0 ? 'bg-green-950/20 border-green-900/50' : 'bg-zinc-900/30 border-zinc-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold flex items-center gap-2">
                <FileText size={14} className="text-[#FFDD00]" /> Pace of Play (Time Per Hole CSV)
              </label>
              {paceData.length > 0 && <Check size={14} className="text-green-500" />}
            </div>
            <p className="text-[10px] text-gray-500 mb-3">Required: Hole, Minutes</p>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 transition-colors rounded text-[10px] font-bold cursor-pointer w-fit">
              <Upload size={12} /> {paceData.length > 0 ? 'Change File' : 'Upload CSV'}
              <input type="file" accept=".csv" onChange={handlePaceUpload} className="hidden" />
            </label>
            {paceData.length > 0 && <span className="text-[9px] text-green-400 mt-2 block">{paceData.length} holes loaded</span>}
          </div>

          <div className={`p-4 rounded-xl border-2 border-dashed transition-all ${groups.length > 0 ? 'bg-green-950/20 border-green-900/50' : 'bg-zinc-900/30 border-zinc-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold flex items-center gap-2">
                <Calendar size={14} className="text-[#FFDD00]" /> Starting Draw (Groups CSV)
              </label>
              {groups.length > 0 && <Check size={14} className="text-green-500" />}
            </div>
            <p className="text-[10px] text-gray-500 mb-3">Required: Group, StartTime, Tee, Player1, Player2...</p>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 transition-colors rounded text-[10px] font-bold cursor-pointer w-fit">
              <Upload size={12} /> {groups.length > 0 ? 'Change File' : 'Upload CSV'}
              <input type="file" accept=".csv" onChange={handleGroupsUpload} className="hidden" />
            </label>
            {groups.length > 0 && <span className="text-[9px] text-green-400 mt-2 block">{groups.length} groups loaded</span>}
          </div>

          <div className={`p-4 rounded-xl border-2 border-dashed transition-all ${kmlData ? 'bg-green-950/20 border-green-900/50' : 'bg-zinc-900/30 border-zinc-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold flex items-center gap-2">
                <MapIcon size={14} className="text-[#FFDD00]" /> Hole Layout (KML File)
              </label>
              {kmlData && <Check size={14} className="text-green-500" />}
            </div>
            <p className="text-[10px] text-gray-500 mb-3">Optional: Upload a KML file for GPS tracking and group mapping.</p>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 transition-colors rounded text-[10px] font-bold cursor-pointer w-fit">
              <Upload size={12} /> {kmlData ? 'Change KML File' : 'Upload KML'}
              <input type="file" accept=".kml" onChange={handleKmlUpload} className="hidden" />
            </label>
            {kmlData && <span className="text-[9px] text-green-400 mt-2 block">Layout data loaded</span>}
          </div>

          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold flex items-center gap-2">
                <Clock size={14} className="text-[#FFDD00]" /> Sandbox Current Time
              </label>
            </div>
            <p className="text-[10px] text-gray-500 mb-3">Testing only: Set a custom clock time for this tournament.</p>
            <div className="flex items-center gap-3">
              <input 
                type="time" 
                value={sandboxTime}
                onChange={(e) => setSandboxTime(e.target.value)}
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs outline-none focus:border-[#FFDD00]"
              />
              {sandboxTime && (
                <button 
                  onClick={() => setSandboxTime('')}
                  className="text-[10px] text-red-500 font-bold uppercase"
                >
                  Clear Offset
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          disabled={!isComplete}
          onClick={() => {
            let offset = currentInfo?.timeOffset || 0;
            if (sandboxTime) {
              const [h, m] = sandboxTime.split(':').map(Number);
              const simulation = new Date();
              simulation.setHours(h, m, 0, 0);
              offset = simulation.getTime() - Date.now();
            } else if (sandboxTime === '' && currentInfo?.timeOffset) {
                // If they cleared it explicitly, we might want to reset to 0
                // But sandboxTime is empty by default. 
                // Let's assume empty means "no change" unless they cleared it. 
                // Actually, if clear was clicked it sets to ''.
            }

            onSetupComplete({ 
              name, 
              round, 
              paceOfPlay: paceData, 
              groups, 
              kmlData,
              timeOffset: sandboxTime ? offset : (sandboxTime === '' ? 0 : currentInfo?.timeOffset)
            });
          }}
          className={`w-full py-4 rounded-xl font-black text-sm uppercase transition-all flex items-center justify-center gap-2 ${
            isComplete 
              ? 'bg-[#FFDD00] text-black shadow-lg shadow-yellow-500/10' 
              : 'bg-zinc-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          {currentInfo ? 'Update Tournament Data' : 'Save Tournament Data'}
        </button>

        {currentInfo && (
           <p className="text-center text-[9px] text-gray-600 mt-4 italic">
            Current: {currentInfo.name} - Round {currentInfo.round}
           </p>
        )}
      </div>
    </div>
  );
};
