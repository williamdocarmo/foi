# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Guia para Publicar na Google Play Store

### Passo 1: Construir a Versão de Produção do App (Sua Ação)

O PWA (e seu modo offline) só funciona na versão "final" do seu site. Para criá-la, rode o seguinte comando no seu terminal:

```bash
npm run build
```

Isso criará uma pasta `.next` com a versão otimizada do seu aplicativo.

### Passo 2: Empacotar o App com o Bubblewrap (Sua Ação)

Agora vem a parte principal. Você usará uma ferramenta do próprio Google chamada **Bubblewrap** para transformar seu PWA em um pacote `.aab` que a Play Store aceita.

1.  **Instale o Bubblewrap (se ainda não o fez):**
    ```bash
    npm install -g @bubblewrap/cli
    ```

2.  **Inicialize o Projeto:** Navegue até a pasta do seu projeto no terminal. **IMPORTANTE:** Antes de rodar o próximo comando, seu aplicativo **precisa estar publicado em uma URL real e acessível**.

    Rode o comando de inicialização, substituindo `[SUA_URL_DE_PRODUCAO]` pela URL onde seu site já está no ar:
    ```bash
    bubblewrap init --manifest https://[SUA_URL_DE_PRODUCAO]/manifest.webmanifest
    ```
    *   O Bubblewrap usará essa URL para baixar a configuração do seu PWA. Ele fará algumas perguntas; a maioria das respostas já estará preenchida com base no seu manifesto. Você pode confirmar pressionando Enter.

3.  **Gere o Pacote do App:** Após a inicialização, o Bubblewrap criará os arquivos de configuração do Android. Agora, para gerar o arquivo final, rode:
    ```bash
    bubblewrap build
    ```
    Isso criará um arquivo chamado `app-release-signed.aab`. **Este é o arquivo que você enviará para a Google Play Store.**
