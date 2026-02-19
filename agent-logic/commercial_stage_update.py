#!/usr/bin/env python3
import argparse, json, datetime
from pathlib import Path

PROJECTS = Path('/home/node/.openclaw/workspace/research/muze-pm-lite/data/commercial_projects.json')
EVENTS = Path('/home/node/.openclaw/workspace/business/management/events/events.jsonl')

VALID = [
  'negotiation','quote_sent','accepted','po_received','invoice_sent',
  'development_active','payment_received','delivered','change_mgmt_30d','closed'
]

def now_iso():
  return datetime.datetime.utcnow().replace(microsecond=0).isoformat()+'Z'

def load_projects():
  if not PROJECTS.exists():
    return []
  return json.loads(PROJECTS.read_text(encoding='utf-8'))

def save_projects(items):
  PROJECTS.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')

def append_event(evt):
  EVENTS.parent.mkdir(parents=True, exist_ok=True)
  row = {'eventId': f"evt-{int(datetime.datetime.utcnow().timestamp()*1000)}", 'ts': now_iso(), 'schemaVersion': 1, **evt}
  with EVENTS.open('a', encoding='utf-8') as f:
    f.write(json.dumps(row, ensure_ascii=False)+'\n')

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--projectId', required=True)
  ap.add_argument('--stage', required=True, choices=VALID)
  ap.add_argument('--deadline', required=False)
  ap.add_argument('--note', required=False, default='')
  ap.add_argument('--source', required=False, default='roadmap')
  args = ap.parse_args()

  items = load_projects()
  idx = next((i for i,p in enumerate(items) if p.get('projectId')==args.projectId), -1)
  if idx < 0:
    raise SystemExit('PROJECT_NOT_FOUND')

  before = dict(items[idx])
  items[idx]['stage'] = args.stage
  if args.deadline:
    items[idx]['nextFollowupAt'] = args.deadline
  items[idx]['lastNote'] = args.note
  items[idx]['updatedAt'] = now_iso()

  save_projects(items)
  append_event({
    'source': args.source,
    'channel': 'roadmap' if args.source != 'dm' else 'dm',
    'type': 'commercial_project_mutation',
    'entityId': args.projectId,
    'before': before,
    'after': items[idx],
    'meta': {'note': args.note}
  })

  print(json.dumps({'ok': True, 'project': items[idx]}, ensure_ascii=False))

if __name__ == '__main__':
  main()
