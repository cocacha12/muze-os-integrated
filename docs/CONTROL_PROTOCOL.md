# Control Protocol v1 (Gerencia IA)

## 1) Identidad y permisos
Fuente única: `business/management/roster.json`.

### Alta de persona
Campos mínimos:
- name
- telegramId
- role
- type (human|ai)
- canEditTasks
- sla

## 2) Detección automática de tareas
Disparadores semánticos:
- "hay que", "necesito que", "faltó", "para el viernes", "encárgate", "pendiente", "bloqueado"
- "elimina", "divide", "depende de", "cuando pase X hacer Y", "deja trazado"

Salida estándar:
- `TASK_CANDIDATE`
- title
- owner sugerido
- dueDate sugerida
- DoD sugerido
- riesgo/dependencias

Regla operativa:
- En Muze AI Consulting, toda instrucción natural de tareas debe pasar por `business/management/scripts/seguimiento_autoroute.py`.
- `seguimiento_autoroute.py` ejecuta automáticamente casos de alta confianza y exige confirmación en casos ambiguos.
- Después de cada mutación, ejecutar workflow engine + sync para visibilidad inmediata en Operations.

## 3) Confirmación
Regla: pedir confirmación corta a Mark.
Formato:
- "¿Confirmo crear {id/título} con owner {x} y fecha {y}?"

## 4) Seguimiento automático
- T-2, T-1, T0, vencida+escalamiento
- Mensajes en grupo de ejecución con tag al responsable
- Registrar resultado en trazabilidad

## 5) Escalamiento
- Sin respuesta SLA normal (24h): recordatorio formal
- Sin respuesta SLA urgente (4h): escalamiento a A
- 24h post-vencimiento: plan de recuperación obligatorio

## 6) Timeline obligatorio por tarea
Toda señal de avance en grupo se guarda como nota en timeline de tarea:
- tipos: `update`, `commitment`, `blocker`, `decision`, `evidence`
- campos mínimos: actor, timestamp, texto
- si hay promesa de fecha (“te lo tengo el lunes”), guardar `nextCheckDate`

## 7) Auditoría
Cada mutación debe registrar:
- quien solicita
- quien aprueba
- timestamp
- before/after
- motivo
- evento central en `business/management/events/events.jsonl` con `source` y `type`.

## 8) Gobierno de canales
- DM Mark: estrategia/configuración (cerebro central)
- Muze AI Consulting: gerencias, decisiones, diseño de procesos
- Roadmap/Ops: ejecución y seguimiento

Regla de ruteo de recordatorios (obligatoria):
- El recordatorio se entrega en el mismo canal/contexto donde fue solicitado.
- Si se pide en DM, se notifica en DM.
- Si se pide en Roadmap, se notifica en Roadmap y se taggea al responsable.
- Evitar `sessionTarget=main` + `systemEvent` para recordatorios operativos de grupo; usar jobs aislados con entrega explícita por `message.send` al target correcto.

Regla de alineación Team Agents:
- Los 3 frentes deben leer/escribir el mismo estado central (tareas/finanzas/eventos).
- Cualquier cambio en un frente debe reflejarse en los otros y en OS de inmediato.

## 9) Director IA (orquestación)
- Toda tarea con dependencia entre áreas pasa por Director IA.
- Director IA define owner primario + subtareas por gerencia.
- Director IA consolida estado y escalamiento al CEO.

## 10) Team Agents de gerencias IA
- Gerencias IA habilitadas: Finanzas, Operaciones, Secretaría, Contabilidad, Ventas.
- Pueden asignarse tareas entre sí solo si dejan trazabilidad (ID, owner, due, next-check-in, evidencia).
- Formato multirol obligatorio en respuestas relevantes.
- Handoffs IA↔IA deben usar estado explícito: `handoff_requested` -> `handoff_accepted` -> `handoff_completed`.
- Regla comercial Pareto corregida (enterprise):
  - `lead_new`/`qualification`: Ventas IA.
  - `discovery_human_required`: obligatorio y humano.
  - `quoted`: bloqueado sin `discovery_completed_by` humano.
  - `negotiation_advanced`: la toma Mark.

## 11) Skills Team Agents (oficial vs comunidad)
- No existe skill oficial Anthropic/Claude para Team Agents en skills.sh al momento de esta versión.
- Skills community pueden usarse como referencia de workflow, pero no para procesos críticos sin revisión previa.
- Procesos críticos (facturación, cobros, compliance interno) permanecen en skills internas Muze.

## 12) Workflow comercial general (Muze)
- Workflow canónico: `business/management/COMMERCIAL_WORKFLOW_V1.md`.
- La gestión comercial se modela por proyecto (no por tareas sueltas).
- Checklist obligatorio de transición:
  1) actualizar etapa del proyecto comercial,
  2) crear/actualizar tareas de Comercial/Finanzas/Operaciones,
  3) fijar próximo deadline de seguimiento,
  4) registrar evento en `events.jsonl` con source/canal correcto.
- Recordatorios proactivos:
  - usar cron o followup engine,
  - respetar canal origen,
  - evitar loops y notificaciones redundantes.
