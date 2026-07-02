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
  Edit2 as Edit3,
  Music,
  Trash2,
  Link,
  Upload,
  Volume2,
  VolumeX
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
  GoogleAuthProvider,
  updateProfile
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

// --- IndexedDB Helper for storing large local audio files (up to 15MB or more) ---
const DB_NAME = 'studyzen_audio_db';
const STORE_NAME = 'sounds';

function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalAudio(id: string, blob: Blob): Promise<void> {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getLocalAudio(id: string): Promise<Blob | null> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to retrieve local audio from IndexedDB:", err);
    return null;
  }
}

async function deleteLocalAudio(id: string): Promise<void> {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to delete local audio from IndexedDB:", err);
  }
}

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
  progress: number;
}

interface UserProfile {
  name: string;
  email: string;
  avatar: string;
  joinDate: string;
}

interface CustomSound {
  id: string;
  name: string;
  url: string;
  isLocal?: boolean;
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
  
  // Sidebar and task control
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isAmbientSoundPlaying, setIsAmbientSoundPlaying] = useState(false);
  
  // Sonidos Personalizados del Usuario
  const [customSounds, setCustomSounds] = useState<CustomSound[]>(() => {
    try {
      const lastUserId = localStorage.getItem('studyzen_last_user_id');
      const saved = lastUserId ? localStorage.getItem(`studyzen_custom_sounds_${lastUserId}`) : null;
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const customAudioRef = useRef<HTMLAudioElement | null>(null);
  const customAudioUrlRef = useRef<string | null>(null);
  const localSoundIdRef = useRef<string | null>(null);
  
  // Datos del Usuario
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile>(() => {
    try {
      const lastUserId = localStorage.getItem('studyzen_last_user_id');
      const saved = lastUserId ? localStorage.getItem(`studyzen_user_${lastUserId}`) : null;
      return saved ? JSON.parse(saved) : {
        name: 'Estudiante Zen',
        email: '',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
        joinDate: 'Estudiante Zen'
      };
    } catch {
      return {
        name: 'Estudiante Zen',
        email: '',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
        joinDate: 'Estudiante Zen'
      };
    }
  });

  const [sessionConfig, setSessionConfig] = useState<SessionConfig>(() => {
    try {
      const lastUserId = localStorage.getItem('studyzen_last_user_id');
      const saved = lastUserId ? localStorage.getItem(`studyzen_config_${lastUserId}`) : null;
      return saved ? JSON.parse(saved) : { focusTime: 25, shortBreak: 5, longBreak: 15 };
    } catch {
      return { focusTime: 25, shortBreak: 5, longBreak: 15 };
    }
  });

  const [activeSound, setActiveSound] = useState<string>(() => {
    const lastUserId = localStorage.getItem('studyzen_last_user_id');
    return (lastUserId ? localStorage.getItem(`studyzen_active_sound_${lastUserId}`) : null) || 'Lluvia';
  });

  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const lastUserId = localStorage.getItem('studyzen_last_user_id');
      const saved = lastUserId ? localStorage.getItem(`studyzen_tasks_${lastUserId}`) : null;
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Estado del Temporizador
  const [timeLeft, setTimeLeft] = useState(() => {
    try {
      const lastUserId = localStorage.getItem('studyzen_last_user_id');
      const saved = lastUserId ? localStorage.getItem(`studyzen_config_${lastUserId}`) : null;
      const config = saved ? JSON.parse(saved) : { focusTime: 25 };
      return (config.focusTime || 25) * 60;
    } catch {
      return 25 * 60;
    }
  });
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState<number>(() => {
    const lastUserId = localStorage.getItem('studyzen_last_user_id');
    const saved = lastUserId ? localStorage.getItem(`studyzen_sessionsCompleted_${lastUserId}`) : null;
    return saved ? parseInt(saved, 10) : 0;
  });

  // Estadísticas del usuario persistidas en firestore
  const [currentStreak, setCurrentStreak] = useState<number>(() => {
    const lastUserId = localStorage.getItem('studyzen_last_user_id');
    const saved = lastUserId ? localStorage.getItem(`studyzen_currentStreak_${lastUserId}`) : null;
    return saved ? parseInt(saved, 10) : 0;
  });
  const [bestStreak, setBestStreak] = useState<number>(() => {
    const lastUserId = localStorage.getItem('studyzen_last_user_id');
    const saved = lastUserId ? localStorage.getItem(`studyzen_bestStreak_${lastUserId}`) : null;
    return saved ? parseInt(saved, 10) : 0;
  });
  const [weeklyMinutes, setWeeklyMinutes] = useState<number[]>(() => {
    try {
      const lastUserId = localStorage.getItem('studyzen_last_user_id');
      const saved = lastUserId ? localStorage.getItem(`studyzen_weeklyMinutes_${lastUserId}`) : null;
      return saved ? JSON.parse(saved) : [0, 0, 0, 0, 0, 0, 0];
    } catch {
      return [0, 0, 0, 0, 0, 0, 0];
    }
  });
  const [lastActiveDate, setLastActiveDate] = useState<string>(() => {
    const lastUserId = localStorage.getItem('studyzen_last_user_id');
    return (lastUserId ? localStorage.getItem(`studyzen_lastActiveDate_${lastUserId}`) : null) || '';
  });
  const [weekCommencedDate, setWeekCommencedDate] = useState<string>(() => {
    const lastUserId = localStorage.getItem('studyzen_last_user_id');
    return (lastUserId ? localStorage.getItem(`studyzen_weekCommencedDate_${lastUserId}`) : null) || '';
  });
  const [totalFocusMinutes, setTotalFocusMinutes] = useState<number>(() => {
    const lastUserId = localStorage.getItem('studyzen_last_user_id');
    const saved = lastUserId ? localStorage.getItem(`studyzen_total_focus_minutes_${lastUserId}`) : null;
    return saved ? parseInt(saved, 10) : 0;
  });

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

  // Estados para foto de perfil al momento de registrarse
  const [registerAvatar, setRegisterAvatar] = useState<string>('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop');
  const registerFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sistema de notificaciones (Toast) personalizado para evitar window.alert bloqueados en el iframe de vista previa
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Perfil y Modales
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isCompletingRef = useRef(false);

  // Estados para edición directa de nombre
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempNameText, setTempNameText] = useState('');

  // Estados controlados para formularios de edición de perfil y creación de tareas
  const [editProfileName, setEditProfileName] = useState('');
  const [editProfileEmail, setEditProfileEmail] = useState('');
  const [taskTitleInput, setTaskTitleInput] = useState('');
  const [taskDateInput, setTaskDateInput] = useState('');
  const [taskDifficultyInput, setTaskDifficultyInput] = useState<Task['difficulty']>('Media');

  // Estados para agregar sonidos o música personalizados
  const [showAddSoundForm, setShowAddSoundForm] = useState(false);
  const [newSoundName, setNewSoundName] = useState('');
  const [newSoundUrl, setNewSoundUrl] = useState('');
  const [newSoundType, setNewSoundType] = useState<'url' | 'upload'>('url');

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

  const handleRegisterFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        showToast("La imagen es demasiado grande. Selecciona una foto menor de 20MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        try {
          const compressedBase64 = await compressImage(rawBase64, 200, 200);
          setRegisterAvatar(compressedBase64);
          showToast('Foto de registro cargada con éxito', 'success');
        } catch (err: any) {
          console.error("Error al procesar la foto de perfil del registro:", err);
          showToast(`No se pudo cargar la imagen: ${err.message || err}`, 'error');
        }
      };
      reader.readAsDataURL(file);
    }
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setAuthError(null);
      if (firebaseUser) {
        const uid = firebaseUser.uid;
        localStorage.setItem('studyzen_last_user_id', uid);
        setCurrentUserId(uid);
        setAuthMode('loggedIn');
        
        // Pre-populamos de inmediato para evitar que "Cargando..." parpadee o se quede pegado, pero sin sobreescribir datos ya leídos de base de datos
        setUser((prev) => {
          if (prev.name !== 'Cargando...' && prev.name !== 'Estudiante Zen') {
            return prev;
          }
          const tempName = firebaseUser.displayName || 'Estudiante Zen';
          return {
            ...prev,
            name: tempName,
            email: firebaseUser.email || '',
            avatar: firebaseUser.photoURL || prev.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
            joinDate: prev.joinDate !== 'Uniendo...' ? prev.joinDate : new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })
          };
        });

        // Asegurarse de que el documento del usuario exista de forma segura en Firestore
        // (Solo lo creamos una vez si getDoc indica que no existe)
        try {
          const userDocRef = doc(db, 'users', uid);
          const docSnap = await getDoc(userDocRef);
          if (!docSnap.exists()) {
            await setDoc(userDocRef, {
              name: firebaseUser.displayName || 'Estudiante Zen',
              email: firebaseUser.email || '',
              avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
              joinDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' }),
              focusTime: 25,
              shortBreak: 5,
              longBreak: 15,
              sessionsCompleted: 0,
              activeSound: 'Lluvia',
              currentStreak: 0,
              bestStreak: 0,
              lastActiveDate: '',
              weekCommencedDate: '',
              weeklyMinutes: [0, 0, 0, 0, 0, 0, 0],
              customSounds: []
            });
          }
        } catch (err) {
          console.error("Error al asegurar inicialización del usuario en Firestore:", err);
        }
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
  }, []);

  // Sincronizar el perfil de usuario en tiempo real desde Firestore
  useEffect(() => {
    if (!currentUserId) return;
    
    const userDocRef = doc(db, 'users', currentUserId);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const updatedUser = {
          name: data.name || 'Estudiante Zen',
          email: data.email || '',
          avatar: data.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
          joinDate: data.joinDate || 'Junio 2026'
        };
        setUser(updatedUser);
        localStorage.setItem(`studyzen_user_${currentUserId}`, JSON.stringify(updatedUser));
        
        const updatedConfig = {
          focusTime: typeof data.focusTime === 'number' ? data.focusTime : 25,
          shortBreak: typeof data.shortBreak === 'number' ? data.shortBreak : 5,
          longBreak: typeof data.longBreak === 'number' ? data.longBreak : 15
        };
        setSessionConfig(updatedConfig);
        localStorage.setItem(`studyzen_config_${currentUserId}`, JSON.stringify(updatedConfig));
        
        if (data.activeSound) {
          setActiveSound(data.activeSound);
          localStorage.setItem(`studyzen_active_sound_${currentUserId}`, data.activeSound);
        }
        if (typeof data.sessionsCompleted === 'number') {
          setSessionsCompleted(data.sessionsCompleted);
          localStorage.setItem(`studyzen_sessionsCompleted_${currentUserId}`, String(data.sessionsCompleted));
        }
        if (typeof data.totalFocusMinutes === 'number') {
          setTotalFocusMinutes(data.totalFocusMinutes);
          localStorage.setItem(`studyzen_total_focus_minutes_${currentUserId}`, String(data.totalFocusMinutes));
        } else {
          const fallback = (data.sessionsCompleted || 0) * (typeof data.focusTime === 'number' ? data.focusTime : 25);
          setTotalFocusMinutes(fallback);
          localStorage.setItem(`studyzen_total_focus_minutes_${currentUserId}`, String(fallback));
        }

        // Cargar estadísticas sincronizadas
        const currentStr = typeof data.currentStreak === 'number' ? data.currentStreak : 0;
        setCurrentStreak(currentStr);
        localStorage.setItem(`studyzen_currentStreak_${currentUserId}`, String(currentStr));

        const bestStr = typeof data.bestStreak === 'number' ? data.bestStreak : 0;
        setBestStreak(bestStr);
        localStorage.setItem(`studyzen_bestStreak_${currentUserId}`, String(bestStr));

        setLastActiveDate(data.lastActiveDate || '');
        localStorage.setItem(`studyzen_lastActiveDate_${currentUserId}`, data.lastActiveDate || '');

        setWeekCommencedDate(data.weekCommencedDate || '');
        localStorage.setItem(`studyzen_weekCommencedDate_${currentUserId}`, data.weekCommencedDate || '');

        if (Array.isArray(data.weeklyMinutes) && data.weeklyMinutes.length === 7) {
          setWeeklyMinutes(data.weeklyMinutes);
          localStorage.setItem(`studyzen_weeklyMinutes_${currentUserId}`, JSON.stringify(data.weeklyMinutes));
        } else {
          setWeeklyMinutes([0, 0, 0, 0, 0, 0, 0]);
          localStorage.setItem(`studyzen_weeklyMinutes_${currentUserId}`, JSON.stringify([0, 0, 0, 0, 0, 0, 0]));
        }

        if (Array.isArray(data.customSounds)) {
          setCustomSounds(data.customSounds);
          localStorage.setItem(`studyzen_custom_sounds_${currentUserId}`, JSON.stringify(data.customSounds));
        } else {
          setCustomSounds([]);
          localStorage.setItem(`studyzen_custom_sounds_${currentUserId}`, JSON.stringify([]));
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
          completed: !!data.completed,
          progress: data.progress || 0
        });
      });
      
      // Sincronización robusta "local-first"
      // Si tenemos tareas en localStorage que no están en Firestore, las conservamos y las subimos.
      const localSaved = localStorage.getItem(`studyzen_tasks_${currentUserId}`);
      let finalTasks = [...fetchedTasks];
      
      if (localSaved) {
        try {
          const localTasks: Task[] = JSON.parse(localSaved);
          const localOnly = localTasks.filter(lt => !fetchedTasks.some(ft => ft.id === lt.id));
          
          if (localOnly.length > 0) {
            // Subir tareas locales pendientes a Firestore de forma segura
            localOnly.forEach(async (t) => {
              try {
                const docRef = doc(db, 'users', currentUserId, 'tasks', t.id);
                await setDoc(docRef, {
                  title: t.title,
                  date: t.date,
                  difficulty: t.difficulty,
                  sessions: t.sessions,
                  completed: t.completed,
                  progress: t.progress,
                  userId: currentUserId
                });
              } catch (e) {
                console.error("Error al sincronizar tarea local a Firestore:", e);
              }
            });
            finalTasks = [...fetchedTasks, ...localOnly];
          }
        } catch (e) {
          console.warn("Error al parsear tareas locales para sincronización:", e);
        }
      }

      setTasks(finalTasks);
      localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(finalTasks));
    }, (err) => {
      console.error("Error al sincronizar tareas desde Firestore:", err);
      showToast('Error al sincronizar tareas con el servidor. Usando datos locales.', 'info');
      // No lanzamos error fatal para evitar crasheos, simplemente usamos lo que tenemos en localStorage.
      const localSaved = localStorage.getItem(`studyzen_tasks_${currentUserId}`);
      if (localSaved) {
        try {
          setTasks(JSON.parse(localSaved));
        } catch (e) {
          console.error("Error al restaurar tareas locales en fallback:", e);
        }
      }
    });
    
    return () => unsubscribe();
  }, [currentUserId]);

  // Hidratar estados desde localStorage cuando currentUserId cambie para carga instantánea y separar cuentas completamente
  useEffect(() => {
    if (!currentUserId) {
      // Limpiar estados cuando no hay usuario autenticado
      setUser({
        name: 'Estudiante Zen',
        email: '',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
        joinDate: 'Estudiante Zen'
      });
      setSessionConfig({ focusTime: 25, shortBreak: 5, longBreak: 15 });
      setSessionsCompleted(0);
      setCurrentStreak(0);
      setBestStreak(0);
      setWeeklyMinutes([0, 0, 0, 0, 0, 0, 0]);
      setLastActiveDate('');
      setWeekCommencedDate('');
      setTotalFocusMinutes(0);
      setCustomSounds([]);
      setTasks([]);
      setActiveSound('Lluvia');
      setTimeLeft(25 * 60);
      return;
    }

    try {
      // Cargar o restablecer perfil de usuario
      const u = localStorage.getItem(`studyzen_user_${currentUserId}`);
      if (u) {
        setUser(JSON.parse(u));
      } else {
        setUser({
          name: 'Cargando...',
          email: '',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
          joinDate: 'Uniendo...'
        });
      }
      
      // Configuración de pomodoro
      const c = localStorage.getItem(`studyzen_config_${currentUserId}`);
      if (c) {
        const config = JSON.parse(c);
        setSessionConfig(config);
        setTimeLeft((config.focusTime || 25) * 60);
      } else {
        const defaultConfig = { focusTime: 25, shortBreak: 5, longBreak: 15 };
        setSessionConfig(defaultConfig);
        setTimeLeft(25 * 60);
      }
      
      // Sesiones completadas
      const s = localStorage.getItem(`studyzen_sessionsCompleted_${currentUserId}`);
      setSessionsCompleted(s ? Number(s) : 0);
      
      // Rachas
      const cs = localStorage.getItem(`studyzen_currentStreak_${currentUserId}`);
      setCurrentStreak(cs ? Number(cs) : 0);
      
      const bs = localStorage.getItem(`studyzen_bestStreak_${currentUserId}`);
      setBestStreak(bs ? Number(bs) : 0);
      
      // Gráfica de minutos semanales
      const wm = localStorage.getItem(`studyzen_weeklyMinutes_${currentUserId}`);
      setWeeklyMinutes(wm ? JSON.parse(wm) : [0, 0, 0, 0, 0, 0, 0]);
      
      // Fechas de actividad
      const la = localStorage.getItem(`studyzen_lastActiveDate_${currentUserId}`);
      setLastActiveDate(la || '');
      
      const wc = localStorage.getItem(`studyzen_weekCommencedDate_${currentUserId}`);
      setWeekCommencedDate(wc || '');

      // Minutos de enfoque totales
      const tf = localStorage.getItem(`studyzen_total_focus_minutes_${currentUserId}`);
      setTotalFocusMinutes(tf ? Number(tf) : 0);

      // Sonidos personalizados
      const snd = localStorage.getItem(`studyzen_custom_sounds_${currentUserId}`);
      setCustomSounds(snd ? JSON.parse(snd) : []);

      // Tareas
      const tsk = localStorage.getItem(`studyzen_tasks_${currentUserId}`);
      setTasks(tsk ? JSON.parse(tsk) : []);

      // Sonido activo
      const as = localStorage.getItem(`studyzen_active_sound_${currentUserId}`);
      setActiveSound(as || 'Lluvia');
    } catch (e) {
      console.warn("Could not hydrate from localStorage:", e);
    }
  }, [currentUserId]);

  // Persistir cambios locales de perfil en localStorage para respaldo offline
  useEffect(() => {
    if (currentUserId && user && user.name !== 'Cargando...') {
      localStorage.setItem(`studyzen_user_${currentUserId}`, JSON.stringify(user));
      localStorage.setItem('studyzen_cached_user', JSON.stringify(user));
    }
  }, [user, currentUserId]);

  // Persistir estadísticas y config en localStorage para respaldo offline e instantáneo
  useEffect(() => {
    if (!currentUserId) return;
    try {
      localStorage.setItem(`studyzen_config_${currentUserId}`, JSON.stringify(sessionConfig));
      localStorage.setItem(`studyzen_sessionsCompleted_${currentUserId}`, String(sessionsCompleted));
      localStorage.setItem(`studyzen_currentStreak_${currentUserId}`, String(currentStreak));
      localStorage.setItem(`studyzen_bestStreak_${currentUserId}`, String(bestStreak));
      localStorage.setItem(`studyzen_weeklyMinutes_${currentUserId}`, JSON.stringify(weeklyMinutes));
      localStorage.setItem(`studyzen_lastActiveDate_${currentUserId}`, lastActiveDate);
      localStorage.setItem(`studyzen_weekCommencedDate_${currentUserId}`, weekCommencedDate);
      localStorage.setItem(`studyzen_total_focus_minutes_${currentUserId}`, String(totalFocusMinutes));
    } catch (e) {
      console.error("Error writing to localStorage:", e);
    }
  }, [sessionConfig, sessionsCompleted, currentStreak, bestStreak, weeklyMinutes, lastActiveDate, weekCommencedDate, totalFocusMinutes, currentUserId]);

  // --- Ambient Sound Synthesis Engine using Web Audio API ---
  const startAmbientSound = (soundName: string) => {
    try {
      // 1. Stop any previous custom audio playing immediately
      if (customAudioRef.current) {
        customAudioRef.current.pause();
        customAudioRef.current = null;
      }
      if (customAudioUrlRef.current) {
        URL.revokeObjectURL(customAudioUrlRef.current);
        customAudioUrlRef.current = null;
      }

      // Check if this is a custom sound
      const customSound = customSounds.find(s => s.name === soundName);
      if (customSound) {
        if (customSound.isLocal) {
          // Play from IndexedDB
          getLocalAudio(customSound.id).then(blob => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              customAudioUrlRef.current = url;
              const audio = new Audio(url);
              audio.loop = true;
              audio.volume = 0.5;
              audio.play().catch(err => {
                console.warn("Could not play custom audio from IndexedDB:", err);
                showToast("No se pudo reproducir este archivo local.", "error");
              });
              customAudioRef.current = audio;
              activeSoundRef.current = soundName;
            } else {
              showToast("Este sonido local no está disponible en este dispositivo. Vuélvelo a subir.", "error");
              setIsAmbientSoundPlaying(false);
            }
          }).catch(err => {
            console.error("IndexedDB retrieval error:", err);
            showToast("Error al cargar el archivo de audio local.", "error");
            setIsAmbientSoundPlaying(false);
          });
          return;
        } else {
          // Play custom HTML5 Audio (URL)
          const audio = new Audio(customSound.url);
          audio.loop = true;
          audio.volume = 0.5; // Buen volumen por defecto
          audio.play().catch(err => {
            console.warn("Could not play custom audio file/stream:", err);
            showToast("No se pudo reproducir este archivo de audio. Verifica el enlace o archivo.", "error");
          });
          customAudioRef.current = audio;
          activeSoundRef.current = soundName;
          return;
        }
      }

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
          if (activeSoundRef.current !== 'Lluvia' || !isAmbientSoundPlaying) return;
          
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
          if (activeSoundRef.current !== 'Bosque' || !isAmbientSoundPlaying) return;

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
          if (activeSoundRef.current !== 'Café' || !isAmbientSoundPlaying) return;

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
      // Detener audio personalizado si está reproduciéndose
      if (customAudioRef.current) {
        customAudioRef.current.pause();
        customAudioRef.current = null;
      }
      if (customAudioUrlRef.current) {
        URL.revokeObjectURL(customAudioUrlRef.current);
        customAudioUrlRef.current = null;
      }
      if (masterGainRef.current && audioCtxRef.current) {
        masterGainRef.current.gain.setValueAtTime(masterGainRef.current.gain.value, audioCtxRef.current.currentTime);
        masterGainRef.current.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 0.4);
      }
      
      const nodesToStop = [...soundNodesRef.current];
      soundNodesRef.current = [];
      activeSoundRef.current = '';

      setTimeout(() => {
        nodesToStop.forEach((node) => {
          try {
            if (node.stop && typeof node.stop === 'function') {
              node.stop();
            }
          } catch (err) {}
        });
      }, 420);
    } catch (e) {
      console.warn("Could not stop audio safely:", e);
    }
  };

  // Sound selection hook listening to study/break states and isAmbientSoundPlaying state
  useEffect(() => {
    if (isAmbientSoundPlaying) {
      startAmbientSound(activeSound);
    } else {
      stopAmbientSound();
    }
    return () => {
      stopAmbientSound();
    };
  }, [isAmbientSoundPlaying, activeSound, customSounds]);

  // Actualizar tiempo del temporizador cuando cambie la config y el temporizador no esté corriendo
  useEffect(() => {
    if (!isActive) {
      const isLongBreak = isBreak && sessionsCompleted % 4 === 0 && sessionsCompleted > 0;
      setTimeLeft(isBreak ? (isLongBreak ? sessionConfig.longBreak : sessionConfig.shortBreak) * 60 : sessionConfig.focusTime * 60);
    }
  }, [sessionConfig.shortBreak, sessionConfig.longBreak, sessionConfig.focusTime, isBreak, sessionsCompleted, isActive]);

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
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    const todayDayOfWeek = (localDate.getDay() + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
    
    let newCurrentStreak = currentStreak;
    let newBestStreak = bestStreak;
    let newWeeklyMinutes = [...weeklyMinutes];
    
    const getMondayDateStr = (d: Date) => {
      const copy = new Date(d);
      const dayVal = copy.getDay();
      const diff = copy.getDate() - dayVal + (dayVal === 0 ? -6 : 1);
      const mon = new Date(copy.setDate(diff));
      const mYear = mon.getFullYear();
      const mMonth = String(mon.getMonth() + 1).padStart(2, '0');
      const mDay = String(mon.getDate()).padStart(2, '0');
      return `${mYear}-${mMonth}-${mDay}`;
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
      const yYear = yesterday.getFullYear();
      const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yDay = String(yesterday.getDate()).padStart(2, '0');
      const yesterdayStr = `${yYear}-${yMonth}-${yDay}`;
      
      if (lastActiveDate === yesterdayStr || lastActiveDate === '') {
        newCurrentStreak += 1;
      } else {
        newCurrentStreak = 1;
      }
    }
    
    if (newCurrentStreak > newBestStreak) {
      newBestStreak = newCurrentStreak;
    }
    
    const newTotalFocusMinutes = totalFocusMinutes + sessionConfig.focusTime;
    
    setCurrentStreak(newCurrentStreak);
    setBestStreak(newBestStreak);
    setWeeklyMinutes(newWeeklyMinutes);
    setLastActiveDate(todayStr);
    setWeekCommencedDate(currentWeekCommenced);
    setTotalFocusMinutes(newTotalFocusMinutes);
    
    try {
      await updateDoc(doc(db, 'users', currentUserId), {
        sessionsCompleted: nextSessions,
        currentStreak: newCurrentStreak,
        bestStreak: newBestStreak,
        lastActiveDate: todayStr,
        weekCommencedDate: currentWeekCommenced,
        weeklyMinutes: newWeeklyMinutes,
        totalFocusMinutes: newTotalFocusMinutes
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}`);
    }
  };

  const handleTimerComplete = async () => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;

    setIsActive(false);
    setIsAmbientSoundPlaying(false);
    
    if (!isBreak) {
      const nextSessions = sessionsCompleted + 1;
      setSessionsCompleted(nextSessions);
      
      // Persistir incremento de sesiones y estadísticas en Firestore
      await trackSessionCompletion(nextSessions);
      
      // Registrar automáticamente en la tarea seleccionada si existe
      if (activeTaskId) {
        const targetTask = tasks.find(t => t.id === activeTaskId);
        if (targetTask) {
          const nextTaskProgress = (targetTask.progress || 0) + 1;
          const isCompleted = nextTaskProgress >= targetTask.sessions;
          
          // Actualización optimista de estado local y localStorage
          const updatedTasks = tasks.map(t => {
            if (t.id === activeTaskId) {
              return { ...t, progress: nextTaskProgress, completed: isCompleted };
            }
            return t;
          });
          setTasks(updatedTasks);
          if (currentUserId) {
            localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(updatedTasks));
          }

          try {
            const taskDocRef = doc(db, 'users', currentUserId!, 'tasks', activeTaskId);
            await updateDoc(taskDocRef, {
              progress: nextTaskProgress,
              completed: isCompleted
            });
            if (isCompleted) {
              showToast(`¡Excelente! Completaste todas las sesiones de: ${targetTask.title}`, 'success');
              setActiveTaskId(null);
            } else {
              showToast(`¡Sesión de ${targetTask.title} registrada! (${nextTaskProgress}/${targetTask.sessions})`, 'success');
            }
          } catch (err) {
            console.error("Error al completar tarea automáticamente:", err);
          }
        }
      } else {
        showToast('¡Sesión terminada! Tómate un descanso.', 'success');
      }

      const nextBreak = nextSessions % 4 === 0 ? sessionConfig.longBreak : sessionConfig.shortBreak;
      setTimeLeft(nextBreak * 60);
      setIsBreak(true);
    } else {
      showToast('¡Descanso terminado! ¿Listo para otra sesión?', 'info');
      setTimeLeft(sessionConfig.focusTime * 60);
      setIsBreak(false);
    }

    isCompletingRef.current = false;
  };

  const toggleTimer = () => {
    const nextActive = !isActive;
    setIsActive(nextActive);
    if (nextActive && !isBreak) {
      setIsAmbientSoundPlaying(true);
    } else {
      setIsAmbientSoundPlaying(false);
    }
  };

  const resetTimer = () => {
    setIsActive(false);
    setIsAmbientSoundPlaying(false);
    isCompletingRef.current = false;
    const isLongBreak = isBreak && sessionsCompleted % 4 === 0 && sessionsCompleted > 0;
    setTimeLeft(isBreak ? (isLongBreak ? sessionConfig.longBreak : sessionConfig.shortBreak) * 60 : sessionConfig.focusTime * 60);
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
    
    // Generar un ID real de Firestore en el cliente de forma síncrona
    const tasksColRef = collection(db, 'users', currentUserId, 'tasks');
    const newDocRef = doc(tasksColRef);
    const taskId = newDocRef.id;

    // Calcular las sesiones propuestas basadas en la dificultad seleccionada y el tiempo de enfoque (Pomodoro)
    const focusTime = sessionConfig?.focusTime || 25;
    let targetMinutes = 75; // Media por defecto
    if (difficulty === 'Alta') {
      targetMinutes = 125;
    } else if (difficulty === 'Baja') {
      targetMinutes = 25;
    }
    const sessionsCount = Math.max(1, Math.round(targetMinutes / focusTime));

    const newTask: Task = {
      id: taskId,
      title,
      date,
      difficulty,
      sessions: sessionsCount,
      completed: false,
      progress: 0
    };

    // Actualización optimista de estado local y localStorage de inmediato
    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(updatedTasks));

    const dbPayload = {
      title,
      date,
      difficulty,
      userId: currentUserId,
      sessions: newTask.sessions,
      completed: false,
      progress: 0
    };

    try {
      await setDoc(newDocRef, dbPayload);
      showToast('Tarea agregada con éxito', 'success');
    } catch (err: any) {
      console.error("Error al guardar la tarea en Firestore:", err);
      // Revertir en caso de error
      setTasks(prev => prev.filter(t => t.id !== taskId));
      const reverted = updatedTasks.filter(t => t.id !== taskId);
      localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(reverted));
      showToast(`Error al guardar tarea: ${err?.message || err}`, 'error');
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}/tasks/${taskId}`);
    }
  };

  const updateTaskProgress = async (taskId: string, newProgress: number) => {
    if (!currentUserId) return;
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const previousTasks = [...tasks];
    const isCompleted = newProgress >= task.sessions;

    // Actualización optimista
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, progress: newProgress, completed: isCompleted };
      }
      return t;
    });
    setTasks(updatedTasks);
    localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(updatedTasks));

    try {
      const taskDocRef = doc(db, 'users', currentUserId, 'tasks', taskId);
      await updateDoc(taskDocRef, {
        progress: newProgress,
        completed: isCompleted
      });
      showToast('Progreso de la tarea actualizado', 'success');
    } catch (err) {
      console.error("Error al actualizar progreso de tarea:", err);
      setTasks(previousTasks);
      localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(previousTasks));
      showToast('Error al actualizar el progreso', 'error');
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}/tasks/${taskId}`);
    }
  };

  const updateTaskSessions = async (taskId: string, newSessions: number) => {
    if (!currentUserId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const previousTasks = [...tasks];
    const isCompleted = task.progress >= newSessions;

    // Actualización optimista
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, sessions: newSessions, completed: isCompleted };
      }
      return t;
    });
    setTasks(updatedTasks);
    localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(updatedTasks));

    try {
      const taskDocRef = doc(db, 'users', currentUserId, 'tasks', taskId);
      await updateDoc(taskDocRef, {
        sessions: newSessions,
        completed: isCompleted
      });
      showToast('Sesiones totales de la tarea actualizadas', 'success');
    } catch (err) {
      console.error("Error al actualizar sesiones totales de la tarea:", err);
      setTasks(previousTasks);
      localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(previousTasks));
      showToast('Error al actualizar las sesiones', 'error');
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}/tasks/${taskId}`);
    }
  };

  const deleteTask = async (id: string) => {
    if (!currentUserId) return;
    
    const previousTasks = [...tasks];
    
    // Actualización optimista
    const updatedTasks = tasks.filter(t => t.id !== id);
    setTasks(updatedTasks);
    localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(updatedTasks));

    if (activeTaskId === id) {
      setActiveTaskId(null);
    }

    try {
      const taskDocRef = doc(db, 'users', currentUserId, 'tasks', id);
      await deleteDoc(taskDocRef);
      showToast('Tarea eliminada con éxito', 'success');
    } catch (err) {
      // Revertir en caso de error
      setTasks(previousTasks);
      localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(previousTasks));
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}/tasks/${id}`);
    }
  };

  const toggleTask = async (id: string, currentCompleted: boolean) => {
    if (!currentUserId) return;

    const previousTasks = [...tasks];
    
    // Actualización optimista
    const updatedTasks = tasks.map(t => {
      if (t.id === id) {
        return { ...t, completed: !currentCompleted };
      }
      return t;
    });
    setTasks(updatedTasks);
    localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(updatedTasks));

    try {
      const taskDocRef = doc(db, 'users', currentUserId, 'tasks', id);
      await updateDoc(taskDocRef, {
        completed: !currentCompleted
      });
    } catch (err) {
      // Revertir en caso de error
      setTasks(previousTasks);
      localStorage.setItem(`studyzen_tasks_${currentUserId}`, JSON.stringify(previousTasks));
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
        showToast("La imagen es demasiado grande. Selecciona una foto menor de 20MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        try {
          // Comprimir y recortar a un tamaño óptimo para avatares (200x200 jpeg)
          const compressedBase64 = await compressImage(rawBase64, 200, 200);
          setUser(prev => {
            const updated = { ...prev, avatar: compressedBase64 };
            if (currentUserId) {
              localStorage.setItem(`studyzen_user_${currentUserId}`, JSON.stringify(updated));
            }
            return updated;
          });
          
          if (currentUserId) {
            await updateDoc(doc(db, 'users', currentUserId), {
              avatar: compressedBase64
            });
          }
          showToast('¡Foto de perfil actualizada con éxito!', 'success');
        } catch (err: any) {
          console.error("Error al procesar/guardar la foto de perfil:", err);
          showToast(`No se pudo guardar la imagen: ${err.message || err}`, 'error');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = async () => {
    setIsActive(false);
    try {
      await signOut(auth);
      setAuthMode('login');
      showToast('Sesión cerrada con éxito', 'info');
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  // Guardar Cambios del Perfil
  const saveProfileChanges = async (newName: string) => {
    const activeUid = currentUserId || auth.currentUser?.uid;
    if (!activeUid) {
      showToast("No se detectó un usuario autenticado legítimo.", "error");
      return;
    }
    const trimmedName = newName.trim();
    try {
      await updateDoc(doc(db, 'users', activeUid), {
        name: trimmedName
      });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      }
      setUser(prev => ({ ...prev, name: trimmedName }));
      showToast('¡Perfil actualizado correctamente!', 'success');
      setActiveSubScreen('none');
    } catch (err: any) {
      console.error("Error al guardar perfil:", err);
      showToast(`No se pudo actualizar el perfil: ${err.message || err}`, 'error');
    }
  };

  // Guardar nombre directamente (sin alertas redundantes o retrasos)
  const saveProfileNameDirectly = async (newName: string) => {
    const activeUid = currentUserId || auth.currentUser?.uid;
    if (!activeUid || !newName.trim()) return;
    const trimmedName = newName.trim();
    try {
      setUser(prev => ({ ...prev, name: trimmedName }));
      await updateDoc(doc(db, 'users', activeUid), {
        name: trimmedName
      });
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      }
      showToast('Nombre actualizado correctamente', 'success');
    } catch (err: any) {
      console.error("Error al guardar nombre directamente:", err);
      showToast(`No se pudo actualizar el nombre directamente: ${err.message || err}`, 'error');
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
    setIsAmbientSoundPlaying(true);
    if (currentUserId) {
      localStorage.setItem(`studyzen_active_sound_${currentUserId}`, soundName);
    }
    localStorage.setItem('studyzen_active_sound', soundName);
    const activeUid = currentUserId || auth.currentUser?.uid;
    if (activeUid) {
      try {
        await updateDoc(doc(db, 'users', activeUid), {
          activeSound: soundName
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${activeUid}`);
      }
    }
  };

  // Agregar Sonido o Música Personalizados
  const handleAddCustomSound = async () => {
    if (!newSoundName.trim() || !newSoundUrl.trim()) {
      showToast("Por favor ingresa un nombre y el enlace o archivo de audio.", "error");
      return;
    }
    const activeUid = currentUserId || auth.currentUser?.uid;
    if (!activeUid) {
      showToast("Inicia sesión para agregar sonidos.", "error");
      return;
    }

    const isLocal = newSoundUrl.startsWith('local://');
    const soundId = isLocal && localSoundIdRef.current 
      ? localSoundIdRef.current 
      : Math.random().toString(36).substring(2, 9);

    const newSoundItem: CustomSound = {
      id: soundId,
      name: newSoundName.trim(),
      url: newSoundUrl.trim(),
      isLocal: isLocal
    };

    // Validar nombre duplicado
    if (['Lluvia', 'Café', 'Bosque', 'Ruido Blanco'].includes(newSoundItem.name) || customSounds.some(s => s.name === newSoundItem.name)) {
      showToast("Ya existe un sonido con ese nombre.", "error");
      return;
    }

    const updatedList = [...customSounds, newSoundItem];
    setCustomSounds(updatedList);
    if (activeUid) {
      localStorage.setItem(`studyzen_custom_sounds_${activeUid}`, JSON.stringify(updatedList));
    }
    localStorage.setItem('studyzen_custom_sounds', JSON.stringify(updatedList));
    
    try {
      await updateDoc(doc(db, 'users', activeUid), {
        customSounds: updatedList
      });
      showToast("¡Sonido agregado con éxito!", "success");
      setNewSoundName('');
      setNewSoundUrl('');
      localSoundIdRef.current = null;
      setShowAddSoundForm(false);
    } catch (err: any) {
      console.error(err);
      showToast(`No se pudo guardar el sonido: ${err.message || err}`, "error");
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
      const userCredential = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
      const firebaseUser = userCredential.user;
      
      // Update Firebase Auth display name so displayName stays persisted
      await updateProfile(firebaseUser, { displayName: nameInput.trim() });
      
      // Create user document in Firestore immediately
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userDocRef, {
        name: nameInput.trim(),
        email: firebaseUser.email || '',
        avatar: registerAvatar,
        joinDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' }),
        focusTime: 25,
        shortBreak: 5,
        longBreak: 15,
        sessionsCompleted: 0,
        activeSound: 'Lluvia',
        currentStreak: 0,
        bestStreak: 0,
        lastActiveDate: '',
        weekCommencedDate: '',
        weeklyMinutes: [0, 0, 0, 0, 0, 0, 0],
        customSounds: []
      });
      
      showToast('¡Cuenta creada con éxito!', 'success');
      setRegisterAvatar('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop');
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
      const userCredential = await signInWithPopup(auth, provider);
      const firebaseUser = userCredential.user;
      
      // Check if user document already exists in Firestore, if not create it
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) {
        await setDoc(userDocRef, {
          name: firebaseUser.displayName || 'Estudiante Zen',
          email: firebaseUser.email || '',
          avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
          joinDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' }),
          focusTime: 25,
          shortBreak: 5,
          longBreak: 15,
          sessionsCompleted: 0,
          activeSound: 'Lluvia',
          currentStreak: 0,
          bestStreak: 0,
          lastActiveDate: '',
          weekCommencedDate: '',
          weeklyMinutes: [0, 0, 0, 0, 0, 0, 0],
          customSounds: []
        });
      }
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
                <div className="flex flex-col items-center space-y-2 pb-2">
                  <div className="relative group cursor-pointer" onClick={() => registerFileInputRef.current?.click()}>
                    <img 
                      src={registerAvatar} 
                      className="w-20 h-20 rounded-full border border-primary-container/30 object-cover" 
                      alt="Avatar de registro"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <span className="text-xs text-on-surface-variant">Sube una foto de perfil (opcional)</span>
                  <input 
                    type="file" 
                    ref={registerFileInputRef}
                    onChange={handleRegisterFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              )}
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
      {/* Sidebar Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100]"
            />
            {/* Sidebar Panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-slate-950 border-r border-white/10 z-[101] flex flex-col p-6 shadow-2xl"
            >
              {/* Header inside Sidebar */}
              <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary-container animate-pulse" />
                  <span className="font-sans font-bold text-xl tracking-tight text-white">StudyZen</span>
                </div>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 hover:bg-white/10 text-on-surface-variant hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
              </div>

              {/* User Quick Info */}
              <div className="glass p-4 rounded-2xl mb-6 flex items-center gap-3">
                <img src={user.avatar} className="w-10 h-10 rounded-full border border-primary-container/30 object-cover" />
                <div className="min-w-0">
                  <p className="font-bold text-sm text-white truncate">{user.name}</p>
                  <p className="text-[10px] uppercase tracking-wider text-primary-container font-semibold">
                    Racha: {currentStreak} 🔥 | {sessionsCompleted} ses.
                  </p>
                </div>
              </div>

              {/* Navigation Links */}
              <div className="space-y-1 flex-1">
                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant opacity-50 mb-2 px-3">Menú Principal</p>
                {[
                  { id: 'focus', icon: Timer, label: 'Temporizador' },
                  { id: 'plan', icon: Calendar, label: 'Planificador' },
                  { id: 'stats', icon: BarChart2, label: 'Estadísticas' },
                  { id: 'profile', icon: User, label: 'Ajustes' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as Tab);
                      setActiveSubScreen('none');
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left cursor-pointer ${activeTab === item.id ? 'bg-primary-container text-slate-900 shadow-[0_0_15px_rgba(168,230,207,0.3)]' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}

                <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant opacity-50 mt-6 mb-2 px-3">Control de Audio</p>
                <div className="glass p-3 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/70 font-semibold truncate">Sonido: {activeSound}</span>
                    <button 
                      onClick={() => setIsAmbientSoundPlaying(!isAmbientSoundPlaying)}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${isAmbientSoundPlaying ? 'border-primary-container/30 text-primary-container bg-primary-container/10' : 'border-white/10 text-on-surface-variant'}`}
                    >
                      {isAmbientSoundPlaying ? <Volume2 className="w-4 h-4 animate-bounce" /> : <VolumeX className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['Lluvia', 'Café', 'Bosque', 'Ruido Blanco'].map(soundName => (
                      <button
                        key={soundName}
                        onClick={() => selectSound(soundName)}
                        className={`text-[10px] py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${activeSound === soundName ? 'border-primary-container text-primary-container bg-primary-container/5' : 'border-white/5 text-white/40 hover:border-white/10'}`}
                      >
                        {soundName}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Logout Button inside Sidebar Footer */}
              <div className="border-t border-white/10 pt-4">
                <button
                  onClick={() => {
                    setIsSidebarOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors font-bold text-sm cursor-pointer"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 glass border-b border-white/10 px-6 py-4 flex justify-between items-center bg-slate-950/40 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-primary-container hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-primary-container drop-shadow-[0_0_10px_rgba(168,230,207,0.5)]">
            StudyZen
          </h1>
        </div>
        <div className="flex items-center gap-3">
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
                      {isBreak ? ((sessionsCompleted % 4 === 0 && sessionsCompleted > 0) ? 'Descanso Largo' : 'Descanso Corto') : 'Enfoque Profundo'}
                    </span>
                  </motion.div>
                </div>
              </div>

              {/* Selector de Tarea Activa */}
              <div className="w-full max-w-xs glass p-4 rounded-3xl mb-6 space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-primary-container" />
                    Trabajar en Tarea:
                  </span>
                  {activeTaskId && (
                    <button 
                      onClick={() => setActiveTaskId(null)} 
                      className="text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 font-bold transition-colors cursor-pointer"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <select
                  value={activeTaskId || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setActiveTaskId(val ? val : null);
                  }}
                  className="w-full bg-slate-900/60 border border-white/10 rounded-xl p-3 outline-none text-sm text-white focus:ring-1 focus:ring-primary-container cursor-pointer [color-scheme:dark]"
                >
                  <option value="">Ninguna (Enfoque Libre)</option>
                  {tasks.filter(t => !t.completed).map(t => (
                    <option key={t.id} value={t.id}>{t.title} ({t.progress || 0}/{t.sessions} ses.)</option>
                  ))}
                </select>

                {activeTaskId && tasks.find(t => t.id === activeTaskId) && (() => {
                  const activeTask = tasks.find(t => t.id === activeTaskId)!;
                  const pct = Math.min(100, (((activeTask.progress || 0) / (activeTask.sessions || 1)) * 100));
                  return (
                    <div className="space-y-2 pt-1 px-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="opacity-60 text-white">Progreso de Tarea:</span>
                        <span className="text-primary-container font-mono">{activeTask.progress || 0}/{activeTask.sessions} ses. ({Math.round(pct)}%)</span>
                      </div>
                      <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden relative">
                        <div 
                          className="bg-primary-container h-full transition-all duration-500 shadow-[0_0_10px_rgba(168,230,207,0.4)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
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
                    className={`flex-1 p-4 glass rounded-2xl flex flex-col items-center gap-2 group transition-all hover:bg-white/10 active:scale-95 cursor-pointer ${activeSound === 'Lluvia' && isAmbientSoundPlaying ? 'border-primary-container bg-white/10' : ''}`}
                  >
                    <CloudRain className={`w-6 h-6 ${activeSound === 'Lluvia' && isAmbientSoundPlaying ? 'text-primary-container animate-pulse' : 'text-secondary'}`} />
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-60 group-hover:opacity-100 italic">Lluvia</span>
                  </button>
                  <button 
                    onClick={() => selectSound('Café')}
                    className={`flex-1 p-4 glass rounded-2xl flex flex-col items-center gap-2 group transition-all hover:bg-white/10 active:scale-95 cursor-pointer ${activeSound === 'Café' && isAmbientSoundPlaying ? 'border-primary-container bg-white/10' : ''}`}
                  >
                    <Coffee className={`w-6 h-6 ${activeSound === 'Café' && isAmbientSoundPlaying ? 'text-primary-container animate-pulse' : 'text-[#c69c6d]'}`} />
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-60 group-hover:opacity-100 italic">Café</span>
                  </button>
                  <button 
                    onClick={() => setIsAmbientSoundPlaying(!isAmbientSoundPlaying)}
                    className={`p-4 glass rounded-2xl flex flex-col items-center justify-center gap-2 group transition-all hover:bg-white/10 active:scale-95 cursor-pointer ${isAmbientSoundPlaying ? 'border-primary-container text-primary-container bg-white/10' : 'text-on-surface-variant opacity-60'}`}
                    title={isAmbientSoundPlaying ? 'Silenciar atmósfera' : 'Reproducir atmósfera'}
                  >
                    {isAmbientSoundPlaying ? <Volume2 className="w-6 h-6 animate-pulse" /> : <VolumeX className="w-6 h-6" />}
                    <span className="text-[10px] uppercase tracking-widest font-semibold">{isAmbientSoundPlaying ? 'Suena' : 'Mudo'}</span>
                  </button>
                </div>
              </div>

              {/* Resumen Card */}
              <div className="w-full mt-8 p-6 glass rounded-3xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary-container/20 flex items-center justify-center">
                      <Flame className="w-6 h-6 text-primary-container fill-current" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Sesiones completadas</p>
                      <p className="text-2xl font-bold">
                        {activeTaskId && tasks.find(t => t.id === activeTaskId)
                          ? `${tasks.find(t => t.id === activeTaskId)?.progress || 0}/${tasks.find(t => t.id === activeTaskId)?.sessions}`
                          : `${sessionsCompleted}/8`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Objetivo</p>
                    <p className="text-sm font-bold text-primary-container truncate max-w-[150px]">
                      {activeTaskId && tasks.find(t => t.id === activeTaskId)
                        ? tasks.find(t => t.id === activeTaskId)?.title
                        : '8 diarias'
                      }
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mt-1">
                  <div 
                    className="bg-primary-container h-full transition-all duration-500 shadow-[0_0_10px_rgba(168,230,207,0.5)]"
                    style={{ 
                      width: `${
                        activeTaskId && tasks.find(t => t.id === activeTaskId)
                          ? Math.min(100, (((tasks.find(t => t.id === activeTaskId)?.progress || 0) / (tasks.find(t => t.id === activeTaskId)?.sessions || 1)) * 100))
                          : Math.min(100, ((sessionsCompleted / 8) * 100))
                      }%` 
                    }}
                  />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input 
                      type="date" 
                      value={taskDateInput}
                      onChange={(e) => setTaskDateInput(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm animate-none w-full"
                    />
                    <select 
                      value={taskDifficultyInput}
                      onChange={(e) => setTaskDifficultyInput(e.target.value as Task['difficulty'])}
                      className="bg-slate-900 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm [color-scheme:dark] w-full"
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
                        showToast("Por favor, llena la asignatura y la fecha.", "error");
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
                      className={`glass p-5 rounded-2xl border-l-4 ${task.difficulty === 'Alta' ? 'border-primary-container' : 'border-secondary'} flex flex-col gap-3 group hover:bg-white/5 transition-all relative`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-start gap-3">
                          <button 
                            onClick={() => toggleTask(task.id, task.completed)}
                            className={`p-1 rounded-full active:scale-90 transition-transform ${task.completed ? 'bg-primary-container/20 text-primary-container' : 'border border-white/20 text-on-surface-variant'}`}
                            title={task.completed ? "Marcar como incompleta" : "Marcar como completada"}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-container bg-primary-container/10 px-2 py-0.5 rounded-full">Esfuerzo {task.difficulty}</span>
                            <h4 className={`font-bold text-lg ${task.completed ? 'line-through opacity-40 text-white/50' : 'text-white'}`}>{task.title}</h4>
                          </div>
                        </div>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTask(task.id);
                          }}
                          className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all active:scale-90"
                          title="Eliminar tarea"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-2 border-t border-white/5 text-sm text-on-surface-variant">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-secondary" />
                            <span>{task.date}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Timer className="w-4 h-4 text-secondary shrink-0" />
                            <span>Sesiones: <strong className="text-white">{task.progress || 0}</strong>/{task.sessions}</span>
                          </div>
                        </div>

                        {!task.completed && (
                          activeTaskId === task.id ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-primary-container bg-primary-container/10 px-3 py-1 rounded-xl">
                              <span className="w-2 h-2 rounded-full bg-primary-container animate-ping" />
                              <span>Enfoque Activo</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveTaskId(task.id);
                                if (currentUserId) {
                                  localStorage.setItem(`studyzen_active_task_id_${currentUserId}`, task.id);
                                }
                                setActiveTab('focus');
                                showToast(`Enfocando en: ${task.title}`, 'info');
                              }}
                              className="px-3 py-1 text-xs font-bold rounded-xl bg-primary-container/10 text-primary-container hover:bg-primary-container/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            >
                              Seleccionar para Enfoque
                            </button>
                          )
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-1">
                        <div 
                          className="bg-primary-container h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, ((task.progress || 0) / task.sessions) * 100)}%` }}
                        />
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
                      <div className="relative mb-6">
                        <motion.div 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleAvatarClick}
                          className="w-32 h-32 rounded-full glass p-1 glow-primary relative cursor-pointer group"
                          title="Haz clic para cambiar tu foto de perfil"
                        >
                          <div className="w-full h-full rounded-full overflow-hidden border-2 border-primary-container/20 relative">
                            <img 
                              src={user.avatar} 
                              alt="Perfil" 
                              className="w-full h-full object-cover group-hover:brightness-50 transition-all duration-300"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                              <Camera className="w-6 h-6 text-white mb-1" />
                              <span className="text-[10px] text-white font-medium">Cambiar</span>
                            </div>
                          </div>
                        </motion.div>
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>
                      
                      <div className="text-center mt-2 flex flex-col items-center">
                        {isEditingName ? (
                          <div className="flex items-center gap-2 max-w-xs justify-center">
                            <input
                              type="text"
                              value={tempNameText}
                              onChange={(e) => setTempNameText(e.target.value)}
                              className="bg-white/5 border border-white/15 rounded-xl px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary-container text-white text-lg font-bold text-center w-48 font-sans"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  saveProfileNameDirectly(tempNameText);
                                  setIsEditingName(false);
                                } else if (e.key === 'Escape') {
                                  setIsEditingName(false);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                saveProfileNameDirectly(tempNameText);
                                setIsEditingName(false);
                              }}
                              className="p-2 bg-primary-container text-slate-900 rounded-xl hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setIsEditingName(false)}
                              className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 active:scale-95 transition-all text-on-surface-variant cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4 rotate-180" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 justify-center group/name">
                            <h2 className="text-2xl font-bold text-white">{user.name}</h2>
                            <button
                              onClick={() => {
                                setTempNameText(user.name);
                                setIsEditingName(true);
                              }}
                              className="p-1.5 opacity-40 group-hover/name:opacity-100 hover:bg-white/5 rounded-lg transition-all text-on-surface-variant cursor-pointer"
                              title="Editar nombre"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <p className="text-sm text-on-surface-variant font-medium mt-1">{user.email}</p>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3 mt-6 w-full px-2">
                        <div className="glass p-3 rounded-2xl text-center">
                          <p className="text-lg font-bold">{totalFocusMinutes}</p>
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
                          { label: 'Editar Perfil', sub: 'Cambia tu foto y nombre de usuario', icon: User, screen: 'profile-settings' },
                          { label: 'Tiempo de Enfoque', sub: 'Modifica tu duración de enfoque', icon: Timer, screen: 'session-settings' },
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
                    <h3 className="text-2xl font-bold">Editar Perfil</h3>
                    
                    <div className="glass p-6 rounded-3xl space-y-6">
                      {/* Foto de Perfil en Configuración */}
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-xs font-bold uppercase tracking-widest opacity-70">Foto de Perfil</span>
                        <div className="relative">
                          <div 
                            onClick={handleAvatarClick}
                            className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary-container/20 relative cursor-pointer hover:brightness-90 transition-all group animate-none"
                          >
                            <img 
                              src={user.avatar} 
                              alt="Perfil" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Camera className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={handleAvatarClick}
                          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        >
                          Elegir Nueva Foto
                        </button>
                      </div>

                      {/* Nombre en Configuración */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-70 block px-1">Nombre de Usuario</label>
                        <input 
                          type="text" 
                          value={editProfileName}
                          onChange={(e) => setEditProfileName(e.target.value)}
                          placeholder="Tu nombre"
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container text-white transition-all text-sm"
                        />
                      </div>

                      <button 
                        onClick={() => {
                          if (editProfileName.trim()) {
                            saveProfileChanges(editProfileName);
                          } else {
                            showToast("El nombre no puede estar vacío.", "error");
                          }
                        }}
                        className="w-full py-3 bg-primary-container text-slate-900 font-bold rounded-xl hover:scale-[1.02] active:scale-95 transition-all cursor-pointer text-sm"
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
                    <h3 className="text-2xl font-bold">Configurar Enfoque</h3>
                    <div className="glass p-6 rounded-3xl space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-bold uppercase tracking-widest opacity-70">Tiempo de Enfoque</label>
                          <span className="text-primary-container font-bold">{sessionConfig.focusTime} min</span>
                        </div>
                        <input 
                          type="range" min="1" max="60" 
                          value={sessionConfig.focusTime} 
                          onChange={(e) => updateSessionConfig('focusTime', parseInt(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-container"
                        />
                      </div>
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
                    className="space-y-6 max-h-[70vh] overflow-y-auto pb-12 pr-1 scrollbar-thin"
                  >
                    <button onClick={() => setActiveSubScreen('none')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-container transition-colors cursor-pointer">
                      <ChevronRight className="w-5 h-5 rotate-180" />
                      <span>Volver al perfil</span>
                    </button>
                    <h3 className="text-2xl font-bold">Biblioteca de Sonidos</h3>
                    
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold opacity-60 px-1">Atmósferas Incorporadas</h4>
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
                    </div>

                    {/* Sonidos Personalizados */}
                    <div className="space-y-3 mt-6">
                      <h4 className="text-sm font-bold opacity-60 px-1">Tus Sonidos y Música</h4>
                      {customSounds.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic px-1">No tienes sonidos personalizados agregados aún.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {customSounds.map((sound) => (
                            <div 
                              key={sound.id}
                              onClick={() => selectSound(sound.name)}
                              className={`glass p-5 rounded-3xl flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] ${activeSound === sound.name ? 'border-primary-container bg-white/10' : 'hover:bg-white/5'}`}
                            >
                              <div className="flex items-center gap-4 min-w-0">
                                <div 
                                  className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary-container/10 text-primary-container shrink-0"
                                >
                                  <Music className="w-6 h-6" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold truncate">{sound.name}</p>
                                  <p className="text-[10px] opacity-50 truncate">
                                    {sound.isLocal ? 'Archivo de audio local (Persistente)' : sound.url.startsWith('data:') ? 'Archivo de audio local' : sound.url}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {activeSound === sound.name && <CheckCircle2 className="w-5 h-5 text-primary-container" />}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (activeSound === sound.name) {
                                      stopAmbientSound();
                                      setActiveSound('Lluvia');
                                      if (currentUserId) {
                                        await updateDoc(doc(db, 'users', currentUserId), { activeSound: 'Lluvia' });
                                      }
                                    }
                                    if (sound.isLocal) {
                                      await deleteLocalAudio(sound.id);
                                    }
                                    const updatedList = customSounds.filter(s => s.id !== sound.id);
                                    setCustomSounds(updatedList);
                                    if (currentUserId) {
                                      localStorage.setItem(`studyzen_custom_sounds_${currentUserId}`, JSON.stringify(updatedList));
                                      try {
                                        await updateDoc(doc(db, 'users', currentUserId), {
                                          customSounds: updatedList
                                        });
                                        showToast("Sonido eliminado de tu biblioteca.", "success");
                                      } catch (err) {
                                        showToast("No se pudo eliminar el sonido de la nube.", "error");
                                      }
                                    }
                                  }}
                                  className="p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                                  title="Eliminar sonido"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Formulario / Botón para Agregar Sonidos */}
                    <div className="mt-6">
                      {!showAddSoundForm ? (
                        <button 
                          onClick={() => setShowAddSoundForm(true)}
                          className="w-full py-4 border border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/5 active:scale-95 transition-all text-sm font-bold tracking-wider text-primary-container cursor-pointer"
                        >
                          <Plus className="w-5 h-5" />
                          AGREGAR SONIDO O MÚSICA
                        </button>
                      ) : (
                        <div className="glass p-5 rounded-3xl space-y-4">
                          <h4 className="font-bold text-sm">Nuevo Sonido o Música</h4>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest opacity-50">Nombre del Sonido</label>
                            <input 
                              type="text"
                              value={newSoundName}
                              onChange={(e) => setNewSoundName(e.target.value)}
                              placeholder="Ej. Lofi Chill, Ruido Mar, Clásica..."
                              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none text-white text-sm"
                            />
                          </div>

                          <div className="flex gap-2 p-1 bg-white/5 rounded-xl text-xs">
                            <button
                              type="button"
                              onClick={() => { setNewSoundType('url'); setNewSoundUrl(''); }}
                              className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${newSoundType === 'url' ? 'bg-primary-container text-slate-900' : 'opacity-60 hover:opacity-100'}`}
                            >
                              <Link className="w-3.5 h-3.5" />
                              Por Enlace URL
                            </button>
                            <button
                              type="button"
                              onClick={() => { setNewSoundType('upload'); setNewSoundUrl(''); }}
                              className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${newSoundType === 'upload' ? 'bg-primary-container text-slate-900' : 'opacity-60 hover:opacity-100'}`}
                            >
                              <Upload className="w-3.5 h-3.5" />
                              Subir Archivo
                            </button>
                          </div>

                          {newSoundType === 'url' ? (
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Enlace de Audio (URL)</label>
                              <input 
                                type="text"
                                value={newSoundUrl}
                                onChange={(e) => setNewSoundUrl(e.target.value)}
                                placeholder="https://ejemplo.com/audio.mp3"
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none text-white text-sm"
                              />
                              <p className="text-[10px] opacity-40">Introduce un enlace directo de streaming, lo-fi radio o archivo mp3 de la web.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Seleccionar Archivo de Audio</label>
                              <div className="relative w-full h-24 border border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-white/5 transition-colors cursor-pointer overflow-hidden">
                                <Upload className="w-6 h-6 opacity-60" />
                                <span className="text-xs font-medium opacity-60">Subir loop o canción (máx. 15MB, mp3/wav/ogg)</span>
                                <input 
                                  type="file" 
                                  accept="audio/*"
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      if (file.size > 15 * 1024 * 1024) {
                                        showToast("El archivo excede los 15MB permitidos.", "error");
                                        return;
                                      }
                                      const tempId = Math.random().toString(36).substring(2, 9);
                                      try {
                                        await saveLocalAudio(tempId, file);
                                        setNewSoundUrl(`local://${tempId}`);
                                        localSoundIdRef.current = tempId;
                                        showToast("¡Archivo de audio cargado con éxito!", "success");
                                      } catch (err) {
                                        console.error("No se pudo guardar el audio localmente:", err);
                                        showToast("Error al guardar el archivo de audio localmente en el dispositivo.", "error");
                                      }
                                    }
                                  }}
                                />
                                {newSoundUrl.startsWith('local://') && (
                                  <div className="absolute inset-0 bg-primary-container text-slate-900 flex flex-col items-center justify-center text-xs font-bold">
                                    <CheckCircle2 className="w-6 h-6 text-slate-900 mb-1" />
                                    ¡Archivo de loop/canción listo localmente!
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <button 
                              onClick={() => setShowAddSoundForm(false)}
                              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all cursor-pointer text-xs uppercase"
                            >
                              Cancelar
                            </button>
                            <button 
                              onClick={handleAddCustomSound}
                              className="flex-1 py-3 bg-primary-container text-slate-900 font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-xs uppercase"
                            >
                              Guardar Sonido
                            </button>
                          </div>
                        </div>
                      )}
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
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 left-6 right-6 md:left-auto md:right-6 md:max-w-sm z-50 p-4 rounded-2xl glass border border-white/20 shadow-2xl flex items-center gap-3"
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-primary-container shadow-[0_0_8px_#a8e6cf]' : toast.type === 'error' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-blue-400 shadow-[0_0_8px_#60a5fa]'}`} />
            <p className="text-sm font-bold tracking-tight text-white">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
