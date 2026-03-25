# Dashboard de Gastos Pessoais

Dashboard web para controle financeiro pessoal com importacao de PDFs Nubank, projecao de gastos e persistencia local no navegador.

## Screenshot

Adicione aqui uma imagem do dashboard, por exemplo em `docs/screenshot-dashboard.png`, e atualize esta secao com:

```md
![Screenshot do Dashboard](docs/screenshot-dashboard.png)
```

## Como usar

Depois do deploy no GitHub Pages, acesse a URL no formato:

`https://SEU-USUARIO.github.io/gastos-dashboard/`

Fluxo recomendado:

1. Abra a aba `📥 Importar`.
2. Importe seus PDFs Nubank Conta para preencher o extrato.
3. Importe seus PDFs Nubank Fatura quando essa funcionalidade estiver disponivel no projeto.
4. Use a secao `⚙️ Configurações` para exportar ou importar assinaturas e despesas fixas em JSON.
5. Revise as abas `📊 Visão Geral`, `📋 Despesas Fixas` e `🔮 Projeção`.

## Rodar localmente

Como o projeto usa ES Modules nativos, abra com servidor HTTP:

```bash
cd gastos-dashboard
python -m http.server 8080
```

Ou use no Windows:

```bat
serve.bat
```

Depois acesse:

`http://localhost:8080`

## Para amigos

1. Abra a URL do GitHub Pages enviada pelo Mikael.
2. Vá na aba `📥 Importar`.
3. Clique em `📥 Importar configuração de amigo` e selecione o JSON recebido.
4. Escolha se quer substituir a base atual ou apenas mesclar o que nao existir.
5. Ajuste assinaturas e despesas fixas para sua realidade.
6. Importe seus proprios PDFs para preencher extrato e faturas.

## Stack

- HTML5
- CSS3
- Vanilla JS com ES Modules
- IndexedDB
- Chart.js via CDN
- PDF.js via CDN

Sem backend, sem login e sem build tool.

## Privacidade

Nenhum dado é enviado a servidores. Tudo fica armazenado localmente no seu navegador (IndexedDB).
