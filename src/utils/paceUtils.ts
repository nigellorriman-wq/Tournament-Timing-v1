import { TournamentInfo, PlayerShotRecord, TimerType } from '../types';

export const calculateTargetTime = (groupNum: string, holeNum: string, tournamentInfo?: TournamentInfo, baseDate: Date = new Date()): { time: string; minutes: number; date: Date } => {
  if (!tournamentInfo) return { time: '00:00', minutes: 0, date: baseDate };
  
  const grp = tournamentInfo.groups.find(g => g.groupNumber === groupNum);
  if (!grp) return { time: '00:00', minutes: 0, date: baseDate };

  // Check for pre-calculated hole time
  if (grp.holeTimes && grp.holeTimes[holeNum]) {
    const timeStr = grp.holeTimes[holeNum];
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date(baseDate);
    date.setHours(h, m, 0, 0);
    
    // Calculate minutes relative to start time for display
    const [startH, startM] = grp.startTime.split(':').map(Number);
    const startDate = new Date(baseDate);
    startDate.setHours(startH, startM, 0, 0);
    const totalMinutes = Math.round((date.getTime() - startDate.getTime()) / 60000);

    return {
      time: timeStr,
      minutes: totalMinutes,
      date
    };
  }

  const targetHoleIdx = parseInt(holeNum);
  
  let totalMinutes = 0;
  // Calculate cumulative pace based on starting tee
  if (grp.startingTee === 1) {
    for (let i = 1; i <= targetHoleIdx; i++) {
      const pace = tournamentInfo.paceOfPlay.find(p => p.hole === i);
      if (pace) totalMinutes += pace.minutes;
    }
  } else {
    // Starting from 10
    const sequence = [10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9];
    const targetIdxInSeq = sequence.indexOf(targetHoleIdx);
    if (targetIdxInSeq !== -1) {
      for (let i = 0; i <= targetIdxInSeq; i++) {
        const pace = tournamentInfo.paceOfPlay.find(p => p.hole === sequence[i]);
        if (pace) totalMinutes += pace.minutes;
      }
    }
  }

  const [startH, startM] = grp.startTime.split(':').map(Number);
  const date = new Date(baseDate);
  date.setHours(startH, startM + totalMinutes, 0, 0);
  
  return {
    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    minutes: totalMinutes,
    date
  };
};

export const getNextGroupExpected = (
  holeNum: string,
  tInfo: TournamentInfo | undefined,
  recs: PlayerShotRecord[],
  baseDate: Date
): string | null => {
  if (!tInfo || !tInfo.groups || tInfo.groups.length === 0) return null;

  // 1. Calculate pace for all groups
  const groupPaces = tInfo.groups.map(g => {
    const pace = calculateTargetTime(g.groupNumber, holeNum, tInfo, baseDate);
    const hasFinished = recs.some(r => 
      String(r.group) === String(g.groupNumber) && 
      r.hole === holeNum && 
      r.type === TimerType.FLAG_IN
    );
    return { group: g, pace, hasFinished };
  });

  // 2. Filter available (unfinished) groups
  let candidates = groupPaces.filter(item => !item.hasFinished);
  
  // If all groups have finished, fallback to all groups
  if (candidates.length === 0) {
    candidates = groupPaces;
  }

  // Sort chronologically by expected completion time
  candidates.sort((a, b) => a.pace.date.getTime() - b.pace.date.getTime());

  // Try to find the first group whose expected completion is in the future relative to baseDate
  const nextExpected = candidates.find(item => item.pace.date.getTime() >= baseDate.getTime());
  
  if (nextExpected) {
    return nextExpected.group.groupNumber;
  }
  
  // If none is in the future, return the first one (which is the most overdue / earliest expected)
  if (candidates.length > 0) {
    return candidates[0].group.groupNumber;
  }

  return null;
};

