import { kv } from '@vercel/kv';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// --- CONFIGURAÇÃO FONTCONFIG ---
process.env.FONTCONFIG_PATH = path.join(process.cwd(), 'fonts');
process.env.PATH = `${process.env.PATH}:/usr/bin/`;

// --- CONFIG ---
const imageUrls = {
    fortune_template: 'https://i.ibb.co/KYVs03H/Filipeta-Quote.png', // O link da sua nova imagem
    locked: 'https://i.ibb.co/RG8sdVw2/Zoltar-5.png'
};

// --- HANDLER ---
export default async function handler(request, response) {
    // --- INICIALIZACAO ---
    const url = new URL(request.url, `http://${request.headers.host}`);
    const ip = (request.headers['x-forwarded-for'] || '127.00.1').split(',')[0].trim();
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    try {
        const quotesPath = path.join(process.cwd(), 'quotes.json');
        const quotesJson = await fs.readFile(quotesPath, 'utf8');
        const quotes = JSON.parse(quotesJson);

        // --- DEBUG ---
        if (url.searchParams.get('reset') === 'true') {
            await kv.del(ip);
            // SEU HTML DE DEBUG COMPLETO VAI AQUI (APENAS PARA O RESET)
            response.setHeader('Content-Type', 'text/html');
            return response.status(200).send('<h1>IP Resetado.</h1>');
        }

        // --- LOCK ---
        const lastVisitTimestamp = await kv.get(ip);
        if (lastVisitTimestamp && lastVisitTimestamp > twentyFourHoursAgo) {
            const lockedImageResponse = await fetch(imageUrls.locked);
            const lockedImageBuffer = await lockedImageResponse.arrayBuffer();
            response.setHeader('Content-Type', 'image/png');
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
        
        const maxCharsPerLine = 25; // AUMENTADO PARA DAR MAIS ESPAÇO
        let line = '';
        let formattedText = '';
        const words = finalQuote.quote.split(' ');
        
        // Loop para formatar o texto em linhas
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if ((line + word).length > maxCharsPerLine && line !== '') {
                formattedText += `<tspan x="50%" dy="1.1em">${line.trim()}</tspan>`; // dy ajustado para 1.1em
                line = '';
            }
            line += `${word} `;
        }
        // Adiciona a última linha
        formattedText += `<tspan x="50%" dy="1.1em">${line.trim()}</tspan>`;
        
        // Ajusta o dy para o autor, relativo à última linha de texto
        formattedText += `<tspan x="50%" dy="1.8em" class="author">- ${finalQuote.source}</tspan>`; 
        
        const textSvg = `
            <svg width="450" height="250">
                <style>
                    text { font-size: 34px; font-family: 'Special Elite'; fill: #2c2c2c; text-anchor: middle; }
                    .author { font-size: 26px; font-style: italic; }
                </style>
                <text x="50%" y="35%">${formattedText}</text> </svg>
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
        response.setHeader('Content-Disposition', 'attachment; filename="zoltar-fortune.png"');
        return response.status(200).end(finalImageBuffer);

    } catch (error) {
        console.error("ERRO DETALHADO:", error);
        const lockedImageResponse = await fetch(imageUrls.locked);
        return response.status(500).end(Buffer.from(await lockedImageResponse.arrayBuffer()));
    }
}