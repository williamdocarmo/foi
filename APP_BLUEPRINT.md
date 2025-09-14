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

## 4. Estrutura de Dados e Conteúdo

A base de conteúdo do aplicativo foi reestruturada para máxima escalabilidade e manutenibilidade, com um sistema de geração de conteúdo robusto.

### 4.1. Estrutura de Arquivos de Dados
- **`src/lib/data/categories.json`**: Arquivo central que define as categorias temáticas do app. É a "fonte da verdade" para as categorias existentes.
- **`data/curiosities/*.json`**: O conteúdo das curiosidades agora é **dividido em um arquivo JSON por categoria** (ex: `data/curiosities/historia.json`). Isso facilita a manutenção e evita o gerenciamento de um único arquivo monolítico.
- **`data/quiz-questions/*.json`**: Similarmente, as perguntas dos quizzes são **divididas em um arquivo JSON por categoria** (ex: `data/quiz-questions/historia.json`).

### 4.2. Carregamento Dinâmico de Dados (`src/lib/data.ts`)
O arquivo `src/lib/data.ts` foi refatorado para **carregar dinamicamente** todos os arquivos JSON dos diretórios `data/curiosities` e `data/quiz-questions`. Isso significa que:
- O sistema é **robusto a erros**: adicionar ou remover uma categoria não quebra a aplicação.
- A aplicação sempre lê o conteúdo mais atualizado, sem depender de importações estáticas.

### 4.3. Modelo de Dados (Firestore)
Para usuários autenticados, os dados de jogo são sincronizados na coleção `userStats` do Firestore.

**Coleção:** `userStats`
**Documento:** `[uid_do_usuario]`
```json
{
  "totalCuriositiesRead": "number",
  "readCuriosities": ["string"],
  "currentStreak": "number",
  "longestStreak": "number",
  "lastPlayedDate": "string", // ISO format
  "quizScores": { "[categoryId]": [{ "score": "number", "date": "string" }] },
  "explorerStatus": "string", // 'Iniciante', 'Explorador', ou 'Expert'
  "combos": "number",
  "displayName": "string",
  "photoURL": "string"
}
```

## 5. Funcionalidades e Lógica

### 5.1. Gamificação Detalhada
- **Níveis (Explorer Status):**
  - **Iniciante:** 0-9 curiosidades lidas.
  - **Explorador:** 10-49 curiosidades lidas.
  - **Expert:** 50+ curiosidades lidas.
- **Sequência (Streak):** Aumenta a cada dia consecutivo de leitura.
- **Combos:** Ganhos a cada 5 curiosidades lidas, usáveis para pular perguntas no quiz.

### 5.2. Sincronização de Dados (`useGameStats`)
- O hook gerencia o estado do jogo, salvando no `localStorage` para convidados.
- Para usuários logados, sincroniza os dados com o Firestore, mesclando o progresso local ao fazer login e depois salvando tudo na nuvem.

### 5.3. Geração de Conteúdo com IA (`scripts/generateContent.ts`)
O script de geração de conteúdo foi **completamente refatorado** para ser robusto e escalável, ideal para gerar milhares de itens.
- **Validação e Limpeza:** O script agora valida o conteúdo existente contra as categorias em `categories.json` e **remove automaticamente** curiosidades ou quizzes "órfãos" (de categorias deletadas), garantindo consistência.
- **Geração em Lotes (Batching):** Para evitar falhas de API, o script gera conteúdo em lotes menores (ex: 50 itens por vez) até atingir a meta definida.
- **Salvamento Progressivo:** O progresso é salvo no disco a cada lote, permitindo que o script seja interrompido e retomado sem perda de dados.
- **Controle de Duplicação Eficiente:** Utiliza a estrutura de dados `Set` para verificar eficientemente se um título ou pergunta já existe, prevenindo duplicatas mesmo com grandes volumes.
- **Paralelismo Controlado:** Utiliza `p-limit` para processar várias categorias simultaneamente (com um limite para não sobrecarregar a API), acelerando drasticamente o tempo total de geração.

### 5.4. Funcionalidade Offline e "Instalação" (PWA)
- **Offline First:** O aplicativo é um Progressive Web App (PWA), projetado para funcionar offline. Através de um Service Worker (`next-pwa`), todos os recursos essenciais (páginas, estilos, imagens, e principalmente os dados de curiosidades e quizzes) são salvos em cache no dispositivo do usuário na primeira visita.
- **Experiência Nativa no Android (TWA):** Para a Google Play Store, utilizamos a ferramenta **Bubblewrap** para empacotar o PWA como um Trusted Web Activity (TWA). Isso gera um app `.aab` extremamente leve (geralmente **2-5 MB**), que abre o site em tela cheia, proporcionando uma experiência de aplicativo nativo sem a necessidade de um invólucro pesado como o Capacitor.
- **Experiência Nativa no iOS (Atalho na Tela de Início):** No iOS, os usuários podem "instalar" o PWA adicionando o site à Tela de Início através do Safari. Isso cria um ícone na tela inicial que abre o aplicativo em modo de tela cheia. O espaço ocupado é apenas o do cache do navegador (geralmente **~10-20 MB**), que armazena os dados para uso offline.

### 5.5. Por que não usar Capacitor?
O Capacitor é uma ferramenta poderosa para transformar aplicações web em aplicativos nativos com acesso a APIs de hardware (câmera, GPS, etc.). No entanto, para este projeto, a abordagem PWA + Bubblewrap é superior pelos seguintes motivos:
- **Simplicidade:** Mantemos uma única base de código 100% web, sem a complexidade de gerenciar um projeto nativo adicional.
- **Leveza:** O app para Android é muito menor em comparação com uma versão em Capacitor, que incluiria todo o runtime nativo.
- **Necessidade:** O "Você Sabia?" não requer APIs nativas complexas. As funcionalidades do PWA (Service Workers para offline, `manifest.webmanifest` para instalação) são suficientes para oferecer a experiência desejada.

## 6. Arquitetura de Componentes React

A interface é construída com componentes reutilizáveis e otimizados.
- **`AppHeader`:** Exibe estatísticas do jogo e status de autenticação.
- **`AuthModal`:** Modal para login/cadastro com Firebase.
- **`CategoryCard`:** Card de categoria na tela inicial.
- **`CuriosityExplorer`:** Componente refatorado para performance. Usa estado mínimo (`currentIndex`) e inicializa de forma segura para evitar loops de renderização. **A contagem total de curiosidades foi removida** para focar na descoberta e não criar uma sensação de "fim de jogo".
- **`QuizEngine`:** Gerencia a lógica do quiz. O embaralhamento de perguntas ocorre no cliente para evitar erros de hidratação. O tempo de espera para a próxima pergunta foi ajustado: **10 segundos para respostas erradas** (dando tempo para ler a explicação) e 2 segundos para respostas corretas. **A contagem total de perguntas foi removida** para melhorar a imersão.
- **`ProfileClient`:** Exibe as estatísticas completas do usuário.
- **`RankingClient`:** Otimizado com **Streaming via `Suspense`**. A busca de dados ocorre no servidor, e um esqueleto de carregamento é exibido instantaneamente, melhorando a percepção de velocidade.

---
*Este documento foi atualizado para refletir uma arquitetura mais madura e escalável, focada em performance, resiliência na geração de dados e melhorias na experiência do usuário.*
