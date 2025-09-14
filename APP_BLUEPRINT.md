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
- **Funcionalidade Offline:** PWA (Progressive Web App) com Service Workers e Cache Persistente do Firestore.
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
O arquivo `src/lib/data.ts` foi refatorado para **carregar dinamicamente** todos os arquivos JSON dos diretórios `data/curiosities` e `data/quiz-questions` usando importações estáticas, garantindo que o Next.js agrupe os dados corretamente no build. Isso significa que:
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

### 5.2. Sincronização de Dados (`useGameStats`) - Arquitetura Offline-First
O hook `useGameStats` foi completamente reescrito para adotar uma arquitetura **offline-first** robusta e de alta performance, eliminando loops de renderização e garantindo uma inicialização instantânea da UI.
- **Inicialização Imediata:** O hook primeiro carrega os dados do `localStorage` de forma síncrona e define o estado inicial. Isso faz com que a interface do usuário seja renderizada instantaneamente, sem esperar por chamadas de rede.
- **Sincronização em Segundo Plano:** Após a renderização inicial, um `useEffect` executa a lógica de autenticação (`onAuthStateChanged`) e a sincronização com o Firestore de forma assíncrona, em segundo plano.
- **Busca de Dados Resiliente:** Ao buscar dados do Firestore, o hook agora utiliza uma estratégia **cache-first-then-server**. Ele tenta buscar do servidor e, se falhar (por estar offline), recorre de forma segura ao cache local do Firestore (`getDocFromCache`), sem nunca quebrar a aplicação.
- **Persistência Desacoplada:** A lógica de salvar os dados no Firebase ou no `localStorage` é centralizada em um `useEffect` que observa o estado `stats` e agenda o salvamento com um `setTimeout` (debounce). Isso desacopla a atualização da UI das operações de I/O, melhorando a performance e prevenindo loops.

### 5.3. Geração de Conteúdo com IA (`scripts/generateContent.ts`)
O script de geração de conteúdo foi **completamente refatorado** para ser robusto e escalável, ideal para gerar milhares de itens.
- **Validação e Limpeza:** O script agora valida o conteúdo existente contra as categorias em `categories.json` e **remove automaticamente** curiosidades ou quizzes "órfãos" (de categorias deletadas), garantindo consistência.
- **Geração em Lotes (Batching):** Para evitar falhas de API, o script gera conteúdo em lotes menores (ex: 50 itens por vez) até atingir a meta definida.
- **Salvamento Progressivo:** O progresso é salvo no disco a cada lote, permitindo que o script seja interrompido e retomado sem perda de dados.
- **Controle de Duplicação Eficiente:** Utiliza a estrutura de dados `Set` e hashes SHA1 para verificar eficientemente se um título ou pergunta já existe, prevenindo duplicatas mesmo com grandes volumes.
- **Paralelismo Controlado:** Utiliza `p-limit` para processar várias categorias simultaneamente (com um limite para não sobrecarregar a API), acelerando drasticamente o tempo total de geração.

### 5.4. Funcionalidade Offline e "Instalação" (PWA)
- **Offline First:** O aplicativo é um Progressive Web App (PWA), projetado para funcionar offline. Através de um Service Worker (`next-pwa`), todos os recursos essenciais (páginas, estilos, imagens, e principalmente os dados de curiosidades e quizzes) são salvos em cache no dispositivo do usuário na primeira visita. A configuração do Firestore com `persistentLocalCache` garante que os dados do usuário também fiquem disponíveis offline.
- **Experiência Nativa no Android (TWA):** Para a Google Play Store, utilizamos a ferramenta **Bubblewrap** para empacotar o PWA como um Trusted Web Activity (TWA). Isso gera um app `.aab` extremamente leve (geralmente **2-5 MB**), que abre o site em tela cheia, proporcionando uma experiência de aplicativo nativo sem a necessidade de um invólucro pesado como o Capacitor.
- **Experiência Nativa no iOS (Atalho na Tela de Início):** No iOS, os usuários podem "instalar" o PWA adicionando o site à Tela de Início através do Safari. Isso cria um ícone na tela inicial que abre o aplicativo em modo de tela cheia. O espaço ocupado é apenas o do cache do navegador, que armazena os dados para uso offline.

### 5.5. Por que não usar Capacitor? (Atualizado)
O Capacitor foi inicialmente considerado, mas a abordagem **PWA + Bubblewrap (TWA)** foi escolhida por ser superior para este projeto, pelas seguintes razões:
- **Simplicidade:** Mantemos uma única base de código 100% web, sem a complexidade de gerenciar um projeto nativo adicional. O erro de build no Appflow (`android platform has not been added yet`) confirmou que gerenciar a plataforma nativa exige passos extras (como `npx cap add android`) que complicam o pipeline de CI/CD.
- **Leveza:** O app para Android gerado pelo Bubblewrap é significativamente menor em comparação com uma versão em Capacitor, que incluiria todo o runtime nativo.
- **Necessidade:** O "Você Sabia?" não requer APIs nativas complexas. As funcionalidades do PWA (Service Workers para offline, `manifest.webmanifest` para instalação) são suficientes para oferecer a experiência desejada.

## 6. Arquitetura de Componentes React

A interface é construída com componentes reutilizáveis e otimizados para performance e estabilidade.
- **`AppHeader`:** Exibe estatísticas do jogo e status de autenticação.
- **`AuthModal`:** Modal para login/cadastro com Firebase.
- **`CategoryCard`:** Card de categoria na tela inicial.
- **`CuriosityExplorer`:** Componente refatorado para eliminar loops de renderização. A lógica de marcação de curiosidade como lida agora é explícita e condicionada (`if !stats.readCuriosities.includes(...)`), quebrando o ciclo de `useEffect` que causava o erro "Maximum update depth exceeded". A inicialização do índice também foi tornada segura para evitar renderizações desnecessárias.
- **`QuizEngine`:** Gerencia a lógica do quiz. O embaralhamento de perguntas ocorre no cliente para evitar erros de hidratação. O tempo de espera para a próxima pergunta foi ajustado: 10 segundos para respostas erradas (dando tempo para ler a explicação) e 2 segundos para respostas corretas.
- **`ProfileClient`:** Exibe as estatísticas completas do usuário.
- **`RankingClient`:** Otimizado com **Streaming via `Suspense`**. A busca de dados ocorre no servidor, e um esqueleto de carregamento é exibido instantaneamente, melhorando a percepção de velocidade.

---
*Este documento foi atualizado para refletir uma arquitetura mais madura e escalável, focada em performance, resiliência na geração de dados e melhorias na experiência do usuário, incluindo a resolução de loops de renderização e a otimização da estratégia offline-first.*