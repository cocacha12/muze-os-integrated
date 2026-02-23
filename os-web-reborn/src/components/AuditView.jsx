import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Webhook, Database, Bot, Sparkles, TerminalSquare, Search, Filter, Copy, Check, ShieldAlert } from 'lucide-react'

export function AuditView() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [copiedId, setCopiedId] = useState(null);

    useEffect(() => {
        fetchEvents();
        const sub = supabase.channel('audit_events')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, fetchEvents)
            .subscribe();
        return () => supabase.removeChannel(sub);
    }, []);

    async function fetchEvents() {
        const { data } = await supabase.from('events').select('*').order('ts', { ascending: false }).limit(100);
        setEvents(data || []);
        setLoading(false);
    }

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(JSON.stringify(text, null, 2));
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    if (loading) return <div className="p-20 text-center animate-pulse font-mono text-sm tracking-widest text-primary">INITIALIZING AUDIT LOG...</div>;

    const getIcon = (source, type) => {
        if (type === 'ERROR') return <ShieldAlert className="w-4 h-4 text-red-500" />;
        switch (source?.toLowerCase()) {
            case 'agent_cron':
            case 'kether':
                return <Bot className="w-4 h-4 text-primary" />;
            case 'webhook': return <Webhook className="w-4 h-4 text-emerald-400" />;
            case 'api': return <Database className="w-4 h-4 text-blue-400" />;
            case 'ui_client': return <ShieldAlert className="w-4 h-4 text-red-400" />;
            case 'system': return <TerminalSquare className="w-4 h-4 text-slate-400" />;
            default: return <Sparkles className="w-4 h-4 text-amber-400" />;
        }
    };

    const filteredEvents = events.filter(e => {
        const matchesSearch = e.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.source?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSource = sourceFilter === 'all' || e.source === sourceFilter;
        return matchesSearch && matchesSource;
    });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-secondary/30 p-4 rounded-2xl border border-border backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
                        <TerminalSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black tracking-tight m-0">Audit Log · Agent Behavior</h2>
                        <div className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">
                            {filteredEvents.length} Events Found
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search events..."
                            className="w-full bg-background/50 border border-border rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-primary outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        className="bg-background/50 border border-border rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                    >
                        <option value="all">Sources: All</option>
                        <option value="api">API</option>
                        <option value="agent_cron">Agents</option>
                        <option value="webhook">Webhooks</option>
                        <option value="UI_Client">UI Logs</option>
                        <option value="system">System</option>
                    </select>
                    <span className="flex items-center gap-2 bg-primary/10 text-primary text-[10px] font-black px-3 py-2 rounded-xl border border-primary/20 tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        LIVE
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[calc(100vh-300px)] pr-2 custom-scrollbar">
                {filteredEvents.length === 0 && (
                    <div className="card text-center p-20 text-muted-foreground italic">
                        No events match your criteria.
                    </div>
                )}
                <AnimatePresence>
                    {filteredEvents.map((event, i) => (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3, delay: i < 10 ? i * 0.05 : 0 }}
                            className={`card p-0 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border transition-colors ${event.type === 'ERROR' ? 'border-red-500/30 hover:border-red-500/50' : 'hover:border-primary/30'}`}
                        >
                            <div className="w-full md:w-64 p-4 bg-secondary/30 flex flex-col justify-between relative overflow-hidden group">
                                <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-[100px] -z-10 transition-colors ${event.type === 'ERROR' ? 'bg-red-500/10 group-hover:bg-red-500/20' : 'bg-primary/5 group-hover:bg-primary/10'}`} />
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        {getIcon(event.source, event.type)}
                                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground">{event.source}</div>
                                    </div>
                                    <div className={`text-sm font-bold leading-tight uppercase tracking-tight ${event.type === 'ERROR' ? 'text-red-500' : 'text-primary'}`}>{event.type?.replace(/_/g, ' ')}</div>
                                </div>
                                <div className="mt-4">
                                    <div className="text-[10px] text-muted-foreground font-bold">{new Date(event.ts).toLocaleString()}</div>
                                    <div className="text-[8px] font-mono text-muted-foreground mt-1 truncate opacity-50">{event.event_id}</div>
                                </div>
                            </div>
                            <div className="flex-1 p-0 bg-slate-950/50 font-mono text-[11px] overflow-hidden group relative">
                                <button
                                    onClick={() => copyToClipboard(event.content_after || event.meta, event.id)}
                                    className="absolute top-2 right-2 p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10 text-white"
                                >
                                    {copiedId === event.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                </button>
                                <div className="flex gap-4 h-full p-4">
                                    {event.content_after && Object.keys(event.content_after).length > 0 && (
                                        <div className="flex-1 overflow-auto max-h-[160px] custom-scrollbar">
                                            <div className="text-[9px] uppercase font-black text-emerald-400/50 tracking-widest mb-2 flex items-center gap-2">
                                                Payload (Snapshot)
                                            </div>
                                            <pre className="text-emerald-400/90 leading-relaxed whitespace-pre-wrap">
                                                {JSON.stringify(event.content_after, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                    {event.meta && Object.keys(event.meta).length > 0 && (
                                        <div className={`flex-1 overflow-auto max-h-[160px] ${event.content_after ? 'border-l border-white/5 pl-4' : ''} custom-scrollbar`}>
                                            <div className={`text-[9px] uppercase font-black tracking-widest mb-2 ${event.type === 'ERROR' ? 'text-red-400/50' : 'text-blue-400/50'}`}>
                                                Meta
                                            </div>
                                            <pre className={`${event.type === 'ERROR' ? 'text-red-400/90' : 'text-blue-400/90'} leading-relaxed whitespace-pre-wrap`}>
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
