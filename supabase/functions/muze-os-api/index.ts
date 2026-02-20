import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const path = url.pathname.replace('/muze-os-api', '')

        // Common Supabase Client initialization using Auth context from request
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Admin Client (Bypass RLS for aggregation/system tasks)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // -------------------------------------------------------------
        // Route: /api/finance/summary
        // -------------------------------------------------------------
        if (path === '/api/finance/summary' && req.method === 'GET') {
            const { data: revs, error: rErr } = await supabaseAdmin.from('finance_revenues').select('*')
            const { data: exps, error: eErr } = await supabaseAdmin.from('finance_expenses').select('*')

            if (rErr) throw rErr
            if (eErr) throw eErr

            const netRevenue = revs.reduce((a, x) => a + Number(x.net || 0), 0)
            const ivaDebito = revs.reduce((a, x) => a + Number(x.iva || 0), 0)
            const ivaCreditoEstimado = 0 // In future, fetch from config DB table

            const totalCostosDirectos = exps.filter(e => e.category === 'cost_direct').reduce((a, x) => a + Number(x.monthly_amount || 0), 0)
            const totalGastosOperativos = exps.filter(e => e.category === 'operating').reduce((a, x) => a + Number(x.monthly_amount || 0), 0)
            const totalHonorarios = exps.filter(e => e.category === 'honorarios').reduce((a, x) => a + Number(x.monthly_amount || 0), 0)
            const totalBonosExtraordinarios = exps.filter(e => e.category === 'bono').reduce((a, x) => a + Number(x.monthly_amount || 0), 0)

            const utilidadMensualAntesImpuesto = netRevenue - totalCostosDirectos - totalGastosOperativos - totalHonorarios - totalBonosExtraordinarios
            const idpcRate = 0.25
            const utilidadAnualRunRate = Math.max(0, utilidadMensualAntesImpuesto * 12)
            const impuestoAnualEstimado = utilidadAnualRunRate * idpcRate
            const reservaImpuestoMensual = Math.max(0, utilidadMensualAntesImpuesto * idpcRate)
            const utilidadMensualEstimada = utilidadMensualAntesImpuesto - reservaImpuestoMensual
            const margenNetoPct = netRevenue > 0 ? (utilidadMensualEstimada / netRevenue) * 100 : 0

            const openingBalance = 0 // Config DB
            const minimumTarget = 0 // Config DB
            const ivaPorPagarEstimado = Math.max(0, ivaDebito - ivaCreditoEstimado)
            const cajaEstimadaFinMes = openingBalance + utilidadMensualEstimada - ivaPorPagarEstimado
            const health = cajaEstimadaFinMes >= minimumTarget ? 'green' : (cajaEstimadaFinMes >= minimumTarget * 0.7 ? 'yellow' : 'red')

            return new Response(
                JSON.stringify({
                    scope: 'cermaq_only',
                    month: new Date().toISOString().slice(0, 7),
                    regime: 'Pro Pyme General (14D)',
                    idpcRate,
                    revenues: revs,
                    ivaDebito,
                    ivaCreditoEstimado,
                    ivaPorPagarEstimado,
                    costsDirect: exps.filter(e => e.category === 'cost_direct'),
                    operatingExpenses: exps.filter(e => e.category === 'operating'),
                    honorarios: exps.filter(e => e.category === 'honorarios'),
                    bonosExtraordinarios: exps.filter(e => e.category === 'bono'),
                    totalCostosDirectos,
                    totalGastosOperativos,
                    totalHonorarios,
                    totalBonosExtraordinarios,
                    reservaImpuestoMensual,
                    utilidadMensualAntesImpuesto,
                    utilidadMensualEstimada,
                    margenNetoPct,
                    impuestoAnualEstimado,
                    openingBalance,
                    minimumTarget,
                    cajaEstimadaFinMes,
                    health
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // -------------------------------------------------------------
        // Route: /api/commercial-summary
        // -------------------------------------------------------------
        if (path === '/api/commercial-summary' && req.method === 'GET') {
            const { data: projects } = await supabaseAdmin.from('projects').select('*')
            const { data: quotes } = await supabaseAdmin.from('quotes').select('*').order('created_at', { ascending: false }).limit(50)
            const { data: accounts } = await supabaseAdmin.from('accounts').select('*')

            const counts = {
                open: projects?.length || 0,
                in_progress: projects?.filter(p => !['payment_received', 'lost', 'closed'].includes(p.stage)).length || 0,
                won: projects?.filter(p => ['payment_received', 'closed', 'delivered'].includes(p.stage)).length || 0
            }

            const conversionRate = Math.round((counts.won / Math.max(1, counts.open + counts.won)) * 100)

            const byCustomer: Record<string, any> = {}
            for (const p of (projects || [])) {
                const acc = accounts?.find(a => a.id === p.account_id) || { name: p.customer_name || 'Sin cliente' }
                const cname = acc.name
                if (!byCustomer[cname]) byCustomer[cname] = { customer: cname, account: acc, projects: [] }
                byCustomer[cname].projects.push({ ...p, tasks: [], quotes: quotes?.filter(q => q.project_id === p.project_id) || [] })
            }

            return new Response(
                JSON.stringify({
                    pipeline: { ...counts, conversionRate },
                    hierarchy: Object.values(byCustomer),
                    quotesRegistry: quotes || []
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // -------------------------------------------------------------
        // Route: /api/commercial/generate-quote
        // -------------------------------------------------------------
        if (path === '/api/commercial/generate-quote' && req.method === 'POST') {
            const { projectId, terms } = await req.json()
            if (!projectId) throw new Error('projectId is required')

            const { data: p } = await supabaseAdmin.from('projects').select('*').eq('project_id', projectId).single()
            if (!p) throw new Error('Project not found')

            // Mocking the generation logic based on terms + project data
            const amount = Number(p.amount || 0)
            const iva = amount * 0.19
            const total = amount + iva

            const quoteText = `## Propuesta Comercial: ${p.name}\n\nTerminos: ${terms || 'Estándar'}\n\n**Monto Neto:** ${amount}\n**IVA (19%):** ${iva}\n**Total:** ${total}\n\nGenerado por Muze OS Agent.`

            // Append event for the agent/UI to react
            const { error: evtErr } = await supabaseAdmin.from('events').insert([{
                event_id: `qgen-${Date.now()}`,
                ts: new Date().toISOString(),
                schema_version: 1,
                source: 'commercial-quote-agent',
                channel: 'roadmap',
                type: 'quote_drafted',
                entity_id: projectId,
                content_after: { quoteText, amount, iva, total }
            }])

            if (evtErr) throw evtErr

            return new Response(
                JSON.stringify({ ok: true, quoteText, amount, iva, total }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // -------------------------------------------------------------
        // Route: /api/discipline-score
        // -------------------------------------------------------------
        if (path === '/api/discipline-score' && req.method === 'GET') {
            const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const { data: events, error } = await supabaseAdmin
                .from('events')
                .select('source, type')
                .gte('ts', last24h)

            if (error) throw error

            const bySource: Record<string, number> = {}
            let mutations = 0

            for (const e of (events || [])) {
                const s = e.source || 'unknown'
                bySource[s] = (bySource[s] || 0) + 1
                if (String(e.type || '').includes('mutation') || String(e.type || '').includes('note')) mutations++
            }

            const score = Math.min(100, Math.round((mutations / Math.max(1, events?.length || 0)) * 100))

            return new Response(
                JSON.stringify({
                    score,
                    bySource,
                    counts: { total24h: events?.length || 0, mutations24h: mutations },
                    strict_mode: score < 85 // Ported from server.js
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // -------------------------------------------------------------
        // Route: /api/consistency-health
        // -------------------------------------------------------------
        if (path === '/api/consistency-health' && req.method === 'GET') {
            const { data: events } = await supabaseAdmin.from('events').select('channel, ts, type, require_ack, event_id, ack_for_event_id, status').limit(2000).order('ts', { ascending: false })

            const channels = ['dm', 'consulting', 'roadmap', 'system']
            const byChannel: Record<string, any> = {}
            for (const ch of channels) byChannel[ch] = { lastEventTs: null, lagSec: 0, ok60s: true, ack24h: 0, pendingAckOverdue: 0 }

            const nowMs = Date.now()
            const ACK_DEADLINE_SEC = 60
            const acked = new Set()

            events?.forEach(e => {
                if (e.type === 'event_ack' && e.status !== 'failed' && e.ack_for_event_id) acked.add(e.ack_for_event_id)
                const ch = e.channel || 'system'
                if (byChannel[ch]) {
                    const t = new Date(e.ts).getTime()
                    if (!byChannel[ch].lastEventTs || t > new Date(byChannel[ch].lastEventTs).getTime()) byChannel[ch].lastEventTs = e.ts
                    if (e.type === 'event_ack' && (nowMs - t <= 24 * 60 * 60 * 1000)) byChannel[ch].ack24h++
                }
            })

            const overdue: any[] = []
            events?.forEach(e => {
                const ch = e.channel || 'system'
                if (!['dm', 'consulting', 'roadmap'].includes(ch) || e.type === 'event_ack' || e.require_ack === false || !e.event_id || acked.has(e.event_id)) return
                const t = new Date(e.ts).getTime()
                const ageSec = Math.max(0, Math.floor((nowMs - t) / 1000))
                if (ageSec > ACK_DEADLINE_SEC) {
                    overdue.push({ eventId: e.event_id, channel: ch, ageSec, type: e.type })
                    if (byChannel[ch]) byChannel[ch].pendingAckOverdue++
                }
            })

            for (const ch of channels) {
                if (byChannel[ch].lastEventTs) {
                    byChannel[ch].lagSec = Math.max(0, Math.floor((nowMs - new Date(byChannel[ch].lastEventTs).getTime()) / 1000))
                    byChannel[ch].ok60s = byChannel[ch].lagSec <= 60
                }
            }

            const consistencyOk = channels.every(ch => (byChannel[ch].ok60s || byChannel[ch].lastEventTs === null)) && overdue.length === 0

            return new Response(
                JSON.stringify({
                    consistencyOk,
                    sloSec: 60,
                    ackDeadlineSec: ACK_DEADLINE_SEC,
                    overdueAckCount: overdue.length,
                    overdueAcks: overdue.slice(0, 30),
                    byChannel
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // -------------------------------------------------------------
        // Route: /api/tasks
        // -------------------------------------------------------------
        if (path === '/api/tasks' || path.startsWith('/api/tasks/')) {
            const taskId = path.split('/')[3] // /api/tasks/ID

            if (req.method === 'GET') {
                if (taskId) {
                    const { data: task, error } = await supabaseAdmin.from('tasks').select('*').eq('id', taskId).single()
                    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                    return new Response(JSON.stringify({ task }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                } else {
                    const owner = url.searchParams.get('owner')
                    const status = url.searchParams.get('status')
                    let query = supabaseAdmin.from('tasks').select('*')
                    if (owner) query = query.eq('owner_id', owner)
                    if (status) query = query.eq('status', status)
                    const { data: tasks, error } = await query
                    if (error) throw error
                    return new Response(JSON.stringify({ tasks }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                }
            }

            if (req.method === 'POST') {
                const task = await req.json()
                const { data, error } = await supabaseAdmin.from('tasks').insert([task]).select().single()
                if (error) throw error
                return new Response(JSON.stringify({ ok: true, task: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            if (req.method === 'PATCH' && taskId) {
                const updates = await req.json()
                const { data, error } = await supabaseAdmin.from('tasks').update(updates).eq('id', taskId).select().single()
                if (error) throw error
                return new Response(JSON.stringify({ ok: true, task: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            if (req.method === 'DELETE' && taskId) {
                const { error } = await supabaseAdmin.from('tasks').delete().eq('id', taskId)
                if (error) throw error
                return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
        }

        // -------------------------------------------------------------
        // Route: /api/projects
        // -------------------------------------------------------------
        if (path === '/api/projects' || path.startsWith('/api/projects/')) {
            const pid = path.split('/')[3]

            if (req.method === 'GET') {
                if (pid) {
                    const { data: proj, error } = await supabaseAdmin.from('projects').select('*').eq('project_id', pid).single()
                    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                    return new Response(JSON.stringify({ project: proj }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                } else {
                    const { data: projs, error } = await supabaseAdmin.from('projects').select('*')
                    if (error) throw error
                    return new Response(JSON.stringify({ projects: projs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                }
            }

            if (req.method === 'POST') {
                const proj = await req.json()
                const { data, error } = await supabaseAdmin.from('projects').insert([proj]).select().single()
                if (error) throw error
                return new Response(JSON.stringify({ ok: true, project: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            if (req.method === 'PATCH' && pid) {
                const updates = await req.json()
                const { data, error } = await supabaseAdmin.from('projects').update(updates).eq('project_id', pid).select().single()
                if (error) throw error
                return new Response(JSON.stringify({ ok: true, project: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            if (req.method === 'DELETE' && pid) {
                const { error } = await supabaseAdmin.from('projects').delete().eq('project_id', pid)
                if (error) throw error
                return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
        }

        // -------------------------------------------------------------
        // Route: /api/quotes
        // -------------------------------------------------------------
        if (path === '/api/quotes' || path.startsWith('/api/quotes/')) {
            const qid = path.split('/')[3]

            if (req.method === 'GET') {
                if (qid) {
                    const { data: q, error } = await supabaseAdmin.from('quotes').select('*').eq('id', qid).single()
                    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                    return new Response(JSON.stringify({ quote: q }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                } else {
                    const pid = url.searchParams.get('projectId')
                    let qry = supabaseAdmin.from('quotes').select('*')
                    if (pid) qry = qry.eq('project_id', pid)
                    const { data: qs, error } = await qry
                    if (error) throw error
                    return new Response(JSON.stringify({ quotes: qs }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
                }
            }

            if (req.method === 'POST') {
                const quote = await req.json()
                const { data, error } = await supabaseAdmin.from('quotes').insert([quote]).select().single()
                if (error) throw error
                return new Response(JSON.stringify({ ok: true, quote: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            if (req.method === 'PATCH' && qid) {
                const updates = await req.json()
                const { data, error } = await supabaseAdmin.from('quotes').update(updates).eq('id', qid).select().single()
                if (error) throw error
                return new Response(JSON.stringify({ ok: true, quote: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }

            if (req.method === 'DELETE' && qid) {
                const { error } = await supabaseAdmin.from('quotes').delete().eq('id', qid)
                if (error) throw error
                return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
        }

        // -------------------------------------------------------------
        // Route: /api/events (append)
        // -------------------------------------------------------------
        if (path === '/api/events' && req.method === 'POST') {
            const body = await req.json()

            const { data, error } = await supabaseAdmin.from('events').insert([{
                event_id: body.eventId || `evt-${Date.now()}`,
                ts: body.ts || new Date().toISOString(),
                schema_version: 1,
                source: body.source || 'api',
                channel: body.channel || 'system',
                type: body.type || 'event',
                entity_id: body.entityId || '',
                require_ack: body.requireAck ?? false,
                content_before: body.before ?? null,
                content_after: body.after ?? null,
                meta: body.meta || {}
            }]).select().single()

            if (error) throw error

            return new Response(
                JSON.stringify({ ok: true, event: data }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 201 }
            )
        }

        return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
    } catch (err: any) {
        return new Response(String(err?.message ?? err), { headers: corsHeaders, status: 500 })
    }
})
