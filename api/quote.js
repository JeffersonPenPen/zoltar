export default async function handler(request, response) {
    // Este é um teste para verificar a versão do ficheiro em produção.
    const versao = "VERSAO_DE_TESTE_DEFINITIVA_1800"; // Um código único

    console.log(`LOG DE TESTE: A Vercel está a executar a ${versao}`);
    
    response.setHeader('Content-Type', 'text/plain');
    response.status(200).send(`API está a funcionar com a versão: ${versao}`);
}