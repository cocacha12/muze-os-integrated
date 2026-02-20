#!/usr/bin/env node
/**
 * Muze AI — Quotation PDF Converter v2
 * Tailored for specialized quotations with emphasized branding
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { marked } = require('marked');

async function main() {
  const puppeteer = require('puppeteer');

  const CSS_FILE = path.join(__dirname, '..', 'resources', 'styles-cotizacion.css');
  const LOGO_FILE = path.join(__dirname, '..', 'resources', 'muze_aiconsulting.png');
  const STAMP_FILE = path.join(__dirname, '..', 'resources', 'timbre_muze_consulting.png');

  const DOCS_DIR = process.cwd();
  const OUTPUT_DIR = path.join(DOCS_DIR, 'pdf-output');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const cssContent = fs.readFileSync(CSS_FILE, 'utf8');

  // Read Muze logo as base64
  let logoBase64 = '';
  if (fs.existsSync(LOGO_FILE)) {
    logoBase64 = fs.readFileSync(LOGO_FILE).toString('base64');
  }

  // Read Stamp image as base64
  let stampBase64 = '';
  if (fs.existsSync(STAMP_FILE)) {
    stampBase64 = fs.readFileSync(STAMP_FILE).toString('base64');
  }

  // Get documents from command line arguments
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node convert-cotizacion.js <file1.md> <file2.md> ...');
    process.exit(1);
  }

  const filesToConvert = args.map(f => f.endsWith('.md') ? f : `${f}.md`);

  console.log('=============================================');
  console.log('  Muze AI — Quotation PDF Generation');
  console.log('=============================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (let i = 0; i < filesToConvert.length; i++) {
    const filename = filesToConvert[i];
    const inputPath = path.join(DOCS_DIR, filename);
    const docName = filename.replace('.md', '');
    const outputPath = path.join(OUTPUT_DIR, `${docName}.pdf`);

    console.log(`  📄 [${i + 1}/${filesToConvert.length}] Converting: ${filename}`);

    try {
      const markdown = fs.readFileSync(inputPath, 'utf8');

      marked.setOptions({
        gfm: true,
        breaks: false,
      });

      let htmlBody = marked.parse(markdown);

      // Inject stamp image into the placeholder if it exists
      if (stampBase64) {
        htmlBody = htmlBody.replace(
          /<div class="stamp-placeholder">([\s\S]*?)<\/div>/g,
          `<div class="stamp-placeholder"><img src="data:image/png;base64,${stampBase64}" style="width: 100%; height: 100%; object-fit: contain;"/></div>`
        );
      }

      const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>${cssContent}</style>
  <style>
    body { padding-top: 10px; } /* Slight extra padding for body start */
  </style>
</head>
<body>
  <div class="content">
    ${htmlBody}
  </div>
</body>
</html>`;

      const tmpHtmlPath = path.join(os.tmpdir(), `muze_cot_${docName}.html`);
      fs.writeFileSync(tmpHtmlPath, fullHtml, 'utf8');

      const page = await browser.newPage();
      await page.goto(`file://${tmpHtmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

      await page.pdf({
        path: outputPath,
        format: 'A4',
        margin: { top: '45mm', bottom: '30mm', left: '25mm', right: '25mm' }, // Increased top and side margins
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="width: 100%; font-family: 'Helvetica', sans-serif; padding: 12mm 25mm 0 25mm; display: flex; flex-direction: column; align-items: flex-start;">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-end; padding-bottom: 15px; border-bottom: 3px solid #26ccc0;">
              ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" style="height: 65px;"/>` : '<span style="color: #26ccc0; font-size: 24px; font-weight: 700;">MUZE AI</span>'}
              <div style="text-align: right; color: #666; font-size: 10px; line-height: 1.4;">
                <strong style="color: #1a1a2e; font-size: 12px;">Propuesta Comercial</strong><br>
                Muze AI Consulting | 2026<br>
                <span style="color: #26ccc0;">www.muze.cl</span>
              </div>
            </div>
            <div style="height: 20px;"></div> <!-- Spacer between line and content start -->
          </div>`,
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; font-family: 'Helvetica', sans-serif; color: #999; padding: 0 25mm; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; padding-top: 10px;">
            <span style="font-weight: 500;">Muze AI Consulting — Decisiones estratégicas potenciadas por Inteligencia Artificial</span>
            <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>`,
      });

      await page.close();
      console.log(`  ✅ Done → ${docName}.pdf`);

    } catch (err) {
      console.log(`  ❌ Error processing ${filename}: ${err.message}`);
    }
  }

  await browser.close();
  console.log('\n=============================================');
  console.log(`  All PDFs saved to: ${OUTPUT_DIR}`);
  console.log('=============================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
