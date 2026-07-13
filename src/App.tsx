import React, { useState, useEffect } from 'react';
import { Timer, LayoutGrid, History, ShieldAlert, Trophy, BarChart2, Flag, MapPin, LogIn, LogOut, Map as MapIcon, User as UserIcon, Menu, X } from 'lucide-react';
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
import { onAuthStateChanged, User, signOut, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, collection, addDoc, query, orderBy, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';

const getCoordinateFromKml = (
  kmlDataStr: string | undefined,
  targetHole: string,
  type: 'tee' | 'green' | 'behind_tee'
): { lat: number; lng: number } | null => {
  if (!kmlDataStr) return null;
  try {
    const parser = new DOMParser();
    const kml = parser.parseFromString(kmlDataStr, 'text/xml');
    const placemarks = kml.getElementsByTagName('Placemark');
    for (let i = 0; i < placemarks.length; i++) {
      const name = placemarks[i].getElementsByTagName('name')[0]?.textContent || '';
      const coordsText = placemarks[i].getElementsByTagName('coordinates')[0]?.textContent || '';
      
      if (coordsText) {
        const coords = coordsText.trim().split(/\s+/).map(pair => {
          const [lng, lat] = pair.split(',').map(Number);
          return [lat, lng] as [number, number];
        }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

        if (coords.length > 0) {
          const holeMatch = name.match(/(\d+)/);
          const holeId = holeMatch ? parseInt(holeMatch[1], 10).toString() : name;
          
          if (holeId === targetHole) {
            if (type === 'green') {
              const greenCoord = coords[coords.length - 1];
              return { lat: greenCoord[0], lng: greenCoord[1] };
            } else if (type === 'tee') {
              const teeCoord = coords[0];
              return { lat: teeCoord[0], lng: teeCoord[1] };
            } else if (type === 'behind_tee') {
              const teeCoord = coords[0];
              if (coords.length > 1) {
                // Direction of first segment is coords[1] - coords[0]
                // We want to go in the opposite direction: coords[0] - (coords[1] - coords[0]) * 0.15
                const nextCoord = coords[1];
                const latDiff = nextCoord[0] - teeCoord[0];
                const lngDiff = nextCoord[1] - teeCoord[1];
                return {
                  lat: teeCoord[0] - latDiff * 0.15,
                  lng: teeCoord[1] - lngDiff * 0.15
                };
              }
              // Fallback if only 1 coordinate
              return { lat: teeCoord[0] - 0.0001, lng: teeCoord[1] };
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error parsing KML for hole coords:", err);
  }
  return null;
};

const getHoleCoordinatesFromKml = (kmlDataStr: string | undefined, targetHole: string): { lat: number; lng: number } | null => {
  return getCoordinateFromKml(kmlDataStr, targetHole, 'green');
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lost' | 'shot' | 'history' | 'tournament' | 'summary' | 'flag' | 'control' | 'map'>('map');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
    const cleaned = adminUsername.trim().toUpperCase();
    if (cleaned === 'XX' || adminUsername === 'admin' || (adminUsername === 'admin' && adminPassword === 'admin')) {
      setIsAdminLoggedIn(true);
      setAdminError('');
      setOfficialInitials('XX');
      localStorage.setItem('golf-admin-logged-in', 'true');
      localStorage.setItem('golf-official-initials', 'XX');
    } else {
      setAdminError('Invalid username. Use "XX" to authenticate.');
    }
  };

  // Save active hole and group to localStorage for local UI persistence
  useEffect(() => {
    localStorage.setItem('golf-active-hole', activeHole);
  }, [activeHole]);

  useEffect(() => {
    localStorage.setItem('golf-active-group', activeGroup);
  }, [activeGroup]);

  // Restrict Setup/Tournament tab strictly to Admin (user XX)
  useEffect(() => {
    if (activeTab === 'tournament' && officialInitials !== 'XX') {
      setActiveTab('shot');
    }
  }, [activeTab, officialInitials]);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeOffset, setTimeOffset] = useState(() => Number(localStorage.getItem('golf-time-offset')) || 0);
  const [testActiveHoleInControl, setTestActiveHoleInControl] = useState<string | null>(() => {
    return localStorage.getItem('golf-test-active-hole-control');
  });

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
    let unmounted = false;
    const initAuthAndListen = async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.warn("Silent anonymous sign-in failed:", err);
        if (!unmounted) {
          setUser({
            uid: 'field-test-user-uid',
            displayName: 'Field Test Official',
            email: 'test@example.com',
            isAnonymous: true
          } as any);
          setAuthLoading(false);
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (unmounted) return;
      if (firebaseUser) {
        setUser(firebaseUser);
        setAuthLoading(false);
      } else {
        initAuthAndListen();
      }
    });

    return () => {
      unmounted = true;
      unsubscribe();
    };
  }, []);

  // Synchronously auto-select the latest tournament if none is stored in localStorage
  useEffect(() => {
    if (!user || tournamentId) return;

    const tournamentsRef = collection(db, 'tournaments');
    const unsub = onSnapshot(tournamentsRef, (snapshot) => {
      if (!snapshot.empty) {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        // Sort by createdAt descending
        docs.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        const latest = docs[0];
        if (latest) {
          setTournamentId(latest.id);
          localStorage.setItem('golf-active-tournament-id', latest.id);
          setTournament(latest);
        }
      }
    }, (error) => {
      console.warn("Error finding latest tournament:", error);
    });

    return () => unsub();
  }, [user, tournamentId]);

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
      const locs = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter((off: any) => {
          const initials = (off.id || off.initials || '').toUpperCase();
          return initials !== 'XX';
        });
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

  // Purge/delete Admin (XX) location from DB if it exists to keep DB pristine
  useEffect(() => {
    if (!tournamentId) return;
    const adminLocRef = doc(db, 'tournaments', tournamentId, 'officials_locations', 'XX');
    deleteDoc(adminLocRef).catch(() => {});
    const adminLocRefLower = doc(db, 'tournaments', tournamentId, 'officials_locations', 'xx');
    deleteDoc(adminLocRefLower).catch(() => {});
  }, [tournamentId]);

  // Realtime coordinates tracking of the current official (only when NOT in test mode/sandbox time)
  useEffect(() => {
    if (timeOffset !== 0) return; // When in test mode, do not poll referee geolocations
    if (!navigator.geolocation || !tournamentId || !officialInitials) return;
    if (officialInitials.toUpperCase() === 'XX') return; // Admin is not an official!

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const officialRef = doc(db, 'tournaments', tournamentId, 'officials_locations', officialInitials);
        setDoc(officialRef, {
          initials: officialInitials.toUpperCase().slice(0, 2),
          lat: latitude,
          lng: longitude,
          isAssignedHoleLocation: false, // It's a real GPS lock now
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
  }, [tournamentId, officialInitials, timeOffset]);

  // Handle referee in 'Hole Control' with missing or fallback georeference information (only when NOT in test mode/sandbox time)
  // Uses the hole they are controlling as their location. Update the map automatically on sync.
  useEffect(() => {
    if (timeOffset !== 0) return; // Sandbox geolocs are handled by other effects below
    if (activeTab !== 'control' || !tournamentId || !officialInitials || !tournament) return;
    if (officialInitials.toUpperCase() === 'XX') return; // Admin is not an official!

    // Check if we have an actual (non-fallback) georeference for the current official
    const refereeLoc = officialsLocations.find(l => 
      l.id === officialInitials || l.initials?.toUpperCase() === officialInitials.toUpperCase()
    );

    const hasRealGeoreference = refereeLoc && 
      typeof refereeLoc.lat === 'number' && 
      typeof refereeLoc.lng === 'number' && 
      refereeLoc.lat !== 0 && 
      refereeLoc.lng !== 0 &&
      refereeLoc.isAssignedHoleLocation !== true; // Must not be a fallback location

    if (!hasRealGeoreference) {
      const coords = getHoleCoordinatesFromKml(tournament.kmlData, activeHole);
      if (coords) {
        // If current location doesn't exist, or matches a different hole, update it
        const currentLatShort = refereeLoc?.lat ? Number(refereeLoc.lat).toFixed(6) : "";
        const targetLatShort = Number(coords.lat).toFixed(6);
        const currentLngShort = refereeLoc?.lng ? Number(refereeLoc.lng).toFixed(6) : "";
        const targetLngShort = Number(coords.lng).toFixed(6);

        if (currentLatShort !== targetLatShort || currentLngShort !== targetLngShort) {
          const officialRef = doc(db, 'tournaments', tournamentId, 'officials_locations', officialInitials);
          setDoc(officialRef, {
            initials: officialInitials.toUpperCase().slice(0, 2),
            lat: coords.lat,
            lng: coords.lng,
            isAssignedHoleLocation: true, // Tagged as automatically assigned fallback
            timestamp: Date.now()
          }, { merge: true }).catch(err => {
            console.error("Error setting official fallback hole location:", err);
          });
        }
      }
    }
  }, [activeTab, activeHole, tournamentId, officialInitials, tournament, officialsLocations, timeOffset]);

  // In test mode: Place referee randomly out on the course, until they enter "Ctrl Hole" and select a hole.
  // Then, move their indicator to beside that hole on the map (using the green coordinates of the hole).
  useEffect(() => {
    if (timeOffset === 0 || !tournamentId || !officialInitials || !tournament) return;
    if (officialInitials.toUpperCase() === 'XX') return; // Admin is not an official!

    let targetLat: number | null = null;
    let targetLng: number | null = null;

    if (!testActiveHoleInControl) {
      // Locate them randomly out on the course deterministically using their initials
      const sum = (officialInitials || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      
      // Extract all valid hole IDs from the KML to make sure we pick one that exists
      const holeIds: string[] = [];
      try {
        const parser = new DOMParser();
        const kml = parser.parseFromString(tournament.kmlData || '', 'text/xml');
        const placemarks = kml.getElementsByTagName('Placemark');
        for (let i = 0; i < placemarks.length; i++) {
          const name = placemarks[i].getElementsByTagName('name')[0]?.textContent || '';
          const holeMatch = name.match(/(\d+)/);
          const holeId = holeMatch ? parseInt(holeMatch[1], 10).toString() : null;
          if (holeId && !holeIds.includes(holeId)) {
            holeIds.push(holeId);
          }
        }
      } catch (e) {
        console.error("Error finding holes from KML for random positioning", e);
      }

      const resolvedHoles = holeIds.length > 0 ? holeIds : Array.from({ length: 18 }, (_, idx) => String(idx + 1));
      const holeIndex = sum % resolvedHoles.length;
      const targetHole = resolvedHoles[holeIndex];

      // Place them beside the green of that targetHole
      const coords = getCoordinateFromKml(tournament.kmlData, targetHole, "green");
      if (coords) {
        // Offset of 15-30 meters (0.00012 to 0.00026 degrees) beside the green so they are "out on the course"
        const latOffset = (Math.sin(sum) * 1.5 + 1.5) * 0.00012 + 0.00008;
        const lngOffset = (Math.cos(sum) * 1.5 + 1.5) * 0.00012 + 0.00008;
        targetLat = coords.lat + (sum % 2 === 0 ? latOffset : -latOffset);
        targetLng = coords.lng + (sum % 3 === 0 ? lngOffset : -lngOffset);
      } else {
        // Fallback to Hole 1 green
        const fallbackCoords = getCoordinateFromKml(tournament.kmlData, "1", "green");
        if (fallbackCoords) {
          targetLat = fallbackCoords.lat;
          targetLng = fallbackCoords.lng;
        }
      }
    } else {
      // Move their indicator to beside the selected hole on the map (the green of the hole)
      const coords = getCoordinateFromKml(tournament.kmlData, testActiveHoleInControl, "green");
      if (coords) {
        targetLat = coords.lat;
        targetLng = coords.lng;
      }
    }

    if (targetLat !== null && targetLng !== null) {
      const refereeLoc = officialsLocations.find(l => 
        l.id === officialInitials || l.initials?.toUpperCase() === officialInitials.toUpperCase()
      );

      const curLat = refereeLoc?.lat;
      const curLng = refereeLoc?.lng;

      const currentLatShort = curLat ? Number(curLat).toFixed(6) : "";
      const targetLatShort = Number(targetLat).toFixed(6);
      const currentLngShort = curLng ? Number(curLng).toFixed(6) : "";
      const targetLngShort = Number(targetLng).toFixed(6);

      if (currentLatShort !== targetLatShort || currentLngShort !== targetLngShort) {
        const officialRef = doc(db, 'tournaments', tournamentId, 'officials_locations', officialInitials);
        setDoc(officialRef, {
          initials: officialInitials.toUpperCase().slice(0, 2),
          lat: targetLat,
          lng: targetLng,
          isAssignedHoleLocation: true,
          timestamp: Date.now()
        }, { merge: true }).catch(err => {
          console.error("Error setting official test mode location in Firestore:", err);
        });
      }
    }
  }, [timeOffset, testActiveHoleInControl, tournamentId, officialInitials, tournament, officialsLocations]);

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
      // Remove any fields that have an undefined value to avoid Firestore client-side validation errors
      const sanitizedRecord = Object.fromEntries(
        Object.entries(record).filter(([_, v]) => v !== undefined)
      );

      const recordsRef = collection(db, 'tournaments', tournamentId, 'records');
      await addDoc(recordsRef, {
        ...sanitizedRecord,
        officialId: user.uid,
        officialName: user.displayName || user.email || 'Official',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tournaments/${tournamentId}/records`);
    }
  };

  const updateActiveTimer = async (timer: any) => {
    if (!user || !tournamentId || !officialInitials) return;
    if (officialInitials.toUpperCase() === 'XX') return; // Admin is not an official!
    try {
      const officialRef = doc(db, 'tournaments', tournamentId, 'officials_locations', officialInitials);
      
      // Remove any fields that have an undefined value to avoid Firestore errors
      const sanitizedTimer = timer
        ? Object.fromEntries(Object.entries(timer).filter(([_, v]) => v !== undefined))
        : null;

      await setDoc(officialRef, {
        activeTimer: sanitizedTimer
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

  if (!officialInitials) {
    const tourneyOfficials = tournament?.officials || [];
    const handleInitialsSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = tempInitials.trim().toUpperCase();
      if (cleaned.length !== 2 || !/^[A-Z]{2}$/.test(cleaned)) {
        setInitialsError('Initials must be exactly 2 letters');
        return;
      }
      
      if (cleaned === 'XX') {
        setIsAdminLoggedIn(true);
        localStorage.setItem('golf-admin-logged-in', 'true');
        setOfficialInitials('XX');
        localStorage.setItem('golf-official-initials', 'XX');
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
            <div className="flex flex-wrap justify-center gap-1.5 max-h-[160px] overflow-y-auto p-1 bg-zinc-900/40 rounded-lg">
              {tourneyOfficials.map((o, idx) => (
                <button
                  key={idx}
                  type="button"
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
                localStorage.removeItem('golf-official-initials');
                localStorage.removeItem('golf-test-active-hole-control');
                setOfficialInitials('');
                setTempInitials('');
                setTestActiveHoleInControl(null);
              }}
              className="px-1.5 py-0.5 text-[10px] tracking-wider font-mono font-black bg-black border border-white text-white rounded cursor-pointer shrink-0"
              title="Click to change initials"
            >
              REF {officialInitials}
            </button>
          )}
          <button 
            onClick={() => {
              localStorage.removeItem('golf-official-initials');
              localStorage.removeItem('golf-admin-logged-in');
              localStorage.removeItem('golf-test-active-hole-control');
              setOfficialInitials('');
              setIsAdminLoggedIn(false);
              setTempInitials('');
              setTestActiveHoleInControl(null);
              signOut(auth);
            }}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-500 transition-colors"
            title="Sign out"
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
                      <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-1 block">Username / Initials</label>
                      <input 
                        type="text" 
                        value={adminUsername}
                        onChange={(e) => setAdminUsername(e.target.value)}
                        className="w-full bg-black border border-zinc-805 border-zinc-800 rounded-xl px-4 py-3 text-center text-sm font-bold uppercase tracking-widest focus:border-[#FFDD00] focus:ring-1 focus:ring-[#FFDD00] outline-none transition-all"
                        placeholder="XX"
                        maxLength={2}
                        autoFocus
                      />
                      <p className="text-[10px] text-zinc-500 text-center mt-2">
                        Type <strong className="text-white">"XX"</strong> to instantly unlock admin setup privileges (no password required).
                      </p>
                    </div>
                    {adminError && (
                      <p className="text-red-500 text-[10px] font-bold uppercase text-center">{adminError}</p>
                    )}
                    <button 
                      type="submit"
                      className="w-full bg-white text-black font-black uppercase tracking-tighter py-4 rounded-xl hover:bg-[#FFDD00] transition-all transform active:scale-95"
                    >
                      Unlock Setup
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
              selectedHole={timeOffset !== 0 ? (testActiveHoleInControl || '') : activeHole}
              setSelectedHole={(hole) => {
                setActiveHole(hole);
                if (timeOffset !== 0) {
                  setTestActiveHoleInControl(hole);
                  localStorage.setItem('golf-test-active-hole-control', hole);
                }
              }}
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
              isAdmin={officialInitials === 'XX' || isAdminLoggedIn}
            />
          )}
        </div>
      </main>

      {/* Navigation Bar */}
      <nav className="border-t border-zinc-800 bg-zinc-900 bg-opacity-90 backdrop-blur-xl shrink-0">
        {/* Mobile Collapsed View */}
        <div className="sm:hidden flex items-center justify-between px-4 py-2 border-b border-zinc-800/50">
          {!isMobileMenuOpen ? (
            <>
              {/* Active Tab Indicator */}
              <div className="flex items-center gap-2 text-[#FFDD00]">
                <div className="p-1 rounded-lg bg-[#FFDD00]/10">
                  {activeTab === 'map' && <MapIcon size={16} />}
                  {activeTab === 'tournament' && <Trophy size={16} />}
                  {activeTab === 'lost' && <Timer size={16} />}
                  {activeTab === 'shot' && <LayoutGrid size={16} />}
                  {activeTab === 'flag' && <Flag size={16} />}
                  {activeTab === 'control' && <MapPin size={16} />}
                  {activeTab === 'summary' && <BarChart2 size={16} />}
                  {activeTab === 'history' && <History size={16} />}
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider">
                  {activeTab === 'map' && 'Map View'}
                  {activeTab === 'tournament' && 'Setup'}
                  {activeTab === 'lost' && 'Lost Ball'}
                  {activeTab === 'shot' && 'Shot Clock'}
                  {activeTab === 'flag' && 'Flag-In'}
                  {activeTab === 'control' && 'Hole Ctrl'}
                  {activeTab === 'summary' && 'Timing'}
                  {activeTab === 'history' && 'History'}
                </span>
              </div>

              {/* Hamburger Button */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="flex items-center gap-1 text-zinc-400 hover:text-white transition-all outline-none py-1 px-2"
              >
                <span className="text-[10px] font-black uppercase tracking-wider">Menu</span>
                <div className="p-1 rounded bg-zinc-800/50">
                  <Menu size={16} />
                </div>
              </button>
            </>
          ) : (
            <>
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Navigation</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-1 text-zinc-400 hover:text-white transition-all outline-none py-1 px-2"
              >
                <span className="text-[10px] font-black uppercase tracking-wider">Close</span>
                <div className="p-1 rounded bg-zinc-800/50">
                  <X size={16} />
                </div>
              </button>
            </>
          )}
        </div>

        {/* Navigation Buttons Grid */}
        <div className={`${!isMobileMenuOpen ? 'hidden sm:grid' : 'grid'} px-2 py-3 pb-8 grid-cols-4 gap-y-5 gap-x-1 sm:flex sm:items-center sm:justify-around sm:gap-6 mx-auto max-w-lg`}>
          <button 
            onClick={() => { setActiveTab('map'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
              activeTab === 'map' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${activeTab === 'map' ? 'bg-[#FFDD00]/10' : ''}`}>
              <MapIcon size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-center">Map View</span>
          </button>
          {officialInitials === 'XX' && (
            <button 
              onClick={() => { setActiveTab('tournament'); setIsMobileMenuOpen(false); }}
              className={`flex flex-col items-center gap-1.5 transition-all outline-none ${
                activeTab === 'tournament' ? 'text-[#FFDD00] scale-105' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${activeTab === 'tournament' ? 'bg-[#FFDD00]/10' : ''}`}>
                <Trophy size={20} />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-center">Setup</span>
            </button>
          )}
          <button 
            onClick={() => { setActiveTab('lost'); setIsMobileMenuOpen(false); }}
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
            onClick={() => { setActiveTab('shot'); setIsMobileMenuOpen(false); }}
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
            onClick={() => { setActiveTab('flag'); setIsMobileMenuOpen(false); }}
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
            onClick={() => { setActiveTab('control'); setIsMobileMenuOpen(false); }}
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
            onClick={() => { setActiveTab('summary'); setIsMobileMenuOpen(false); }}
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
            onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }}
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
