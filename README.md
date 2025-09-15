# Você Sabia? - PWA Educacional

Este é um projeto Next.js para o aplicativo "Você Sabia?", um jogo educativo no formato de Progressive Web App (PWA) que oferece uma experiência de aprendizado gamificada através de curiosidades e quizzes.

## 🚀 Pré-requisitos de Desenvolvimento

Para rodar, modificar e fazer o deploy deste projeto, você precisará ter os seguintes softwares instalados no seu computador.

### Para todos os sistemas (macOS, Windows, Linux)

1.  **Node.js:** É o ambiente que executa o JavaScript no servidor. O Next.js é construído sobre ele.
    *   Recomendamos a versão LTS (Long-Term Support).
    *   Você pode baixar em [nodejs.org](https://nodejs.org/).
2.  **npm (Node Package Manager):** É o gerenciador de pacotes do Node.js, usado para instalar as dependências do projeto. Ele vem junto com a instalação do Node.js.
3.  **Git:** É o sistema de controle de versão usado para gerenciar o histórico do código e para fazer o deploy em plataformas como a Vercel.
    *   Você pode baixar em [git-scm.com](https://git-scm.com/).

## ⚙️ Rodando o Projeto Localmente

1.  **Crie o arquivo de ambiente:**
    Copie o exemplo `.env.example` para um novo arquivo chamado `.env` e preencha com sua chave de API do Google Gemini.
    ```bash
    cp .env.example .env
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```
3.  **Inicie o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```
    O aplicativo estará disponível em `http://localhost:3000`.

---

## ☁️ Guia de Deploy (Publicação na Web)

Para que seu aplicativo esteja disponível publicamente, você precisa primeiro publicá-lo ("fazer o deploy"). A **Vercel** é a plataforma recomendada.

1.  **Publique seu Código no GitHub:**
    A Vercel se conecta ao seu repositório Git para automatizar o processo. Se ainda não o fez, crie um repositório no GitHub e envie seu código.

2.  **Faça o Deploy na Vercel:**
    a. Crie uma conta gratuita na [Vercel](https://vercel.com), usando sua conta do GitHub.
    b. No painel da Vercel, clique em **"Add New... > Project"**.
    c. Importe o repositório do seu projeto.
    d. Expanda a seção **"Environment Variables"** (Variáveis de Ambiente) e adicione a variável `GEMINI_API_KEY` com a sua chave da API.
    e. Clique em **"Deploy"**.

3.  Ao final, você receberá uma **URL de produção** (ex: `https://seu-app.vercel.app`). Guarde esta URL, pois ela será a base para os apps das lojas.

---
## 📱 Empacotando o PWA para as Lojas de Aplicativos

Com a URL de produção em mãos, você tem duas abordagens principais para criar os aplicativos para as lojas. A abordagem recomendada e atual do projeto é usar o **Bubblewrap (TWA)** para Android, que é mais simples e leve. No entanto, também documentamos o processo com **Capacitor** para referência futura ou caso precise de APIs nativas.

### Abordagem 1: Bubblewrap para Android (Recomendado)

Esta abordagem empacota seu PWA em um "Trusted Web Activity" (TWA), que é essencialmente uma janela do Chrome em tela cheia, oferecendo uma experiência nativa com um tamanho de app extremamente pequeno.

**Pré-requisitos:**

1.  **Java Development Kit (JDK):** Necessário para a ferramenta `bubblewrap` funcionar.
    *   **No macOS:** A forma mais fácil é via [Homebrew](https://brew.sh/): `brew install openjdk`
    *   **No Windows/Linux:** Use os instaladores oficiais do seu sistema.
2.  **Bubblewrap CLI:**
    ```bash
    npm install -g @bubblewrap/cli
    ```

**Passos:**

1.  **Inicialize o projeto Bubblewrap:**
    Rode o comando de inicialização, substituindo pela sua URL de produção. Ele usará seu `manifest.webmanifest` para pré-configurar tudo.
    ```bash
    bubblewrap init --manifest https://seu-app.vercel.app/manifest.webmanifest
    ```
    *   O CLI fará algumas perguntas. Na maioria dos casos, você pode pressionar `Enter` para aceitar os padrões.
    *   **Guarde a senha da chave de assinatura (`signing key password`) que você definir!** Você precisará dela para publicar na Google Play Store.

2.  **Compile o Pacote do App (.aab):**
    Após a inicialização, rode o comando de build:
    ```bash
    bubblewrap build
    ```
    *   Isso criará um arquivo chamado `app-release-signed.aab`. **Este é o arquivo que você enviará para a Google Play Console.** O tamanho será extremamente leve (geralmente entre 2-5 MB).
    *   Ele também gera um arquivo `app-release-universal.apk` para testes diretos no seu celular Android.

---

### Abordagem 2: Capacitor para Android e iOS (em um MacBook)

Capacitor é uma ferramenta mais poderosa que cria um invólucro nativo completo para seu app. Use esta abordagem se precisar de acesso a APIs nativas que o PWA não oferece.

**Pré-requisitos Essenciais no macOS:**

1.  **Xcode:** Indispensável para compilar para iOS.
    *   Instale pela **Mac App Store**.
    *   Após instalar, abra o Xcode uma vez para aceitar os termos e instalar componentes adicionais.
    *   Instale as ferramentas de linha de comando do Xcode:
        ```bash
        xcode-select --install
        ```

2.  **CocoaPods:** Gerenciador de dependências para projetos Xcode.
    ```bash
    sudo gem install cocoapods
    ```

3.  **Android Studio:** Indispensável para compilar para Android.
    *   Baixe e instale em [developer.android.com/studio](https://developer.android.com/studio).
    *   Abra o Android Studio e, através do SDK Manager, certifique-se de que o **Android SDK** mais recente e as **Android SDK Command-line Tools** estão instalados.
    *   Configure a variável de ambiente `ANDROID_SDK_ROOT` no seu perfil de shell (`~/.zshrc` ou `~/.bash_profile`):
        ```bash
        export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
        ```

**Passos para usar o Capacitor:**

1.  **Instale o CLI do Capacitor (se ainda não tiver):**
    ```bash
    npm install @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
    ```

2.  **Inicialize o Capacitor no seu projeto (passo único):**
    Este comando cria o arquivo `capacitor.config.ts`.
    ```bash
    npx cap init "Você Sabia?" "com.vocesabia.app" --web-dir "out"
    ```
    *   `web-dir "out"` é crucial, pois diz ao Capacitor para usar a pasta de exportação estática do Next.js.

3.  **Adicione as Plataformas Nativas (passo único):**
    Esses comandos criam as pastas `android` e `ios` no seu projeto. **Você deve commitar essas pastas no seu repositório Git.**
    ```bash
    npx cap add android
    npx cap add ios
    ```

4.  **Faça o Build do seu App Next.js:**
    Este comando gera a pasta `out` com seu site estático.
    ```bash
    npm run build
    ```

5.  **Sincronize o Build com as Plataformas Nativas:**
    Este comando copia o conteúdo da pasta `out` para dentro dos projetos nativos (`android` e `ios`).
    ```bash
    npx cap sync
    ```

6.  **Abra, Compile e Rode no IDE Nativo:**
    *   **Para iOS:**
        ```bash
        npx cap open ios
        ```
        Isso abrirá o projeto no **Xcode**. A partir daí, você pode selecionar um simulador ou um dispositivo físico, e clicar no botão "Play" para compilar e rodar. Para publicar na App Store, você usará as ferramentas de arquivamento do Xcode.

    *   **Para Android:**
        ```bash
        npx cap open android
        ```
        Isso abrirá o projeto no **Android Studio**. A partir daí, você pode selecionar um emulador ou dispositivo físico e clicar no botão "Run". Para publicar, você usará a opção "Build > Generate Signed Bundle / APK...".

---

### "Instalando" no iOS (via Safari)

Para ambas as abordagens (Bubblewrap ou Capacitor), a experiência no iOS como PWA é a mesma. O usuário "instala" o site na tela de início.

1.  Abra a **URL de produção** do seu site no navegador **Safari**.
2.  Toque no ícone de **Compartilhar** (um quadrado com uma seta para cima).
3.  Role para baixo e selecione a opção **"Adicionar à Tela de Início"**.
4.  Confirme o nome do aplicativo e toque em "Adicionar".

O ícone do "Você Sabia?" aparecerá na tela de início do usuário, abrindo em tela cheia como um app nativo, com acesso ao conteúdo offline.
