import React, { useState, useEffect } from 'react';
import { Timer, LayoutGrid, History, ShieldAlert, Trophy, BarChart2, Flag, MapPin, LogIn, LogOut, Map as MapIcon, User as UserIcon } from 'lucide-react';
import LostBallTimer from './components/LostBallTimer';
import ShotTimer from './components/ShotTimer';
import SessionHistory from './components/SessionHistory';
import { HoleTimings } from './components/HoleTimings';
import { FlagInTimer } from './components/FlagInTimer';
import { HoleControl } from './components/HoleControl';
import { TournamentSetup } from './components/TournamentSetup';
import MapView from './components/MapView';
import { PlayerShotRecord, TournamentInfo } from './types';
import { useWakeLock } from './hooks/useWakeLock';
import { auth, db, signInWithGoogle, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, collection, addDoc, query, orderBy, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lost' | 'shot' | 'history' | 'tournament' | 'summary' | 'flag' | 'control' | 'map'>('shot');
  const [activeHole, setActiveHole] = useState<string>(() => localStorage.getItem('golf-active-hole') || '1');
  const [activeGroup, setActiveGroup] = useState<string>(() => localStorage.getItem('golf-active-group') || '1');
  const [records, setRecords] = useState<PlayerShotRecord[]>([]);
  const [tournament, setTournament] = useState<TournamentInfo | undefined>(undefined);
  const [tournamentId, setTournamentId] = useState<string | null>(() => localStorage.getItem('golf-active-tournament-id'));

  const [officialsLocations, setOfficialsLocations] = useState<any[]>([]);
  const [officialInitials, setOfficialInitials] = useState(() => localStorage.getItem('golf-official-initials') || '');
  const [tempInitials, setTempInitials] = useState('');
  const [initialsError, setInitialsError] = useState('');

  // Admin Login States
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => localStorage.getItem('golf-admin-logged-in') === 'true');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUsername === 'admin' && adminPassword === 'admin') {
      setIsAdminLoggedIn(true);
      setAdminError('');
      localStorage.setItem('golf-admin-logged-in', 'true');
    } else {
      setAdminError('Invalid credentials');
    }
  };

  // Save active hole and group to localStorage for local UI persistence
  useEffect(() => {
    localStorage.setItem('golf-active-hole', activeHole);
  }, [activeHole]);

  useEffect(() => {
    localStorage.setItem('golf-active-group', activeGroup);
  }, [activeGroup]);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeOffset, setTimeOffset] = useState(() => Number(localStorage.getItem('golf-time-offset')) || 0);

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => {
      const actualNow = new Date();
      setCurrentTime(new Date(actualNow.getTime() + timeOffset));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeOffset]);

  // Sync tournament timeOffset if available
  useEffect(() => {
    if (tournament?.timeOffset !== undefined) {
      setTimeOffset(tournament.timeOffset);
      localStorage.setItem('golf-time-offset', String(tournament.timeOffset));
    }
  }, [tournament?.timeOffset]);

  const { isSupported, isActive: isWakeLockActive, requestWakeLock } = useWakeLock();

  // Initial state definitions with Firebase sync logic
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !tournamentId) return;

    const tourneyRef = doc(db, 'tournaments', tournamentId);
    const unsubTourney = onSnapshot(tourneyRef, (snapshot) => {
      if (snapshot.exists()) {
        setTournament(snapshot.data() as TournamentInfo);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${tournamentId}`);
    });

    const recordsRef = collection(db, 'tournaments', tournamentId, 'records');
    const q = query(recordsRef, orderBy('timestamp', 'desc'));
    const unsubRecords = onSnapshot(q, (snapshot) => {
      const newRecords = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as PlayerShotRecord[];
      setRecords(newRecords);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `tournaments/${tournamentId}/records`);
    });

    const locsRef = collection(db, 'tournaments', tournamentId, 'officials_locations');
    const unsubLocs = onSnapshot(locsRef, (snapshot) => {
      const locs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOfficialsLocations(locs);
    }, (error) => {
      console.error("Error loading officials locations:", error);
    });

    return () => {
      unsubTourney();
      unsubRecords();
      unsubLocs();
    };
  }, [user, tournamentId]);

  // Realtime coordinates tracking of the current official
  useEffect(() => {
    if (!navigator.geolocation || !tournamentId || !officialInitials) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const officialRef = doc(db, 'tournaments', tournamentId, 'officials_locations', officialInitials);
        setDoc(officialRef, {
          initials: officialInitials.toUpperCase().slice(0, 2),
          lat: latitude,
          lng: longitude,
          timestamp: Date.now()
        }, { merge: true }).catch(err => {
          console.error("Error setting official location:", err);
        });
      },
      (error) => {
        console.warn("Geolocation watch error:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [tournamentId, officialInitials]);

  // Request wake lock and lock orientation on interaction
  const handleInteraction = async () => {
    if (!isWakeLockActive) {
      await requestWakeLock();
    }
    
    // Attempt to lock orientation to portrait if supported
    if (window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
      try {
        await (window.screen.orientation as any).lock('portrait');
      } catch (err) {
        // Silent fail as it's not always supported or needs fullscreen
        console.warn('Orientation lock failed:', err);
      }
    }
  };

  const handleRecordAdded = async (record: PlayerShotRecord) => {
    if (!user || !tournamentId) {
      setRecords(prev => [...prev, record]);
      return;
    }

    try {
      const recordsRef = collection(db, 'tournaments', tournamentId, 'records');
      await addDoc(recordsRef, {
        ...record,
        officialId: user.uid,
        officialName: user.displayName || user.email || 'Official',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tournaments/${tournamentId}/records`);
    }
  };

  const updateActiveTimer = async (timer: any) => {
    if (!user || !tournamentId || !officialInitials) return;
    try {
      const officialRef = doc(db, 'tournaments', tournamentId, 'officials_locations', officialInitials);
      await setDoc(officialRef, {
        activeTimer: timer || null
      }, { merge: true });
    } catch (err) {
      console.error("Error setting active timer:", err);
    }
  };

  const clearHistory = async () => {
    if (!confirm('Are you sure you want to clear all records for this tournament? This will affect all officials.')) return;

    if (!user || !tournamentId) {
      setRecords([]);
      return;
    }

    try {
      const recordsRef = collection(db, 'tournaments', tournamentId, 'records');
      const snapshot = await getDocs(recordsRef);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tournaments/${tournamentId}/records`);
    }
  };

  const cleanUndefined = <T,>(obj: T): T => {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => cleanUndefined(item)) as unknown as T;
    }
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const val = obj[key];
          if (val !== undefined) {
            cleaned[key] = cleanUndefined(val);
          }
        }
      }
      return cleaned as T;
    }
    return obj;
  };

  const handleTournamentSetup = async (info: TournamentInfo) => {
    if (!user) return;

    // Create a stable ID from tournament name and round or a new one
    const id = info.name.replace(/\s+/g, '-').toLowerCase() + '-' + info.round;
    setTournamentId(id);
    localStorage.setItem('golf-active-tournament-id', id);

    try {
      const tourneyRef = doc(db, 'tournaments', id);
      const cleanedData = cleanUndefined({
        ...info,
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
      await setDoc(tourneyRef, cleanedData, { merge: true });
      
      setTournament(info);
      setActiveTab('shot');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tournaments/${id}`);
    }
  };

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#FFDD00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-20 h-20 bg-[#FFDD00] text-black rounded-3xl flex items-center justify-center mb-8 rotate-3 shadow-2xl shadow-[#FFDD00]/20">
          <Timer size={48} strokeWidth={2.5} />
        </div>
        <h1 className="text-4xl font-black italic tracking-tighter uppercase mb-2">Player Timing</h1>
        <p className="text-zinc-500 text-sm max-w-[240px] mb-12 font-medium leading-relaxed">
          Professional golf officiating & precision timing solution.
        </p>
        
        <button 
          onClick={signInWithGoogle}
          className="group relative flex items-center gap-4 bg-white text-black px-8 py-5 rounded-2xl font-black uppercase tracking-tighter transition-all hover:bg-[#FFDD00] hover:scale-105 active:scale-95 shadow-xl"
        >
          <LogIn size={24} strokeWidth={2.5} />
          <span>Login with Google</span>
          <div className="absolute -inset-1 bg-[#FFDD00] rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity"></div>
        </button>

        <p className="mt-12 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
          Authorized Personnel Only
        </p>
      </div>
    );
  }

  if (user && !officialInitials) {
    const tourneyOfficials = tournament?.officials || [];
    const handleInitialsSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = tempInitials.trim().toUpperCase();
      if (cleaned.length !== 2 || !/^[A-Z]{2}$/.test(cleaned)) {
        setInitialsError('Initials must be exactly 2 letters');
        return;
      }
      
      // If the setup lists configured officials, check if it matches one of them
      if (tourneyOfficials.length > 0 && !tourneyOfficials.some(o => o.initials === cleaned)) {
        setInitialsError(`"${cleaned}" is not registered. Please use one of: ${tourneyOfficials.map(o => o.initials).join(', ')}`);
        return;
      }

      setOfficialInitials(cleaned);
      localStorage.setItem('golf-official-initials', cleaned);
    };

    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans z-50">
        <div className="w-20 h-20 bg-black text-white border-2 border-white rounded-3xl flex items-center justify-center mb-6 shadow-2xl font-mono text-3xl font-black">
          {tempInitials.toUpperCase().padEnd(2, '_')}
        </div>
        <h1 className="text-3xl font-black italic tracking-tighter uppercase mb-2">Ref Initials</h1>
        <p className="text-zinc-500 text-xs max-w-[280px] mb-8 font-medium leading-relaxed">
          Please enter your 2-character initials to link your device and map position.
        </p>

        <form onSubmit={handleInitialsSubmit} className="w-full max-w-xs space-y-4">
          <div>
            <input 
              type="text"
              maxLength={2}
              value={tempInitials}
              onChange={(e) => {
                setTempInitials(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, ''));
                setInitialsError('');
              }}
              className="w-full bg-zinc-950 border border-zinc-805 border-zinc-800 rounded-xl px-4 py-3.5 text-center text-xl font-mono tracking-widest font-black focus:border-[#FFDD00] outline-none"
              placeholder="XX"
              autoFocus
            />
            {initialsError && (
              <p className="text-red-500 text-[10px] uppercase font-bold mt-2 leading-relaxed">{initialsError}</p>
            )}
          </div>
          <button 
            type="submit"
            className="w-full bg-[#FFDD00] text-black font-black uppercase tracking-tighter py-4 rounded-xl hover:bg-[#ffe533] transition-all transform active:scale-95"
          >
            Access Timing App
          </button>
        </form>

        {tourneyOfficials.length > 0 && (
          <div className="mt-8 max-w-xs">
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-2">Registered Officials</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {tourneyOfficials.map((o, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTempInitials(o.initials);
                    setInitialsError('');
                  }}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] font-mono font-bold text-gray-300 transition-colors"
                >
                  {o.initials} {o.name ? `(${o.name})` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 flex flex-col bg-black text-white font-sans selection:bg-[#FFDD00] selection:text-black"
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
    >
      {/* Header */}
      <header className="p-2 pt-6 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 bg-[#FFDD00] text-black rounded flex items-center justify-center shadow-md">
            <Timer size={14} strokeWidth={3} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-sm font-black uppercase tracking-tighter leading-none italic">
                {tournament ? tournament.name : 'Player Timing'}
              </h1>
              <span className="text-sm font-black tabular-nums text-[#FFDD00]">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
            </div>
            {tournament && (
              <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">Round {tournament.round}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {officialInitials && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to change your Rules Official initials?')) {
                  localStorage.removeItem('golf-official-initials');
                  setOfficialInitials('');
                  setTempInitials('');
                }
              }}
              className="px-1.5 py-0.5 text-[10px] tracking-wider font-mono font-black bg-black border border-white text-white rounded cursor-pointer shrink-0"
              title="Click to change initials"
            >
              REF {officialInitials}
            </button>
          )}
          <button 
            onClick={() => signOut(auth)}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-500 transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
          {isSupported && !isWakeLockActive && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-950 text-red-500 text-[10px] font-black uppercase ring-1 ring-red-900 animate-pulse">
              <ShieldAlert size={10} /> Sleep Enabled
            </div>
          )}
          {isWakeLockActive && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-950 text-green-500 text-[10px] font-black uppercase ring-1 ring-green-900">
              <ShieldAlert size={10} /> AWAKE
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto">
          {activeTab === 'lost' && (
            <LostBallTimer 
              onRecordAdded={handleRecordAdded} 
              tournamentInfo={tournament} 
              hole={activeHole}
              setHole={setActiveHole}
              group={activeGroup}
              setGroup={setActiveGroup}
              currentTime={currentTime}
              updateActiveTimer={updateActiveTimer}
            />
          )}
          {activeTab === 'shot' && (
            <ShotTimer 
              onRecordAdded={handleRecordAdded} 
              records={records} 
              tournamentInfo={tournament}
              hole={activeHole}
              setHole={setActiveHole}
              group={activeGroup}
              setGroup={setActiveGroup}
              currentTime={currentTime}
              updateActiveTimer={updateActiveTimer}
            />
          )}
          {activeTab === 'history' && (
            <SessionHistory 
              records={records} 
              onClear={clearHistory} 
              tournamentInfo={tournament}
            />
          )}
          {activeTab === 'tournament' && (
            !isAdminLoggedIn ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
                <div className="w-full max-w-xs bg-zinc-900/50 backdrop-blur-md p-8 rounded-3xl border border-zinc-800 shadow-2xl">
                  <div className="flex justify-center mb-6">
                    <div className="p-4 bg-[#FFDD00]/10 rounded-2xl text-[#FFDD00]">
                      <ShieldAlert size={32} />
                    </div>
                  </div>
                  <h2 className="text-xl font-black uppercase tracking-tighter text-center mb-6">Admin Access</h2>
                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1 block">Username</label>
                      <input 
                        type="text" 
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-[#FFDD00] focus:ring-1 focus:ring-[#FFDD00] outline-none transition-all"
                        placeholder="admin"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1 block">Password</label>
                      <input 
                        type="password" 
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-[#FFDD00] focus:ring-1 focus:ring-[#FFDD00] outline-none transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                    {adminError && (
                      <p className="text-red-500 text-[10px] font-bold uppercase text-center">{adminError}</p>
                    )}
                    <button 
                      type="submit"
                      className="w-full bg-white text-black font-black uppercase tracking-tighter py-4 rounded-xl hover:bg-[#FFDD00] transition-all transform active:scale-95"
                    >
                      Authenticate
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <TournamentSetup 
                currentInfo={tournament}
                onSetupComplete={handleTournamentSetup} 
              />
            )
          )}
          {activeTab === 'summary' && (
            <HoleTimings 
              records={records}
              tournamentInfo={tournament}
            />
          )}
          {activeTab === 'flag' && (
            <FlagInTimer 
              onRecordAdded={handleRecordAdded}
              records={records}
              tournamentInfo={tournament}
              hole={activeHole}
              setHole={setActiveHole}
              group={activeGroup}
              setGroup={setActiveGroup}
              currentTime={currentTime}
            />
          )}
          {activeTab === 'control' && (
            <HoleControl 
              onRecordAdded={handleRecordAdded}
              records={records}
              tournamentInfo={tournament}
              selectedHole={activeHole}
              setSelectedHole={setActiveHole}
              setActiveGroup={setActiveGroup}
              currentTime={currentTime}
            />
          )}
          {activeTab === 'map' && (
            <MapView 
              tournamentInfo={tournament}
              records={records}
              currentTime={currentTime}
              officialsLocations={officialsLocations}
            />
          )}
        </div>
      </main>

      {/* Navigation Bar */}
      <nav className="border-t border-zinc-800 bg-zinc-900 bg-opacity-90 backdrop-blur-xl shrink-0">
        <div className="px-2 py-3 pb-8 grid grid-cols-4 gap-y-5 gap-x-1 sm:flex sm:items-center sm:justify-around sm:gap-6 mx-auto max-w-lg">
          <button 
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'map' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'map' ? 'bg-[#FFDD00]/10' : ''}`}>
              <MapIcon size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Map View</span>
          </button>
          <button 
            onClick={() => setActiveTab('tournament')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'tournament' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'tournament' ? 'bg-[#FFDD00]/10' : ''}`}>
              <Trophy size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Setup</span>
          </button>
          <button 
            onClick={() => setActiveTab('lost')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'lost' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'lost' ? 'bg-[#FFDD00]/10' : ''}`}>
              <Timer size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Lost Ball</span>
          </button>
          <button 
            onClick={() => setActiveTab('shot')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'shot' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'shot' ? 'bg-[#FFDD00]/10' : ''}`}>
              <LayoutGrid size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Shot Clock</span>
          </button>
          <button 
            onClick={() => setActiveTab('flag')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'flag' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'flag' ? 'bg-[#FFDD00]/10' : ''}`}>
              <Flag size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Flag-In</span>
          </button>
          <button 
            onClick={() => setActiveTab('control')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'control' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'control' ? 'bg-[#FFDD00]/10' : ''}`}>
              <MapPin size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Hole Ctrl</span>
          </button>
          <button 
            onClick={() => setActiveTab('summary')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'summary' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'summary' ? 'bg-[#FFDD00]/10' : ''}`}>
              <BarChart2 size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Timing</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'history' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className="relative">
              <div className={`p-1.5 rounded-lg ${activeTab === 'history' ? 'bg-[#FFDD00]/10' : ''}`}>
                <History size={20} />
              </div>
              {records.length > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-[8px] font-black text-white flex items-center justify-center rounded-full border-2 border-zinc-900">
                  {records.length}
                </span>
              )}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">History</span>
          </button>
        </div>
      </nav>
      
      {/* Global CSS for Forced Portrait feel */}
      <style>{`
        body {
          overscroll-behavior-y: contain;
          background: black;
          overflow: hidden;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        select {
          appearance: none;
          -webkit-appearance: none;
        }
        @media screen and (orientation: landscape) {
          .landscape-notice {
            display: flex;
          }
        }
        .landscape-notice {
          display: none;
        }
      `}</style>
      
      {/* Landscape Warning (Optional but helpful based on user request) */}
      <div className="landscape-notice fixed inset-0 z-[100] bg-black flex-col items-center justify-center p-8 text-center sm:hidden">
        <div className="w-20 h-20 bg-[#FFDD00] text-black rounded-full flex items-center justify-center mb-6 animate-bounce">
          <ShieldAlert size={48} />
        </div>
        <h2 className="text-2xl font-black uppercase mb-2">Portrait Only</h2>
        <p className="text-gray-400">This tool is optimized for hand-held portrait use. Please rotate your device.</p>
      </div>
    </div>
  );
}
