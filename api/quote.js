// VERSÃO FINAL CORRIGIDA E UNIFICADA
import { kv } from '@vercel/kv';
import geoip from 'geoip-lite';
import quotes from '../quotes.json';
import path from 'path';
import fs from 'fs/promises';

// --- CONFIG ---
const imageUrls = {
    fortune_template: 'https://i.ibb.co/hRWtBZbS/Zoltar-Filipeta.png',
    locked: 'https://i.ibb.co/RG8sdVw2/Zoltar-5.png'
};
// --------------------

// --- HANDLER ---
export default async function handler(request, response) {
    // --- INICIALIZACAO ---
    const url = new URL(request.url, `http://${request.headers.host}`);
    const ip = (request.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    try {
        // --- DEBUG ---
        if (url.searchParams.get('reset') === 'true') {
            await kv.del(ip);

            // Coleta de dados para o relatório
            const geo = geoip.lookup(ip);
            const city = request.headers['x-vercel-ip-city'] || 'N/A';
            const region = request.headers['x-vercel-ip-country-region'] || 'N/A';
            const userAgent = request.headers['user-agent'] || 'N/A';
            const language = request.headers['accept-language'] || 'N/A';
            const hour = new Date().getUTCHours() - 3;
            const activeTags = new Set();
            if (hour >= 18 || hour < 6) activeTags.add('noite'); else activeTags.add('dia');
            if (geo && geo.country) activeTags.add(geo.country);
            
            // Lógica de sorteio de "Urna" para simulação
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
            
            // Montagem do HTML de debug
            response.setHeader('Content-Type', 'text/html');
            const reportHtml = `
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8"><title>Zoltar - Debug Reset</title>
                    <style>
                        body { font-family: monospace; background-color: #121212; color: #e0e0e0; padding: 20px; }
                        h1, h2 { color: #f0e68c; border-bottom: 1px solid #f0e68c; }
                        pre { background-color: #2c2c2c; padding: 15px; border-radius: 5px; white-space: pre-wrap; word-wrap: break-word; }
                        strong { color: #87ceeb; }
                    </style>
                </head>
                <body>
                    <h1>Relatório de Depuração (Algoritmo de Urna)</h1>
                    <p>Seu IP (<strong>${ip}</strong>) foi resetado.</p>
                    <h2>1. Dados do Usuário</h2>
                    <pre>
<strong>IP:</strong> ${ip}
<strong>País (geoip-lite):</strong> ${geo ? geo.country : 'N/A'}
<strong>Cidade (Vercel):</strong> ${city}
<strong>Região (Vercel):</strong> ${region}
<strong>Hora (UTC-3):</strong> ${hour}
                    </pre>
                    <h2>2. Lógica de Pesos</h2>
                    <p><strong>Tags de Contexto Ativas:</strong> [${Array.from(activeTags).join(', ')}]</p>
                    <p><strong>Pesos Calculados:</strong></p>
                    <pre>${JSON.stringify(quotesWithWeights, null, 2)}</pre>
                    <h2>3. Simulação da Randomização</h2>
                    <p>A "urna" de sorteio contém <strong>${pool.length}</strong> "papeizinhos" no total.</p>
                    <p><strong>Frase que seria sorteada:</strong></p>
                    <pre>${simulatedQuote ? JSON.stringify(simulatedQuote, null, 2) : 'Nenhuma frase encontrada.'}</pre>
                </body>
                </html>
            `;
            return response.status(200).send(reportHtml);
        }

        // --- LOCK ---
        const lastVisitTimestamp = await kv.get(ip);
        if (lastVisitTimestamp && lastVisitTimestamp > twentyFourHoursAgo) {
            response.setHeader('Location', imageUrls.locked);
            return response.status(307).send('Redirecting to locked image');
        }

        // --- SORTEIO ---
        const activeTags = new Set();
        const geo = geoip.lookup(ip);
        const hour = new Date().getUTCHours() - 3;
        if (hour >= 18 || hour < 6) activeTags.add('noite'); else activeTags.add('dia');
        if (geo && geo.country) activeTags.add(geo.country);
        
        const baseWeight = 1;
        const tagBonus = 2; 
        const pool = [];
        quotes.forEach(quote => {
            let score = baseWeight;
            quote.tags.forEach(tag => {
                if (activeTags.has(tag)) {
                    score += tagBonus;
                }
            });
            for (let i = 0; i < score; i++) {
                pool.push(quote);
            }
        });
        const finalQuote = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : quotes[Math.floor(Math.random() * quotes.length)];

        if (!finalQuote) { throw new Error("Não foi possível sortear uma frase."); }

        // --- RENDERIZACAO ---
        const fontPath = path.join(process.cwd(), 'SpecialElite-Regular.ttf');
        const fontBuffer = await fs.readFile(fontPath);
        const fontBase64 = fontBuffer.toString('base64');
        const fontDataUri = `data:font/ttf;base64,${fontBase64}`;

        const maxCharsPerLine = 22;
        let line = '';
        let formattedText = '';
        for (const word of finalQuote.text.split(' ')) {
            if ((line + word).length > maxCharsPerLine) {
                formattedText += `<tspan x="225" dy="1.2em">${line.trim()}</tspan>`;
                line = '';
            }
            line += `${word} `;
        }
        formattedText += `<tspan x="225" dy="1.2em">${line.trim()}</tspan>`;
        formattedText += `<tspan x="225" dy="1.8em" class="author">- ${finalQuote.author}</tspan>`;

        const finalSvg = `
            <svg width="600" height="450" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                <style>
                    @font-face {
                        font-family: 'ZoltarFont';
                        src: url(${fontDataUri});
                    }
                    .text-block {
                        font-family: 'ZoltarFont', monospace;
                        font-size: 28px;
                        fill: #2c2c2c;
                        text-anchor: middle;
                    }
                    .author {
                        font-size: 22px;
                        font-style: italic;
                    }
                </style>
                <image href="${imageUrls.fortune_template}" x="0" y="0" width="600" height="450" />
                <text x="0" y="0" transform="translate(150 215) rotate(11)" class="text-block">
                    ${formattedText}
                </text>
            </svg>
        `;

        // --- RESPOSTA ---
        await kv.set(ip, Date.now());
        response.setHeader('Content-Type', 'image/svg+xml');
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return response.status(200).send(finalSvg);

    } catch (error) {
        // --- ERRO ---
        console.error("ERRO DETALHADO:", error);
        response.setHeader('Location', imageUrls.locked);
        return response.status(307).send('Redirecting to locked image on error');
    }
}