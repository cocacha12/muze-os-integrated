#!/usr/bin/env python3
import sys, json, datetime, re
from pathlib import Path

# Configuración de rutas
PROJECTS_PATH = Path('/home/node/.openclaw/workspace/research/muze-pm-lite/data/commercial_projects.json')
SCRIPTS_DIR = Path('/home/node/.openclaw/workspace/business/management/scripts')
STAGE_UPDATE_SCRIPT = SCRIPTS_DIR / 'commercial_stage_update.py'

# Mapeo de intención a etapa y lógica de deadline
INTENTS = [
    {
        'patterns': [r'\bcotizaci[oó]n aceptada\b', r'\baceptaron\b', r'\bpropuesta aceptada\b', r'\basi es\b', r'\bsi\b'],
        'current_stage': 'quote_sent',
        'next_stage': 'accepted',
        'deadline_delta': 2,
        'note': 'Aceptación confirmada vía chat.'
    },
    {
        'patterns': [r'\boc recibida\b', r'\bya lleg[oó] la oc\b', r'\brecibimos la oc\b', r'\btenemos oc\b'],
        'current_stage': 'accepted',
        'next_stage': 'po_received',
        'deadline_delta': 1,
        'note': 'OC recibida confirmada vía chat.'
    },
    {
        'patterns': [r'\bfactura enviada\b', r'\bya se envi[oó] la factura\b', r'\bfacturada\b'],
        'current_stage': 'po_received',
        'next_stage': 'invoice_sent',
        'deadline_delta': 30,
        'note': 'Envío de factura confirmado vía chat.'
    },
    {
        'patterns': [r'\bpago recibido\b', r'\bya pagaron\b', r'\bcobrado\b', r'\btransferencia recibida\b'],
        'current_stage': 'invoice_sent',
        'next_stage': 'payment_received',
        'deadline_delta': 1,
        'note': 'Pago confirmado vía chat.'
    },
    {
        'patterns': [r'\bproyecto entregado\b', r'\bya se entreg[oó]\b', r'\bentrega lista\b'],
        'current_stage': 'development_active',
        'next_stage': 'delivered',
        'deadline_delta': 1,
        'note': 'Entrega de proyecto confirmada vía chat.'
    }
]

def parse_date_mentions(text):
    # Buscar "mañana"
    if 'mañana' in text.lower():
        return (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    # Buscar fechas YYYY-MM-DD
    match = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', text)
    if match:
        return match.group(1)
    return None

def main():
    if len(sys.argv) < 3:
        print(json.dumps({'ok': False, 'error': 'USAGE: parser.py <projectId> <text>'}))
        return

    pid = sys.argv[1]
    text = sys.argv[2].lower()
    
    if not PROJECTS_PATH.exists():
        print(json.dumps({'ok': False, 'error': 'PROJECTS_FILE_NOT_FOUND'}))
        return

    projects = json.loads(PROJECTS_PATH.read_text(encoding='utf-8'))
    proj = next((p for p in projects if p.get('projectId') == pid), None)
    
    if not proj:
        print(json.dumps({'ok': False, 'error': 'PROJECT_NOT_FOUND'}))
        return

    current_stage = proj.get('stage', 'negotiation')
    
    # Buscar match de intención
    match = None
    for intent in INTENTS:
        if intent['current_stage'] == current_stage:
            for pattern in intent['patterns']:
                if re.search(pattern, text):
                    match = intent
                    break
        if match: break
    
    if not match:
        print(json.dumps({'ok': False, 'status': 'NO_MATCH', 'current_stage': current_stage}))
        return

    # Determinar deadline
    deadline = parse_date_mentions(text)
    if not deadline:
        deadline = (datetime.date.today() + datetime.timedelta(days=match['deadline_delta'])).isoformat()

    # Preparar comando de actualización
    import subprocess
    cmd = [
        'python3', str(STAGE_UPDATE_SCRIPT),
        '--projectId', pid,
        '--stage', match['next_stage'],
        '--deadline', deadline,
        '--note', match['note'],
        '--source', 'roadmap' # por defecto, se puede parametrizar
    ]
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(res.stdout)
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))

if __name__ == '__main__':
    main()
