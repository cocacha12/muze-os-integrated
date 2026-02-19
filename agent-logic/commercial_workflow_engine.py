#!/usr/bin/env python3
import json, datetime
from pathlib import Path

PROJECTS = Path('/home/node/.openclaw/workspace/research/muze-pm-lite/data/commercial_projects.json')
QUOTES = Path('/home/node/.openclaw/workspace/research/muze-pm-lite/data/commercial_quotes.json')
ACTIONS = Path('/home/node/.openclaw/workspace/business/management/actions/open.jsonl')
STATE = Path('/home/node/.openclaw/workspace/memory/commercial-followup-state.json')

STAGE_PROB = {
    'negotiation': 0.25,
    'quote_sent': 0.40,
    'accepted': 0.65,
    'po_received': 0.80,
    'invoice_sent': 0.92,
    'development_active': 0.95,
    'payment_received': 1.00,
    'delivered': 1.00,
    'change_mgmt_30d': 1.00,
    'closed': 1.00,
}

SLA_DAYS = {
    'negotiation': 2,
    'quote_sent': 3,
    'accepted': 2,
    'po_received': 1,
    'invoice_sent': 30,
    'development_active': 7,
    'payment_received': 14,
    'delivered': 1,
    'change_mgmt_30d': 7,
}

QUESTION_BY_STAGE = {
    'negotiation': '¿Cómo va la cotización?',
    'quote_sent': '¿Cómo va la cotización?',
    'accepted': '¿Cuándo envían OC?',
    'po_received': '¿Se recibió la OC y ya está lista la factura?',
    'invoice_sent': 'Han pasado 30 días, ¿se recibió el pago de la factura?',
    'development_active': '¿Se entregó el proyecto?',
    'delivered': '¿Cómo va la gestión de cambio post-entrega?',
    'change_mgmt_30d': '¿Seguimos sin incidencias en gestión del cambio?',
}


def now_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'


def today():
    return datetime.date.today()


def parse_day(s):
    try:
        return datetime.date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def load_actions():
    out = []
    if not ACTIONS.exists():
        return out
    for ln in ACTIONS.read_text(encoding='utf-8').splitlines():
        ln = ln.strip()
        if ln:
            out.append(json.loads(ln))
    return out


def save_actions(items):
    ACTIONS.write_text('\n'.join(json.dumps(x, ensure_ascii=False) for x in items) + '\n', encoding='utf-8')


def ensure_task(actions, title, area, owner, due_date, linked_project_id, objective):
    idx = next((i for i, a in enumerate(actions) if a.get('linkedProjectId') == linked_project_id and a.get('title') == title and a.get('status') != 'done'), -1)
    if idx >= 0:
        a = actions[idx]
        a['dueDate'] = due_date
        a['updatedAt'] = now_iso()
        actions[idx] = a
        return a['id']

    base = linked_project_id.replace('cermaq-', 'CER-').upper()
    task_id = f"{area[:3].upper()}-{datetime.date.today().strftime('%Y%m%d')}-{base[:8]}-{len(actions)+1:03d}"
    actions.append({
        'id': task_id,
        'area': area,
        'title': title,
        'objective': objective,
        'owner': owner,
        'dueDate': due_date,
        'status': 'todo',
        'priority': 'alta',
        'linkedProjectId': linked_project_id,
        'nextCheckIn': due_date,
        'evidence': [],
        'blockers': [],
        'createdAt': now_iso(),
        'updatedAt': now_iso(),
    })
    return task_id


def main():
    projects = load_json(PROJECTS, [])
    quotes = load_json(QUOTES, [])
    state = load_json(STATE, {'lastPingByProject': {}})
    actions = load_actions()

    tdy = today()
    due_followups = []

    for p in projects:
        stage = p.get('stage') or 'negotiation'
        amount = float(p.get('amount') or 0)
        prob = STAGE_PROB.get(stage, 0.25)
        p['stageProbability'] = prob
        p['expectedValue'] = round(amount * prob, 2)

        if not p.get('nextFollowupAt'):
            sla = SLA_DAYS.get(stage, 3)
            p['nextFollowupAt'] = (tdy + datetime.timedelta(days=sla)).isoformat()

        next_day = parse_day(p.get('nextFollowupAt'))
        if next_day and next_day <= tdy:
            pid = p.get('projectId')
            last_ping = parse_day(state.get('lastPingByProject', {}).get(pid))
            if last_ping != tdy:
                owner = p.get('owner', 'Comercial')
                owner_l = str(owner).lower()
                owner_tag = '@mark' if 'mark' in owner_l else ('@christopher' if 'christopher' in owner_l else '')
                due_followups.append({
                    'projectId': pid,
                    'customer': p.get('customer'),
                    'project': p.get('name'),
                    'stage': stage,
                    'question': QUESTION_BY_STAGE.get(stage, '¿Cómo va este proyecto?'),
                    'owner': owner,
                    'ownerTag': owner_tag
                })
                state.setdefault('lastPingByProject', {})[pid] = tdy.isoformat()

        # Auto-derived tasks by stage
        if stage == 'po_received':
            tid = ensure_task(
                actions,
                title=f"Emitir factura · {p.get('customer','Cliente')} · {p.get('name','Proyecto')}",
                area='finanzas',
                owner='Gerente Finanzas (IA)',
                due_date=(tdy + datetime.timedelta(days=1)).isoformat(),
                linked_project_id=p.get('projectId'),
                objective='Emitir y enviar factura con respaldo de OC recibida.'
            )
            p['financeTaskId'] = tid

        if stage == 'invoice_sent':
            tid = ensure_task(
                actions,
                title=f"Activar desarrollo · {p.get('customer','Cliente')} · {p.get('name','Proyecto')}",
                area='operaciones',
                owner='Mark / Equipo Dev',
                due_date=(tdy + datetime.timedelta(days=1)).isoformat(),
                linked_project_id=p.get('projectId'),
                objective='Activar ejecución técnica tras envío de factura.'
            )
            p['developmentTaskId'] = tid

        if stage == 'delivered':
            tid = ensure_task(
                actions,
                title=f"Gestión de cambio 30 días · {p.get('customer','Cliente')} · {p.get('name','Proyecto')}",
                area='operaciones',
                owner='Gerente Operaciones (IA)',
                due_date=(tdy + datetime.timedelta(days=30)).isoformat(),
                linked_project_id=p.get('projectId'),
                objective='Seguimiento post-entrega de adopción y gestión del cambio por 30 días.'
            )
            p['changeMgmtTaskId'] = tid

        # enrich quote link count
        pid = (p.get('projectId') or '').lower()
        related = [q for q in quotes if pid.split('cermaq-')[-1] in (str(q.get('project','')).lower())]
        p['quoteCount'] = len(related)

        # 200+ IQ: Stale detection (Inactividad silenciosa)
        last_upd = parse_day(p.get('updatedAt') or p.get('createdAt'))
        if last_upd:
            days_inactive = (tdy - last_upd).days
            if days_inactive >= 5 and stage not in ['payment_received', 'closed']:
                p['isStale'] = True
                owner = p.get('owner', 'Comercial')
                owner_tag = '@mark' if 'mark' in str(owner).lower() else ('@christopher' if 'christopher' in str(owner).lower() else '')
                due_followups.append({
                    'projectId': pid,
                    'customer': p.get('customer'),
                    'project': p.get('name'),
                    'stage': stage,
                    'question': f"⚠️ Inactividad: lleva {days_inactive} días sin novedades. ¿Hay algún bloqueo (precio, timing, sponsor)?",
                    'owner': owner,
                    'ownerTag': owner_tag,
                    'isStaleAlert': True
                })

        p['updatedAt'] = now_iso()

    save_json(PROJECTS, projects)
    save_json(STATE, state)
    save_actions(actions)

    print(json.dumps({
        'ok': True,
        'updatedProjects': len(projects),
        'dueFollowups': due_followups,
        'generatedAt': now_iso()
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
