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

### Específico para Gerar o App Android

1.  **Java Development Kit (JDK):** Necessário para a ferramenta `bubblewrap` funcionar.
    *   **No macOS:** A forma mais fácil é via [Homebrew](https://brew.sh/): `brew install openjdk`
    *   **No Windows:** Use o [instalador oficial](https://www.oracle.com/java/technologies/downloads/).
2.  **Android Studio (Opcional, mas recomendado):** Se você quiser abrir o projeto Android gerado, visualizar no emulador ou gerar o arquivo de instalação (`.apk`/`.aab`) manualmente.
    *   Baixe em [developer.android.com/studio](https://developer.android.com/studio).

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
    O aplicativo estará disponível em `http://localhost:9002`.

---

## ☁️ Guia de Deploy (Publicação na Web)

Para que seu aplicativo esteja disponível publicamente e para gerar o pacote para as lojas, você precisa primeiro publicá-lo ("fazer o deploy"). A **Vercel** é a plataforma recomendada.

1.  **Publique seu Código no GitHub:**
    A Vercel se conecta ao seu repositório Git para automatizar o processo. Se ainda não o fez, crie um repositório no GitHub e envie seu código.

2.  **Faça o Deploy na Vercel:**
    a. Crie uma conta gratuita na [Vercel](https://vercel.com), usando sua conta do GitHub.
    b. No painel da Vercel, clique em **"Add New... > Project"**.
    c. Importe o repositório do seu projeto.
    d. Expanda a seção **"Environment Variables"** (Variáveis de Ambiente) e adicione a variável `GEMINI_API_KEY` com a sua chave da API.
    e. Clique em **"Deploy"**.

3.  Ao final, você receberá uma **URL de produção** (ex: `https://seu-app.vercel.app`). Guarde esta URL.

---

## 📱 Gerando o App para as Lojas

Com sua **URL de produção** em mãos, você pode empacotar o PWA.

### Gerando para Android (Google Play Store)

Use a ferramenta **Bubblewrap** para criar o pacote `.aab`.

1.  **Instale o Bubblewrap (globalmente):**
    ```bash
    npm install -g @bubblewrap/cli
    ```

2.  **Gere o projeto Android a partir da sua URL:**
    Rode o comando de inicialização, substituindo `https://app.foiumaideia.com` pela sua URL de produção:

    ```bash
    bubblewrap init --manifest https://app.foiumaideia.com/manifest.webmanifest
    ```
    *   O Bubblewrap fará algumas perguntas. Na maioria dos casos, você pode pressionar `Enter` para aceitar os padrões, pois ele pegará as informações do seu arquivo de manifesto.
    *   **Guarde a senha da chave de assinatura (`signing key password`) que você definir!**

3.  **Compile o Pacote do App (.aab):**
    Após a inicialização, rode o comando de build:
    ```bash
    bubblewrap build
    ```
    *   Ele pedirá a senha da chave que você definiu no passo anterior.
    *   Isso criará um arquivo chamado `app-release-signed.aab`. **Este é o arquivo que você enviará para a Google Play Console.**
    *   Ele também gera um arquivo `app-release-universal.apk`, que você pode usar para instalar e testar diretamente no seu celular Android.

4.  **(Opcional) Abrindo no Android Studio:**
    A pasta gerada pelo `bubblewrap` é um projeto Android completo. Você pode abri-la no Android Studio para:
    *   Testar o app em um emulador.
    *   Fazer modificações nativas avançadas (se necessário).
    *   Gerar os arquivos `.aab` ou `.apk` usando a interface gráfica do Android Studio.

### "Instalando" no iOS (Adicionar à Tela de Início)

No iOS, a "instalação" de um PWA é um processo manual para o usuário:

1.  Abra a **URL de produção** do seu site no navegador **Safari**.
2.  Toque no ícone de **Compartilhar** (um quadrado com uma seta para cima).
3.  Role para baixo e selecione a opção **"Adicionar à Tela de Início"**.
4.  Confirme o nome do aplicativo e toque em "Adicionar".

O ícone do "Você Sabia?" aparecerá na tela de início do usuário, abrindo em tela cheia como um app nativo.
