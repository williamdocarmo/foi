# Blueprint do Aplicativo: Você Sabia?

## 1. Visão Geral do Produto

**Nome do Aplicativo:** Você Sabia?

**Conceito Central:** Um jogo educativo no formato de Progressive Web App (PWA) que oferece uma experiência de aprendizado gamificada através de curiosidades e quizzes. O aplicativo incentiva o engajamento contínuo com um sistema de ranking, conquistas e combos, funcionando perfeitamente offline e permitindo a sincronização de progresso entre dispositivos através de uma conta opcional.

**Público-Alvo:** Pessoas curiosas de todas as idades que gostam de aprender coisas novas, testar seus conhecimentos e competir de forma amigável.

## 2. Stack de Tecnologia

- **Framework:** Next.js (com App Router)
- **Linguagem:** TypeScript
- **UI:** React
- **Componentes:** ShadCN UI
- **Estilização:** Tailwind CSS
- **Autenticação e Banco de Dados:** Firebase (Authentication e Firestore)
- **Funcionalidades de IA:** Genkit (para geração de conteúdo e funcionalidades futuras)
- **Funcionalidade Offline:** PWA (Progressive Web App) com Service Workers.
- **Hospedagem:** Vercel

## 3. Diretrizes de Design e Estilo (UI/UX)

- **Paleta de Cores:** Primária (Roxo `#9C27B0`), Fundo (Roxo claro `#F3E5F5`), Destaque (Laranja `#FFB300`).
- **Tipografia:** 'PT Sans'.
- **Iconografia:** Lucide React.
- **Layout:** Limpo, responsivo, moderno, priorizando componentes ShadCN para uma UI consistente.
- **Notificações:** Componentes "Toast" devem ser usados exclusivamente para exibir erros.

## 4. Estrutura de Dados

A base de conteúdo do aplicativo é composta por arquivos JSON locais, garantindo a funcionalidade offline.

### 4.1. `src/lib/data/categories.json`
Define as categorias temáticas do app.
```json
[
  {
    "id": "string",       // Identificador único (ex: "historia")
    "name": "string",     // Nome exibido (ex: "História")
    "icon": "string",     // Nome do ícone de `lucide-react` (ex: "BookOpen")
    "emoji": "string",    // Emoji para representação visual (ex: "📜")
    "description": "string",
    "color": "string"     // Cor hexadecimal para a categoria (ex: "#A1887F")
  }
]
```

### 4.2. `src/lib/data/curiosities.json`
Armazena todas as curiosidades.
```json
[
  {
    "id": "string",          // ID único (ex: "historia-1")
    "categoryId": "string",  // ID da categoria correspondente
    "title": "string",
    "content": "string",
    "funFact": "string"    // Fato divertido opcional
  }
]
```

### 4.3. `src/lib/data/quiz-questions.json`
Armazena todas as perguntas dos quizzes.
```json
[
  {
    "id": "string",               // ID único (ex: "quiz-historia-1")
    "categoryId": "string",       // ID da categoria correspondente
    "difficulty": "string",       // 'easy', 'medium', ou 'hard'
    "question": "string",
    "options": ["string", "string", "string", "string"], // Array de 4 opções
    "correctAnswer": "string",    // O texto exato da resposta correta
    "explanation": "string"       // Explicação que aparece após a resposta
  }
]
```

### 4.4. Modelo de Dados (Firestore)
Para usuários autenticados, os dados de jogo são sincronizados na coleção `userStats` do Firestore.

**Coleção:** `userStats`
**Documento:** `[uid_do_usuario]`

```json
{
  // Campos do GameStats
  "totalCuriositiesRead": "number",
  "readCuriosities": ["string"], // Array de IDs das curiosidades lidas
  "currentStreak": "number",
  "longestStreak": "number",
  "lastPlayedDate": "string", // Formato ISO (ex: "2023-10-27T10:00:00.000Z")
  "quizScores": {
    "[categoryId]": [
      { "score": "number", "date": "string" }
    ]
  },
  "explorerStatus": "string", // 'Iniciante', 'Explorador', ou 'Expert'
  "combos": "number",

  // Campos de Perfil do Usuário (para o Ranking)
  "displayName": "string",
  "photoURL": "string" // URL da foto de perfil
}
```

## 5. Funcionalidades e Lógica

### 5.1. Gamificação Detalhada
- **Níveis (Explorer Status):**
  - **Iniciante:** 0-9 curiosidades lidas.
  - **Explorador:** 10-49 curiosidades lidas.
  - **Expert:** 50+ curiosidades lidas.
- **Sequência (Streak):**
  - A `currentStreak` aumenta em 1 se o usuário ler uma curiosidade em um dia consecutivo ao `lastPlayedDate`.
  - Se o intervalo for maior que um dia, a `currentStreak` é resetada para 1.
  - A `longestStreak` armazena o maior valor que a `currentStreak` já atingiu.
- **Combos:**
  - O usuário ganha **1 Combo** a cada 5 curiosidades lidas.
  - Combos podem ser usados durante um quiz para acertar a pergunta atual automaticamente.

### 5.2. Sincronização de Dados (`useGameStats`)
- O hook `useGameStats` gerencia o estado do jogo.
- **Para convidados:** Os dados são salvos no `localStorage`.
- **Para usuários logados:**
  - No login, os dados do `localStorage` são mesclados com os do Firestore (priorizando os dados mais recentes/maiores) e depois o `localStorage` é limpo.
  - Todas as atualizações subsequentes são salvas diretamente no Firestore.

### 5.3. Funcionalidades de IA (Genkit Flows)
Os fluxos de IA são construídos para expansão futura e podem não estar ativos na versão inicial focada no offline.
- **`generateContent.ts` (Script):** Um script de Node.js que usa a API do Gemini para popular os arquivos JSON de curiosidades e quizzes, garantindo que não haja conteúdo duplicado.
- **`ranking-flow.ts`:** Um fluxo que busca os 5 melhores usuários no Firestore, ordenados por `totalCuriositiesRead`, para alimentar a página de Ranking.
- **`feedback-flow.ts`:** (Futuro) Gera uma explicação personalizada quando um usuário erra uma pergunta no quiz, comparando a resposta errada com a correta.
- **`ai-quiz-generator.ts`:** (Futuro) Gera um quiz personalizado com base em uma lista de curiosidades fornecida.
- **`ai-adaptive-learning.ts`:** (Futuro) Analisa o histórico de quizzes para sugerir novas categorias e ajustar a dificuldade.

## 6. Arquitetura de Componentes React

A interface é construída com componentes reutilizáveis.
- **`AppHeader`:** Cabeçalho persistente que exibe as estatísticas do jogo (`totalCuriositiesRead`, `currentStreak`) e o status de autenticação do usuário.
- **`AuthModal`:** Modal para login/cadastro com Google ou E-mail/Senha. Gerencia o fluxo de autenticação com o Firebase.
- **`CategoryCard`:** Card na tela inicial que representa uma categoria, contendo seu ícone, nome, descrição e botões para explorar ou iniciar um quiz.
- **`CuriosityExplorer`:** Componente principal para a leitura de curiosidades. Gerencia o estado da curiosidade atual (índice), navegação (próximo/anterior), e a lógica do botão "Surpreenda-me".
- **`QuizEngine`:** Gerencia toda a lógica do quiz: estado do jogo (jogando/finalizado), pergunta atual, tempo, pontuação, seleção de respostas e exibição da tela de resultados.
- **`ProfileClient`:** Exibe as estatísticas completas do perfil do usuário, incluindo nível, progresso e um gráfico de desempenho nos quizzes.
- **`RankingClient`:** Invoca o `ranking-flow` para buscar e exibir a lista dos melhores jogadores.

## 7. PWA e Publicação
- O aplicativo é um PWA totalmente funcional offline. O `manifest.webmanifest` e um `service-worker` (gerado por `next-pwa`) garantem a capacidade de instalação e o cache de assets.
- O `README.md` contém o guia detalhado para gerar o pacote `.aab` para a Google Play Store usando o **Bubblewrap CLI** e para instruir usuários de iOS a "Adicionar à Tela de Início".
- **URL de Produção:** `https://app.foiumaideia.com`

---
*Este documento foi atualizado para refletir uma arquitetura detalhada, incluindo modelos de dados, lógica de gamificação e estrutura de componentes, facilitando o desenvolvimento e a manutenção.*
