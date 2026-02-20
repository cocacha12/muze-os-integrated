const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3211;
const SKILL_SCRIPT = path.join(__dirname, '.agent', 'skills', 'muze-quotations', 'scripts', 'convert-cotizacion.cjs');
const OUTPUT_DIR = path.join(__dirname, 'pdf-output');

const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url.startsWith('/pdf-output/')) {
        const filePath = path.join(__dirname, req.url);
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'application/pdf' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('File Not Found');
        }
        return;
    }

    if (req.method === 'POST' && req.url === '/generate') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { markdown, filename } = JSON.parse(body);
                if (!markdown || !filename) {
                    throw new Error('markdown and filename are required');
                }

                const tempTs = Date.now();
                const tempMdFilename = `tmp_${tempTs}.md`;
                const tempMdPath = path.join(__dirname, tempMdFilename);
                fs.writeFileSync(tempMdPath, markdown);

                console.log(`[PDF Worker] Generating branded PDF for: ${filename}`);

                // We pass only the relative filename and set cwd to __dirname
                const proc = spawn('node', [SKILL_SCRIPT, tempMdFilename], { cwd: __dirname });

                proc.on('close', (code) => {
                    if (fs.existsSync(tempMdPath)) fs.unlinkSync(tempMdPath);

                    if (code === 0) {
                        const expectedPdfPath = path.join(OUTPUT_DIR, `tmp_${tempTs}.pdf`);
                        if (fs.existsSync(expectedPdfPath)) {
                            const finalPath = path.join(OUTPUT_DIR, `${filename}.pdf`);
                            if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                            fs.renameSync(expectedPdfPath, finalPath);

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ ok: true, pdfUrl: `/pdf-output/${filename}.pdf`, path: finalPath }));
                        } else {
                            res.writeHead(500);
                            res.end(JSON.stringify({ ok: false, error: 'PDF file not found at ' + expectedPdfPath }));
                        }
                    } else {
                        res.writeHead(500);
                        res.end(JSON.stringify({ ok: false, error: `Process exited with code ${code}` }));
                    }
                });
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`✅ Muze AI Quotation Service running on http://localhost:${PORT}`);
    console.log(`   Using script: ${SKILL_SCRIPT}`);
});
