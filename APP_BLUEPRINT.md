# Blueprint do Aplicativo: Você Sabia?

## 1. Visão Geral do Produto

**Nome do Aplicativo:** Você Sabia? (Anteriormente "Idea Spark")

**Conceito Central:** Um jogo educativo no formato de Progressive Web App (PWA) que oferece uma experiência de aprendizado gamificada através de curiosidades e quizzes. O aplicativo é projetado para funcionar offline, incentivando o engajamento contínuo.

**Público-Alvo:** Pessoas curiosas de todas as idades que gostam de aprender coisas novas, testar seus conhecimentos e se desafiar de forma divertida.

## 2. Stack de Tecnologia

- **Framework:** Next.js (com App Router)
- **Linguagem:** TypeScript
- **UI:** React
- **Componentes:** ShadCN UI
- **Estilização:** Tailwind CSS
- **Funcionalidades de IA:** Genkit (Google AI)
- **Funcionalidade Offline:** PWA (Progressive Web App) com Service Workers.
- **Hospedagem:** Vercel

## 3. Diretrizes de Design e Estilo (UI/UX)

### 3.1. Paleta de Cores

- **Primária:** Roxo vibrante (`#9C27B0`). Representa criatividade e sabedoria.
  - *Variável CSS HSL:* `291 64% 42%`
- **Fundo (Background):** Roxo claro (`#F3E5F5`). Um fundo suave e convidativo.
  - *Variável CSS HSL:* `300 47% 95%`
- **Destaque (Accent):** Laranja amarelado (`#FFB300`). Usado para CTAs e informações importantes.
  - *Variável CSS HSL:* `42 100% 50%`

### 3.2. Tipografia

- **Fonte Principal:** 'PT Sans' (humanist sans-serif). Usada para títulos e corpo de texto.

### 3.3. Iconografia

- **Biblioteca:** Lucide React. Ícones de estilo limpo e moderno.

### 3.4. Layout e Componentes

- **Estilo Geral:** Limpo, responsivo e moderno, com cantos arredondados, sombras suaves e animações sutis (`bounce-in`, `slide-in-up`) para uma experiência agradável.
- **Componentes:** Priorizar o uso de componentes da biblioteca ShadCN UI.
- **Notificações:** Usar componentes de "Toast" exclusivamente para exibir mensagens de erro.

## 4. Estrutura de Conteúdo e Dados

### 4.1. Categorias

O aplicativo é organizado em torno das seguintes categorias. Cada categoria tem um ID, nome, ícone (Lucide), emoji, descrição e cor associada.

```json
[
  { "id": "saude", "name": "Saúde", "icon": "Heart", "emoji": "🩺", "description": "Corpo humano e medicina.", "color": "#EF5350" },
  { "id": "bem-estar", "name": "Bem-estar", "icon": "Leaf", "emoji": "🌱", "description": "Vida saudável e equilibrada.", "color": "#66BB6A" },
  { "id": "dinheiro", "name": "Dinheiro", "icon": "DollarSign", "emoji": "💰", "description": "Educação financeira.", "color": "#FFEE58" },
  { "id": "futuro", "name": "Futuro", "icon": "Rocket", "emoji": "🔮", "description": "Tendências e previsões.", "color": "#7E57C2" },
  { "id": "tecnologia", "name": "Tecnologia", "icon": "Smartphone", "emoji": "💻", "description": "Inovações do mundo tech.", "color": "#29B6F6" },
  { "id": "ciencia", "name": "Ciência", "icon": "Atom", "emoji": "🔬", "description": "Descobertas fascinantes.", "color": "#BDBDBD" },
  { "id": "cultura", "name": "Cultura", "icon": "Palette", "emoji": "🎭", "description": "Arte, tradições e expressões.", "color": "#FFA726" },
  { "id": "historia", "name": "História", "icon": "BookOpen", "emoji": "📜", "description": "Fatos interessantes do passado.", "color": "#A1887F" },
  { "id": "misterios", "name": "Mistérios", "icon": "Eye", "emoji": "🕵️", "description": "Enigmas não resolvidos.", "color": "#42A5F5" },
  { "id": "entretenimento", "name": "Entretenimento", "icon": "Film", "emoji": "🎬", "description": "Filmes, séries e celebridades.", "color": "#EC407A" },
  { "id": "relacionamentos", "name": "Relacionamentos", "icon": "Users", "emoji": "❤️", "description": "Dicas sobre relações humanas.", "color": "#FF7043" },
  { "id": "psicologia", "name": "Psicologia", "icon": "Brain", "emoji": "🧠", "description": "Como funciona a mente humana.", "color": "#AB47BC" },
  { "id": "autoajuda", "name": "Autoajuda", "icon": "TrendingUp", "emoji": "🌟", "description": "Dicas para crescimento pessoal.", "color": "#26A69A" },
  { "id": "viagens", "name": "Viagens", "icon": "MapPin", "emoji": "✈️", "description": "Destinos incríveis e dicas.", "color": "#5C6BC0" },
  { "id": "lugares", "name": "Lugares", "icon": "Globe", "emoji": "📍", "description": "Curiosidades ao redor do mundo.", "color": "#8D6E63" },
  { "id": "habilidades", "name": "Habilidades", "icon": "Target", "emoji": "🛠️", "description": "Desenvolva novas competências.", "color": "#78909C" },
  { "id": "hacks", "name": "Hacks do Dia a Dia", "icon": "Lightbulb", "emoji": "💡", "description": "Truques úteis para facilitar a vida.", "color": "#FFCA28" },
  { "id": "natureza-e-animais", "name": "Natureza e Animais", "icon": "PawPrint", "emoji": "🐾", "description": "O reino animal e fenômenos naturais.", "color": "#4CAF50" },
  { "id": "universo-e-astronomia", "name": "Universo e Astronomia", "icon": "Orbit", "emoji": "🌌", "description": "Segredos do cosmos e das galáxias.", "color": "#3F51B5" },
  { "id": "musica", "name": "Música", "icon": "Music", "emoji": "🎵", "description": "História de bandas, artistas e gêneros.", "color": "#E91E63" }
]
```

### 4.2. Curiosidades

- **Formato:** Apresentadas em cards. Cada curiosidade possui `id`, `categoryId`, `title`, `content` e um `funFact` opcional.
- **Armazenamento:** Consolidadas em `src/lib/data/curiosities.json`.

### 4.3. Quizzes

- **Formato:** Cada pergunta de quiz tem `id`, `categoryId`, `difficulty` ('easy', 'medium', 'hard'), `question`, `options` (array de 4 strings), `correctAnswer` e `explanation`.
- **Armazenamento:** Consolidadas em `src/lib/data/quiz-questions.json`.

## 5. Funcionalidades Principais

### 5.1. Tela Inicial
- Um cabeçalho com o logo e estatísticas do jogador (curiosidades lidas, sequência de dias).
- Uma seção "Hero" com o título do app, um slogan e um botão "Surpreenda-me!" para levar a uma curiosidade aleatória.
- Uma grade exibindo os cards de todas as categorias.
- Cada card de categoria contém o ícone, nome, descrição, um link para explorar as curiosidades e um botão para "Iniciar Quiz".

### 5.2. Explorador de Curiosidades
- Exibe uma curiosidade por vez em um card grande.
- Mostra o progresso dentro da categoria (ex: "Curiosidade 5 de 15").
- Botões para navegar para a curiosidade "Anterior" e "Próxima".
- O botão "Próxima" na última curiosidade se transforma em "Voltar ao Início".
- Ao ler uma curiosidade, ela é marcada como lida e as estatísticas do jogador são atualizadas.

### 5.3. Motor de Quiz
- As perguntas são apresentadas uma de cada vez.
- Há um cronômetro regressivo para cada pergunta (15 segundos).
- A pontuação é baseada na correção da resposta e no tempo restante.
- Após responder, a resposta correta e a incorreta são destacadas visualmente, e uma explicação é exibida.
- Ao final do quiz, uma tela de resultados mostra a pontuação final, o número de acertos e o tempo total.
- Opções para "Jogar Novamente" ou voltar para a "Página Inicial".

### 5.4. Gamificação
- **Estatísticas do Jogo:** Armazenadas no `localStorage` do navegador.
  - `totalCuriositiesRead`: Total de curiosidades lidas.
  - `readCuriosities`: Array com IDs das curiosidades lidas.
  - `currentStreak`: Sequência de dias consecutivos jogando.
  - `longestStreak`: Recorde de sequência de dias.
  - `lastPlayedDate`: Data da última sessão.
  - `quizScores`: Histórico de pontuações por categoria.
  - `explorerStatus`: Nível do jogador ('Iniciante', 'Explorador', 'Expert').
  - `combos`: Contagem baseada em marcos de leitura (ex: a cada 5 lidas).

## 6. Funcionalidade PWA e Publicação

### 6.1. Progressive Web App (PWA)
- **URL de Produção:** `https://app.foiumaideia.com/`
- O aplicativo está configurado para ser um PWA usando `next-pwa`.
- **Manifesto:** `src/app/manifest.webmanifest/route.ts` define o nome do app, cores, e ícones para a instalação.
- **Service Worker:** Habilitado para cachear o aplicativo e os dados, permitindo o funcionamento offline.
- **Suporte iOS:** Metatags específicas da Apple foram adicionadas para melhorar a experiência de "Adicionar à Tela de Início" no Safari.

### 6.2. Publicação na Google Play Store (Android)
- **Ferramenta:** Bubblewrap CLI (`@bubblewrap/cli`).
- **Processo:**
  1. Criar os ícones do app (`public/icons/icon-192x192.png`, `public/icons/icon-512x512.png`).
  2. Rodar `npm run build` para criar a versão de produção.
  3. Rodar `bubblewrap init --manifest https://app.foiumaideia.com/manifest.webmanifest`.
  4. Rodar `bubblewrap build` para gerar o arquivo `app-release-signed.aab`.
  5. Enviar o `.aab` para o Google Play Console.

## 7. Geração de Conteúdo com IA

- **Script:** `scripts/generateContent.ts`.
- **Funcionalidade:** Usa a API do Google Gemini para popular os arquivos `curiosities.json` and `quiz-questions.json`.
- **Execução:** `npm run generate-content`.
- **Lógica:**
  - Lê as categorias existentes.
  - Para cada categoria, lê o conteúdo já existente para evitar duplicatas.
  - Gera um número definido de novas curiosidades e perguntas de quiz.
  - Adiciona o novo conteúdo aos arquivos JSON centralizados.
  - Inclui pausas e lógica de repetição para lidar com limites de taxa da API.
