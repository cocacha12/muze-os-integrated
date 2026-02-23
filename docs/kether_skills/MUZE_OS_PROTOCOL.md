# 📖 Protocolo Operativo: Muze OS Agentic Stack (v1.0)

Este documento define el estándar de interacción entre el Agente Director (Kether) y el ecosistema Muze OS para la gestión empresarial total.

## 1. Arquitectura de Verdad
*   **Cerebro Maestro:** Aplicación Web (Supabase). Los datos operativos NO residen en el contexto del chat ni en archivos locales de forma permanente.
*   **Interfaz de Entrada:** Chat (Telegram/Signal/etc.). El agente transforma lenguaje natural y archivos (PDF/Imágenes) en registros estructurados.
*   **Capa de Acción:** Edge Functions de Supabase (REST API) y MCP Server (SSE).

## 2. Flujo de Procesamiento de Inputs (Agentic CRUD)
Ante cualquier input (mensaje de texto crudo, audio transcrito, notas largas o archivo), el agente ejecuta:
1.  **Recepción y Filtro Cognitivo:** Debes **siempre** referirte y cumplir la skill documentada en `RECEPTION_SKILL.md` para limpiar, entender y estructurar cualquier texto desordenado o lista de ideas.
2.  **Extracción:** Identificar Cliente, Tipo de Documento (OC/Factura), Montos, Fechas, Hitos y **Responsables Asignados (Assignees)**.
3.  **Análisis de Bloqueadores:** Identificar condiciones críticas (ej. Código HES, aprobaciones pendientes).
4.  **Sincronización:**
    *   **Orquestación Integral:** Ante un evento o proyecto nuevo (cliente + fases + requerimiento), debes **siempre** referirte y cumplir la skill documentada en `ORCHESTRATION_SKILL.md`. Utilizarás obligatoriamente la herramienta `orchestrate_project` sin ejecutar pasos separados.
    *   **🌟 Conciencia de Contexto (Anti-Alucinación):** Si dudas sobre qué `area` asignar, qué `status` es válido, a quién (`assignee`) otorgarle una tarea, o si la API aborta tu solicitud por "Invalid Status/Area", **DEBES** ejecutar la herramienta `get_workspace_context` para recuperar los mapas y enumeradores actualizados desde la Base de Datos antes de reintentar. No intentes adivinar ni inventar jerarquías.
    *   **Acciones Aisladas:** Tareas individuales usan POST `/api/tasks`, registro individual de sub-agentes usa POST `/api/entities`.
    *   **upload_file**: Almacenamiento de evidencias firmes en el Storage de Muze OS vinculado a la tarea o ID del proyecto.

## 3. Estándares de Visualización (Dashboard Sync)
Para asegurar que el Dashboard pinte la información correctamente, el agente debe:
*   **Normalizar Status:** Usar estrictamente `todo`, `doing`, `done`.
*   **Asignar Área:** Clasificar en `commercial`, `operations`, `finance` o `system`.
*   **Vincular Owner:** Usar su `entity_id` registrado.

## 4. Gestión de Infraestructura (Protocolo de Escalación)
*   **Sync Errors:** Si la API rechaza columnas, solicitar `NOTIFY pgrst, 'reload schema';` al humano/Antgravity.
*   **Router Issues:** Si los métodos `PATCH` fallan, reportar la necesidad de soporte para parámetros de consulta (`query params`).

## 5. Onboarding de Instancia Nueva
Cualquier instancia nueva debe iniciar con:
1.  Lectura de este protocolo.
2.  Ejecución de `GET /api/tasks` para reconstruir el estado actual del negocio.
3.  Registro en `entities` para establecer presencia en el LiveAuditWidget.

---
*Documento generado por Kether ☀️ - Director Operativo.*
