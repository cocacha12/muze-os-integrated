import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

const STAGE_PROB: Record<string, number> = {
    negotiation: 0.25,
    oc_sent: 0.80,
    invoiced: 0.92,
    development: 0.95,
    payment_received: 1.00,
    lost: 0.00,
    closed: 1.00,
}

const SLA_DAYS: Record<string, number> = {
    negotiation: 2,
    oc_sent: 1,
    invoiced: 30,
    development: 7,
    payment_received: 14,
}

const QUESTION_BY_STAGE: Record<string, string> = {
    negotiation: '¿Cómo va la cotización?',
    oc_sent: '¿Se recibió la OC y ya está listo el código HES/HE?',
    invoiced: 'Han pasado 30 días, ¿se recibió el pago de la factura?',
    development: '¿Cómo va el desarrollo del proyecto?',
}

Deno.serve(async (req) => {
    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: projects, error: pErr } = await supabaseAdmin.from('projects').select('*')
        if (pErr) throw pErr

        const tdy = new Date()
        tdy.setUTCHours(0, 0, 0, 0)

        const due_followups: any[] = []
        let updatedCount = 0

        for (const p of (projects || [])) {
            const stage = p.stage || 'negotiation'
            const amount = Number(p.amount || 0)
            const prob = STAGE_PROB[stage] || 0.25

            const expectedValue = Math.round(amount * prob * 100) / 100

            let nextFollowupAt = p.next_followup_at
            if (!nextFollowupAt) {
                const sla = SLA_DAYS[stage] || 3
                const nextD = new Date(tdy)
                nextD.setDate(nextD.getDate() + sla)
                nextFollowupAt = nextD.toISOString().split('T')[0]
            }

            // Check for followups
            const nextDay = new Date(nextFollowupAt)
            if (nextDay <= tdy) {
                // Evaluate ping logic
                // Simplified: push to followups
                const owner = p.owner || 'Comercial'
                const owner_l = String(owner).toLowerCase()
                const ownerTag = owner_l.includes('mark') ? '@mark' : (owner_l.includes('christopher') ? '@christopher' : '')

                due_followups.push({
                    projectId: p.project_id,
                    customer: p.customer_name,
                    project: p.name,
                    stage,
                    question: QUESTION_BY_STAGE[stage] || '¿Cómo va este proyecto?',
                    owner,
                    ownerTag
                })
            }

            // 200+ IQ: Stale detection
            const lastUpd = new Date(p.updated_at || p.created_at)
            const diffMs = tdy.getTime() - lastUpd.getTime()
            const daysInactive = Math.floor(diffMs / (1000 * 60 * 60 * 24))
            let isStale = p.is_stale || false

            if (daysInactive >= 5 && !['payment_received', 'closed', 'lost'].includes(stage)) {
                isStale = true
                due_followups.push({
                    projectId: p.project_id,
                    customer: p.customer_name,
                    project: p.name,
                    stage,
                    question: `⚠️ Inactividad: lleva ${daysInactive} días sin novedades. ¿Hay algún bloqueo?`,
                    owner: p.owner,
                    isStaleAlert: true
                })
            }

            // Auto-derived Tasks By Stage
            let financeTaskId = p.finance_task_id
            if (stage === 'oc_sent' && !financeTaskId) {
                const isCermaq = String(p.customer_name || '').toLowerCase().includes('cermaq')
                const tid = `FIN-${Date.now().toString(16).toUpperCase()}`
                await supabaseAdmin.from('tasks').insert([{
                    id: tid,
                    title: `Emitir factura${isCermaq ? ' (+ Solicitar HES)' : ''} · ${p.customer_name || 'Cliente'} · ${p.name || 'Proyecto'}`,
                    objective: isCermaq
                        ? 'Solicitar código HES/HE al cliente y luego emitir factura.'
                        : 'Emitir y enviar factura con respaldo de OC recibida.',
                    owner_id: 'Gerente Finanzas (IA)',
                    status: 'todo',
                    priority: 'alta',
                    due_date: new Date(tdy.getTime() + 86400000).toISOString().split('T')[0],
                    project_id: p.project_id
                }])
                financeTaskId = tid
            }

            let developmentTaskId = p.development_task_id
            if (stage === 'invoiced' && !developmentTaskId) {
                const tid = `OP-${Date.now().toString(16).toUpperCase()}`
                await supabaseAdmin.from('tasks').insert([{
                    id: tid,
                    title: `Activar desarrollo · ${p.customer_name || 'Cliente'} · ${p.name || 'Proyecto'}`,
                    objective: 'Activar ejecución técnica tras envío de factura.',
                    owner_id: 'Mark',
                    status: 'todo',
                    priority: 'alta',
                    due_date: new Date(tdy.getTime() + 86400000).toISOString().split('T')[0],
                    project_id: p.project_id
                }])
                developmentTaskId = tid
            }

            const updates = {
                stage_probability: prob,
                expected_value: expectedValue,
                next_followup_at: nextFollowupAt,
                is_stale: isStale,
                finance_task_id: financeTaskId,
                development_task_id: developmentTaskId,
                updated_at: new Date().toISOString()
            }

            await supabaseAdmin.from('projects').update(updates).eq('id', p.id)
            updatedCount++
        }

        return new Response(JSON.stringify({
            ok: true,
            updatedProjects: updatedCount,
            dueFollowups,
            generatedAt: new Date().toISOString()
        }), { headers: { 'Content-Type': 'application/json' } })

    } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), { headers: { 'Content-Type': 'application/json' }, status: 500 })
    }
})
