# Muze OS: Agent Handover & Operations Manual (OpenClaw)

Este documento es el manual maestro para que cualquier Agente de IA (OpenClaw / Gemini / Claude) opere en el ecosistema **Muze OS Reborn**.

## 1. Contexto del Sistema
Muze OS Reborn es un hub operativo agéntico diseñado bajo el paradigma **"Todo es una Tarea"**. 
- **Producción**: [https://muzeos.muze.cl](https://muzeos.muze.cl) ✅
- **Frontend**: React + Vite (Desplegado en Docker con PM2).
- **Backend/DB**: Supabase (Postgres + Edge Functions).
- **Herramientas de IA**: Expone un API CRUD y un servidor MCP para ejecución de lógica compleja.

## 2. Política de Sincronización Continua (GitHub)
**Importante**: Este sistema opera bajo una política de "Sync Inmediato". 
- Cada cambio en la infraestructura, lógica de negocio o documentación se refleja instantáneamente en el repositorio remoto: `https://github.com/cocacha12/muze-os-integrated`.
- **Regla para el Agente**: Siempre consulta el repositorio para obtener el contexto más reciente antes de realizar operaciones críticas de CRUD. La documentación local y remota son idénticas y se actualizan en tiempo real.

## 3. Acceso y Autenticación
- **Base URL**: `https://bubblfvliussddwvxdhy.supabase.co/functions/v1/muze-os-api`
- **Contrato del API**: `/public/api-contract-v1.json` (Consúltalo siempre para descubrir endpoints).
- **Headers Requeridos**:
    - `Authorization: Bearer [SUPABASE_ANON_KEY]`
    - `Idempotency-Key: [UUID_UNICO]` (Requerido para mutaciones POST/PATCH).

## 3. Interfaz de Comunicación: Code Mode MCP
Este es el canal **primario** de operación para el Agente. En lugar de docenas de herramientas específicas, el servidor MCP (`muze-mcp-server`) exporta solo dos:

### A. `search(code)`
Permite al agente navegar por el contrato técnico (`api-contract-v1.json`) escribiendo código JS. 
- **Propósito**: Descubrir endpoints, parámetros y esquemas de respuesta sin saturar el contexto.
- **Payload**: El agente recibe un objeto `spec` y debe retornar la parte relevante.

### B. `execute(code)`
Permite al agente ejecutar lógica compleja de forma autónoma en un entorno sandboxed.
- **Propósito**: Realizar operaciones CRUD, encadenar llamadas (ej. crear tarea + actualizar proyecto) y manejar respuestas en un solo round-trip.
- **Inyección**: El sandbox provee el objeto `muze`, el cual tiene el método `request({ method, path, body })`.

## 4. El Contrato de Herramientas (The Knowledge)
El archivo [api-contract-v1.json](./os-web-reborn/public/api-contract-v1.json) es el mapa del tesoro. **NO es un API para llamar manualmente en cada turno**, sino la base de datos que la herramienta `search()` consulta para que el Agente sepa *qué* código escribir en `execute()`.

## 5. Protocolos Operativos (Reglas de Oro)

### A. Operador Autónomo via Code Mode
Como agente, DEBES preferir el uso de `execute()` para:
1.  **Transacciones Atómicas**: Si necesitas mover un estado comercial y crear una tarea contable, hazlo en un solo bloque de código dentro de `execute()`.
2.  **Validación Pre-vuelo**: Usa `search()` al inicio de la sesión para confirmar que los campos que vas a usar en `execute()` existen en la versión actual del API.

### B. Trazabilidad
Toda ejecución vía `execute()` queda registrada automáticamente en la tabla `events` de Supabase con el tipo `mcp_execute_eval` para auditoría gerencial.

## 6. Flujo de Trabajo Recomendado para el Agente
1.  **Exploración**: `GET /api/commercial-summary` para ver qué requiere atención.
2.  **Decisión**: Si un proyecto está en `negotiation`, llama a `generate_quote`.
3.  **Entrega**: Registra el PDF resultante en la tarea correspondiente.
4.  **Confirmación**: Publica un `update` en la tarea informando al equipo que la cotización ha sido enviada.

---
**Handover de Sistema Completado.** El Agente está ahora autorizado para operar.
