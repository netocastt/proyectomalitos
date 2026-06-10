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
  UserPlus
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

  // Estados de carga e inputs de autenticación
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Perfil y Modales
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Escribir un perfil predeterminado o leerlo al iniciar sesión
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setAuthError(null);
      if (firebaseUser) {
        setCurrentUserId(firebaseUser.uid);
        setAuthMode('loggedIn');
        
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            setUser({
              name: data.name || firebaseUser.displayName || 'Estudiante Zen',
              email: data.email || firebaseUser.email || '',
              avatar: data.avatar || firebaseUser.photoURL || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
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
          } else {
            // Generar valores iniciales para un nuevo usuario
            const initialProfile: UserProfile = {
              name: firebaseUser.displayName || nameInput || 'Estudiante Zen',
              email: firebaseUser.email || '',
              avatar: firebaseUser.photoURL || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
              joinDate: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })
            };
            
            await setDoc(userDocRef, {
              ...initialProfile,
              focusTime: 25,
              shortBreak: 5,
              longBreak: 15,
              sessionsCompleted: 0,
              activeSound: 'Lluvia'
            });
            
            setUser(initialProfile);
            setSessionConfig({ focusTime: 25, shortBreak: 5, longBreak: 15 });
          }
        } catch (err) {
          console.error("Error al inicializar perfil del usuario en Firestore:", err);
        }
      } else {
        setCurrentUserId(null);
        setAuthMode('login');
        setTasks([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const handleTimerComplete = async () => {
    setIsActive(false);
    if (!isBreak) {
      const nextSessions = sessionsCompleted + 1;
      setSessionsCompleted(nextSessions);
      
      // Persistir incremento de sesiones en Firestore
      if (currentUserId) {
        try {
          await updateDoc(doc(db, 'users', currentUserId), {
            sessionsCompleted: nextSessions
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}`);
        }
      }
      
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
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Avatar = reader.result as string;
        setUser(prev => ({ ...prev, avatar: base64Avatar }));
        
        if (currentUserId) {
          try {
            await updateDoc(doc(db, 'users', currentUserId), {
              avatar: base64Avatar
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}`);
          }
        }
        alert('¡Foto de perfil actualizada con éxito!');
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
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUserId}`);
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
      if (error.code === 'auth/operation-not-allowed') {
        setAuthError("El proveedor de Correo/Contraseña no está habilitado en Firebase. Por favor actívalo en el panel del proyecto o inicia con Google.");
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
      if (error.code === 'auth/operation-not-allowed') {
        setAuthError("El proveedor de Correo/Contraseña no está habilitado en Firebase. Por favor actívalo en el panel o inicia con Google.");
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
                    id="materiaInput"
                    placeholder="Asignatura o Proyecto" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="date" 
                      id="fechaInput"
                      className="bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm"
                    />
                    <select 
                      id="dificultadInput"
                      className="bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all text-sm"
                    >
                      <option value="Baja">Relajado</option>
                      <option value="Media">Media</option>
                      <option value="Alta">Trabajo Profundo</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => {
                      const m = document.getElementById('materiaInput') as HTMLInputElement;
                      const f = document.getElementById('fechaInput') as HTMLInputElement;
                      const d = document.getElementById('dificultadInput') as HTMLSelectElement;
                      if (m.value && f.value) {
                        addTask(m.value, f.value, d.value as Task['difficulty']);
                        m.value = ''; f.value = '';
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
                  <span className="text-xs font-bold uppercase tracking-widest text-primary-container">+12% vs SP</span>
                  <div>
                    <p className="text-3xl font-bold">{sessionsCompleted}</p>
                    <p className="text-xs font-semibold opacity-50 uppercase tracking-widest">Sesiones Completes</p>
                  </div>
                </div>
                <div className="glass p-5 rounded-3xl flex flex-col justify-between h-32 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity bg-secondary rounded-bl-3xl">
                    <Flame className="w-12 h-12" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-secondary">Flujo Élite</span>
                  <div>
                    <p className="text-3xl font-bold">15 Días</p>
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
                  <div className="flex gap-2 text-[10px] font-bold">
                    <button className="px-3 py-1 glass rounded-lg">SEMANA</button>
                    <button className="px-3 py-1 bg-primary-container text-slate-900 rounded-lg">MES</button>
                  </div>
                </div>
                <div className="h-40 flex items-end justify-between gap-2 px-2">
                  {[40, 85, 65, 95, 55, 30, 20].map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-3">
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: `${val}%` }}
                        transition={{ delay: i * 0.1, duration: 1 }}
                        className={`w-full rounded-t-lg relative group ${val > 70 ? 'bg-primary-container/40' : 'bg-white/10'}`}
                      >
                        <div className={`absolute inset-0 rounded-t-lg transition-opacity group-hover:opacity-100 opacity-60 ${val > 70 ? 'bg-primary-container shadow-[0_0_15px_rgba(168,230,207,0.3)]' : 'bg-white/20'}`}></div>
                      </motion.div>
                      <span className="text-[10px] font-bold opacity-30">{'LM MJVSD'[i]}</span>
                    </div>
                  ))}
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
                      <h2 className="text-2xl font-bold">{user.name}</h2>
                      <p className="text-xs uppercase tracking-[0.3em] font-bold text-primary-container mt-1">Miembro Zenith Pro</p>
                      
                      <div className="flex gap-4 mt-6">
                        <div className="glass px-6 py-3 rounded-2xl text-center">
                          <p className="text-xl font-bold">{sessionsCompleted * 25}</p>
                          <p className="text-[10px] uppercase tracking-widest font-bold opacity-50">Minutos Focus</p>
                        </div>
                        <div className="glass px-6 py-3 rounded-2xl text-center">
                          <p className="text-xl font-bold">15</p>
                          <p className="text-[10px] uppercase tracking-widest font-bold opacity-50">Mejor Racha</p>
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

                    <div className="relative overflow-hidden rounded-3xl p-6 border border-primary-container/30 bg-gradient-to-br from-primary-container/10 to-transparent flex flex-col items-center text-center gap-4 group">
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-container/10 blur-3xl"></div>
                      <h4 className="text-xl font-bold text-primary-container">Zenith Platinum</h4>
                      <p className="text-sm opacity-70">Desbloquea análisis avanzados y paisajes sonoros exclusivos.</p>
                      <button className="w-full py-3 bg-primary-container text-slate-900 font-bold rounded-xl uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all">
                        Gestionar Membresía
                      </button>
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
                          id="editProfileName"
                          defaultValue={user.name}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:ring-1 focus:ring-primary-container"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-50 px-1">Correo Electrónico</label>
                        <input 
                          type="email" 
                          id="editProfileEmail"
                          defaultValue={user.email}
                          disabled
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none opacity-50 cursor-not-allowed"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          const n = (document.getElementById('editProfileName') as HTMLInputElement).value;
                          const e = (document.getElementById('editProfileEmail') as HTMLInputElement).value;
                          if (n) {
                            saveProfileChanges(n, e);
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
