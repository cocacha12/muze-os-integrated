import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { AuditView } from './components/AuditView'
import { Sun, Moon, Hexagon, ArrowRight, Activity, Command, LayoutDashboard, Briefcase, Target, FileText, CheckCircle2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { EmptyState } from './components/EmptyState'
// ... (helpers and App component remain unchanged)
// To keep the replace tool focused, I will use multi_replace for specific functions instead of trying to replace from the top imports down to HomeView, which is too large of a block.

// Formatting helpers
const CLP = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n || 0));

function App() {
    const [view, setView] = useState('home'); // home, operations, finance, commercial, executive, audit
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState('dark');
    const [stats, setStats] = useState({
        open: 0,
        inProgress: 0,
        blocked: 0,
        revenue: 0,
        health: 'ok',
        lag: '12'
    });

    useEffect(() => {
        checkUser();
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    useEffect(() => {
        if (user) {
            fetchDashboardData();
        }
    }, [user, view]);

    async function checkUser() {
        try {
            const res = await supabase.auth.getSession();
            const session = res?.data?.session;
            if (session) {
                setUser({ name: session.user.email.split('@')[0], role: 'admin' });
            } else {
                setUser({ name: 'Mark', role: 'admin' });
            }
        } catch (e) {
            console.error("Auth check failed:", e);
            setUser({ name: 'Mark', role: 'admin' });
        } finally {
            setLoading(false);
        }
    }

    async function fetchDashboardData() {
        try {
            const { data: tasks } = await supabase.from('tasks').select('status');
            const open = tasks?.filter(t => t.status === 'todo').length || 0;
            const inProgress = tasks?.filter(t => t.status === 'in_progress').length || 0;
            const blocked = tasks?.filter(t => t.status === 'blocked').length || 0;

            const { data: revData } = await supabase.from('finance_revenues').select('net');
            const revenue = revData?.reduce((acc, r) => acc + (r.net || 0), 0) || 0;

            setStats(prev => ({ ...prev, open, inProgress, blocked, revenue }));
        } catch (e) {
            console.error("Dashboard error:", e);
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <div className="text-primary font-black uppercase tracking-[0.2em] text-xs">Loading Muze OS...</div>
            </div>
        </div>
    );

    if (!user) {
        return (
            <div id="auth" className="fixed inset-0 bg-background/80 backdrop-blur-xl flex items-center justify-center z-[99]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="card w-[360px] flex flex-col gap-4"
                >
                    <div className="flex flex-col items-center mb-4">
                        <img src="/muze-logo.svg" alt="Muze OS" className="h-12 w-auto mb-4 drop-shadow-[0_0_15px_rgba(38,204,192,0.3)]" />
                        <h2 className="text-2xl font-black tracking-tight">Login Muze OS</h2>
                    </div>
                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Username</label>
                        <input className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary focus-visible:outline-none transition-all" placeholder="mark" defaultValue="mark" />
                        <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Password</label>
                        <input className="w-full px-4 py-3 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary focus-visible:outline-none transition-all" placeholder="••••••••" type="password" />
                    </div>
                    <button
                        onClick={() => setUser({ name: 'Mark', role: 'admin' })}
                        className="mt-4 bg-primary text-primary-foreground font-black py-3 rounded-xl cursor-pointer hover:scale-[1.02] hover:shadow-primary/40 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-primary"
                    >
                        Acceder
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen premium-gradient transition-colors duration-500`}>
            <main className="wrap">
                <header className="flex justify-between items-center gap-4 flex-wrap mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-xl border border-primary/20 shadow-inner">
                            <img src="/muze-logo-iso.svg" alt="Muze" className="w-8 h-8 object-contain" />
                        </div>
                        <h1 className="text-2xl font-black flex flex-col leading-none tracking-tight">
                            Muze OS
                            <span className="text-[10px] text-primary uppercase tracking-[0.2em] font-black">{view} view</span>
                        </h1>
                    </div>

                    <nav className="flex items-center gap-1 p-1 bg-secondary rounded-2xl border border-border shadow-inner">
                        <NavBtn active={view === 'home'} label="Home" onClick={() => setView('home')} />
                        <NavBtn active={view === 'operations'} label="Operations" onClick={() => setView('operations')} />
                        <NavBtn active={view === 'finance'} label="Finance" onClick={() => setView('finance')} />
                        <NavBtn active={view === 'commercial'} label="Commercial" onClick={() => setView('commercial')} />
                        <NavBtn active={view === 'audit'} label="Audit" onClick={() => setView('audit')} />
                        <div className="w-px h-4 bg-border mx-1" />
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-background/50 hover:shadow-sm transition-all text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            aria-label="Toggle theme"
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                    </nav>
                </header>

                <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-black text-xs shadow-lg shadow-primary/20">M</div>
                        <div>
                            <div className="text-xs font-black leading-none">{user.name}</div>
                            <div className="text-[10px] text-muted-foreground uppercase font-bold">{user.role}</div>
                        </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                        Server: production-us-west
                    </div>
                </div>

                <div className="flex-1 relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={view}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="w-full"
                        >
                            {view === 'home' && <HomeView stats={stats} user={user} setView={setView} />}
                            {view === 'finance' && <FinanceView user={user} setView={setView} />}
                            {view === 'commercial' && <CommercialView user={user} setView={setView} />}
                            {view === 'operations' && <OperationsView user={user} setView={setView} />}
                            {view === 'audit' && <AuditView user={user} />}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* AI Chat layer */}
                <DirectorChat />
            </main>
        </div>
    )
}

function NavBtn({ active, label, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${active
                ? 'bg-background text-foreground shadow-sm scale-[1.02]'
                : 'text-muted-foreground hover:text-foreground'
                }`}
        >
            {label}
        </button>
    )
}

function HomeView({ stats, user, setView }) {
    return (
        <div className="space-y-6">
            <section className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <StatCard label="Open Tasks" value={stats.open} />
                <StatCard label="In Progress" value={stats.inProgress} />
                <StatCard label="Blocked" value={stats.blocked} color="text-destructive" />
                <StatCard label="Facturado Neto" value={CLP(stats.revenue)} />
                <StatCard label="Sync Health" value={stats.health === 'ok' ? `🟢 OK · ${stats.lag}s` : '🔴 Warn'} />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ModuleCard
                    title="Execution (Operations)"
                    desc="Tablero Kanban, owners, deadlines y seguimiento de tareas."
                    icon={Activity}
                    onClick={() => setView('operations')}
                />
                <ModuleCard
                    title="Finance"
                    desc="Ingresos, IVA, costos, gastos, utilidad e impuesto estimado."
                    icon={Briefcase}
                    onClick={() => setView('finance')}
                />
                <ModuleCard
                    title="Commercial"
                    desc="Pipeline comercial, cotizaciones y actividad de cierre."
                    icon={Target}
                    onClick={() => setView('commercial')}
                />
            </section>
        </div>
    );
}

function TaskDetail({ task, onClose }) {
    const [activeTab, setActiveTab] = useState('updates');
    const [updates, setUpdates] = useState([]);
    const [files, setFiles] = useState([]);
    const [activity, setActivity] = useState([]);
    const [newUpdate, setNewUpdate] = useState('');

    useEffect(() => {
        if (task) {
            fetchTaskDetails();
        }
    }, [task]);

    async function fetchTaskDetails() {
        const { data: u } = await supabase.from('task_updates').select('*').eq('task_id', task.id).order('created_at', { ascending: false });
        const { data: f } = await supabase.from('task_files').select('*').eq('task_id', task.id).order('created_at', { ascending: false });
        const { data: a } = await supabase.from('task_activity').select('*').eq('task_id', task.id).order('created_at', { ascending: false });

        setUpdates(u || []);
        setFiles(f || []);
        setActivity(a || []);
    }

    async function postUpdate() {
        if (!newUpdate.trim()) return;
        const { error } = await supabase.from('task_updates').insert([{
            task_id: task.id,
            content: newUpdate,
            author_id: 'Mark' // Mocked current user
        }]);
        if (!error) {
            setNewUpdate('');
            fetchTaskDetails();
        }
    }

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed inset-y-0 right-0 w-full md:w-[500px] bg-background border-l border-border shadow-2xl z-50 flex flex-col"
        >
            <div className="p-6 border-b border-border flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase bg-primary/20 text-primary px-2 py-1 rounded-full">{task.priority}</span>
                        <Badge status={task.status} />
                    </div>
                    <h2 className="text-xl font-black tracking-tight">{task.title}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{task.objective}</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="flex p-2 gap-1 border-b border-border bg-white/5">
                {['updates', 'files', 'activity'].map(t => (
                    <button
                        key={t}
                        onClick={() => setActiveTab(t)}
                        className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-white'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'updates' && (
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <textarea
                                value={newUpdate}
                                onChange={(e) => setNewUpdate(e.target.value)}
                                placeholder="Escribe una actualización..."
                                className="w-full bg-white/5 border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all min-h-[100px]"
                            />
                            <button
                                onClick={postUpdate}
                                className="w-full bg-primary text-primary-foreground py-2 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
                            >
                                Publicar Actualización
                            </button>
                        </div>
                        <div className="space-y-4">
                            {updates.map(upd => (
                                <div key={upd.id} className="card p-4 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="font-black text-[10px] uppercase text-primary">{upd.author_id}</span>
                                        <span className="text-[9px] text-muted-foreground uppercase">{new Date(upd.created_at).toLocaleString()}</span>
                                    </div>
                                    <p className="text-sm leading-relaxed">{upd.content}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'files' && (
                    <div className="grid grid-cols-2 gap-4">
                        {files.length === 0 ? (
                            <div className="col-span-2 py-12 text-center text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">No hay archivos adjuntos</div>
                        ) : files.map(file => (
                            <div key={file.id} className="card p-3 flex flex-col gap-2 group cursor-pointer hover:border-primary/50 transition-colors">
                                <div className="aspect-square bg-white/5 rounded-lg flex items-center justify-center text-primary/40 group-hover:text-primary transition-colors">
                                    <FileText size={32} strokeWidth={1} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-[10px] truncate">{file.name}</span>
                                    <span className="text-[8px] text-muted-foreground uppercase">{file.type} · {(file.size / 1024).toFixed(1)} KB</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="space-y-4">
                        {activity.map(act => (
                            <div key={act.id} className="flex gap-4 items-start">
                                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(38,204,192,0.8)]" />
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs font-bold leading-none">
                                        <span className="text-primary font-black uppercase text-[9px] mr-2">{act.actor}</span>
                                        {act.action === 'status_changed' ? `cambió el estado a ${act.details?.new}` : act.action}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground uppercase">{new Date(act.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function StatCard({ label, value, color = "" }) {
    return (
        <div className="card flex flex-col justify-between">
            <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{label}</div>
            <div className={`text-2xl font-black mt-2 ${color}`}>{value}</div>
        </div>
    )
}

function ModuleCard({ title, desc, icon: Icon, onClick }) {
    return (
        <button
            className="card cursor-pointer group text-left relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background transition-all duration-300 hover:-translate-y-1"
            onClick={onClick}
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10 group-hover:scale-110 transition-transform duration-500" />
            {Icon && (
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 text-primary border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-[0_0_20px_rgba(38,204,192,0.4)] transition-all duration-300">
                    <Icon className="w-6 h-6" strokeWidth={1.5} />
                </div>
            )}
            <h3 className="text-xl font-black mb-2 group-hover:text-primary transition-colors tracking-tight">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8 pr-4">{desc}</p>
            <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest mt-auto opacity-80 group-hover:opacity-100 transition-opacity">
                Abrir Módulo
                <ArrowRight className="w-3 h-3 group-hover:translate-x-2 transition-transform duration-300" strokeWidth={3} />
            </div>
        </button>
    )
}

function OperationsView({ user, setView }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [activeTab, setActiveTab] = useState('kanban');
    const [selectedTask, setSelectedTask] = useState(null);

    useEffect(() => { fetchTasks(); }, []);

    async function fetchTasks() {
        const { data } = await supabase.from('tasks').select('*').order('due_date', { ascending: true });
        setTasks(data || []);
        setLoading(false);
    }

    const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
    tasks.forEach(t => counts[t.status] = (counts[t.status] || 0) + 1);

    const filteredTasks = tasks.filter(t => !filter || t.owner_id === filter);
    const owners = [...new Set(tasks.map(t => t.owner_id))].filter(Boolean).sort();

    if (loading) return null;

    const kanbanStatuses = ['todo', 'in_progress', 'blocked', 'done'];

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-black m-0 font-display">Operations</h2>
                    <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-3 py-1 rounded-full font-black uppercase tracking-widest">
                        {counts.in_progress} Activas
                    </span>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="glass-card flex p-1 rounded-xl">
                        <button
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'kanban' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-white'}`}
                            onClick={() => setActiveTab('kanban')}
                        >
                            Kanban
                        </button>
                        <button
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'list' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-white'}`}
                            onClick={() => setActiveTab('list')}
                        >
                            Executive
                        </button>
                    </div>

                    <div className="card flex gap-4 p-2 px-4 items-center text-[10px] font-black uppercase">
                        <span className="text-muted-foreground tracking-widest">Responsable</span>
                        <select
                            className="bg-transparent border-none outline-none text-primary cursor-pointer hover:underline"
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        >
                            <option value="">Todos</option>
                            {owners.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Open" value={counts.todo + counts.in_progress + counts.blocked} />
                <StatCard label="In Progress" value={counts.in_progress} color="text-primary" />
                <StatCard label="Blocked" value={counts.blocked} color="text-destructive" />
                <StatCard label="Completed" value={counts.done} color="text-emerald-500" />
            </section>

            {activeTab === 'kanban' && (
                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                    {kanbanStatuses.map(status => (
                        <div key={status} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex-1 min-w-[300px] flex flex-col gap-4">
                            <h3 className="text-xs uppercase font-black text-muted-foreground tracking-widest flex justify-between">
                                {status.replace('_', ' ')}
                                <span className="bg-background px-2 py-0.5 rounded-full text-[10px]">{counts[status]}</span>
                            </h3>
                            <div className="flex flex-col gap-3">
                                {tasks.filter(t => t.status === status && (!filter || t.owner_id === filter)).length === 0 && (
                                    <div className="text-center p-8 text-[10px] text-muted-foreground font-black uppercase tracking-widest">Sin Tareas</div>
                                )}
                                {tasks.filter(t => t.status === status && (!filter || t.owner_id === filter)).map((t, idx) => (
                                    <motion.div
                                        key={t.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        onClick={() => setSelectedTask(t)}
                                        className="card p-4 flex flex-col gap-3 hover:-translate-y-1 transition-transform cursor-pointer border-l-2 border-l-transparent hover:border-l-primary"
                                    >
                                        <div className="flex justify-between items-start gap-2">
                                            <h4 className="font-bold text-sm leading-tight text-white">{t.title}</h4>
                                            <span className="text-[10px] font-black uppercase bg-primary/20 text-primary px-2 py-1 rounded-full">{t.priority}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-3">{t.objective}</p>
                                        {t.due_date && <div className="text-[10px] text-muted-foreground/80 font-mono mt-2">Due: {t.due_date}</div>}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'list' && (
                <div className="card p-0 overflow-hidden border-border/40">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-border text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
                                    <th className="p-4">Tarea</th><th className="p-4">Responsable</th><th className="p-4">Entrega</th><th className="p-4">Estado</th><th className="p-4">Prioridad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredTasks.length === 0 ? (
                                    <tr>
                                        <td colSpan="5">
                                            <div className="py-8">
                                                <EmptyState
                                                    icon={CheckCircle2}
                                                    title="Clear Roadmap"
                                                    description="No hay tareas asignadas alineadas a tu filtro. Tu equipo está al día con el pipeline."
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredTasks.map(t => (
                                    <tr key={t.id} onClick={() => setSelectedTask(t)} className="hover:bg-white/5 transition-colors cursor-pointer group">
                                        <td className="p-4 font-bold group-hover:text-primary transition-colors">{t.title}</td>
                                        <td className="p-4 text-xs font-mono">{t.owner_id || '-'}</td>
                                        <td className="p-4 text-xs text-muted-foreground">{t.due_date || '-'}</td>
                                        <td className="p-4">
                                            <Badge status={t.status} />
                                        </td>
                                        <td className="p-4">
                                            <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground">{t.priority}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {/* Task Detail Slider */}
            <AnimatePresence>
                {selectedTask && (
                    <TaskDetail
                        task={selectedTask}
                        onClose={() => {
                            setSelectedTask(null);
                            fetchTasks(); // Refresh list to get updated status if changed
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

function FinanceView({ user, setView }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchFinanceData(); }, []);

    async function fetchFinanceData() {
        const { data: revs } = await supabase.from('finance_revenues').select('*');
        const { data: exps } = await supabase.from('finance_expenses').select('*');
        const { data: projs } = await supabase.from('projects').select('*');

        const netRevenue = revs?.reduce((a, x) => a + Number(x.net || 0), 0) || 0;
        const ivaDebito = revs?.reduce((a, x) => a + Number(x.iva || 0), 0) || 0;

        // IVA Crédito Estimado (19% sobre costos directos y operativos que suelen llevar IVA)
        const totalCostosDirectos = exps?.filter(e => e.category === 'cost_direct').reduce((a, x) => a + Number(x.monthly_amount || 0), 0) || 0;
        const totalGastosOperativos = exps?.filter(e => e.category === 'operating').reduce((a, x) => a + Number(x.monthly_amount || 0), 0) || 0;
        const ivaCreditoEst = (totalCostosDirectos + totalGastosOperativos) * 0.19;
        const ivaAPagar = Math.max(0, ivaDebito - ivaCreditoEst);

        const totalHonorarios = exps?.filter(e => e.category === 'honorarios').reduce((a, x) => a + Number(x.monthly_amount || 0), 0) || 0;
        const totalBonosExtraordinarios = exps?.filter(e => e.category === 'bono').reduce((a, x) => a + Number(x.monthly_amount || 0), 0) || 0;

        const idpcRate = 0.25;
        const netProfitBeforeTax = netRevenue - totalCostosDirectos - totalGastosOperativos - totalHonorarios - totalBonosExtraordinarios;
        const taxReserve = Math.max(0, netProfitBeforeTax * idpcRate);
        const netProfitAfterTax = netProfitBeforeTax - taxReserve;

        // Flujo Proyectado 30d (Proyectos en etapa 'invoiced' que no han pagado)
        const projectedRevenue = projs?.filter(p => p.stage === 'invoiced').reduce((a, x) => a + Number(x.expectedValue || 0), 0) || 0;

        setData({
            revenues: revs || [],
            costsDirect: exps?.filter(e => e.category === 'cost_direct') || [],
            operatingExpenses: exps?.filter(e => e.category === 'operating') || [],
            honorarios: exps?.filter(e => e.category === 'honorarios') || [],
            bonosExtraordinarios: exps?.filter(e => e.category === 'bono') || [],
            netRevenue, ivaDebito, ivaCreditoEst, ivaAPagar,
            totalCostosDirectos, totalGastosOperativos, totalHonorarios, totalBonosExtraordinarios,
            netProfitAfterTax, taxReserve, idpcRate, projectedRevenue
        });
        setLoading(false);
    }

    if (loading) return null;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black m-0">Finance · Cermaq Chile</h2>
                <div className="flex gap-2 text-[10px] font-black uppercase">
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">Scope: Cermaq</span>
                    <span className="bg-secondary text-muted-foreground px-3 py-1 rounded-full border border-border">IDPC: {Math.round(data.idpcRate * 100)}%</span>
                </div>
            </div>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Facturado Neto" value={CLP(data.netRevenue)} />
                <StatCard label="Utilidad Est." value={data.netProfitAfterTax > 0 ? CLP(data.netProfitAfterTax) : '$ 0'} color="text-primary" />
                <StatCard label="Flujo Proyectado 30d" value={CLP(data.projectedRevenue)} color="text-emerald-500" />
                <StatCard label="Reserva IDPC (25%)" value={CLP(data.taxReserve)} color="text-amber-500" />
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-4 flex flex-col gap-2">
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">IVA Débito (Ventas)</div>
                    <div className="text-xl font-black">{CLP(data.ivaDebito)}</div>
                </div>
                <div className="card p-4 flex flex-col gap-2 border-dashed">
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">IVA Crédito (Est. Compras)</div>
                    <div className="text-xl font-black text-muted-foreground">{CLP(data.ivaCreditoEst)}</div>
                </div>
                <div className="card p-4 flex flex-col gap-2 bg-primary/5 border-primary/20">
                    <div className="text-[10px] font-black text-primary uppercase tracking-widest">IVA Neto a Pagar</div>
                    <div className="text-xl font-black text-primary">{CLP(data.ivaAPagar)}</div>
                </div>
            </div>

            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 opacity-80 scale-95 origin-left">
                <StatCard label="Costos Directos" value={CLP(data.totalCostosDirectos)} />
                <StatCard label="Gastos Operativos" value={CLP(data.totalGastosOperativos)} />
                <StatCard label="Honorarios" value={CLP(data.totalHonorarios)} />
                <StatCard label="Bonos Extra" value={CLP(data.totalBonosExtraordinarios)} />
            </section>

            <div className="card p-0 overflow-hidden">
                <div className="p-4 border-b border-border flex justify-between items-center bg-white/5">
                    <h3 className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">Ingresos (Prorrateados)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-border text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
                                <th className="p-4">ID</th><th className="p-4">Fecha</th><th className="p-4">Cliente</th><th className="p-4 text-right">Neto</th><th className="p-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.revenues.length === 0 ? (
                                <tr>
                                    <td colSpan="5">
                                        <div className="py-8">
                                            <EmptyState
                                                icon={FileText}
                                                title="Monitoreo Financiero en Cero"
                                                description="No detecto ingresos registrados en este rango. ¿Quieres que procese un nuevo archivo DTE?"
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ) : data.revenues.map(r => (
                                <tr key={r.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="p-4 font-mono text-xs text-primary">{r.id}</td>
                                    <td className="p-4">{r.issue_date}</td>
                                    <td className="p-4 font-bold">{r.customer}</td>
                                    <td className="p-4 text-right font-black">{CLP(r.net)}</td>
                                    <td className="p-4 text-right text-muted-foreground">{CLP(r.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ExecutiveView has been unified into OperationsView as the 'list' tab.
// Deprecated component removed.

function Badge({ status }) {
    const styles = {
        done: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
        blocked: 'text-destructive bg-destructive/10 border-destructive/20',
        in_progress: 'text-primary bg-primary/10 border-primary/20',
        todo: 'text-muted-foreground bg-muted border-border'
    };
    return (
        <span className={`text-[9px] uppercase font-black px-2.5 py-1 rounded-full border ${styles[status] || styles.todo}`}>
            {(status || 'unknown').replace('_', ' ')}
        </span>
    )
}

function CommercialView({ user, setView }) {
    const [data, setData] = useState(null);
    const [generating, setGenerating] = useState(null);

    useEffect(() => { fetchCommercial(); }, []);

    async function handleGenerateQuote(p) {
        setGenerating(p.project_id);
        try {
            const markdown = `# Propuesta Comercial: ${p.name}\n\n**De:** Mark — CEO, Muze AI Consulting\n**Para:** Cliente — ${p.customer_name}\n**Fecha:** ${new Date().toLocaleDateString()}\n**Referencia:** Propuesta Técnica y Comercial\n\n---\n\n## Descripción del Proyecto\n${p.description}\n\n## Términos Comerciales\n- **Monto Neto:** ${CLP(p.amount)}\n- **IVA (19%):** ${CLP(p.amount * 0.19)}\n- **Total:** ${CLP(p.amount * 1.19)}\n\n<div class="signature-block">\n  <div class="signature-line"></div>\n  <div class="signature-name">Mark</div>\n  <div class="signature-title">CEO</div>\n  <div class="signature-company">Muze AI Consulting</div>\n  <div class="stamp-placeholder"></div>\n</div>`;

            const res = await fetch('http://localhost:3211/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markdown, filename: `cotizacion_${p.project_id}` })
            });
            const result = await res.json();
            if (result.ok) {
                // Register in task_files if it's a known project/task
                const { data: t } = await supabase.from('tasks').select('id').eq('project_id', p.project_id).single();
                if (t) {
                    await supabase.from('task_files').insert([{
                        task_id: t.id,
                        name: `Cotización: ${p.name}`,
                        url: `http://localhost:3211${result.pdfUrl}`,
                        type: 'pdf',
                        size: 0, // Placeholder
                        uploaded_by: 'Director IA'
                    }]);
                    await supabase.from('task_activity').insert([{
                        task_id: t.id,
                        actor: 'Director IA',
                        action: 'file_added',
                        details: { name: `Cotización: ${p.name}` }
                    }]);
                }

                alert(`¡PDF Generado con éxito!\n\nUbicación: ${result.path}`);
                window.open(`http://localhost:3211${result.pdfUrl}`, '_blank');
            } else {
                alert(`Error al generar PDF: ${result.error}`);
            }
        } catch (err) {
            alert(`Error de conexión con el generador local: ${err.message}`);
        } finally {
            setGenerating(null);
        }
    }

    async function fetchCommercial() {
        const { data: accounts } = await supabase.from('accounts').select('*');
        const { data: projects } = await supabase.from('projects').select('*');
        const { data: quotes } = await supabase.from('quotes').select('*');

        const hierarchy = accounts?.map(acc => ({
            customer: acc.name,
            account: acc,
            projects: projects?.filter(p => p.account_id === acc.id).map(p => ({
                ...p,
                quotes: quotes?.filter(q => q.project_id === p.project_id) || []
            })) || []
        })) || [];

        const stats = {
            open: projects?.length || 0,
            in_progress: projects?.filter(p => p.stage !== 'payment_received' && p.stage !== 'lost').length || 0,
            value: projects?.reduce((a, b) => a + Number(b.amount || 0), 0) || 0
        };

        setData({ hierarchy, stats });
        setLoading(false);
    }

    if (loading) return null;

    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-black m-0">Commercial Pipeline</h2>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Pipeline Total" value={data.stats.open} />
                <StatCard label="En Seguimiento" value={data.stats.in_progress} />
                <StatCard label="Expected Value" value={CLP(data.stats.value)} color="text-primary" />
                <StatCard label="Conversion" value="24%" />
            </section>

            <div className="space-y-8">
                {data.hierarchy.length === 0 ? (
                    <EmptyState
                        icon={Briefcase}
                        title="Pipeline Estratégico Vacío"
                        description="Aún no hay proyectos comerciales activos. Puedo ayudarte a generar un análisis de prospectos o cargar el histórico de ventas."
                        actionLabel="Crear Proyecto"
                        onAction={() => alert('Director Agent: Función delegada.')}
                    />
                ) : data.hierarchy.map(c => (
                    <div key={c.customer} className="space-y-3">
                        <div className="flex justify-between items-end border-b-2 border-primary/20 pb-2">
                            <h3 className="text-xl font-black text-primary uppercase tracking-tight">{c.customer}</h3>
                            <div className="hidden md:flex gap-4 text-[9px] text-muted-foreground uppercase font-black">
                                {c.account.champions?.map((ch, i) => <span key={i} className="bg-secondary px-2 py-1 rounded-full">{ch.name} · {ch.role}</span>)}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {c.projects.map(p => {
                                const stageStyles = {
                                    negotiation: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                                    oc_sent: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                                    invoiced: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                                    development: 'bg-primary/10 text-primary border-primary/20',
                                    lost: 'bg-destructive/10 text-destructive border-destructive/20'
                                };
                                const badgeStyle = stageStyles[p.stage] || stageStyles.development;

                                return (
                                    <div key={p.project_id} className="card p-6 grid grid-cols-1 md:grid-cols-4 gap-6 items-center hover:bg-primary/5">
                                        <div className="flex flex-col">
                                            <div className="font-black text-lg leading-tight uppercase tracking-tight">{p.name}</div>
                                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-1">Monto Estimado</div>
                                            <div className="font-black text-lg">{CLP(p.amount)}</div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <div className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mb-2">Stage</div>
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${badgeStyle}`}>
                                                {p.stage.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button className="bg-primary text-primary-foreground text-[10px] font-black px-4 py-2 rounded-xl shadow-lg shadow-primary/20 uppercase tracking-widest">
                                                Ver Detalles
                                            </button>
                                            <button
                                                onClick={() => handleGenerateQuote(p)}
                                                disabled={generating === p.project_id}
                                                className={`text-[10px] font-black px-4 py-2 rounded-xl border border-primary/20 uppercase tracking-widest transition-all ${generating === p.project_id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/10'}`}
                                            >
                                                {generating === p.project_id ? 'Generando...' : 'Generar PDF'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DirectorChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            const sub = supabase.channel('messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fetchMessages).subscribe();
            fetchMessages();
            return () => supabase.removeChannel(sub);
        }
    }, [isOpen]);

    async function fetchMessages() {
        const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(20);
        setMessages(data || []);
    }

    async function send() {
        if (!input.trim()) return;
        await supabase.from('messages').insert([{ content: input, sender_name: 'Mark', role: 'admin', channel: 'global' }]);
        setInput('');
    }

    return (
        <div className={`fixed right-6 bottom-6 transition-all z-[100] ${isOpen ? 'w-80 h-[500px]' : 'w-14 h-14'}`}>
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-full h-full bg-primary rounded-full flex items-center justify-center shadow-xl shadow-primary/20 cursor-pointer hover:scale-110 active:scale-95 transition-all text-primary-foreground"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" /></svg>
                </button>
            ) : (
                <div className="card glass-card w-full h-full flex flex-col p-0 overflow-hidden shadow-2xl border-primary/20">
                    <div className="bg-primary/10 p-4 border-b border-primary/20 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            <b className="text-[10px] uppercase tracking-[0.2em] text-primary font-black">Agent Director</b>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground font-black">×</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center p-10 text-[10px] text-muted-foreground italic font-bold">No hay mensajes aún.</div>
                        )}
                        {messages.map(m => (
                            <div key={m.id} className={`flex flex-col ${m.role === 'admin' ? 'items-end' : 'items-start'}`}>
                                <div className={`text-[9px] font-black mb-1 px-1 uppercase tracking-tighter ${m.role === 'admin' ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {m.sender_name || 'System'}
                                </div>
                                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${m.role === 'admin'
                                    ? 'bg-primary text-primary-foreground font-medium rounded-tr-none'
                                    : 'bg-secondary text-foreground rounded-tl-none border border-border/50'
                                    }`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 bg-background/50 backdrop-blur-md border-t border-border flex gap-2">
                        <input
                            className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="Intervención manual..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={k => k.key === 'Enter' && send()}
                        />
                        <button
                            onClick={send}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                        >
                            ENVIAR
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App
