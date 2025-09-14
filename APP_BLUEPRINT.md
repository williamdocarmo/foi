# Blueprint do Aplicativo: Você Sabia?

## 1. Visão Geral do Produto

**Nome do Aplicativo:** Você Sabia?

**Conceito Central:** Um jogo educativo no formato de Progressive Web App (PWA) que oferece uma experiência de aprendizado gamificada através de curiosidades e quizzes. O aplicativo incentiva o engajamento contínuo com um sistema de ranking, conquistas e combos, funcionando perfeitamente offline e permitindo a sincronização de progresso entre dispositivos através de uma conta opcional.

**Público-Alvo:** Pessoas curiosas de todas asidades que gostam de aprender coisas novas, testar seus conhecimentos e competir de forma amigável.

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

## 6. Arquitetura de Páginas e Componentes

### 6.1. Página Principal (Home)
- **Função:** Serve como o portal de entrada do aplicativo, apresentando o conceito e convidando o usuário a explorar o conteúdo.
- **Seção Hero:** Uma área de grande impacto visual com o título do app, uma breve descrição e um botão de ação principal ("Surpreenda-me com uma curiosidade aleatória"), que leva o usuário a uma curiosidade de qualquer categoria.
- **Grid de Categorias:** O corpo principal da página exibe todas as categorias de conteúdo disponíveis em formato de cards. Cada card mostra o nome, ícone e descrição da categoria, além de dois botões: "Explorar" (para ler as curiosidades) e "Quiz" (para iniciar o teste de conhecimento). A disponibilidade dos botões depende da existência de conteúdo para aquela categoria.

### 6.2. Página de Curiosidades (Curiosity Explorer)
- **Função:** É a principal interface de aprendizado, onde o usuário consome o conteúdo de curiosidades de uma categoria específica.
- **Navegação Sequencial:** O usuário navega por uma curiosidade de cada vez, com botões de "Anterior" e "Próxima". O sistema automaticamente marca cada curiosidade como lida ao ser exibida.
- **Conteúdo da Curiosidade:** Cada card exibe o título, o parágrafo da curiosidade e um "Fato Curioso" destacado, para reforçar o aprendizado.
- **Gamificação Integrada:** A página exibe o progresso do usuário em tempo real, mostrando o total de curiosidades lidas, a sequência de dias de uso (streak), os combos acumulados e o nível de explorador (Iniciante, Explorador, Expert).
- **Funcionalidade "Surpreenda-me":** Um botão permite que o usuário salte para uma curiosidade aleatória de qualquer outra categoria, incentivando a descoberta.

### 6.3. Página de Quiz (Quiz Engine)
- **Função:** Testa o conhecimento do usuário sobre uma categoria específica através de um quiz interativo.
- **Lógica do Jogo:** As perguntas são embaralhadas a cada nova tentativa. Cada pergunta tem um cronômetro regressivo de 60 segundos.
- **Sistema de Respostas:** O usuário seleciona uma das quatro opções. O sistema dá feedback visual imediato (verde para correto, vermelho para incorreto) e revela a explicação da resposta, que fica visível por alguns segundos antes de avançar para a próxima pergunta.
- **Pontuação:** A pontuação é calculada com base na correção da resposta e no tempo restante no cronômetro.
- **Uso de Combos:** O usuário pode usar "combos" (ganhos ao ler curiosidades) para pular uma pergunta, recebendo os pontos como se tivesse acertado.
- **Tela de Resultados:** Ao final do quiz, uma tela de resumo exibe a pontuação final, o número de acertos e o tempo total, com opções para jogar novamente ou voltar ao início.

### 6.4. Página de Perfil (Conquistas)
- **Função:** É o painel de controle do progresso geral do usuário no aplicativo.
- **Nível de Explorador:** Uma seção de destaque mostra o status atual do usuário (Iniciante, Explorador, Expert) com uma barra de progresso indicando o quão perto ele está do próximo nível.
- **Estatísticas Gerais:** Apresenta um resumo das principais métricas de gamificação: total de curiosidades lidas, sequência atual de dias, recorde de sequência e combos disponíveis.
- **Desempenho nos Quizzes:** Um gráfico de barras exibe a pontuação média do usuário em cada categoria de quiz que ele já jogou, permitindo uma visualização clara de seus pontos fortes e fracos.
- **Compartilhamento:** Um botão permite que o usuário compartilhe o aplicativo com amigos através da API nativa de compartilhamento do dispositivo ou copiando o link.

---
*Este documento foi atualizado para refletir uma arquitetura mais madura e escalável, focada em performance, resiliência na geração de dados e melhorias na experiência do usuário, incluindo a resolução de loops de renderização e a otimização da estratégia offline-first.*

    