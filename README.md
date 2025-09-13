# Você Sabia? - PWA Educacional

Este é um projeto Next.js para o aplicativo "Você Sabia?", um jogo educativo no formato de Progressive Web App (PWA) que oferece uma experiência de aprendizado gamificada através de curiosidades e quizzes.

## 🚀 Pré-requisitos de Desenvolvimento

Para rodar, modificar e fazer o deploy deste projeto, você precisará ter os seguintes softwares instalados no seu computador (seja macOS, Windows ou Linux):

1.  **Node.js:** É o ambiente que executa o JavaScript no servidor. O Next.js é construído sobre ele.
    *   Recomendamos a versão LTS (Long-Term Support).
    *   Você pode baixar em [nodejs.org](https://nodejs.org/).
2.  **npm (Node Package Manager):** É o gerenciador de pacotes do Node.js, usado para instalar as dependências do projeto. Ele vem junto com a instalação do Node.js.
3.  **Git:** É o sistema de controle de versão usado para gerenciar o histórico do código e para fazer o deploy em plataformas como a Vercel.
    *   Você pode baixar em [git-scm.com](https://git-scm.com/).
4.  **Java Development Kit (JDK):** Necessário para a ferramenta `bubblewrap` funcionar e gerar o pacote do aplicativo Android.
    *   O Bubblewrap pode instalar uma versão própria, mas ter o JDK (versão 11 ou superior) pré-instalado pode ajudar a evitar problemas.

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

## 🧠 Gerando e Publicando Novo Conteúdo

O conteúdo de curiosidades e quizzes do aplicativo é gerado por IA e armazenado em arquivos JSON dentro de `data/`. Para que o novo conteúdo apareça no seu site publicado (deploy), você precisa seguir estes passos:

### Passo 1: Gere o Conteúdo Localmente

Rode o seguinte comando no seu terminal:
```bash
npm run generate-content
```
Isso irá gerar novas curiosidades e perguntas, adicionando-as aos arquivos JSON correspondentes em `data/curiosities` e `data/quiz-questions`. O script é resiliente e pode ser interrompido e retomado, pois ele verifica o conteúdo existente antes de gerar novos itens.

### Passo 2: Adicione, "Comite" e Publique as Mudanças

**Este é o passo mais importante.** A Vercel só pode usar os arquivos que estão no seu repositório do GitHub. Após gerar o conteúdo, você precisa salvar essas alterações no Git.

1.  **Adicione os arquivos modificados:**
    ```bash
    git add data/
    ```
2.  **Crie um "commit" (um ponto de salvamento):**
    ```bash
    git commit -m "Adiciona novo conteúdo de curiosidades e quizzes"
    ```
3.  **Envie para o GitHub:**
    ```bash
    git push
    ```

Assim que você fizer o `push`, a Vercel irá detectar as mudanças nos arquivos de conteúdo e iniciar um novo deploy. Em poucos minutos, seu site estará atualizado com as novas curiosidades e perguntas.

---

## ☁️ Guia de Deploy na Vercel

Para que seu aplicativo esteja disponível publicamente na internet e para gerar o pacote da Google Play Store, você precisa primeiro publicá-lo ("fazer o deploy"). A Vercel é a plataforma recomendada para projetos Next.js.

### Passo 1: Publicar seu Código no GitHub

A Vercel se conecta ao seu repositório Git para automatizar o processo de deploy.

1.  Crie uma conta gratuita no [GitHub](https://github.com/).
2.  Crie um novo repositório (ex: `voce-sabia-app`).
3.  No seu terminal, na pasta do projeto, envie seu código para o repositório que você criou:
    ```bash
    git init # Se você ainda não iniciou o git
    git add .
    git commit -m "Commit inicial do projeto"
    git branch -M main
    # Substitua a URL pela URL do seu repositório:
    git remote add origin https://github.com/SEU_USUARIO/NOME_DO_SEU_REPO.git
    git push -u origin main
    ```

### Passo 2: Fazer o Deploy na Vercel

1.  Crie uma conta gratuita na [Vercel](https://vercel.com), usando sua conta do GitHub para se cadastrar.
2.  No painel da Vercel, clique em **"Add New... > Project"**.
3.  Selecione (ou importe) o repositório do GitHub que você acabou de criar.
4.  A Vercel detectará que é um projeto Next.js. Antes de fazer o deploy, você precisa adicionar sua chave de API do Gemini:
    *   Expanda a seção **"Environment Variables"** (Variáveis de Ambiente).
    *   Adicione uma variável com o nome: `GEMINI_API_KEY`.
    *   No campo de valor, cole a sua chave da API do Google Gemini.
5.  Clique em **"Deploy"**. A Vercel irá construir e publicar seu site.
6.  Ao final, você receberá uma URL pública, como `https://voce-sabia-app-seunome.vercel.app`. **Guarde esta é a sua URL de produção!** Ela será usada no próximo passo. Para um domínio mais profissional como `app.foiumaideia.com`, você pode configurar um domínio personalizado nas configurações do projeto na Vercel.

---

## 📦 Qual o Tamanho do Aplicativo? (iOS e Android)

Uma das maiores vantagens deste projeto ser um **Progressive Web App (PWA)** é que ele é extremamente leve para o usuário final.

### Para Android (via Google Play Store)

*   **Tamanho do Download Inicial:** Muito pequeno, geralmente **entre 2 MB e 5 MB**.
*   **Como funciona:** O pacote (`.aab`) que enviamos para a Play Store é um invólucro leve (chamado de Trusted Web Activity ou TWA). Ele não contém todo o aplicativo. Sua principal função é abrir o seu site em tela cheia, sem a barra de endereço do navegador, proporcionando uma experiência de app nativo. O conteúdo real (curiosidades, imagens, etc.) é carregado da internet e salvo no cache do dispositivo pelo Service Worker para permitir o uso offline.

### Para iOS (via "Adicionar à Tela de Início")

*   **Tamanho do Download:** **Praticamente zero.**
*   **Como funciona:** No iOS, não há um download da App Store. O usuário simplesmente salva um atalho do site na tela de início. O espaço ocupado é o cache do navegador Safari, que armazena os arquivos necessários para o funcionamento offline. O tamanho cresce conforme o usuário interage com o app, mas o impacto inicial é mínimo.

Em ambos os casos, a experiência é de um aplicativo rápido, que não consome muito espaço no dispositivo do usuário e que se atualiza automaticamente sempre que você publica uma nova versão do site.

---

## 📱 Gerando o App para as Lojas

Com sua URL de produção em mãos (`https://app.foiumaideia.com` ou a URL da Vercel), você pode empacotar o PWA para as lojas.

### Gerando para Android (Google Play Store)

Use a ferramenta **Bubblewrap** para criar o pacote `.aab` que será enviado para a Google Play Store.

1.  **Instale o Bubblewrap (globalmente):**
    ```bash
    npm install -g @bubblewrap/cli
    ```

2.  **Empacote o PWA:**
    Rode o comando de inicialização usando a sua URL de produção e o nome correto do manifesto (`manifest.webmanifest`):

    ```bash
    bubblewrap init --manifest https://app.foiumaideia.com/manifest.webmanifest
    ```
    *   O Bubblewrap fará algumas perguntas. Na maioria dos casos, você pode pressionar `Enter` para aceitar os padrões, pois ele pegará as informações do seu arquivo de manifesto. Preste atenção no `signing key password`, guarde a senha que você definir.

3.  **Gere o Pacote do App (.aab):**
    Após a inicialização, rode o comando de build:
    ```bash
    bubblewrap build
    ```
    *   Ele pedirá a senha da chave que você definiu no passo anterior.
    *   Isso criará um arquivo chamado `app-release-signed.aab`. **Este é o arquivo que você enviará para a Google Play Console.**

### "Instalando" no iOS (Adicionar à Tela de Início)

No iOS, a "instalação" de um PWA é um processo manual para o usuário, mas o resultado é um ícone na tela de início que abre o app em tela cheia, com funcionalidades offline.

1.  Abra a **URL de produção** do seu site no navegador **Safari**.
2.  Toque no ícone de **Compartilhar** (um quadrado com uma seta para cima).
3.  Role para baixo e selecione a opção **"Adicionar à Tela de Início"**.
4.  Confirme o nome do aplicativo e toque em "Adicionar".

O ícone do "Você Sabia?" aparecerá na tela de início do usuário.
