/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from 'react';
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

// --- Componente Principal ---

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    const saved = localStorage.getItem('studyzen_auth');
    return (saved as AuthMode) || 'login';
  });
  
  const [activeTab, setActiveTab] = useState<Tab>('focus');
  const [activeSubScreen, setActiveSubScreen] = useState<SubScreen>('none');
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('studyzen_user');
    return saved ? JSON.parse(saved) : {
      name: 'Diego Elio',
      email: 'diego@studyzen.io',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&h=200&auto=format&fit=crop',
      joinDate: 'Abril 2024'
    };
  });

  const [sessionConfig, setSessionConfig] = useState<SessionConfig>(() => {
    const saved = localStorage.getItem('studyzen_config');
    return saved ? JSON.parse(saved) : {
      focusTime: 25,
      shortBreak: 5,
      longBreak: 15
    };
  });

  const [activeSound, setActiveSound] = useState('Lluvia');

  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('studyzen_tasks');
    return saved ? JSON.parse(saved) : [
      { id: '1', title: 'Proyecto de Integrales', date: '2024-10-15', difficulty: 'Alta', sessions: 4, completed: false },
      { id: '2', title: 'Ensayo Modernismo', date: '2024-10-18', difficulty: 'Media', sessions: 2, completed: false },
    ];
  });

  // Estado del Temporizador
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  // Perfil y Modales
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Persistencia
  useEffect(() => {
    localStorage.setItem('studyzen_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('studyzen_auth', authMode);
    localStorage.setItem('studyzen_user', JSON.stringify(user));
    localStorage.setItem('studyzen_config', JSON.stringify(sessionConfig));
  }, [authMode, user, sessionConfig]);

  // Actualizar tiempo cuando cambie la config
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

  const handleTimerComplete = () => {
    setIsActive(false);
    if (!isBreak) {
      setSessionsCompleted((prev) => prev + 1);
      alert('¡Sesión terminada! Tómate un descanso.');
      const nextBreak = (sessionsCompleted + 1) % 4 === 0 ? sessionConfig.longBreak : sessionConfig.shortBreak;
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

  // --- Lógica de Tareas ---
  const addTask = (title: string, date: string, difficulty: Task['difficulty']) => {
    if (!title || !date) return;
    const newTask: Task = {
      id: Date.now().toString(),
      title,
      date,
      difficulty,
      sessions: difficulty === 'Alta' ? 5 : difficulty === 'Media' ? 3 : 1,
      completed: false
    };
    setTasks([newTask, ...tasks]);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  // --- Lógica de Perfil ---
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUser(prev => ({ ...prev, avatar: reader.result as string }));
        alert('¡Foto de perfil actualizada con éxito!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    const confirmLogout = window.confirm('¿Estás seguro de que deseas cerrar sesión?');
    if (confirmLogout) {
      setAuthMode('login');
      setIsActive(false);
    }
  };

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
            <p className="text-on-surface-variant italic">Tu santuario digital de productividad</p>
          </div>

          <div className="glass p-8 rounded-3xl space-y-6">
            <h2 className="text-xl font-bold">{authMode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h2>
            
            <div className="space-y-4">
              {authMode === 'register' && (
                <div className="relative">
                  <User className="absolute left-3 top-3 w-5 h-5 text-on-surface-variant opacity-50" />
                  <input type="text" placeholder="Nombre completo" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 outline-none focus:ring-1 focus:ring-primary-container transition-all" />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-on-surface-variant opacity-50" />
                <input type="email" placeholder="Correo electrónico" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 outline-none focus:ring-1 focus:ring-primary-container transition-all" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-on-surface-variant opacity-50" />
                <input type="password" placeholder="Contraseña" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pl-10 outline-none focus:ring-1 focus:ring-primary-container transition-all" />
              </div>
            </div>

            <button 
              onClick={() => setAuthMode('loggedIn')}
              className="w-full py-4 bg-gradient-to-r from-primary-container to-secondary rounded-2xl text-slate-900 font-bold active:scale-[0.98] transition-all"
            >
              {authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse'}
            </button>

            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-on-surface-variant">
                {authMode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
              </span>
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-primary-container font-bold hover:underline"
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
            onClick={() => setActiveTab('profile')}
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
                  Tu santuario de productividad
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
                    className="flex-1 py-4 bg-gradient-to-r from-primary-container to-secondary rounded-2xl text-slate-900 font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {isActive ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    {isActive ? 'Pausar Sesión' : 'Iniciar Sesión'}
                  </button>
                  <button 
                    onClick={resetTimer}
                    className="p-4 glass rounded-2xl active:scale-95 transition-all text-on-surface-variant"
                  >
                    <RefreshCw className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={() => setActiveSound('Lluvia')}
                    className={`flex-1 p-4 glass rounded-2xl flex flex-col items-center gap-2 group transition-all hover:bg-white/10 active:scale-95 ${activeSound === 'Lluvia' ? 'border-primary-container bg-white/5' : ''}`}
                  >
                    <CloudRain className={`w-6 h-6 ${activeSound === 'Lluvia' ? 'text-primary-container' : 'text-secondary'}`} />
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-60 group-hover:opacity-100 italic">Lluvia</span>
                  </button>
                  <button 
                    onClick={() => setActiveSound('Café')}
                    className={`flex-1 p-4 glass rounded-2xl flex flex-col items-center gap-2 group transition-all hover:bg-white/10 active:scale-95 ${activeSound === 'Café' ? 'border-primary-container bg-white/5' : ''}`}
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
                      className="bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all"
                    />
                    <select 
                      id="dificultadInput"
                      className="bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary-container transition-all"
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
                      addTask(m.value, f.value, d.value as Task['difficulty']);
                      m.value = ''; f.value = '';
                    }}
                    className="w-full py-3 bg-primary-container text-slate-900 font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2"
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
                {tasks.map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => toggleTask(task.id)}
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
                ))}
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
                <p className="text-on-surface-variant italic">Tu rendimiento cognitivo.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="glass p-5 rounded-3xl flex flex-col justify-between h-32 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity bg-primary-container rounded-bl-3xl">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-primary-container">+12% vs SP</span>
                  <div>
                    <p className="text-3xl font-bold">{sessionsCompleted + 40}</p>
                    <p className="text-xs font-semibold opacity-50 uppercase tracking-widest">Completadas</p>
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
                          <p className="text-xl font-bold">128</p>
                          <p className="text-[10px] uppercase tracking-widest font-bold opacity-50">Horas Focus</p>
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
                      className="w-full py-4 text-red-500 font-bold flex items-center justify-center gap-3 hover:bg-red-500/5 rounded-2xl transition-colors"
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
                    <button onClick={() => setActiveSubScreen('none')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-container transition-colors">
                      <ChevronRight className="w-5 h-5 rotate-180" />
                      <span>Volver al perfil</span>
                    </button>
                    <h3 className="text-2xl font-bold">Ajustes de Perfil</h3>
                    <div className="glass p-6 rounded-3xl space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-50 px-1">Nombre</label>
                        <input 
                          type="text" 
                          value={user.name} 
                          onChange={(e) => setUser({...user, name: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:ring-1 focus:ring-primary-container"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-50 px-1">Correo Electrónico</label>
                        <input 
                          type="email" 
                          value={user.email} 
                          onChange={(e) => setUser({...user, email: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none focus:ring-1 focus:ring-primary-container"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          alert('¡Cambios guardados con éxito!');
                          setActiveSubScreen('none');
                        }}
                        className="w-full py-4 bg-primary-container text-slate-900 font-bold rounded-xl active:scale-95 transition-all"
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
                    <button onClick={() => setActiveSubScreen('none')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-container transition-colors">
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
                            onChange={(e) => setSessionConfig({...sessionConfig, [item.key]: parseInt(e.target.value)})}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-container"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-on-surface-variant italic text-center px-4">
                        El tiempo de enfoque se aplicará a tu próxima sesión.
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
                    <button onClick={() => setActiveSubScreen('none')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary-container transition-colors">
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
                          onClick={() => setActiveSound(sound.name)}
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
              className={`flex flex-col items-center gap-1 transition-all duration-300 relative px-4 ${activeTab === tab.id ? 'text-primary-container scale-110' : 'text-on-surface-variant opacity-40 hover:opacity-100'}`}
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
