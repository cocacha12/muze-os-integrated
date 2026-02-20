import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const INTENTS = [
    {
        patterns: [/\\boc recibida\\b/i, /\\bya lleg[oó] la oc\\b/i, /\\brecibimos la oc\\b/i, /\\btenemos oc\\b/i, /\\benv[ií]o oc\\b/i],
        current_stage: 'negotiation',
        next_stage: 'oc_sent',
        deadline_delta: 1,
        note: 'OC recibida confirmada vía chat.'
    },
    {
        patterns: [/\\bfactura enviada\\b/i, /\\bya se envi[oó] la factura\\b/i, /\\bfacturada\\b/i, /\\bya se factur[oó]\\b/i],
        current_stage: 'oc_sent',
        next_stage: 'invoiced',
        deadline_delta: 30,
        note: 'Envío de factura confirmado vía chat.'
    },
    {
        patterns: [/\\bproyecto en desarrollo\\b/i, /\\bempezamos el desarrollo\\b/i, /\\bactivar desarrollo\\b/i],
        current_stage: 'invoiced',
        next_stage: 'development',
        deadline_delta: 7,
        note: 'Desarrollo activado tras facturación.'
    },
    {
        patterns: [/\\bpago recibido\\b/i, /\\bya pagaron\\b/i, /\\bcobrado\\b/i, /\\btransferencia recibida\\b/i],
        current_stage: 'invoiced',
        next_stage: 'payment_received',
        deadline_delta: 1,
        note: 'Pago confirmado vía chat.'
    }
];

function parseDateMentions(text: string): string | null {
    if (text.toLowerCase().includes('mañana')) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    }
    const match = text.match(/\\b(\\d{4}-\\d{2}-\\d{2})\\b/);
    if (match) return match[1];
    return null;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { projectId, text } = await req.json()

        if (!projectId || !text) {
            return new Response(JSON.stringify({ ok: false, error: 'projectId and text are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: proj, error: projErr } = await supabaseAdmin.from('projects').select('id, stage').eq('project_id', projectId).single()

        if (projErr || !proj) {
            return new Response(JSON.stringify({ ok: false, error: 'PROJECT_NOT_FOUND' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const current_stage = proj.stage || 'negotiation'

        let match = null
        for (const intent of INTENTS) {
            if (intent.current_stage === current_stage) {
                if (intent.patterns.some(p => p.test(text))) {
                    match = intent
                    break
                }
            }
        }

        if (!match) {
            return new Response(JSON.stringify({ ok: false, status: 'NO_MATCH', current_stage }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        let deadline = parseDateMentions(text)
        if (!deadline) {
            const d = new Date()
            d.setDate(d.getDate() + match.deadline_delta)
            deadline = d.toISOString().split('T')[0]
        }

        // Update Project stage
        const { error: updateErr } = await supabaseAdmin.from('projects')
            .update({ stage: match.next_stage })
            .eq('project_id', projectId)

        if (updateErr) throw updateErr

        // Insert Note/Event
        await supabaseAdmin.from('events').insert([{
            event_id: `evt-${Date.now()}`,
            ts: new Date().toISOString(),
            schema_version: 1,
            source: 'commercial-intent-parser',
            channel: 'roadmap',
            type: 'commercial_project_mutation',
            entity_id: projectId,
            content_after: { stage: match.next_stage, note: match.note, deadline }
        }])

        return new Response(
            JSON.stringify({ ok: true, matched_intent: match.next_stage, deadline, note: match.note }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
    }
})
