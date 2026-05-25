import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TournamentInfo, PlayerShotRecord, TimerType } from '../types';
import { Map as MapIcon, Users, Clock, Info } from 'lucide-react';
import { calculateTargetTime } from '../utils/paceUtils';

// Fix for default marker icons in React Leaflet
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapViewProps {
  tournamentInfo: TournamentInfo | undefined;
  records: PlayerShotRecord[];
  currentTime?: Date;
  officialsLocations?: any[];
}

interface HoleLayout {
  hole: string;
  coordinates: [number, number][];
}

interface GroupPosition {
  groupNumber: string;
  hole: string;
  estimated: boolean;
  lat: number;
  lng: number;
  players: string[];
  paceStatus: 'Ahead' | 'On Time' | 'Behind';
}

export default function MapView({ tournamentInfo, records, currentTime, officialsLocations }: MapViewProps) {
  const [holeLayouts, setHoleLayouts] = useState<HoleLayout[]>([]);
  const [center, setCenter] = useState<[number, number]>([0, 0]);
  const [zoom, setZoom] = useState(13);
  const now = currentTime || new Date();

  // Parse KML Data
  useEffect(() => {
    if (!tournamentInfo?.kmlData) return;

    try {
      const parser = new DOMParser();
      const kml = parser.parseFromString(tournamentInfo.kmlData, 'text/xml');
      const placemarks = kml.getElementsByTagName('Placemark');
      const layouts: HoleLayout[] = [];
      let allCoords: [number, number][] = [];

      for (let i = 0; i < placemarks.length; i++) {
        const name = placemarks[i].getElementsByTagName('name')[0]?.textContent || '';
        const coordsText = placemarks[i].getElementsByTagName('coordinates')[0]?.textContent || '';
        
        if (coordsText) {
          const coords = coordsText.trim().split(/\s+/).map(pair => {
            const [lng, lat] = pair.split(',').map(Number);
            return [lat, lng] as [number, number];
          }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

          if (coords.length > 0) {
            // Extract just the number from the name for consistent matching
            // handles "Hole 1", "Hole 01", "1", etc.
            const holeMatch = name.match(/(\d+)/);
            const holeId = holeMatch ? parseInt(holeMatch[1], 10).toString() : name;
            
            layouts.push({ hole: holeId, coordinates: coords });
            allCoords = [...allCoords, ...coords];
          }
        }
      }

      setHoleLayouts(layouts);

      if (allCoords.length > 0) {
        const avgLat = allCoords.reduce((sum, c) => sum + c[0], 0) / allCoords.length;
        const avgLng = allCoords.reduce((sum, c) => sum + c[1], 0) / allCoords.length;
        setCenter([avgLat, avgLng]);
        setZoom(15);
      }
    } catch (error) {
      console.error('Failed to parse KML:', error);
    }
  }, [tournamentInfo?.kmlData]);

  const minuteNow = Math.floor(now.getTime() / 60000);

  const nextGroups = useMemo(() => {
    if (!tournamentInfo) return [];
    return tournamentInfo.groups
      .filter(g => {
        const [h, m] = g.startTime.split(':').map(Number);
        const start = new Date(now);
        start.setHours(h, m, 0, 0);
        return start > now;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 10);
  }, [tournamentInfo, minuteNow]);

  const finishedGroups = useMemo(() => {
    if (!tournamentInfo) return [];
    
    const totalPaceMinutes = tournamentInfo.paceOfPlay.reduce((sum, p) => sum + p.minutes, 0);
    
    const finished = tournamentInfo.groups.map(group => {
      const lastHoleOfSequence = group.startingTee === 10 ? '9' : '18';
      const finishRecord = records.find(r => String(r.group) === String(group.groupNumber) && r.hole === lastHoleOfSequence && r.type === TimerType.FLAG_IN);
      
      const startTime = new Date(now);
      const [sh, sm] = group.startTime.split(':').map(Number);
      startTime.setHours(sh, sm, 0, 0);

      if (finishRecord) {
        const finishTime = new Date(finishRecord.timestamp);
        const duration = Math.round((finishTime.getTime() - startTime.getTime()) / 60000);
        return {
          groupNumber: group.groupNumber,
          completionTime: finishTime,
          duration,
          status: 'actual' as const
        };
      } else {
        const estimatedFinishTime = new Date(startTime.getTime() + totalPaceMinutes * 60000);
        if (now > estimatedFinishTime) {
          return {
            groupNumber: group.groupNumber,
            completionTime: estimatedFinishTime,
            duration: totalPaceMinutes,
            status: 'estimated' as const
          };
        }
      }
      return null;
    }).filter(Boolean) as { groupNumber: string; completionTime: Date; duration: number; status: 'actual' | 'estimated' }[];

    return finished.sort((a, b) => b.completionTime.getTime() - a.completionTime.getTime()).slice(0, 10);
  }, [tournamentInfo, records, minuteNow]);

  const activeOfficialsLocations = useMemo(() => {
    const hasSandboxTime = tournamentInfo?.timeOffset !== undefined && tournamentInfo?.timeOffset !== 0;
    if (hasSandboxTime) {
      return (officialsLocations || []).map(off => ({
        ...off,
        initials: off.initials || off.id || 'RF',
        timestamp: Date.now() // Bypass the 1-hour expiration filter for sandbox testing
      }));
    }

    if (!tournamentInfo?.officials || tournamentInfo.officials.length === 0 || holeLayouts.length === 0) {
      return officialsLocations || [];
    }

    const mockOfficials: any[] = [];
    const shuffledHoles = [...holeLayouts];
    
    // Deterministic seeded shuffle using tournament name
    let seed = 42;
    for (let i = shuffledHoles.length - 1; i > 0; i--) {
      const nameSum = (tournamentInfo.name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const x = Math.sin(seed++ + nameSum) * 10000;
      const r = x - Math.floor(x);
      const j = Math.floor(r * (i + 1));
      const temp = shuffledHoles[i];
      shuffledHoles[i] = shuffledHoles[j];
      shuffledHoles[j] = temp;
    }

    tournamentInfo.officials.forEach((official, idx) => {
      const layout = shuffledHoles[idx % shuffledHoles.length];
      if (layout && layout.coordinates.length > 0) {
        const greenCoord = layout.coordinates[layout.coordinates.length - 1]; // Green is the end of the hole layout
        
        // Offset of 15-30 meters (0.00012 to 0.00026 degrees) beside the green
        const nameSum2 = (official.initials || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + idx;
        const latOffset = (Math.sin(nameSum2) * 1.5 + 1.5) * 0.00012 + 0.00008;
        const lngOffset = (Math.cos(nameSum2) * 1.5 + 1.5) * 0.00012 + 0.00008;

        const matchingRealLoc = (officialsLocations || []).find(
          l => l.initials?.toUpperCase() === official.initials?.toUpperCase()
        );

        mockOfficials.push({
          initials: official.initials.toUpperCase().slice(0, 2),
          lat: greenCoord[0] + (nameSum2 % 2 === 0 ? latOffset : -latOffset),
          lng: greenCoord[1] + (nameSum2 % 3 === 0 ? lngOffset : -lngOffset),
          timestamp: Date.now(),
          activeTimer: matchingRealLoc?.activeTimer || null
        });
      }
    });

    return mockOfficials;
  }, [tournamentInfo, holeLayouts, officialsLocations]);

  const groupPositions = useMemo(() => {
    if (!tournamentInfo) return [];

    const positions: GroupPosition[] = [];
    const totalPaceMinutes = tournamentInfo.paceOfPlay.reduce((sum, p) => sum + p.minutes, 0);

    tournamentInfo.groups.forEach(group => {
      const startTime = new Date(now);
      const [hours, minutes] = group.startTime.split(':').map(Number);
      startTime.setHours(hours, minutes, 0, 0);
      
      const elapsedMinutes = (now.getTime() - startTime.getTime()) / 60000;

      // When a group has finished the final hole (actual record of flag-in on final hole of sequence)
      const lastHoleOfSequence = group.startingTee === 10 ? '9' : '18';
      const hasFinishedActual = records.some(r => String(r.group) === String(group.groupNumber) && r.hole === lastHoleOfSequence && r.type === TimerType.FLAG_IN);
      if (hasFinishedActual) return;

      // When a group is expected to have finished the final hole (based on total pace time)
      const estimatedFinishTime = new Date(startTime.getTime() + totalPaceMinutes * 60000);
      if (now > estimatedFinishTime) return;

      // Find latest record for this group
      const groupRecords = records
        .filter(r => String(r.group) === String(group.groupNumber))
        .sort((a, b) => b.timestamp - a.timestamp);

      // Find all flag-ins for this group to detect manual progression
      const groupFlagIns = records
        .filter(r => String(r.group) === String(group.groupNumber) && r.type === TimerType.FLAG_IN);
        
      const latestFlagIn = groupFlagIns.length > 0
        ? [...groupFlagIns].sort((a, b) => b.timestamp - a.timestamp)[0]
        : null;

      let currentHole = '1';
      let lat = 0;
      let lng = 0;
      let estimated = true;

      if (groupRecords.length > 0 && groupRecords[0].latitude && groupRecords[0].longitude) {
        currentHole = groupRecords[0].hole;
        lat = groupRecords[0].latitude;
        lng = groupRecords[0].longitude;
        estimated = false;
      } else {
        // Estimate based on time
        if (elapsedMinutes <= 0 && !latestFlagIn) return;

        let holeProgress = 0;
        const sequence = group.startingTee === 10 
          ? [10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9]
          : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];

        if (latestFlagIn) {
          const finishedHoleNum = parseInt(latestFlagIn.hole, 10);
          const finishedHoleIndex = sequence.indexOf(finishedHoleNum);
          
          if (finishedHoleIndex !== -1 && finishedHoleIndex + 1 < sequence.length) {
            currentHole = String(sequence[finishedHoleIndex + 1]);
            const elapsedMinutesOnCurrentHole = (now.getTime() - latestFlagIn.timestamp) / 60000;
            const pace = tournamentInfo.paceOfPlay.find(p => p.hole === sequence[finishedHoleIndex + 1]);
            const holeDuration = pace ? pace.minutes : 15;
            holeProgress = Math.max(0, Math.min(1, elapsedMinutesOnCurrentHole / holeDuration));
          } else {
            currentHole = String(sequence[sequence.length - 1]);
            holeProgress = 1;
          }
        } else {
          let minsAcc = 0;
          let prevMinsAcc = 0;
          let holeDuration = 0;
          currentHole = String(sequence[0]);
          
          for (const holeNum of sequence) {
            const pace = tournamentInfo.paceOfPlay.find(p => p.hole === holeNum);
            if (pace) {
              prevMinsAcc = minsAcc;
              minsAcc += pace.minutes;
              holeDuration = pace.minutes;
              if (elapsedMinutes < minsAcc) {
                currentHole = String(holeNum);
                break;
              }
              currentHole = String(holeNum);
            }
          }
          
          if (holeDuration > 0) {
            holeProgress = Math.max(0, Math.min(1, (elapsedMinutes - prevMinsAcc) / holeDuration));
          } else {
            holeProgress = 1;
          }
        }

        const layout = holeLayouts.find(l => l.hole === currentHole);
        if (layout && layout.coordinates.length > 0) {
          // User suggested that progression to green takes 3/4 of the hole time
          // This leaves 1/4 for walking/transition to next hole.
          const effectiveProgress = Math.min(1, holeProgress / 0.75);

          if (layout.coordinates.length === 1) {
            lat = layout.coordinates[0][0];
            lng = layout.coordinates[0][1];
          } else {
            const totalSegments = layout.coordinates.length - 1;
            const segmentProgress = effectiveProgress * totalSegments;
            const segmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
            const t = segmentProgress - segmentIndex;
            
            const start = layout.coordinates[segmentIndex];
            const end = layout.coordinates[segmentIndex + 1];
            
            lat = start[0] + (end[0] - start[0]) * t;
            lng = start[1] + (end[1] - start[1]) * t;
          }
        } else if (holeLayouts.length > 0) {
          // Fallback to first available hole layout if specific one missing
          lat = holeLayouts[0].coordinates[0][0];
          lng = holeLayouts[0].coordinates[0][1];
        }
      }

      // Calculate Pace Status
      let diff = 0;
      if (latestFlagIn) {
        const elapsedOnCurrent = (now.getTime() - latestFlagIn.timestamp) / 60000;
        const pace = tournamentInfo.paceOfPlay.find(p => p.hole === parseInt(currentHole, 10));
        const limitMins = pace ? pace.minutes : 15;
        const extraTime = Math.max(0, elapsedOnCurrent - limitMins);
        
        diff = latestFlagIn.timeTaken + extraTime;
      } else {
        const target = calculateTargetTime(group.groupNumber, currentHole, tournamentInfo, now);
        diff = (now.getTime() - target.date.getTime()) / 60000;
      }

      let paceStatus: 'Ahead' | 'On Time' | 'Behind' = 'On Time';
      if (latestFlagIn) {
        if (diff > 5) paceStatus = 'Behind';
        else if (diff < 0) paceStatus = 'Ahead';
      } else {
        if (diff > 5) paceStatus = 'Behind';
      }

      if (lat !== 0) {
        positions.push({
          groupNumber: group.groupNumber,
          hole: currentHole,
          estimated,
          lat,
          lng,
          players: group.players,
          paceStatus
        });
      }
    });

    const deconflictedPositions: GroupPosition[] = [];
    const coordUsage = new Map<string, number>();

    positions.forEach(pos => {
      const key = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
      const count = coordUsage.get(key) || 0;
      coordUsage.set(key, count + 1);

      if (count > 0) {
        // Small spiral offset for overlapping markers
        const angle = count * 0.5; // simple spiral
        const radius = 0.00015 * Math.sqrt(count);
        pos.lat += Math.cos(angle) * radius;
        pos.lng += Math.sin(angle) * radius;
      }
      deconflictedPositions.push(pos);
    });

    return deconflictedPositions;
  }, [tournamentInfo, records, holeLayouts, minuteNow]);

  if (!tournamentInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-zinc-500">
        <Info size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-bold uppercase tracking-wider">No tournament active</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="p-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <MapIcon size={18} className="text-[#FFDD00]" />
          <h2 className="text-sm font-black uppercase tracking-tighter italic">Map View</h2>
        </div>
        <div className="flex gap-4">
           <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full bg-zinc-400"></div>
             <span className="text-[9px] font-bold uppercase text-zinc-400">Confirmed</span>
           </div>
           <div className="flex items-center gap-1.5">
             <div className="w-2 h-2 rounded-full border border-zinc-400"></div>
             <span className="text-[9px] font-bold uppercase text-zinc-400">Estimated</span>
           </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        {/* Left Table: Next to start */}
        {nextGroups.length > 0 && (
          <div className="absolute left-2 top-2 z-[1000] w-32 bg-black/80 backdrop-blur-md rounded-xl border border-zinc-800 p-2 pointer-events-none sm:pointer-events-auto">
            <div className="text-[10px] font-black uppercase tracking-tighter text-[#FFDD00] mb-2 px-1">Next 10 Starting</div>
            <div className="space-y-1">
              {nextGroups.map(g => (
                <div key={g.groupNumber} className="flex items-center justify-between gap-2 px-1 py-1 border-b border-zinc-800 last:border-0">
                  <span className="text-[10px] font-black text-white">G{g.groupNumber}</span>
                  <span className="text-[10px] font-mono text-white">{g.startTime}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right Table: Last Finished */}
        {finishedGroups.length > 0 && (
          <div className="absolute right-2 top-2 z-[1000] w-44 bg-black/80 backdrop-blur-md rounded-xl border border-zinc-800 p-2 pointer-events-none sm:pointer-events-auto">
            <div className="text-[10px] font-black uppercase tracking-tighter text-[#FFDD00] mb-2 px-1">Last 10 Finished</div>
            <div className="space-y-1">
              {finishedGroups.map(g => {
                const h = Math.floor(g.duration / 60);
                const m = g.duration % 60;
                return (
                  <div key={g.groupNumber} className="flex flex-col gap-0.5 px-1 py-1 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-white">G{g.groupNumber} <span className="text-[8px] text-white font-bold uppercase">{g.status === 'estimated' ? 'Est' : 'Act'}</span></span>
                      <span className="text-[10px] font-mono text-[#FFDD00]">
                        {g.completionTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </span>
                    </div>
                    <div className="text-[8px] font-bold text-white uppercase flex justify-between">
                      <span>Time Taken</span>
                      <span>{h}h {m}m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <MapContainer 
          center={center} 
          zoom={zoom} 
          style={{ height: '100%', width: '100%', background: '#000' }}
          zoomControl={false}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; <a href="https://www.esri.com/">Esri</a>, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
          />
          
          {holeLayouts.map((layout, idx) => {
            const labelPositions = getSubtleLabelPositions(layout.coordinates, 120);
            return (
              <React.Fragment key={`hole-group-${idx}`}>
                <Polyline 
                  positions={layout.coordinates}
                  pathOptions={{ color: '#FFDD00', weight: 2, opacity: 0.6, dashArray: '5, 10' }}
                >
                  <Popup>
                    <div className="text-black font-bold">Hole {layout.hole}</div>
                  </Popup>
                </Polyline>
                {labelPositions.map((p, pIdx) => (
                  <Marker
                    key={`hole-label-${idx}-${pIdx}`}
                    position={p}
                    interactive={false}
                    icon={L.divIcon({
                      html: `<div class="subtle-hole-label">${layout.hole}</div>`,
                      className: '',
                      iconSize: [24, 24],
                      iconAnchor: [12, 12]
                    })}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {groupPositions.map((pos, idx) => (
            <Marker 
              key={`group-${idx}`} 
              position={[pos.lat, pos.lng]}
              icon={L.divIcon({
                html: `
                  <div class="group-marker ${pos.estimated ? 'estimated' : ''} ${pos.paceStatus === 'Behind' ? 'behind' : ''} ${pos.paceStatus === 'Ahead' ? 'ahead' : ''} ${pos.paceStatus === 'On Time' ? 'ontime' : ''}">
                    <span class="label">${pos.groupNumber}</span>
                  </div>
                `,
                className: '',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
              })}
            >
              <Popup>
                <div className="text-black p-1 min-w-[120px]">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="font-black text-sm uppercase">Group {pos.groupNumber}</div>
                    <div className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                      pos.paceStatus === 'Behind' ? 'bg-red-500 text-white' : 
                      pos.paceStatus === 'Ahead' ? 'bg-blue-500 text-white' : 
                      'bg-green-500 text-white'
                    }`}>
                      {pos.paceStatus}
                    </div>
                  </div>
                  
                  <div className="space-y-1 mb-2">
                    {pos.players.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-600">
                        <div className="w-1 h-1 rounded-full bg-zinc-300"></div>
                        {p}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-zinc-100 flex flex-col gap-1">
                    <div className="text-[9px] text-zinc-400 font-bold uppercase flex items-center justify-between">
                      <span>Location</span>
                      <span className="text-zinc-900">Hole {pos.hole}</span>
                    </div>
                    <div className="text-[9px] text-zinc-400 font-bold uppercase flex items-center justify-between">
                      <span>Status</span>
                      <span className={pos.estimated ? 'text-zinc-500' : 'text-green-600'}>
                        {pos.estimated ? 'ESTIMATED' : 'CONFIRMED'}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Render rules officials */}
          {activeOfficialsLocations.map((off, idx) => {
            // Filter out positions updated more than 1 hour ago
            const isRecent = Date.now() - off.timestamp < 3600000;
            if (!isRecent) return null;

            const hasActiveTimer = off.activeTimer && off.activeTimer !== null;
            const pulseClass = hasActiveTimer ? 'pulse-timer' : '';

            return (
              <Marker
                key={`official-${off.initials}-${idx}`}
                position={[off.lat, off.lng]}
                icon={L.divIcon({
                  html: `<div class="official-marker-box ${pulseClass}">${off.initials.trim().toUpperCase().slice(0, 2)}</div>`,
                  className: '',
                  iconSize: [26, 26],
                  iconAnchor: [13, 13]
                })}
              >
                <Popup>
                  <div className="text-black font-bold text-xs p-1 min-w-[180px]">
                    <p className="font-black border-b border-zinc-200 pb-1 mb-1.5 flex items-center justify-between text-zinc-950">
                      <span>Rules Official: {off.initials}</span>
                      {hasActiveTimer && (
                        <span className="animate-pulse bg-red-600 text-white text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase">
                          ACTIVE
                        </span>
                      )}
                    </p>
                    {hasActiveTimer ? (
                      <div className="space-y-1.5 text-zinc-800">
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-extrabold uppercase">
                          <span>TIMER TYPE</span>
                          <span className="text-red-600">
                            {off.activeTimer.type === 'LOST_BALL' ? 'LOST BALL' : 'SHOT CLOCK'}
                          </span>
                        </div>
                        <p className="text-xs font-black text-zinc-900 mt-1">
                          {off.activeTimer.playerName}
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-[10px] bg-zinc-100 p-1.5 rounded border border-zinc-200 mt-1 tabular-nums font-mono text-zinc-600">
                          <div>
                            <span className="block text-[8px] text-zinc-400 font-bold uppercase">Hole</span>
                            <span className="font-bold text-zinc-900">Hole {off.activeTimer.hole}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] text-zinc-400 font-bold uppercase">Group</span>
                            <span className="font-bold text-zinc-900">Group {off.activeTimer.group}</span>
                          </div>
                        </div>
                        
                        {off.activeTimer.type === 'LOST_BALL' ? (
                          <div className="mt-2 text-center text-red-600 font-mono text-xs font-black border-t border-dashed border-zinc-200 pt-1.5">
                            Search Code: Rule 18.2a {off.activeTimer.timeLeft !== undefined ? `(${Math.floor(off.activeTimer.timeLeft / 60)}:${(off.activeTimer.timeLeft % 60).toString().padStart(2, '0')} left)` : ''}
                          </div>
                        ) : (
                          <div className="mt-2 text-center text-amber-600 font-mono text-xs font-black border-t border-dashed border-zinc-200 pt-1.5">
                            Pace Limit: {off.activeTimer.limit}s {off.activeTimer.timeTaken !== undefined ? `(${off.activeTimer.timeTaken.toFixed(1)}s elapsed)` : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-zinc-500 text-[10px] py-1">
                        No active timers currently running.
                      </div>
                    )}
                    
                    <p className="text-[8px] text-zinc-400 mt-2 text-right border-t border-zinc-100 pt-1">
                      Last update: {new Date(off.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          
          <MapController center={center} zoom={zoom} />
        </MapContainer>
      </div>

      <style>{`
        @keyframes pulse-yellow {
          0% {
            box-shadow: 0 0 0 0 rgba(255, 221, 0, 0.9), 0 4px 12px rgba(0,0,0,0.6);
            border-color: #FFDD00;
          }
          70% {
            box-shadow: 0 0 0 14px rgba(255, 221, 0, 0), 0 4px 12px rgba(0,0,0,0.6);
            border-color: #FFDD00;
          }
          100% {
            box-shadow: 0 0 0 0 rgba(255, 221, 0, 0), 0 4px 12px rgba(0,0,0,0.6);
            border-color: #FFDD00;
          }
        }
        .official-marker-box {
          width: 26px;
          height: 26px;
          background: #000000;
          border: 2px solid #FFFFFF;
          color: #FFFFFF;
          border-radius: 0px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: monospace;
          font-weight: 900;
          font-size: 11px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.6);
          transition: all 0.3s;
        }
        .official-marker-box.pulse-timer {
          animation: pulse-yellow 1.5s infinite;
          background: #251212;
          border-color: #FFDD00;
        }
        .group-marker {
          width: 32px;
          height: 32px;
          background: #22C55E;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 14px;
          border: 3px solid black;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          transition: all 0.3s;
        }
        .group-marker.ontime {
          background: #22C55E;
          color: white;
          border-color: black;
        }
        .group-marker.behind {
          background: #EF4444;
          color: white;
          border-color: black;
        }
        .group-marker.ahead {
          background: #3B82F6;
          color: white;
          border-color: black;
        }
        .group-marker.estimated {
          background: rgba(0,0,0,0.8);
          color: #22C55E;
          border: 3px solid #22C55E;
        }
        .group-marker.estimated.ontime {
          color: #22C55E;
          border-color: #22C55E;
        }
        .group-marker.estimated.behind {
          color: #EF4444;
          border-color: #EF4444;
        }
        .group-marker.estimated.ahead {
          color: #3B82F6;
          border-color: #3B82F6;
        }
        .group-marker .label {
          font-family: sans-serif;
          font-style: italic;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
          background: white;
        }
        .leaflet-container {
          filter: saturate(1.2) contrast(1.1);
        }
        .subtle-hole-label {
          color: #FFFFFF;
          font-family: monospace;
          font-size: 11px;
          font-weight: 900;
          text-align: center;
          line-height: 24px;
          text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 1px 3px rgba(0, 0, 0, 0.9);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function MapController({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

function getSubtleLabelPositions(coords: [number, number][], intervalMeters = 120): [number, number][] {
  if (coords.length < 2) return [];
  const points: [number, number][] = [];
  const numPoints = coords.length;
  
  // Starting traverse with offset to prevent overlap with start marker
  let distanceSinceLastLabel = intervalMeters / 2;
  
  for (let i = 1; i < numPoints; i++) {
    const p1 = coords[i - 1];
    const p2 = coords[i];
    
    const dy = p2[0] - p1[0];
    const dx = (p2[1] - p1[1]) * Math.cos((p1[0] * Math.PI) / 180);
    const segLength = Math.sqrt(dx * dx + dy * dy) * 111000;
    
    if (segLength === 0) continue;
    
    let segTraversed = 0;
    while (segTraversed + (intervalMeters - distanceSinceLastLabel) <= segLength) {
      const needed = intervalMeters - distanceSinceLastLabel;
      segTraversed += needed;
      const ratio = segTraversed / segLength;
      const lat = p1[0] + dy * ratio;
      const lng = p1[1] + (p2[1] - p1[1]) * ratio;
      points.push([lat, lng]);
      distanceSinceLastLabel = 0;
    }
    distanceSinceLastLabel += (segLength - segTraversed);
  }
  
  if (points.length === 0) {
    const midIndex = Math.floor(coords.length / 2);
    if (coords[midIndex]) {
      points.push(coords[midIndex]);
    }
  }
  
  return points;
}
