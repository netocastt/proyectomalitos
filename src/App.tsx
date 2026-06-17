/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react';
import { 
  Timer, 
  Calendar, 
  BarChart2, 
  User, 
  Settings, 
  Play, 
  Square, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  Flame, 
  Menu,
  ChevronRight,
  LogOut,
  Bell,
  CloudRain,
  Coffee,
  Sparkles,
  Camera,
  Mail,
  Lock,
  UserPlus,
  Check,
  Edit2 as Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Importaciones de Firebase
import { 
  auth, 
  db, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  query
} from 'firebase/firestore';

// --- Tipos ---

type Tab = 'focus' | 'plan' | 'stats' | 'profile';
type AuthMode = 'login' | 'register' | 'loggedIn';
type SubScreen = 'none' | 'profile-settings' | 'session-settings' | 'sound-library';

interface Task {
  id: string;
  title: string;
  date: string;
  difficulty: 'Baja' | 'Media' | 'Alta';
  sessions: number;
  completed: boolean;
}

interface UserProfile {
  name: string;
  email: string;
  avatar: string;
  joinDate: string;
}

interface SessionConfig {
  focusTime: number;
  shortBreak: number;
  longBreak: number;
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('focus');
  const [activeSubScreen, setActiveSubScreen] = useState<SubScreen>('none');
  
  // Datos del Usuario
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile>({
    name: 'Cargando...',
    email: '',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
    joinDate: 'Uniendo...'
  });

  const [sessionConfig, setSessionConfig] = useState<SessionConfig>({
    focusTime: 25,
    shortBreak: 5,
    longBreak: 15
  });

  const [activeSound, setActiveSound] = useState('Lluvia');
  const [tasks, setTasks] = useState<Task[]>([]);

  // Estado del Temporizador
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  // Estadísticas del usuario persistidas en firestore
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [weeklyMinutes, setWeeklyMinutes] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [lastActiveDate, setLastActiveDate] = useState('');
  const [weekCommencedDate, setWeekCommencedDate] = useState('');

  // Ambient Sound Synthesis Engine using Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const soundNodesRef = useRef<any[]>([]); // active oscillators or source nodes
  const activeSoundRef = useRef<string>('');

  // Estados de carga e inputs de autenticación
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Perfil y Modales
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Estados para edición directa de nombre
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempNameText, setTempNameText] = useState('');

  // Estados controlados para formularios de edición de perfil y creación de tareas
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfileEmail, setEditProfileEmail] = useState('');
  const [taskTitleInput, setTaskTitleInput] = useState('');
  const [taskDateInput, setTaskDateInput] = useState('');
  const [taskDifficultyInput, setTaskDifficultyInput] = useState<Task['difficulty']>('Media');

  // Helper para comprimir y recortar fotos de perfil a un tamaño óptimo
  const compressImage = (base64Str: string, maxWidth = 200, maxHeight = 200): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const size = Math.min(width, height);
        canvas.width = maxWidth;
        canvas.height = maxHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(
            img,
            (width - size) / 2, (height - size) / 2, size, size,
            0, 0, maxWidth, maxHeight
          );
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  // Sincronizar estados locales de edición de perfil cuando la pantalla cambie o el perfil cambie
  useEffect(() => {
    if (activeSubScreen === 'profile-settings') {
      setEditProfileName(user.name);
      setEditProfileEmail(user.email);
    }
  }, [activeSubScreen, user.name, user.email]);

  // Escribir un perfil predeterminado o leerlo al iniciar sesión
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setLoading(true);
      setAuthError(null);
      if (firebaseUser) {
        setCurrentUserId(firebaseUser.uid);
        setAuthMode('loggedIn');
        
        // Pre-populamos de inmediato para evitar que "Cargando..." parpadee o se quede pegado, pero sin sobreescribir datos ya leídos de base de datos
        setUser((prev) => {
          if (prev.name !== 'Cargando...' && prev.name !== 'Estudiante Zen') {
            return prev;
          }
          const tempName = firebaseUser.displayName || nameInput || 'Estudiante Zen';
          return {
            ...prev,
            name: tempName,
            email: firebaseUser.email || '',
            avatar: firebaseUser.photoURL || prev.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
            joinDate: prev.joinDate !== 'Uniendo...' ? prev.joinDate : new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })
          };
        });
      } else {
        setCurrentUserId(null);
        setAuthMode('login');
        setTasks([]);
        setUser({
          name: 'Cargando...',
          email: '',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
          joinDate: 'Uniendo...'
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [nameInput]);

  // Sincronizar el perfil de usuario en tiempo real desde Firestore
  useEffect(() => {
    if (!currentUserId) return;
    
    const userDocRef = doc(db, 'users', currentUserId);
    const unsubscribe = onSnapshot(userDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUser({
          name: data.name || 'Estudiante Zen',
          email: data.email || '',
          avatar: data.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
          joinDate: data.joinDate || 'Junio 2026'
        });
        
        setSessionConfig({
          focusTime: typeof data.focusTime === 'number' ? data.focusTime : 25,
          shortBreak: typeof data.shortBreak === 'number' ? data.shortBreak : 5,
          longBreak: typeof data.longBreak === 'number' ? data.longBreak : 15
        });
        
        if (data.activeSound) setActiveSound(data.activeSound);
        if (typeof data.sessionsCompleted === 'number') {
          setSessionsCompleted(data.sessionsCompleted);
        }

        // Cargar estadísticas sincronizadas
        setCurrentStreak(typeof data.currentStreak === 'number' ? data.currentStreak : 0);
        setBestStreak(typeof data.bestStreak === 'number' ? data.bestStreak : 0);
        setLastActiveDate(data.lastActiveDate || '');
        setWeekCommencedDate(data.weekCommencedDate || '');
        if (Array.isArray(data.weeklyMinutes) && data.weeklyMinutes.length === 7) {
          setWeeklyMinutes(data.weeklyMinutes);
        } else {
          setWeeklyMinutes([0, 0, 0, 0, 0, 0, 0]);
        }
      } else {
        // Generar valores iniciales para un nuevo usuario
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          const initialProfile: UserProfile = {
            name: firebaseUser.displayName || nameInput || 'Estudiante Zen',
            email: firebaseUser.email || '',
            avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
            joinDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })
          };
          
          try {
            await setDoc(userDocRef, {
              ...initialProfile,
              focusTime: 25,
              shortBreak: 5,
              longBreak: 15,
              sessionsCompleted: 0,
              activeSound: 'Lluvia',
              currentStreak: 0,
              bestStreak: 0,
              lastActiveDate: '',
              weekCommencedDate: '',
              weeklyMinutes: [0, 0, 0, 0, 0, 0, 0]
            });
          } catch (err) {
            console.error("Error al inicializar perfil del usuario en Firestore:", err);
          }
        }
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${currentUserId}`);
    });
    
    return () => unsubscribe();
  }, [currentUserId]);

  // Sincronizar tareas en tiempo real
  useEffect(() => {
    if (!currentUserId) return;
    
    const tasksColRef = collection(db, 'users', currentUserId, 'tasks');
    const unsubscribe = onSnapshot(tasksColRef, (snapshot) => {
      const fetchedTasks: Task[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetchedTasks.push({
          id: docSnap.id,
          title: data.title || '',
          date: data.date || '',
          difficulty: data.difficulty || 'Media',
          sessions: data.sessions || 1,
          completed: !!data.completed
        });
      });
      setTasks(fetchedTasks);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${currentUserId}/tasks`);
    });
    
    return () => unsubscribe();
  }, [currentUserId]);

  // --- Ambient Sound Synthesis Engine using Web Audio API ---
  const startAmbientSound = (soundName: string) => {
    try {
      // Initialize AudioContext
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Stop previous sounds
      stopAmbientSound();

      // Ensure master gain is set up
      if (!masterGainRef.current) {
        masterGainRef.current = ctx.createGain();
        masterGainRef.current.connect(ctx.destination);
      }
      // Start with volume 0 and fade in smoothly
      masterGainRef.current.gain.setValueAtTime(0, ctx.currentTime);
      masterGainRef.current.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 1.5);

      activeSoundRef.current = soundName;
      const nodes: any[] = [];

      if (soundName === 'Ruido Blanco') {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, ctx.currentTime);

        whiteNoise.connect(filter);
        filter.connect(masterGainRef.current);
        whiteNoise.start();

        nodes.push(whiteNoise);
      } else if (soundName === 'Lluvia') {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const rainSource = ctx.createBufferSource();
        rainSource.buffer = noiseBuffer;
        rainSource.loop = true;

        const rainFilter = ctx.createBiquadFilter();
        rainFilter.type = 'lowpass';
        rainFilter.frequency.setValueAtTime(320, ctx.currentTime);

        rainSource.connect(rainFilter);
        rainFilter.connect(masterGainRef.current);
        rainSource.start();
        nodes.push(rainSource);

        let dropletTimer: any = null;
        const scheduleDroplet = () => {
          if (activeSoundRef.current !== 'Lluvia' || !isActive || isBreak) return;
          
          const dropOsc = ctx.createOscillator();
          const dropGain = ctx.createGain();
          
          dropOsc.type = 'sine';
          const pitch = 250 + Math.random() * 400;
          dropOsc.frequency.setValueAtTime(pitch, ctx.currentTime);
          dropOsc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.08);

          dropGain.gain.setValueAtTime(0.08, ctx.currentTime);
          dropGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

          dropOsc.connect(dropGain);
          dropGain.connect(masterGainRef.current!);
          dropOsc.start();
          dropOsc.stop(ctx.currentTime + 0.1);

          const nextInterval = 80 + Math.random() * 300;
          dropletTimer = setTimeout(scheduleDroplet, nextInterval);
        };
        scheduleDroplet();
        
        const stopDroplets = {
          stop: () => {
            if (dropletTimer) clearTimeout(dropletTimer);
          }
        };
        nodes.push(stopDroplets);
      } else if (soundName === 'Bosque') {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const windSource = ctx.createBufferSource();
        windSource.buffer = noiseBuffer;
        windSource.loop = true;

        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.setValueAtTime(350, ctx.currentTime);
        windFilter.Q.setValueAtTime(1.5, ctx.currentTime);

        windSource.connect(windFilter);
        windFilter.connect(masterGainRef.current);
        windSource.start();
        nodes.push(windSource);

        const breezeLfo = ctx.createOscillator();
        const breezeLfoGain = ctx.createGain();
        breezeLfo.frequency.setValueAtTime(0.08, ctx.currentTime);
        breezeLfoGain.gain.setValueAtTime(120, ctx.currentTime);

        breezeLfo.connect(breezeLfoGain);
        breezeLfoGain.connect(windFilter.frequency);
        breezeLfo.start();
        nodes.push(breezeLfo);

        let birdTimer: any = null;
        const playBirdChirp = () => {
          if (activeSoundRef.current !== 'Bosque' || !isActive || isBreak) return;

          const chirpOsc = ctx.createOscillator();
          const chirpGain = ctx.createGain();

          chirpOsc.type = 'sine';
          const startPitch = 2200 + Math.random() * 800;
          chirpOsc.frequency.setValueAtTime(startPitch, ctx.currentTime);
          chirpOsc.frequency.exponentialRampToValueAtTime(startPitch - 400, ctx.currentTime + 0.15);

          chirpGain.gain.setValueAtTime(0, ctx.currentTime);
          chirpGain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.02);
          chirpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

          chirpOsc.connect(chirpGain);
          chirpGain.connect(masterGainRef.current!);
          chirpOsc.start();
          chirpOsc.stop(ctx.currentTime + 0.16);

          birdTimer = setTimeout(playBirdChirp, 3000 + Math.random() * 7000);
        };
        birdTimer = setTimeout(playBirdChirp, 1500);

        const stopBirds = {
          stop: () => {
            if (birdTimer) clearTimeout(birdTimer);
          }
        };
        nodes.push(stopBirds);
      } else if (soundName === 'Café') {
        const bufferSize = ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const cafeSource = ctx.createBufferSource();
        cafeSource.buffer = noiseBuffer;
        cafeSource.loop = true;

        const cafeFilter = ctx.createBiquadFilter();
        cafeFilter.type = 'lowpass';
        cafeFilter.frequency.setValueAtTime(150, ctx.currentTime);

        cafeSource.connect(cafeFilter);
        cafeFilter.connect(masterGainRef.current);
        cafeSource.start();
        nodes.push(cafeSource);

        let cafeTimer: any = null;
        const playCafeDetail = () => {
          if (activeSoundRef.current !== 'Café' || !isActive || isBreak) return;

          const detailType = Math.random();
          if (detailType < 0.7) {
            const clickOsc = ctx.createOscillator();
            const clickGain = ctx.createGain();
            clickOsc.type = 'triangle';
            clickOsc.frequency.setValueAtTime(140 + Math.random() * 80, ctx.currentTime);
            clickGain.gain.setValueAtTime(0.05, ctx.currentTime);
            clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015);
            clickOsc.connect(clickGain);
            clickGain.connect(masterGainRef.current!);
            clickOsc.start();
            clickOsc.stop(ctx.currentTime + 0.02);
          } else {
            const clinkOsc = ctx.createOscillator();
            const clinkGain = ctx.createGain();
            clinkOsc.type = 'sine';
            clinkOsc.frequency.setValueAtTime(3200 + Math.random() * 1200, ctx.currentTime);
            clinkGain.gain.setValueAtTime(0.015, ctx.currentTime);
            clinkGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
            clinkOsc.connect(clinkGain);
            clinkGain.connect(masterGainRef.current!);
            clinkOsc.start();
            clinkOsc.stop(ctx.currentTime + 0.25);
          }

          cafeTimer = setTimeout(playCafeDetail, 150 + Math.random() * 800);
        };
        playCafeDetail();

        const stopCafe = {
          stop: () => {
            if (cafeTimer) clearTimeout(cafeTimer);
          }
        };
        nodes.push(stopCafe);
      }

      soundNodesRef.current = nodes;
    } catch (e) {
      console.warn("Could not start Web Audio:", e);
    }
  };

  const stopAmbientSound = () => {
    try {
      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.setValueAtTime(masterGainRef.current.gain.value, audioCtxRef.current.currentTime);
        masterGainRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 0.4);
      }
      setTimeout(() => {
        soundNodesRef.current.forEach((node) => {
          try {
            if (node.stop && typeof node.stop === 'function') {
              node.stop();
            }
          } catch (err) {}
        });
        soundNodesRef.current = [];
        activeSoundRef.current = '';
      }, 420);
    } catch (e) {
      console.warn("Could not stop audio safely:", e);
    }
  };

  // Sound selection hook listening to study/break states
  useEffect(() => {
    if (isActive && !isBreak) {
      startAmbientSound(activeSound);
    } else {
      stopAmbientSound();
    }
    return () => {
      stopAmbientSound();
    };
  }, [isActive, activeSound, isBreak]);

  // Actualizar tiempo del temporizador cuando cambie la config
  useEffect(() => {
    if (!isActive) {
      setTimeLeft(isBreak ? sessionConfig.shortBreak * 60 : sessionConfig.focusTime * 60);
    }
  }, [sessionConfig, isBreak, isActive]);

  // --- Lógica del Temporizador ---
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      handleTimerComplete();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft]);

  // Track and save study habit stats in real-time
  const trackSessionCompletion = async (nextSessions: number) => {
    if (!currentUserId) return;
    
    // YYYY-MM-DD in local representation
    const localDate = new Date();
    const todayStr = localDate.toLocaleDateString('en-CA');
    const todayDayOfWeek = (localDate.getDay() + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
    
    let newCurrentStreak = currentStreak;
    let newBestStreak = bestStreak;
    let newWeeklyMinutes = [...weeklyMinutes];
    
    const getMondayDateStr = (d: Date) => {
      const copy = new Date(d);
      const day = copy.getDay();
      const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(copy.setDate(diff));
      return mon.toLocaleDateString('en-CA');
    };
    const currentWeekCommenced = getMondayDateStr(new Date());
    
    if (weekCommencedDate !== currentWeekCommenced) {
      newWeeklyMinutes = [0, 0, 0, 0, 0, 0, 0];
    }
    
    newWeeklyMinutes[todayDayOfWeek] = (newWeeklyMinutes[todayDayOfWeek] || 0) + sessionConfig.focusTime;
    
    if (lastActiveDate === todayStr) {
      // already focused today, keep streak same
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA');
      
      if (lastActiveDate === yesterdayStr || lastActiveDate === '') {
        newCurrentStreak += 1;
      } else {
        newCurrentStreak = 1;
      }
    }
    
    if (newCurrentStreak > newBestStreak) {
      newBestStreak = newCurrentStreak;
    }
    
    setCurrentStreak(newCurrentStreak);
    setBestStreak(newBestStreak);
    setWeeklyMinutes(newWeeklyMinutes);
    setLastActiveDate(todayStr);
    setWeekCommencedDate(currentWeekCommenced);
    
    try {
      await updateDoc(doc(db, 'users', currentUserId), {
        sessionsCompleted: nextSessions,
        currentStreak: newCurrentStreak,
        bestStreak: newBestStreak,
        lastActiveDate: todayStr,
        weekCommencedDate: currentWeekCommenced,
        weeklyMinutes: newWeeklyMinutes
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}`);
    }
  };

  const handleTimerComplete = async () => {
    setIsActive(false);
    if (!isBreak) {
      const nextSessions = sessionsCompleted + 1;
      setSessionsCompleted(nextSessions);
      
      // Persistir incremento de sesiones y estadísticas en Firestore
      await trackSessionCompletion(nextSessions);
      
      alert('¡Sesión terminada! Tómate un descanso.');
      const nextBreak = nextSessions % 4 === 0 ? sessionConfig.longBreak : sessionConfig.shortBreak;
      setTimeLeft(nextBreak * 60);
      setIsBreak(true);
    } else {
      alert('¡Descanso terminado! ¿Listo para otra sesión?');
      setTimeLeft(sessionConfig.focusTime * 60);
      setIsBreak(false);
    }
  };

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(isBreak ? sessionConfig.shortBreak * 60 : sessionConfig.focusTime * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalSessionTime = isBreak 
    ? ((sessionsCompleted % 4 === 0 && sessionsCompleted > 0) ? sessionConfig.longBreak : sessionConfig.shortBreak) * 60 
    : sessionConfig.focusTime * 60;
  const progress = (totalSessionTime - timeLeft) / totalSessionTime;

  // --- Lógica de Tareas (Firestore) ---
  const addTask = async (title: string, date: string, difficulty: Task['difficulty']) => {
    if (!title || !date || !currentUserId) return;
    const newTask = {
      title,
      date,
      difficulty,
      userId: currentUserId,
      sessions: difficulty === 'Alta' ? 5 : difficulty === 'Media' ? 3 : 1,
      completed: false
    };
    try {
      await addDoc(collection(db, 'users', currentUserId, 'tasks'), newTask);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}/tasks`);
    }
  };

  const toggleTask = async (id: string, currentCompleted: boolean) => {
    if (!currentUserId) return;
    try {
      const taskDocRef = doc(db, 'users', currentUserId, 'tasks', id);
      await updateDoc(taskDocRef, {
        completed: !currentCompleted
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}/tasks/${id}`);
    }
  };

  // --- Lógica de Perfil ---
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        alert("La imagen es demasiado grande. Selecciona una foto menor de 20MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        try {
          // Comprimir y recortar a un tamaño óptimo para avatares (200x200 jpeg)
          const compressedBase64 = await compressImage(rawBase64, 200, 200);
          setUser(prev => ({ ...prev, avatar: compressedBase64 }));
          
          if (currentUserId) {
            await updateDoc(doc(db, 'users', currentUserId), {
              avatar: compressedBase64
            });
          }
          alert('¡Foto de perfil actualizada con éxito!');
        } catch (err: any) {
          console.error("Error al procesar/guardar la foto de perfil:", err);
          alert(`No se pudo guardar la imagen: ${err.message || err}`);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = async () => {
    const confirmLogout = window.confirm('¿Estás seguro de que deseas cerrar sesión?');
    if (confirmLogout) {
      setIsActive(false);
      try {
        await signOut(auth);
        setAuthMode('login');
      } catch (err) {
        console.error("Error al cerrar sesión:", err);
      }
    }
  };

  // Guardar Cambios del Perfil
  const saveProfileChanges = async (newName: string, newEmail: string) => {
    if (!currentUserId) return;
    try {
      await updateDoc(doc(db, 'users', currentUserId), {
        name: newName,
        email: newEmail
      });
      setUser(prev => ({ ...prev, name: newName, email: newEmail }));
      alert('¡Perfil actualizado correctamente!');
      setActiveSubScreen('none');
    } catch (err: any) {
      console.error("Error al guardar perfil:", err);
      alert(`No se pudo actualizar el perfil: ${err.message || err}`);
    }
  };

  // Guardar nombre directamente (sin alertas redundantes o retrasos)
  const saveProfileNameDirectly = async (newName: string) => {
    if (!currentUserId || !newName.trim()) return;
    try {
      setUser(prev => ({ ...prev, name: newName.trim() }));
      await updateDoc(doc(db, 'users', currentUserId), {
        name: newName.trim()
      });
    } catch (err: any) {
      console.error("Error al guardar nombre directamente:", err);
      alert(`No se pudo actualizar el nombre directamente: ${err.message || err}`);
    }
  };

  // Actualizar configuración de sesión en base de datos
  const updateSessionConfig = async (key: keyof SessionConfig, value: number) => {
    const updated = { ...sessionConfig, [key]: value };
    setSessionConfig(updated);
    
    if (currentUserId) {
      try {
        await updateDoc(doc(db, 'users', currentUserId), {
          [key]: value
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}`);
      }
    }
  };

  // Cambiar sonido ambiente
  const selectSound = async (soundName: string) => {
    setActiveSound(soundName);
    if (currentUserId) {
      try {
        await updateDoc(doc(db, 'users', currentUserId), {
          activeSound: soundName
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}`);
      }
    }
  };

  // --- Handlers de Autenticación de Firebase Genuina ---
  
  const handleEmailSignUp = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || !nameInput) {
      setAuthError("Por favor rellena todos los campos.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
      // El observer onAuthStateChanged manejará el registro del documento del perfil.
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/configuration-not-found') {
        setAuthError("El método de Correo/Contraseña no está habilitado en Firebase. Actívalo en la consola de Firebase -> Authentication -> Sign-in method.");
      } else {
        setAuthError(error.message || "Error al registrarse.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      setAuthError("Ingresa tu correo y contraseña.");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, emailInput, passwordInput);
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/configuration-not-found') {
        setAuthError("El método de Correo/Contraseña no está habilitado en Firebase. Actívalo en la consola de Firebase -> Authentication -> Sign-in method.");
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        setAuthError("Credenciales inválidas o correo no registrado.");
      } else {
        setAuthError(error.message || "Error al iniciar sesión.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error(error);
      setAuthError(error.message || "Error al iniciar sesión con Google.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Pantalla de Carga Global
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-6 text-center">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2.5 }}
          className="p-4 glass rounded-3xl mb-4 text-primary-container"
        >
          <Sparkles className="w-12 h-12 text-primary-container" />
        </motion.div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] opacity-60">Sincronizando santuario...</p>
      </div>
    );
  }

  // --- Pantallas de Auth ---
  if (authMode !== 'loggedIn') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-8"
        >
          <div className="space-y-2">
            <div className="inline-flex p-4 glass rounded-3xl mb-4 text-primary-container">
              <Sparkles className="w-10 h-10 drop-shadow-[0_0_15px_rgba(168,230,207,0.5)]" />
            </div>
            <h1 className="text-4xl font-bold tracking-tighter text-primary-container">StudyZen</h1>
            <p className="text-on-surface-variant italic">Tu santuario digital de productividad conectada</p>
          </div>

          <div className="glass p-8 rounded-3xl space-y-6">
            <h2 className="text-xl font-bold">{authMode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h2>
            
            <form onSubmit={authMode === 'login' ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
              {authMode === 'register' && (
                <div className="relative">
                  <User className="absolute left-3 top-3 w-5 h-5 text-on-surface-variant opacity-50" />
                  <input 
                    type="text" 
                    placeholder="Nombre completo" 
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm" 
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-on-surface-variant opacity-50" />
                <input 
                  type="email" 
                  placeholder="Correo electrónico" 
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm" 
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-on-surface-variant opacity-50" />
                <input 
                  type="password" 
                  placeholder="Contraseña" 
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm" 
                />
              </div>

              {authError && (
                <p className="text-red-400 text-xs text-left px-1 mt-1 leading-relaxed max-h-24 overflow-y-auto font-medium">
                  {authError}
                </p>
              )}

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full py-4 mt-2 bg-gradient-to-r from-primary-container to-secondary rounded-2xl text-slate-900 font-bold active:scale-[0.98] transition-all cursor-pointer text-sm"
              >
                {authLoading ? 'Procesando...' : (authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse')}
              </button>
            </form>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink mx-4 text-xs opacity-40 font-bold uppercase tracking-widest">o</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <button 
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer text-sm font-semibold"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.62 0 3.08.56 4.22 1.65l3.15-3.15C17.45 1.84 14.93 1 12 1 7.35 1 3.4 3.72 1.55 7.68l3.64 2.82C6.1 7.37 8.82 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.44c-.28 1.48-1.12 2.73-2.38 3.58l3.69 2.86c2.16-1.99 3.42-4.92 3.42-8.59z" />
                <path fill="#FBBC05" d="M5.19 14.86c-.24-.73-.38-1.5-.38-2.3s.14-1.57.38-2.3L1.55 7.44C.56 9.38 0 11.6 0 14s.56 4.62 1.55 6.56l3.64-2.7z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.69-2.86c-1.02.68-2.33 1.09-3.9 1.09-3.18 0-5.9-2.33-6.86-5.46l-3.64 2.82C3.4 20.28 7.35 23 12 23z" />
              </svg>
              Continuar con Google
            </button>

            <div className="flex items-center justify-center gap-2 text-xs pt-1">
              <span className="text-on-surface-variant">
                {authMode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
              </span>
              <button 
                onClick={() => {
                  setAuthError(null);
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                }}
                className="text-primary-container font-bold hover:underline cursor-pointer"
              >
                {authMode === 'login' ? 'Regístrate' : 'Inicia sesión'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 glass border-b border-white/10 px-6 py-4 flex justify-between items-center bg-slate-950/40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button className="p-2 text-primary-container hover:bg-white/10 rounded-lg transition-colors">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-primary-container drop-shadow-[0_0_10px_rgba(168,230,207,0.5)]">
            StudyZen
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 text-on-surface-variant hover:bg-white/10 rounded-lg transition-colors">
            <Bell className="w-5 h-5" />
          </button>
          <div 
            onClick={() => {
              setActiveTab('profile');
              setActiveSubScreen('none');
            }}
            className="w-10 h-10 rounded-full border border-primary-container/30 overflow-hidden cursor-pointer active:scale-95 transition-transform"
          >
            <img 
              src={user.avatar} 
              alt="Perfil" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-md mx-auto pt-24 pb-32 px-5 overflow-x-hidden relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'focus' && (
            <motion.div
              key="focus"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center"
            >
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-1">Enfoque Profundo</h2>
                <p className="text-on-surface-variant flex items-center justify-center gap-2 italic">
                  <Sparkles className="w-4 h-4 text-primary-container" />
                  Tu santuario de productividad en la nube
                </p>
              </div>

              {/* Temporizador */}
              <div className="relative w-80 h-80 flex items-center justify-center mb-10">
                <svg className="absolute w-full h-full -rotate-90">
                  <circle cx="160" cy="160" r="145" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                  <motion.circle 
                    cx="160" cy="160" r="145" 
                    fill="transparent" 
                    stroke={isBreak ? "#88ceff" : "#a8e6cf"} 
                    strokeWidth="8" 
                    strokeDasharray={911}
                    strokeDashoffset={911 * (1 - progress)}
                    strokeLinecap="round"
                    className="timer-glow"
                  />
                </svg>
                <div className="w-64 h-64 rounded-full glass flex flex-col items-center justify-center relative overflow-hidden group">
                  <motion.div 
                    animate={{ y: [0, -5, 0], scale: isActive ? 1.05 : 1 }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    className="relative z-10 text-center"
                  >
                    <span className="block text-6xl font-bold tracking-tighter mb-2">
                      {formatTime(timeLeft)}
                    </span>
                    <span className={`font-semibold uppercase tracking-widest text-xs ${isBreak ? 'text-secondary' : 'text-primary-container'}`}>
                      {isBreak ? 'Enfriamiento' : 'Enfoque Profundo'}
                    </span>
                  </motion.div>
                </div>
              </div>

              {/* Controles */}
              <div className="w-full flex flex-col gap-4">
                <div className="flex gap-4">
                  <button 
                    onClick={toggleTimer}
                    className="flex-1 py-4 bg-gradient-to-r from-primary-container to-secondary rounded-2xl text-slate-900 font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isActive ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    {isActive ? 'Pausar Sesión' : 'Iniciar Sesión'}
                  </button>
                  <button 
                    onClick={resetTimer}
                    className="p-4 glass rounded-2xl active:scale-95 transition-all text-on-surface-variant cursor-pointer"
                  >
                    <RefreshCw className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={() => selectSound('Lluvia')}
                    className={`flex-1 p-4 glass rounded-2xl flex flex-col items-center gap-2 group transition-all hover:bg-white/10 active:scale-95 cursor-pointer ${activeSound === 'Lluvia' ? 'border-primary-container bg-white/5' : ''}`}
                  >
                    <CloudRain className={`w-6 h-6 ${activeSound === 'Lluvia' ? 'text-primary-container' : 'text-secondary'}`} />
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-60 group-hover:opacity-100 italic">Lluvia</span>
                  </button>
                  <button 
                    onClick={() => selectSound('Café')}
                    className={`flex-1 p-4 glass rounded-2xl flex flex-col items-center gap-2 group transition-all hover:bg-white/10 active:scale-95 cursor-pointer ${activeSound === 'Café' ? 'border-primary-container bg-white/5' : ''}`}
                  >
                    <Coffee className={`w-6 h-6 ${activeSound === 'Café' ? 'text-primary-container' : 'text-[#c69c6d]'}`} />
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-60 group-hover:opacity-100 italic">Café</span>
                  </button>
                </div>
              </div>

              {/* Resumen Card */}
              <div className="w-full mt-8 p-6 glass rounded-3xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary-container/20 flex items-center justify-center">
                    <Flame className="w-6 h-6 text-primary-container fill-current" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Sesiones hoy</p>
                    <p className="text-2xl font-bold">{sessionsCompleted}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Meta diaria</p>
                  <p className="text-2xl font-bold">{sessionsCompleted}/8</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'plan' && (
            <motion.div
              key="plan"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-3xl font-bold">Planificador</h2>
                <p className="text-on-surface-variant italic">Organiza tu camino a la excelencia.</p>
              </div>

              {/* Nueva Tarea Form */}
              <div className="glass p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-primary-container" />
                  <h3 className="font-bold">Nueva Tarea</h3>
                </div>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    value={taskTitleInput}
                    onChange={(e) => setTaskTitleInput(e.target.value)}
                    placeholder="Asignatura o Proyecto" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="date" 
                      value={taskDateInput}
                      onChange={(e) => setTaskDateInput(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm animate-none"
                    />
                    <select 
                      value={taskDifficultyInput}
                      onChange={(e) => setTaskDifficultyInput(e.target.value as Task['difficulty'])}
                      className="bg-slate-900 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm [color-scheme:dark]"
                    >
                      <option value="Baja">Relajado</option>
                      <option value="Media">Media</option>
                      <option value="Alta">Trabajo Profundo</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => {
                      if (taskTitleInput.trim() && taskDateInput) {
                        addTask(taskTitleInput.trim(), taskDateInput, taskDifficultyInput);
                        setTaskTitleInput('');
                        setTaskDateInput('');
                        setTaskDifficultyInput('Media');
                      } else {
                        alert("Por favor, llena la asignatura y la fecha.");
                      }
                    }}
                    className="w-full py-3 bg-primary-container text-slate-900 font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                    AGREGAR TAREA
                  </button>
                </div>
              </div>

              {/* Lista de Tareas */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <h3 className="font-bold text-lg">Próximas Sesiones</h3>
                  <span className="text-xs font-bold text-primary-container uppercase tracking-widest">{tasks.filter(t => !t.completed).length} Activas</span>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic text-center py-6">No tienes tareas para mostrar. ¡Crea una nueva arriba!</p>
                ) : (
                  tasks.map(task => (
                    <div 
                      key={task.id} 
                      onClick={() => toggleTask(task.id, task.completed)}
                      className={`glass p-5 rounded-2xl border-l-4 ${task.difficulty === 'Alta' ? 'border-primary-container' : 'border-secondary'} flex flex-col gap-3 group hover:bg-white/5 transition-all cursor-pointer`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-primary-container bg-primary-container/10 px-2 py-0.5 rounded-full">Esfuerzo {task.difficulty}</span>
                          <h4 className={`font-bold text-lg ${task.completed ? 'line-through opacity-40' : ''}`}>{task.title}</h4>
                        </div>
                        <div className={`p-1 rounded-full ${task.completed ? 'bg-primary-container/20 text-primary-container' : 'border border-white/20'}`}>
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-on-surface-variant">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>{task.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Timer className="w-4 h-4" />
                          <span>{task.sessions} sugeridas</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-3xl font-bold">Estadísticas</h2>
                <p className="text-on-surface-variant italic">Tu rendimiento cognitivo real sincronizado.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="glass p-5 rounded-3xl flex flex-col justify-between h-32 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity bg-primary-container rounded-bl-3xl">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-primary-container">{sessionsCompleted > 0 ? 'Ritmo Óptimo' : 'Inicia Sesión'}</span>
                  <div>
                    <p className="text-3xl font-bold">{sessionsCompleted}</p>
                    <p className="text-xs font-semibold opacity-50 uppercase tracking-widest">Sesiones Realizadas</p>
                  </div>
                </div>
                <div className="glass p-5 rounded-3xl flex flex-col justify-between h-32 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity bg-secondary rounded-bl-3xl">
                    <Flame className="w-12 h-12" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-secondary">{currentStreak > 0 ? 'Foco Conectado' : 'Sin Racha'}</span>
                  <div>
                    <p className="text-3xl font-bold">{currentStreak} {currentStreak === 1 ? 'Día' : 'Días'}</p>
                    <p className="text-xs font-semibold opacity-50 uppercase tracking-widest">Racha Actual</p>
                  </div>
                </div>
              </div>

              <div className="glass p-6 rounded-3xl space-y-6">
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className="font-bold">Desempeño Semanal</h3>
                    <p className="text-xs opacity-50 uppercase tracking-widest font-semibold">Minutos de enfoque</p>
                  </div>
                </div>
                <div className="h-44 flex items-end justify-between gap-3 px-2">
                  {weeklyMinutes.map((val, i) => {
                    const maxVal = Math.max(...weeklyMinutes, 30);
                    const pct = (val / maxVal) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <span className="text-[9px] font-mono font-bold text-primary-container">{val}m</span>
                        <div className="w-full relative group h-28 flex items-end">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${pct}%` }}
                            transition={{ delay: i * 0.05, duration: 0.8, ease: "easeOut" }}
                            className={`w-full rounded-t-lg relative ${val > 0 ? 'bg-primary-container shadow-[0_0_12px_rgba(168,230,207,0.3)]' : 'bg-white/5'}`}
                            style={{ minHeight: val > 0 ? '4px' : '0px' }}
                          >
                            <div className="absolute inset-0 rounded-t-lg bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </motion.div>
                        </div>
                        <span className="text-[10px] font-bold opacity-40">{'LMMJVSD'[i]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <AnimatePresence mode="wait">
                {activeSubScreen === 'none' && (
                  <motion.div
                    key="main-profile"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-8"
                  >
                    <div className="flex flex-col items-center py-4">
                      <div className="relative group mb-6">
                        <motion.div 
                          whileHover={{ scale: 1.05 }}
                          className="w-32 h-32 rounded-full glass p-1 glow-primary relative"
                        >
                          <div className="w-full h-full rounded-full overflow-hidden border-2 border-primary-container/20">
                            <img 
                              src={user.avatar} 
                              alt="Perfil" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <button 
                            onClick={handleAvatarClick}
                            className="absolute bottom-1 right-1 p-2 bg-primary-container text-slate-900 rounded-full shadow-lg active:scale-90 transition-transform cursor-pointer"
                          >
                            <Camera className="w-5 h-5" />
                          </button>
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleFileChange}
                          />
                        </motion.div>
                      </div>
                      {isEditingName ? (
                        <div className="flex items-center gap-2 mt-4 justify-center w-full max-w-xs">
                          <input
                            type="text"
                            value={tempNameText}
                            onChange={(e) => setTempNameText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                saveProfileNameDirectly(tempNameText);
                                setIsEditingName(false);
                              } else if (e.key === 'Escape') {
                                setIsEditingName(false);
                              }
                            }}
                            className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-center text-lg outline-none focus:ring-1 focus:ring-primary-container font-medium text-white w-full"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              saveProfileNameDirectly(tempNameText);
                              setIsEditingName(false);
                            }}
                            className="p-2 bg-primary-container text-slate-900 rounded-lg active:scale-90 transition-transform cursor-pointer shrink-0"
                            title="Guardar"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-center mt-4 group">
                          <h2 
                            onClick={() => {
                              setTempNameText(user.name);
                              setIsEditingName(true);
                            }}
                            className="text-2xl font-bold cursor-pointer hover:text-primary-container transition-colors"
                          >
                            {user.name}
                          </h2>
                          <button
                            onClick={() => {
                              setTempNameText(user.name);
                              setIsEditingName(true);
                            }}
                            className="p-1 text-on-surface-variant hover:text-primary-container transition-colors opacity-60 group-hover:opacity-100"
                            title="Editar nombre directamente"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 gap-3 mt-6 w-full px-2">
                        <div className="glass p-3 rounded-2xl text-center">
                          <p className="text-lg font-bold">{sessionsCompleted * sessionConfig.focusTime}</p>
                          <p className="text-[9px] uppercase tracking-wider font-bold opacity-50">Minutos Focus</p>
                        </div>
                        <div className="glass p-3 rounded-2xl text-center">
                          <p className="text-lg font-bold">{currentStreak}</p>
                          <p className="text-[9px] uppercase tracking-wider font-bold opacity-50">Racha Actual</p>
                        </div>
                        <div className="glass p-3 rounded-2xl text-center">
                          <p className="text-lg font-bold">{bestStreak}</p>
                          <p className="text-[9px] uppercase tracking-wider font-bold opacity-50">Mejor Racha</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-bold px-1">Mi Cuenta</h3>
                      <div className="space-y-3">
                        {[
                          { label: 'Ajustes de Perfil', sub: 'Seguridad y preferencias personales', icon: User, screen: 'profile-settings' },
                          { label: 'Configuración de Sesiones', sub: 'Tiempos y notificaciones', icon: Timer, screen: 'session-settings' },
                          { label: 'Biblioteca de Sonidos', sub: 'Personaliza tu atmósfera de Zen', icon: Sparkles, screen: 'sound-library' }
                        ].map((item, i) => (
                          <div 
                            key={i} 
                            onClick={() => setActiveSubScreen(item.screen as SubScreen)}
                            className="glass p-5 rounded-2xl flex items-center justify-between group hover:bg-white/10 cursor-pointer active:scale-[0.99] transition-all"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-primary-container/10 flex items-center justify-center text-primary-container">
                                <item.icon className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-bold text-sm">{item.label}</p>
                                <p className="text-xs opacity-50">{item.sub}</p>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 opacity-20 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <button 
                      onClick={handleLogout}
                      className="w-full py-4 text-red-500 font-bold flex items-center justify-center gap-3 hover:bg-red-500/5 rounded-2xl transition-colors cursor-pointer"
                    >
                      <LogOut className="w-5 h-5" />
                      CERRAR SESIÓN
                    </button>
                  </motion.div>
                )}

                {activeSubScreen === 'profile-settings' && (
                  <motion.div
                    key="profile-settings"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-6"
                  >
                    <button onClick={() => setActiveSubScreen('none')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-container transition-colors cursor-pointer">
                      <ChevronRight className="w-5 h-5 rotate-180" />
                      <span>Volver al perfil</span>
                    </button>
                    <h3 className="text-2xl font-bold">Ajustes de Perfil</h3>
                    <div className="glass p-6 rounded-3xl space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-50 px-1">Nombre</label>
                        <input 
                          type="text" 
                          value={editProfileName}
                          onChange={(e) => setEditProfileName(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:ring-1 focus:ring-primary-container"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-50 px-1">Correo Electrónico</label>
                        <input 
                          type="email" 
                          value={editProfileEmail}
                          disabled
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none opacity-50 cursor-not-allowed"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          if (editProfileName.trim()) {
                            saveProfileChanges(editProfileName.trim(), editProfileEmail);
                          } else {
                            alert("Por favor, ingresa tu nombre.");
                          }
                        }}
                        className="w-full py-4 bg-primary-container text-slate-900 font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
                      >
                        GUARDAR CAMBIOS
                      </button>
                    </div>
                  </motion.div>
                )}

                {activeSubScreen === 'session-settings' && (
                  <motion.div
                    key="session-settings"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-6"
                  >
                    <button onClick={() => setActiveSubScreen('none')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-container transition-colors cursor-pointer">
                      <ChevronRight className="w-5 h-5 rotate-180" />
                      <span>Volver al perfil</span>
                    </button>
                    <h3 className="text-2xl font-bold">Configuración de Sesiones</h3>
                    <div className="glass p-6 rounded-3xl space-y-8">
                      {[
                        { label: 'Tiempo de Enfoque', key: 'focusTime' },
                        { label: 'Descanso Corto', key: 'shortBreak' },
                        { label: 'Descanso Largo', key: 'longBreak' }
                      ].map((item) => (
                        <div key={item.key} className="space-y-4">
                          <div className="flex justify-between items-center px-1">
                            <label className="text-sm font-bold uppercase tracking-widest opacity-70">{item.label}</label>
                            <span className="text-primary-container font-bold">{sessionConfig[item.key as keyof SessionConfig]} min</span>
                          </div>
                          <input 
                            type="range" min="1" max="60" 
                            value={sessionConfig[item.key as keyof SessionConfig]} 
                            onChange={(e) => updateSessionConfig(item.key as keyof SessionConfig, parseInt(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-container"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-on-surface-variant italic text-center px-4">
                        El tiempo de enfoque se guardará perpetuamente en la nube.
                      </p>
                    </div>
                  </motion.div>
                )}

                {activeSubScreen === 'sound-library' && (
                  <motion.div
                    key="sound-library"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="space-y-6"
                  >
                    <button onClick={() => setActiveSubScreen('none')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-container transition-colors cursor-pointer">
                      <ChevronRight className="w-5 h-5 rotate-180" />
                      <span>Volver al perfil</span>
                    </button>
                    <h3 className="text-2xl font-bold">Biblioteca de Sonidos</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { name: 'Lluvia', icon: CloudRain, color: '#88ceff', desc: 'Gotas rítmicas para calmar la mente.' },
                        { name: 'Café', icon: Coffee, color: '#c69c6d', desc: 'Escritura y ambiente de cafetería urbana.' },
                        { name: 'Bosque', icon: Sparkles, color: '#a8e6cf', desc: 'Viento suave y fauna minimalista.' },
                        { name: 'Ruido Blanco', icon: RefreshCw, color: '#ffffff', desc: 'Frecuencia constante para bloqueo total.' }
                      ].map((sound) => (
                        <div 
                          key={sound.name}
                          onClick={() => selectSound(sound.name)}
                          className={`glass p-5 rounded-3xl flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] ${activeSound === sound.name ? 'border-primary-container bg-white/10' : 'hover:bg-white/5'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div 
                              className="w-12 h-12 rounded-2xl flex items-center justify-center"
                              style={{ backgroundColor: `${sound.color}15`, color: sound.color }}
                            >
                              <sound.icon className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-bold">{sound.name}</p>
                              <p className="text-[10px] opacity-50">{sound.desc}</p>
                            </div>
                          </div>
                          {activeSound === sound.name && <CheckCircle2 className="w-5 h-5 text-primary-container" />}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navegación */}
      <nav className="fixed bottom-0 w-full z-50 px-6 pb-8 pt-4 pointer-events-none">
        <div className="max-w-md mx-auto h-20 glass rounded-3xl border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] flex justify-around items-center pointer-events-auto">
          {[
            { id: 'focus', icon: Timer, label: 'Enfoque' },
            { id: 'plan', icon: Calendar, label: 'Planear' },
            { id: 'stats', icon: BarChart2, label: 'Stats' },
            { id: 'profile', icon: User, label: 'Perfil' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as Tab);
                setActiveSubScreen('none');
              }}
              className={`flex flex-col items-center gap-1 transition-all duration-300 relative px-4 cursor-pointer ${activeTab === tab.id ? 'text-primary-container scale-110' : 'text-on-surface-variant opacity-40 hover:opacity-100'}`}
            >
              <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'drop-shadow-[0_0_8px_rgba(168,230,207,0.5)]' : ''}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTabIndicator"
                  className="absolute -bottom-2 w-1 h-1 bg-primary-container rounded-full shadow-[0_0_10px_#a8e6cf]"
                />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
