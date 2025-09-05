import { kv } from '@vercel/kv';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Fontes
process.env.FONTCONFIG_PATH = path.join(process.cwd(), 'fonts');
process.env.PATH = `${process.env.PATH}:/usr/bin/`;

// --- CONFIG ---
const imageUrls = {
    fortune_template: 'https://i.ibb.co/hRWtBZbS/Zoltar-Filipeta.png',
    locked: 'https://i.ibb.co/RG8sdVw2/Zoltar-5.png'
};

// --- HANDLER ---
export default async function handler(request, response) {
    // --- INICIALIZACAO ---
    const url = new URL(request.url, `http://${request.headers.host}`);
    const ip = (request.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    try {
        const quotesPath = path.join(process.cwd(), 'quotes.json');
        const quotesJson = await fs.readFile(quotesPath, 'utf8');
        const quotes = JSON.parse(quotesJson);

        // --- DEBUG ---
        if (url.searchParams.get('reset') === 'true') {
            await kv.del(ip);

            const country = request.headers['x-vercel-ip-country'] || 'N/A';
            const city = request.headers['x-vercel-ip-city'] || 'N/A';
            const region = request.headers['x-vercel-ip-country-region'] || 'N/A';
            const userAgent = request.headers['user-agent'] || 'N/A';
            const language = request.headers['accept-language'] || 'N/A';
            const hour = new Date().getUTCHours() - 3;
            const activeTags = new Set();
            if (hour >= 18 || hour < 6) activeTags.add('noite'); else activeTags.add('dia');
            if (country) activeTags.add(country);
            
            const baseWeight = 1;
            const tagBonus = 2;
            const quotesWithWeights = quotes.map(quote => {
                let score = baseWeight;
                quote.tags.forEach(tag => {
                    if (activeTags.has(tag)) {
                        score += tagBonus;
                    }
                });
                return { ...quote, score };
            });

            const pool = [];
            for (const quote of quotesWithWeights) {
                for (let i = 0; i < quote.score; i++) {
                    pool.push(quote);
                }
            }
            const simulatedQuote = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
            
            response.setHeader('Content-Type', 'text/html');
            const reportHtml = `
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8"><title>Zoltar - Debug Reset</title>
                    <style>
                        body { font-family: monospace; background-color: #000000; color: #f0f0f0; padding: 20px; }
                        h1, h2 { color: #00aaff; border-bottom: 1px solid #00aaff; padding-bottom: 5px; }
                        p, li { font-size: 16px; line-height: 1.6; }
                        hr { border-color: #333; }
                        pre { background-color: #1a1a1a; padding: 15px; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word; border: 1px solid #00aaff; }
                        strong { color: #00aaff; } .value { color: #f0f0f0; }
                    </style>
                </head>
                <body>
                    <h1>Relatório de Depuração (Algoritmo de Urna)</h1>
                    <p>Seu IP (<span class="value">${ip}</span>) foi resetado.</p> <hr>
                    <h2>1. Dados "Pescados" do Usuário</h2>
                    <pre><strong>IP:</strong> <span class="value">${ip}</span>
<strong>País:</strong> <span class="value">${country}</span>
<strong>Cidade:</strong> <span class="value">${city}</span>
<strong>Estado/Região:</strong> <span class="value">${region}</span>
<strong>Idioma:</strong> <span class="value">${language}</span>
<strong>User-Agent:</strong> <span class="value">${userAgent}</span></pre>
                    <h2>2. Lógica de Pesos</h2>
                    <p><strong>Tags de Contexto Ativas:</strong> [${Array.from(activeTags).join(', ')}]</p>
                    <p><strong>Regra:</strong> Peso base de ${baseWeight} + Bônus de ${tagBonus} por tag correspondente.</p>
                    <p><strong>Pesos Calculados para Cada Frase:</strong></p>
                    <pre>${JSON.stringify(quotesWithWeights, null, 2)}</pre>
                    <h2>3. Simulação da Randomização</h2>
                    <p>A "urna" de sorteio contém <strong>${pool.length}</strong> "papeizinhos" no total.</p>
                    <p><strong>Frase que seria sorteada nesta simulação:</strong></p>
                    <pre>${simulatedQuote ? JSON.stringify(simulatedQuote, null, 2) : 'Nenhuma frase encontrada.'}</pre>
                </body>
                </html>
            `;
            return response.status(200).send(reportHtml);
        }

        // --- LOCK ---
        const lastVisitTimestamp = await kv.get(ip);
        if (lastVisitTimestamp && lastVisitTimestamp > twentyFourHoursAgo) {
            const lockedImageResponse = await fetch(imageUrls.locked);
            const lockedImageBuffer = await lockedImageResponse.arrayBuffer();
            response.setHeader('Content-Type', 'image/png');
            response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return response.status(200).end(Buffer.from(lockedImageBuffer));
        }

        // --- SORTEIO ---
        const activeTags = new Set();
        const country = request.headers['x-vercel-ip-country'] || null;
        const hour = new Date().getUTCHours() - 3;
        if (hour >= 18 || hour < 6) activeTags.add('noite'); else activeTags.add('dia');
        if (country) activeTags.add(country);
        
        const pool = [];
        quotes.forEach(quote => {
            let score = 1;
            if (quote.tags && Array.isArray(quote.tags)) {
                quote.tags.forEach(tag => { if (activeTags.has(tag)) { score += 2; } });
            }
            for (let i = 0; i < score; i++) { pool.push(quote); }
        });
        let finalQuote = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : quotes[0];
        if (!finalQuote || !finalQuote.quote) finalQuote = quotes[0];

        // --- RENDERIZACAO ---
        const baseImageResponse = await fetch(imageUrls.fortune_template);
        const baseImageBuffer = await baseImageResponse.arrayBuffer();
        
        const maxCharsPerLine = 22;
        let line = '';
        let formattedText = '';
        for (const word of finalQuote.quote.split(' ')) {
            if ((line + word).length > maxCharsPerLine) {
                formattedText += `<tspan x="50%" dy="1.2em">${line.trim()}</tspan>`;
                line = '';
            }
            line += `${word} `;
        }
        formattedText += `<tspan x="50%" dy="1.2em">${line.trim()}</tspan>`;
        formattedText += `<tspan x="50%" dy="1.8em" class="author">- ${finalQuote.source}</tspan>`;
        
        const textSvg = `
            <svg width="450" height="250">
                <style>
                    text { font-size: 34px; font-family: 'Special Elite'; fill: #2c2c2c; text-anchor: middle; }
                    .author { font-size: 26px; font-style: italic; }
                </style>
                <text x="50%" y="40%">${formattedText}</text>
            </svg>
        `;

        const rotatedTextBuffer = await sharp(Buffer.from(textSvg))
            .rotate(12, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();
            
        const finalImageBuffer = await sharp(baseImageBuffer)
            .composite([{ 
                input: rotatedTextBuffer,
                top: 375,
                left: 215
            }])
            .png().toBuffer();
        
        await kv.set(ip, Date.now());

        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return response.status(200).end(finalImageBuffer);

    } catch (error) {
        console.error("ERRO DETALHADO:", error);
        const lockedImageResponse = await fetch(imageUrls.locked);
        return response.status(500).end(Buffer.from(await lockedImageResponse.arrayBuffer()));
    }
}