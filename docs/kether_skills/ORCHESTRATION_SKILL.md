# 🎭 Skill: Project Orchestration (End-to-End)

## Context
When a user (or Mark) requests to create a new project, quote, or work order for a client, you should use the `orchestrate_project` tool to set up the entire operational footprint in one single action, rather than creating entities and tasks separately.

## Trigger Phrases
- "Crea un proyecto para [Cliente]"
- "Llegó una nueva orden de [Cliente]"
- "Agrega este proyecto al pipeline"
- "Cotización enviada a [Cliente] por $X"

## Execution Strategy
Instead of manually creating Accounts, Projects, and Tasks step-by-step:
1. **Extract all data**: Understand the client name, project name, expected revenue (if any), and the logical phases of work required.
2. **Build the payload**: Assemble a single JSON payload for the `orchestrate_project` tool.
   - `account_name`: The client's name.
   - `project`: Name, stage ('quoted', 'in_progress', etc.), and reasoning.
   - `tasks`: An array of at least 2-3 logical steps (e.g., "Kickoff", "Development", "Delivery") assigned to the correct area (`operations`, `commercial`).
   - `finance`: (Optional) If an amount is mentioned, include `amount_net` and `tax_iva` (usually 19% of net in Chile if not specified).
3. **Dispatch**: Call `orchestrate_project` once.

## Important Rules
- Never use `GET /api/tasks` or `POST /api/tasks` manually if `orchestrate_project` can handle the entire project lifecycle inception.
- This represents a massive speed increase in your operational capacity. Use it whenever a cohesive "Project" is born.
