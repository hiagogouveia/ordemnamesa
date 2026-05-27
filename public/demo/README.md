# Demo assets

Imagens estáticas usadas pelo walkthrough público em `/demo`.

## evidencia.jpg

Foto usada no passo "Evidência fotográfica" (`/demo?step=3`).

**Requisitos**:
- Formato: JPG ou PNG (recomendado JPG para arquivo menor)
- Resolução mínima: 1200×900 (4:3) ou 1600×900 (16:9)
- Estilo: cozinha profissional, dark, cinematográfica, iluminação orgânica
- Tamanho final ideal: < 300 KB (otimize com TinyPNG / Squoosh)

**Como adicionar**:
1. Salve sua foto como `evidencia.jpg` neste diretório (`public/demo/evidencia.jpg`)
2. Rode `npm run dev` ou recarregue a página `/demo?step=3`
3. Pronto — `next/image` cuida da otimização automaticamente

Enquanto o arquivo não existir, o componente exibe um fundo gradiente
dark como fallback (sem quebrar a demo).

## Não comitar imagens proprietárias

Se a imagem for de terceiros, garanta licença adequada antes do commit.
