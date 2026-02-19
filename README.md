# Muze OS Integrated (v1.0)

Consolidated architecture for Muze OS, integrating client management, opportunity tracking, and project execution with an agentic automation motor.

## 🏗 Repository Structure

- `os-web/`: Backend (Node.js/Express) and UI module.
- `agent-logic/`: Core logic for commercial workflows, intent parsing, and state mutation.
- `data-schemas/`: JSON structures for accounting, project tracking, and quotation logs.
- `docs/`: Protocol documentation and operating model guidelines.

## 🚀 Deployment Requirements

### Environment Variables
Ensure the following variables are configured in your `.env` or deployment environment:

- `PORT`: Set to `3210` (Default for Muze OS).
- `MUZE_PM_PASS_MARK`: Root password for the dashboard/admin access.

### System Dependencies
- **Node.js**: v18+ recommended.
- **Python**: v3.10+ for agent-logic scripts.
- **Puppeteer**: Required for PDF generation (specifically for `muze-quotations` skills). Ensure system libraries for Chromium are installed.

## 📄 Key Components
- **Commercial Workflow Engine**: Orchestrates SLA and EV transitions.
- **Intent Parser**: Processes natural language input from Telegram.
- **Control Protocol**: Governance rules for agent-human interaction.

---
*Created by Antigravity for Muze AI.*
