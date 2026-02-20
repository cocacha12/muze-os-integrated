import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Webhook, Database, Bot, Sparkles, TerminalSquare } from 'lucide-react'

export function AuditView() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
        const sub = supabase.channel('audit_events')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, fetchEvents)
            .subscribe();
        return () => supabase.removeChannel(sub);
    }, []);

    async function fetchEvents() {
        const { data } = await supabase.from('events').select('*').order('ts', { ascending: false }).limit(50);
        setEvents(data || []);
        setLoading(false);
    }

    if (loading) return <div className="p-20 text-center animate-pulse font-mono text-sm tracking-widest text-primary">INITIALIZING AUDIT LOG...</div>;

    const getIcon = (source) => {
        switch (source) {
            case 'agent_cron': return <Bot className="w-4 h-4 text-primary" />;
            case 'webhook': return <Webhook className="w-4 h-4 text-emerald-400" />;
            case 'api': return <Database className="w-4 h-4 text-blue-400" />;
            default: return <Sparkles className="w-4 h-4 text-amber-400" />;
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center bg-secondary/30 p-4 rounded-2xl border border-border backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
                        <TerminalSquare className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-xl font-black tracking-tight m-0">Audit Log · Agent Behavior</h2>
                </div>
                <div className="flex gap-2">
                    <span className="flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-1.5 rounded-full border border-primary/20 tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        REALTIME
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {events.length === 0 && (
                    <div className="card text-center p-20 text-muted-foreground italic">
                        No se han registrado eventos de agentes aún.
                    </div>
                )}
                <AnimatePresence>
                    {events.map((event, i) => (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
                            className="card p-0 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border hover:border-primary/30 transition-colors"
                        >
                            <div className="w-full md:w-64 p-4 bg-secondary/30 flex flex-col justify-between relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10" />
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        {getIcon(event.source)}
                                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground">{event.source}</div>
                                    </div>
                                    <div className="text-sm font-bold leading-tight text-primary">{event.type.replace(/_/g, ' ')}</div>
                                </div>
                                <div className="mt-4">
                                    <div className="text-[10px] text-muted-foreground font-bold">{new Date(event.ts).toLocaleString()}</div>
                                    <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate opacity-50">{event.event_id}</div>
                                </div>
                            </div>
                            <div className="flex-1 p-4 bg-slate-950 font-mono text-[11px] overflow-hidden">
                                <div className="flex gap-4 h-full">
                                    <div className="flex-1 overflow-auto max-h-[200px] custom-scrollbar">
                                        <div className="text-[9px] uppercase font-black text-emerald-400/70 tracking-widest mb-2 flex items-center gap-2">
                                            Payload (After)
                                        </div>
                                        <pre className="text-emerald-400/90 leading-relaxed">
                                            {JSON.stringify(event.content_after, null, 2)}
                                        </pre>
                                    </div>
                                    {event.meta && Object.keys(event.meta).length > 0 && (
                                        <div className="w-48 overflow-auto max-h-[200px] border-l border-white/5 pl-4 custom-scrollbar">
                                            <div className="text-[9px] uppercase font-black text-blue-400/70 tracking-widest mb-2">
                                                Meta
                                            </div>
                                            <pre className="text-blue-400/90 leading-relaxed">
                                                {JSON.stringify(event.meta, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
