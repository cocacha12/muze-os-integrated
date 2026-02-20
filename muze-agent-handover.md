# Muze OS: Agent Handover & Operations Manual (OpenClaw)

Este documento es el manual maestro para que cualquier Agente de IA (OpenClaw / Gemini / Claude) opere en el ecosistema **Muze OS Reborn**.

## 1. Contexto del Sistema
Muze OS Reborn es un hub operativo agéntico diseñado bajo el paradigma **"Todo es una Tarea"**. 
- **Frontend**: React + Vite (en `os-web-reborn/`).
- **Backend/DB**: Supabase (Postgres + Edge Functions).
- **Herramientas de IA**: Expone un API CRUD y un servidor MCP para ejecución de lógica compleja.

## 2. Acceso y Autenticación
- **Base URL**: `https://uajdytklnstnujwpsldl.supabase.co/functions/v1/muze-os-api`
- **Contrato del API**: `/public/api-contract-v1.json` (Consúltalo siempre para descubrir endpoints).
- **Headers Requeridos**:
    - `Authorization: Bearer [SUPABASE_ANON_KEY]`
    - `Idempotency-Key: [UUID_UNICO]` (Requerido para mutaciones POST/PATCH).

## 3. Capacidades Principales (Omnipotencia Agéntica)
El agente tiene control **total y absoluto** (CRUD) sobre las siguientes entidades mediante el API:
- **Tasks**: Gestión de Kanban operacional. Soporta `updates`, `files` y `activity`.
- **Finance**: Gestión completa de `revenues` (ingresos) y `expenses` (egresos). El agente puede registrar facturas, actualizar pagos y proyectar flujos de caja.
- **Accounts**: Gestión de la base de datos de clientes y contactos.
- **Projects**: Seguimiento del pipeline comercial y transiciones de etapa.
- **Quotes**: Generación y registro de propuestas comerciales.

## 4. Protocolos Operativos (Reglas de Oro)

### A. Operador Financiero Autónomo
Como agente, tienes permiso para:
1.  **Registrar Ingresos**: Al recibir confirmación de pago o emisión de factura.
2.  **Gestionar Gastos**: Categorizar y actualizar los egresos mensuales.
3.  **Auditoría Continua**: Cruzar los datos de `commercial_projects` con `finance_revenues` para asegurar consistencia.

### A. Vínculo Documental Automático
Siempre que generes un documento (ej. Cotización PDF), DEBES:
1.  Identificar el `project_id` relacionado.
2.  Buscar la tarea asociada a ese proyecto en la tabla `tasks`.
3.  Registrar el archivo en `task_files` y documentar la acción en `task_activity`.

### B. Gestión de Clientes Especiales (CERMAQ)
- Si el proyecto es para **Cermaq**, el estado `oc_sent` requiere el código **HES**.
- Si detectas que falta el HES, debes crear una tarea de seguimiento en el área de Finanzas.

### C. Trazabilidad de IA
- Cada acción realizada por la IA en la base de datos debe incluir `actor: "Director IA"` en el JSON de la solicitud.
- Usa descriptores claros en la columna `note` al actualizar etapas comerciales.

## 5. Servidor MCP (Advanced Execution)
Muze OS incluye un servidor MCP (`muze-mcp-server`) que permite la ejecución de código sandboxed:
- **`search(code)`**: Úsalo para navegar por el contrato API sin gastar tokens de contexto.
- **`execute(code)`**: Te permite enviar un bloque JavaScript complejo que realice múltiples llamadas al API en una sola transacción, optimizando latencia.

## 6. Flujo de Trabajo Recomendado para el Agente
1.  **Exploración**: `GET /api/commercial-summary` para ver qué requiere atención.
2.  **Decisión**: Si un proyecto está en `negotiation`, llama a `generate_quote`.
3.  **Entrega**: Registra el PDF resultante en la tarea correspondiente.
4.  **Confirmación**: Publica un `update` en la tarea informando al equipo que la cotización ha sido enviada.

---
**Handover de Sistema Completado.** El Agente está ahora autorizado para operar.
