# 🧠 Skill: Reception & Unstructured Data Processing (Memoria y Asignación)

## Context
When a user (like Mark) provides you with a long, unstructured audio transcript, a messy block of text, or a "brain dump" containing multiple instructions, project details, financial figures, and task assignments, you must use this skill to extract, clean, and orchestrate the data.

## Trigger Scenarios
- "Acabo de salir de una reunión con [Cliente], anota esto..."
- "Tengo un montón de ideas para el proyecto X, Juan hará Y, yo haré Z..."
- Long text blocks containing mixed instructions (tasks, revenue, responsibilities).
- Any scenario where the input is chaotic and requires deep information extraction.

## Execution Strategy
You act as a cognitive filter between the user's messy input (Short-Term Memory) and Muze OS (Long-Term Memory).
Follow this 3-Step Process:

### Step 1: Silent Extraction (The Cognitive Filter)
Read the input and silently extract the following entities:
- **Client/Account**: Who is this for?
- **Project Context**: What is the overall goal or project name?
- **Financials**: Is there any mention of cost, revenue, or budget? (Extract generic numbers to `amount_net`).
- **Tasks & Milestones**: Break down the narrative into concrete, logical tasks.
- **Assignees (Owners)**: Who is explicitly mentioned to do what? (e.g., "Mark", "Juan", "CFO").

### Step 2: Confirmation Brief (Optional but recommended)
If the input is highly complex, reply with a very short bulleted summary confirming what you understood:
*"Entendido. Crearé el proyecto X para Cliente Y, con Z tareas. Asignaré a [Nombre] a la tarea W. ¿Procedo a registrarlo?"*
*(If the user's instruction is explicit like "Regístralo de inmediato", skip this step and go to Step 3).*

### Step 3: Long-Term Memory Injection (MCP Dispatch)
Use the `orchestrate_project` tool to inject the entire structured package into Muze OS.
**CRITICAL**: You must now utilize the `assignee` field inside the `tasks` array if a person was mentioned.
Example payload structure for `tasks`:
```json
"tasks": [
  {
    "title": "Configurar Servidor",
    "area": "operations",
    "status": "todo",
    "assignee": "Mark",
    "reasoning": { "analysis": "Mencionado en el audio como responsable de infraestructura." }
  }
]
```

## Important Rules
- Never split the inception of an unstructured dump into multiple GET/POST calls. Assemble the entire reality in your RAM (Step 1) and fire it cleanly via `orchestrate_project` (Step 3).
- If an assignee is mentioned, ALWAYS pass their name in the `assignee` field so the UI can tag them.
