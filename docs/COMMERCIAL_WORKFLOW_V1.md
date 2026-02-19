# Commercial Workflow v1 (Muze)

Objetivo: seguimiento proactivo de oportunidades comerciales por proyecto, desde cotización hasta cobro y post-entrega.

## Etapas canónicas
1. `negotiation` — negociación abierta
2. `quote_sent` — cotización PDF enviada
3. `accepted` — cotización aceptada
4. `po_received` — OC recibida
5. `invoice_sent` — factura enviada
6. `development_active` — desarrollo activado (Mark + equipo)
7. `payment_received` — pago recibido
8. `delivered` — proyecto entregado
9. `change_mgmt_30d` — gestión del cambio por 30 días
10. `closed` — cierre comercial final

## Protocolo conversacional (obligatorio)
1) Preguntar: "¿Cómo va la cotización?"
2) Si aceptada: preguntar "¿Cuándo envían OC?" y fijar deadline.
3) En deadline: preguntar "¿Se recibió la OC?"
4) Si OC recibida: crear tarea Finanzas `Emitir factura`.
5) Preguntar: "¿Factura enviada?"
6) Si sí: activar tarea `development_active` (Mark + equipo).
7) A los 30 días de factura: preguntar "¿Se recibió el pago de la factura?"
8) Preguntar: "¿Se entregó el proyecto?"
9) Si entregado: abrir `change_mgmt_30d` (30 días de seguimiento).
10) Al completar seguimiento: cerrar en `closed`.

## Reglas de automatización
- Cada transición debe registrar evento en `business/management/events/events.jsonl`.
- Cada transición debe crear/actualizar tarea en `business/management/actions/open.jsonl`.
- Los recordatorios se envían por el mismo canal de origen (DM/roadmap).
- Si no hay respuesta, reintentar con cooldown (sin spam) y escalar según SLA.

## Datos mínimos por proyecto
- customer
- project
- owner comercial
- etapa actual
- deadline de la próxima pregunta
- quoteId/pdfUrl (si aplica)
- taskIds relacionadas (comercial/finanzas/ops)

## Extensión v1.1 (Pareto 200+ IQ)

### A) Prioridad por valor esperado
- Campo `amount` (monto) + `stageProbability` (0-1).
- Cálculo: `expectedValue = amount * stageProbability`.
- Priorizar follow-up por mayor `expectedValue` y mayor riesgo de atraso.

Probabilidades sugeridas por etapa:
- negotiation: 0.25
- quote_sent: 0.40
- accepted: 0.65
- po_received: 0.80
- invoice_sent: 0.92
- payment_received: 1.00

### B) SLA por etapa
- negotiation: primer follow-up en 48h
- quote_sent: follow-up en 72h
- accepted: confirmar OC en 48h
- po_received: factura en <=24h
- invoice_sent: control de pago en D+30
- delivered: abrir change management en <=24h

Semáforo:
- Verde: dentro de SLA
- Amarillo: +1 a +2 días sobre SLA
- Rojo: >2 días sobre SLA

### C) Next Best Action (NBA) obligatorio
Cada proyecto debe mantener:
- `nextAction`
- `nextActionOwner`
- `nextActionDue`

Si falta alguno, el bot debe preguntar y completar.

### D) Motivo de fricción/pérdida estructurado
Campo `frictionReason` (uno o más):
- price
- timing
- scope
- legal_procurement
- missing_sponsor
- no_budget
- competitor
- silent_customer
- internal_delay

### E) Gates de calidad por transición
- quote_sent -> accepted: requiere evidencia (mensaje/email/acta de aceptación)
- accepted -> po_received: requiere OC o confirmación documental
- po_received -> invoice_sent: requiere tarea de finanzas creada + evidencia de envío
- invoice_sent -> payment_received: requiere validación de cobro
- delivered -> change_mgmt_30d: requiere acta/confirmación de entrega

### F) Forecast ejecutivo semanal
Emitir 1 resumen semanal con:
- pipelineAmountTotal
- expectedValueTotal
- negocios en rojo (SLA)
- cierres esperados 7/14/30 días
- top 3 acciones críticas por owner
