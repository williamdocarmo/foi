# Blueprint do Aplicativo: Você Sabia?

## 1. Visão Geral do Produto

**Nome do Aplicativo:** Você Sabia?

**Conceito Central:** Um jogo educativo no formato de Progressive Web App (PWA) que oferece uma experiência de aprendizado gamificada através de curiosidades e quizzes. O aplicativo incentiva o engajamento contínuo com um sistema de ranking e conquistas, funcionando offline e permitindo a sincronização de progresso entre dispositivos através de uma conta opcional.

**Público-Alvo:** Pessoas curiosas de todas as idades que gostam de aprender coisas novas, testar seus conhecimentos e competir de forma amigável.

## 2. Stack de Tecnologia

- **Framework:** Next.js (com App Router)
- **Linguagem:** TypeScript
- **UI:** React
- **Componentes:** ShadCN UI
- **Estilização:** Tailwind CSS
- **Autenticação e Banco de Dados:** Firebase (Authentication e Firestore)
- **Funcionalidades de IA:** Genkit (Google AI)
- **Funcionalidade Offline:** PWA (Progressive Web App) com Service Workers.
- **Hospedagem:** Vercel

## 3. Diretrizes de Design e Estilo (UI/UX)

- **Paleta de Cores:** Primária (Roxo `#9C27B0`), Fundo (Roxo claro `#F3E5F5`), Destaque (Laranja `#FFB300`).
- **Tipografia:** 'PT Sans'.
- **Iconografia:** Lucide React.
- **Layout e Componentes:** Limpo, responsivo, moderno, com prioridade para componentes ShadCN.
- **Notificações:** "Toast" usado apenas para erros.

## 4. Estrutura de Conteúdo e Dados

### 4.1. Categorias
O conteúdo é organizado em 20 categorias temáticas, cada uma com curiosidades e quizzes associados. (Ex: Saúde, Ciência, História).

### 4.2. Curiosidades e Quizzes
- **Curiosidades:** Apresentadas em cards. Armazenadas em `src/lib/data/curiosities.json`.
- **Quizzes:** Perguntas de múltipla escolha com tempo. Armazenadas em `src/lib/data/quiz-questions.json`.
- **Geração de Conteúdo:** Um script (`scripts/generateContent.ts`) usa a IA do Gemini para popular os arquivos JSON, garantindo um fluxo contínuo de novidades.

## 5. Funcionalidades Principais

### 5.1. Tela Inicial
- Cabeçalho com estatísticas do jogador.
- Seção "Hero" com slogan e botão "Surpreenda-me!".
- Grade de categorias para exploração ou início de quiz.

### 5.2. Explorador de Curiosidades
- Exibição de uma curiosidade por vez com navegação sequencial.
- O progresso é salvo automaticamente (localmente ou na nuvem).
- Botão "Surpreenda-me" para navegar para uma curiosidade aleatória de qualquer categoria.

### 5.3. Motor de Quiz
- Perguntas cronometradas (20 segundos) com pontuação baseada em acerto e tempo.
- Feedback imediato com explicação da resposta correta.
- Tela de resultados ao final com pontuação, acertos e tempo total.

### 5.4. Autenticação e Sincronização (Firebase)
- **Modo Convidado:** Por padrão, todo o progresso é salvo no `localStorage` do navegador, permitindo jogar sem criar conta.
- **Login Opcional:** O usuário pode optar por criar uma conta (Google ou Email/Senha) para sincronizar seu progresso no Firestore.
- **Privacidade:** A criação de conta exige o consentimento explícito dos termos de uso.
- **Benefício:** Permite continuar a jornada de aprendizado em múltiplos dispositivos.

### 5.5. Gamificação e Engajamento Social
- **Estatísticas do Jogo:** Armazenadas local ou remotamente.
  - `totalCuriositiesRead`, `readCuriosities`, `currentStreak`, `longestStreak`, `lastPlayedDate`, `quizScores`, `explorerStatus`, `combos`.
- **Página de Perfil/Conquistas (`/profile`):**
  - Exibe o nível do jogador (Iniciante, Explorador, Expert) com barra de progresso.
  - Mostra estatísticas detalhadas como recorde de sequência e desempenho nos quizzes.
  - Inclui um botão para compartilhar o app com amigos.
- **Página de Ranking (`/ranking`):**
  - Exibe um ranking dos "Top 5" jogadores, baseado no total de curiosidades lidas.
  - Os dados são buscados dinamicamente do Firestore através de um Genkit Flow, garantindo que o ranking esteja sempre atualizado.

## 6. Funcionalidade PWA e Publicação

### 6.1. Progressive Web App (PWA)
- **URL de Produção:** `https://app.foiumaideia.com/`
- O aplicativo é um PWA totalmente funcional offline, com manifesto e service worker configurados.
- Otimizado para "Adicionar à Tela de Início" tanto no Android quanto no iOS.

### 6.2. Publicação na Google Play Store (Android)
- **Ferramenta:** Bubblewrap CLI (`@bubblewrap/cli`).
- **Processo:** Usa a URL de produção (`https://app.foiumaideia.com/manifest.webmanifest`) para gerar o arquivo `.aab` que será enviado para a Google Play Console.
- O `README.md` contém o guia detalhado para este processo.

---
*Este documento foi atualizado para refletir o estado atual do aplicativo, incluindo autenticação, perfil de usuário e ranking.*
