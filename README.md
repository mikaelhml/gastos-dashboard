# Dashboard de Gastos Pessoais

Dashboard web offline-first para controle financeiro pessoal, com persistencia local em `IndexedDB`, importacao de PDFs bancarios e organizacao manual de assinaturas, despesas fixas, parcelamentos e financiamentos.

As bibliotecas de graficos e parsing de PDF agora ficam versionadas em `vendor/`, entao o carregamento inicial do app nao depende de CDN externa.

## Status atual do projeto

- **Fase 9:** refinamento visual do dashboard + correcao de migracao IndexedDB
- **Versao publica:** limpa, sem seeds pessoais
- **Fase atual:** estabilizacao final do fluxo Registrato + parser Itaú
- **Hospedagem alvo:** GitHub Pages

Hoje o projeto ja entrega:

- CRUD inline de assinaturas e despesas fixas
- conversao manual de lancamentos para assinatura, despesa fixa, parcelamento ou financiamento
- importacao de configuracao JSON
- importacao de PDFs por perfil de layout
- importacao inicial de Relatorio Registrato / SCR
- sugestoes do Registrato com fluxo de `aceitar / dispensar`
- inferencia inicial de parcelas e data de inicio para compromissos financeiros
- KPIs resumidos do SCR na visao geral
- bloco informativo do SCR na projecao
- refinamento visual da navegacao, cards, paines e changelog
- migracao do IndexedDB corrigida para criar stores faltantes em bases antigas
- suporte a senha de PDF com reutilizacao automatica na sessao

## O que esta estavel

- base publica iniciando vazia
- `IndexedDB` como unica persistencia local
- exportacao/importacao de configuracao JSON
- parser de extrato Nubank Conta
- parser de Nubank Fatura
- UI principal do dashboard, filtros, cards e projecao funcionando com base vazia

## O que ainda esta em estabilizacao

- parser de faturas Itaú/Visa em variantes de layout, especialmente `Uniclass/Signature`
- heuristicas para OCR ruim e linhas quebradas em PDFs de fatura
- calibracao final das heuristicas do Registrato
- parser de faturas Itaú/Visa em variantes de layout, especialmente `Uniclass/Signature`

## Proximos passos

1. calibrar as sugestoes do Registrato com uso real no navegador
2. estabilizar de vez o parser de faturas Itaú/Visa, principalmente os PDFs que ainda retornam `0 lançamentos`
3. separar melhor perfis/layouts de fatura Itaú comum vs Itaú Uniclass/Signature
4. ampliar diagnostico para novos layouts de PDF quando necessario
5. revisar microinteracoes e consistencia visual nas abas restantes

## Fluxo recomendado de uso

1. Abra a aba `📥 Importar`
2. Importe extratos e faturas PDF
3. Se precisar, converta lancamentos manualmente nas abas
4. Revise:
   - `📊 Visão Geral`
   - `📋 Despesas Fixas`
   - `💳 Parcelamentos`
   - `🔮 Projeção`
5. Exporte a configuracao em JSON para backup

## Perfis de PDF suportados hoje

- `nubank-conta` — extrato da conta Nubank
- `nubank-fatura` — fatura Nubank
- `itau-fatura` — fatura Itaú/Visa
- `registrato-scr` — Relatorio de Emprestimos e Financiamentos (Registrato / SCR)

Observacao importante:

- o parser Itaú/Visa existe e esta funcional em varios casos, mas ainda nao cobre todos os layouts reais
- PDFs com senha reutilizam a mesma senha automaticamente enquanto a sessao estiver aberta
- o Registrato/SCR entra como camada propria, com sugestoes e contexto visual, sem contaminar extrato nem fatura

## Rodar localmente

Como o projeto usa ES Modules nativos, rode com servidor HTTP:

```bash
cd gastos-dashboard
python -m http.server 8080
```

Ou no Windows:

```bat
serve.bat
```

Depois acesse:

`http://localhost:8080`

## Importar e exportar configuracao

- `📤 Exportar configuração (JSON)` salva assinaturas e despesas fixas atuais
- `📥 Importar configuração (JSON)` restaura ou migra essas configuracoes
- a importacao permite substituir ou mesclar os dados

## Estrutura importante do projeto

```text
gastos-dashboard/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── db.js
│   ├── seed.js
│   ├── parsers/
│   │   ├── pdf-utils.js
│   │   ├── layout-profiles.js
│   │   ├── nubank-conta.js
│   │   ├── nubank-fatura.js
│   │   └── itau-fatura.js
│   ├── utils/
│   │   ├── categorizer.js
│   │   ├── config-io.js
│   │   ├── dom.js
│   │   └── formatters.js
│   └── views/
│       ├── assinaturas.js
│       ├── despesas-fixas.js
│       ├── extrato.js
│       ├── importar.js
│       ├── lancamentos.js
│       ├── parcelamentos.js
│       ├── projecao.js
│       └── visao-geral.js
└── serve.bat
```

## Arquivos-chave para manutencao

- `js/app.js`
  - orquestra a carga inicial e o refresh geral

- `js/db.js`
  - wrapper do `IndexedDB`
  - manter o banco publico separado do banco antigo

- `js/seed.js`
  - deve continuar vazio na versao publica

- `js/parsers/layout-profiles.js`
  - ponto central para detectar e rotear cada PDF para o parser correto

- `js/parsers/pdf-utils.js`
  - base compartilhada para PDF.js, senha, hash e extracao estrutural

- `js/parsers/itau-fatura.js`
  - principal ponto de atencao atual
  - contem varios fallbacks para OCR ruim, mas ainda precisa evoluir

- `js/views/lancamentos.js`
  - converte lancamentos em estruturas manuais do dashboard

- `js/utils/registrato-suggestions.js`
  - consolida heuristicas, sugestoes, aceite/dispensa e insights do SCR

## Regras importantes

- nao trocar a stack
- nao adicionar backend
- nao usar `localStorage`
- manter `IndexedDB`
- manter a versao publica sem dados pessoais
- nao reintroduzir seeds reais em `js/seed.js`

## Privacidade

Nenhum dado financeiro e enviado para servidor do app. Tudo fica no navegador do usuario via `IndexedDB`.

## Troubleshooting rapido

### O app abriu com erro de importacao PDF

- verifique o console do navegador
- se o PDF tiver senha, informe a senha quando solicitado
- em lotes, a senha deve ser reutilizada automaticamente

### A fatura Itaú voltou `0 lançamentos`

- este ainda e o principal ponto aberto do projeto
- capture o log do console com as primeiras linhas extraidas
- compare o PDF com os perfis/layouts ja suportados

### A versao publica apareceu com dados antigos

- provavelmente e `IndexedDB` antigo no navegador
- limpe a base local ou teste em aba anonima

## Resumo executivo para retomada futura

Se eu voltar a este projeto depois:

- o foco nao e mais a importacao basica do Registrato
- o foco principal agora e fechar a **view dedicada do SCR** e validar o fluxo real ponta a ponta
- o parser Itaú/Visa continua sendo o outro ponto critico, especialmente variante `Uniclass/Signature`
- a UI principal e a base publica ja estao boas
- qualquer nova rodada deve priorizar:
  1. validar o Registrato real no navegador
  2. criar a superficie dedicada do SCR
  3. depois retomar logs e refinamento do parser Itaú
