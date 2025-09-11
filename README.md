# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.



Passo 2: Construir a Versão de Produção do App (Sua Ação)

O PWA (e seu modo offline) só funciona na versão "final" do seu site. Para criá-la, rode o seguinte comando no seu terminal:

npm run build

Isso criará uma pasta .next com a versão otimizada do seu aplicativo.

Passo 3: Empacotar o App com o Bubblewrap (Sua Ação)

Agora vem a parte principal. Você usará uma ferramenta do próprio Google chamada Bubblewrap para transformar seu PWA em um pacote .aab que a Play Store aceita.

Instale o Bubblewrap: Você precisará do Node.js instalado. No seu terminal, rode:

npm install -g @bubblewrap/cli

Inicialize o Projeto: Navegue até a pasta do seu projeto no terminal e rode o comando de inicialização. Ele vai te fazer algumas perguntas com base no arquivo manifest.json que eu já criei:

bubblewrap init --manifest https://[SUA_URL_DE_PRODUCAO]/manifest.json

IMPORTANTE: Substitua [SUA_URL_DE_PRODUCAO] pela URL onde seu site estará hospedado. Se você ainda não publicou o site, pode usar uma URL temporária e ajustar depois.
O Bubblewrap fará perguntas sobre o nome do app, caminho para os ícones, etc. A maioria das respostas já estará preenchida. Você pode confirmar pressionando Enter.
Gere o Pacote do App: Após a inicialização, o Bubblewrap criará os arquivos de configuração. Agora, para gerar o arquivo final, rode:

bubblewrap build

Isso criará um arquivo chamado app-release-signed.aab. Este é o arquivo que você enviará para a Google Play Store.