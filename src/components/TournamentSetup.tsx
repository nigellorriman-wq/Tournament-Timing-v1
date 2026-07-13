import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, X, Check, FileText, Trophy, Calendar, FileType, Sparkles, Loader2, Map as MapIcon, Clock, User, RotateCcw } from 'lucide-react';
import { TournamentInfo, HolePace, GroupData, OfficialData } from '../types';

const DEFAULT_PACE_OF_PLAY: HolePace[] = [
  { hole: 1, minutes: 15 },
  { hole: 2, minutes: 15 },
  { hole: 3, minutes: 12 },
  { hole: 4, minutes: 15 },
  { hole: 5, minutes: 18 },
  { hole: 6, minutes: 15 },
  { hole: 7, minutes: 12 },
  { hole: 8, minutes: 15 },
  { hole: 9, minutes: 18 },
  { hole: 10, minutes: 15 },
  { hole: 11, minutes: 15 },
  { hole: 12, minutes: 12 },
  { hole: 13, minutes: 15 },
  { hole: 14, minutes: 18 },
  { hole: 15, minutes: 15 },
  { hole: 16, minutes: 12 },
  { hole: 17, minutes: 15 },
  { hole: 18, minutes: 18 }
];

const DEFAULT_GROUPS: GroupData[] = [
  {
    groupNumber: "1",
    startTime: "06:30",
    startingTee: 1,
    players: ["Tiger Woods", "Rory McIlroy", "Scottie Scheffler"],
    holeTimes: {
      "1": "06:45", "2": "07:00", "3": "07:12", "4": "07:27", "5": "07:45",
      "6": "08:00", "7": "08:12", "8": "08:27", "9": "08:45", "10": "09:00",
      "11": "09:15", "12": "09:27", "13": "09:42", "14": "10:00", "15": "10:15",
      "16": "10:27", "17": "10:42", "18": "11:00"
    }
  },
  {
    groupNumber: "2",
    startTime: "06:40",
    startingTee: 1,
    players: ["Jon Rahm", "Viktor Hovland", "Xander Schauffele"],
    holeTimes: {
      "1": "06:55", "2": "07:10", "3": "07:22", "4": "07:37", "5": "07:55",
      "6": "08:10", "7": "08:22", "8": "08:37", "9": "08:55", "10": "09:10",
      "11": "09:25", "12": "09:37", "13": "09:52", "14": "10:10", "15": "10:25",
      "16": "10:37", "17": "10:52", "18": "11:10"
    }
  },
  {
    groupNumber: "3",
    startTime: "06:50",
    startingTee: 1,
    players: ["Patrick Cantlay", "Wyndham Clark", "Max Homa"],
    holeTimes: {
      "1": "07:05", "2": "07:20", "3": "07:32", "4": "07:47", "5": "08:05",
      "6": "08:20", "7": "08:32", "8": "08:47", "9": "09:05", "10": "09:20",
      "11": "09:35", "12": "09:47", "13": "10:02", "14": "10:20", "15": "10:35",
      "16": "10:47", "17": "11:02", "18": "11:20"
    }
  },
  {
    groupNumber: "4",
    startTime: "07:00",
    startingTee: 1,
    players: ["Matt Fitzpatrick", "Brian Harman", "Ludvig Aberg"],
    holeTimes: {
      "1": "07:15", "2": "07:30", "3": "07:42", "4": "07:57", "5": "08:15",
      "6": "08:30", "7": "08:42", "8": "08:57", "9": "09:15", "10": "09:30",
      "11": "09:45", "12": "09:57", "13": "10:12", "14": "10:30", "15": "10:45",
      "16": "10:57", "17": "11:12", "18": "11:30"
    }
  },
  {
    groupNumber: "5",
    startTime: "07:10",
    startingTee: 1,
    players: ["Jordan Spieth", "Justin Thomas", "Brooks Koepka"],
    holeTimes: {
      "1": "07:25", "2": "07:40", "3": "07:52", "4": "08:07", "5": "08:25",
      "6": "08:40", "7": "08:52", "8": "09:07", "9": "09:25", "10": "09:40",
      "11": "09:55", "12": "10:07", "13": "10:22", "14": "10:40", "15": "10:55",
      "16": "11:07", "17": "11:22", "18": "11:40"
    }
  }
];

const DEFAULT_OFFICIALS: OfficialData[] = [
  { initials: "JD", name: "John Doe" },
  { initials: "AS", name: "Adam Scott" }
];

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

  const [officials, setOfficials] = useState<OfficialData[]>(currentInfo?.officials || []);
  const [newOfficialInitials, setNewOfficialInitials] = useState('');
  const [newOfficialName, setNewOfficialName] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetAll = () => {
    setName('');
    setRound('');
    setPaceData([]);
    setGroups([]);
    setKmlData('');
    setSandboxTime('');
    setOfficials([]);
    setShowResetConfirm(false);
  };

  const handleAddOfficial = () => {
    const initials = newOfficialInitials.trim().toUpperCase();
    if (initials.length !== 2) return;
    if (officials.some(o => o.initials === initials)) return;
    setOfficials([...officials, { initials, name: newOfficialName.trim() || undefined }]);
    setNewOfficialInitials('');
    setNewOfficialName('');
  };

  const handleRemoveOfficial = (initials: string) => {
    setOfficials(officials.filter(o => o.initials !== initials));
  };

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

      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pdfBase64: base64Data })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      const parsed = await response.json();
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
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-[#FFDD00]">
            <Trophy size={20} /> Tournament Setup
          </h2>
          <p className="text-white text-xs mt-1">Import pace of play and starting draw records.</p>
        </div>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/50 text-red-400 hover:text-red-300 rounded text-[10px] font-black uppercase transition-all tracking-wider shrink-0 outline-none select-none"
          title="Reset to default settings"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      <div className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 focus-within:border-[#FFDD00] transition-colors">
            <label className="text-[10px] text-white uppercase font-black mb-1 block">Tournament Name</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Masters"
              className="w-full bg-transparent outline-none font-bold text-sm"
            />
          </div>
          <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 focus-within:border-[#FFDD00] transition-colors">
            <label className="text-[10px] text-white uppercase font-black mb-1 block">Round Number</label>
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
          <p className="text-[10px] text-white mb-3">Upload a full start list PDF. Gemini will extract all info automatically.</p>
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
            <p className="text-[10px] text-white mb-3">Required: Hole, Minutes</p>
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
            <p className="text-[10px] text-white mb-3">Required: Group, StartTime, Tee, Player1, Player2...</p>
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
            <p className="text-[10px] text-white mb-3">Optional: Upload a KML file for GPS tracking and group mapping.</p>
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
            <p className="text-[10px] text-white mb-3">Testing only: Set a custom clock time for this tournament.</p>
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

          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold flex items-center gap-2">
                <User size={14} className="text-[#FFDD00]" /> Registered Rules Officials
              </label>
            </div>
            <p className="text-[10px] text-white mb-3">Add rules officials' 2-letter initials for course location mapping.</p>
            <div className="flex gap-2 mb-3">
              <input 
                type="text"
                maxLength={2}
                placeholder="Initials"
                value={newOfficialInitials}
                onChange={(e) => setNewOfficialInitials(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, ''))}
                className="bg-black border border-zinc-800 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#FFDD00] w-20 uppercase font-mono tracking-widest text-center font-bold"
              />
              <input 
                type="text"
                placeholder="Full Name (optional)"
                value={newOfficialName}
                onChange={(e) => setNewOfficialName(e.target.value)}
                className="bg-black border border-zinc-800 rounded px-2.5 py-1.5 text-xs outline-none focus:border-[#FFDD00] flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={handleAddOfficial}
                className="px-3 py-1.5 bg-[#FFDD00] hover:bg-[#ffe533] text-black text-[10px] font-black uppercase rounded transition-colors shrink-0"
              >
                Add
              </button>
            </div>

            {officials.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar pt-1">
                {officials.map((off, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs">
                    <span className="font-mono font-black bg-white text-black px-1.5 py-0.5 rounded text-[9px] border border-white leading-none">{off.initials}</span>
                    <span className="text-gray-400 text-[10px] truncate max-w-[100px]">{off.name || 'Official'}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOfficial(off.initials)}
                      className="text-red-500 hover:text-red-400 font-bold ml-1 text-xs leading-none"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[9px] text-white italic">No officials configured yet.</p>
            )}
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
              timeOffset: sandboxTime ? offset : (sandboxTime === '' ? 0 : currentInfo?.timeOffset),
              officials
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
           <p className="text-center text-[9px] text-white mt-4 italic">
            Current: {currentInfo.name} - Round {currentInfo.round}
           </p>
        )}
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <div className="p-2 bg-red-500/10 rounded-full">
                <RotateCcw size={20} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-wide">Confirm Reset</h3>
            </div>
            <p className="text-sm text-zinc-300 mb-6 leading-relaxed">
              Are you sure you want to clear all tournament settings? This will completely clear the tournament name, round, player lists, starting draw, pace of play, and rules officials.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 transition-colors rounded text-xs font-bold uppercase tracking-wider text-zinc-300 outline-none"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 transition-colors rounded text-xs font-bold uppercase tracking-wider text-white outline-none"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
