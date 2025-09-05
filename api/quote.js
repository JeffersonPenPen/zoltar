// VERSÃO COM LEITURA EXPLÍCITA DE FICHEIROS
import { kv } from '@vercel/kv';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises'; // Usaremos o 'fs' para ler ambos os ficheiros

// --- CONFIG ---
const imageUrls = {
    fortune_template: 'https://i.ibb.co/hRWtBZbS/Zoltar-Filipeta.png',
    locked: 'https://i.ibb.co/RG8sdVw2/Zoltar-5.png'
};

// --- CACHE ---
let cachedFontDataUri = null;
async function getFontDataUri() {
    if (cachedFontDataUri) return cachedFontDataUri;
    const fontPath = path.join(process.cwd(), 'SpecialElite-Regular.ttf');
    const fontBuffer = await fs.readFile(fontPath);
    cachedFontDataUri = `data:font/ttf;base64,${fontBuffer.toString('base64')}`;
    return cachedFontDataUri;
}

// --- HANDLER ---
export default async function handler(request, response) {
    // --- INICIALIZACAO ---
    const url = new URL(request.url, `http://${request.headers.host}`);
    const ip = (request.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    try {
        // MUDANÇA CRÍTICA: Lendo o quotes.json manualmente
        const quotesPath = path.join(process.cwd(), 'quotes.json');
        const quotesJson = await fs.readFile(quotesPath, 'utf8');
        const quotes = JSON.parse(quotesJson);

        if (!quotes || quotes.length === 0) {
            throw new Error('O ficheiro quotes.json está vazio ou não foi lido corretamente.');
        }

        // --- DEBUG ---
        if (url.searchParams.get('reset') === 'true') {
            await kv.del(ip);
            // O seu código de debug HTML completo e correto está aqui
            response.setHeader('Content-Type', 'text/html');
            // Cole aqui o seu HTML de debug completo se desejar
            return response.status(200).send('<h1>IP Resetado</h1>');
        }

        // --- LOCK ---
        const lastVisitTimestamp = await kv.get(ip);
        if (lastVisitTimestamp && lastVisitTimestamp > twentyFourHoursAgo) {
            const lockedImageResponse = await fetch(imageUrls.locked);
            return response.status(200).end(Buffer.from(await lockedImageResponse.arrayBuffer()));
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
        const fontDataUri = await getFontDataUri();
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
                    @font-face { font-family: 'ZoltarFont'; src: url(${fontDataUri}); }
                    text { font-size: 34px; font-family: 'ZoltarFont', monospace; fill: #2c2c2c; text-anchor: middle; }
                    .author { font-size: 26px; font-style: italic; }
                </style>
                <text x="50%" y="40%">${formattedText}</text>
            </svg>
        `;

        const rotatedTextBuffer = await sharp(Buffer.from(textSvg))
            .rotate(12, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();
            
        const finalImageBuffer = await sharp(baseImageBuffer)
            .composite([{ input: rotatedTextBuffer, top: 375, left: 215 }])
            .png().toBuffer();
        
        // --- REGISTRO ---
        await kv.set(ip, Date.now());

        // --- RESPOSTA ---
        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return response.status(200).end(finalImageBuffer);

    } catch (error) {
        // --- ERRO ---
        console.error("ERRO DETALHADO:", error);
        const lockedImageResponse = await fetch(imageUrls.locked);
        return response.status(500).end(Buffer.from(await lockedImageResponse.arrayBuffer()));
    }
}