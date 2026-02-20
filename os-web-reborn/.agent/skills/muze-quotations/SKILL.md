---
name: muze-quotations
description: Skill for generating premium branded quotations and proposals with Muze AI certification stamps.
---

# Muze AI — Quotation & Proposal Branding

This skill standardizes the creation of commercial proposals and quotations, emphasizing the Muze AI brand and incorporating a "Certified AI" physical stamp.

## Directory Structure
- `scripts/convert-cotizacion.js`: Specialized converter with larger header and footer slogan.
- `resources/styles-cotizacion.css`: Premium stylesheet with Inter typography and signature block styling.
- `resources/muze_aiconsulting.png`: Muze AI logo for the header.
- `resources/timbre_muze_consulting.png`: The authentic Muze AI institutional seal/stamp.

## Branding Elements
- **Header:** Emphasized Muze AI logo (65px height) with "Propuesta Comercial" tag.
- **Footer:** "Decisiones estratégicas potenciadas por Inteligencia Artificial".
- **Signature:** Includes a `signature-block` with a `stamp-placeholder` that automatically overlays the physical stamp image.
- **Color Palette:** Primary `#26ccc0` (Teal), Secondary `#1a1a2e` (Deep Navy).

## Document Structure (Markdown)
Quotations should follow this pattern:
```markdown
# [Title]

**De:** [Sender Name] — [Role], Muze AI Consulting  
**Para:** [Recipient Name] — [Role], [Client Company]  
**Fecha:** [Date]
**Referencia:** [Topic]

---

[Content...]

<div class="signature-block">
  <div class="signature-line"></div>
  <div class="signature-name">[Sender Name]</div>
  <div class="signature-title">[Role]</div>
  <div class="signature-company">Muze AI Consulting</div>
  <div class="stamp-placeholder"></div>
</div>
```

## Generation Process
1. Run from the directory containing the proposal `.md` file:
   ```bash
   node [path-to-skill]/scripts/convert-cotizacion.js proposal.md
   ```

## Customization
- **Stamp:** Modify rotation or opacity in `resources/styles-cotizacion.css` under `.stamp-placeholder`.
- **Slogan:** Update the footer slogan directly in the `scripts/convert-cotizacion.js` if a change in company motto occurs.
