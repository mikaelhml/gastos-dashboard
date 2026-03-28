# Dashboard de Gastos Pessoais

## What This Is

Dashboard web local-first para organizar vida financeira a partir de PDFs de faturas, extratos bancarios e Registrato/SCR. O foco e transformar esses dados em um mini gerenciador financeiro pessoal que rode no navegador, sem backend e sem enviar dados sensiveis para fora da maquina do usuario.

## Core Value

Dar visibilidade financeira util e privada a partir de dados bancarios reais, com tudo processado e armazenado localmente.

## Requirements

### Validated

- ✓ Importar PDFs de extrato, fatura e Registrato/SCR com roteamento por layout — existing
- ✓ Persistir todos os dados localmente no navegador via IndexedDB — existing
- ✓ Exibir dashboard com abas para visao geral, despesas, lancamentos, extrato, projecao, Registrato e importacao — existing
- ✓ Permitir cadastro manual de assinaturas e despesas fixas com persistencia imediata — existing
- ✓ Gerar sugestoes e contexto inicial a partir de dados recorrentes e do Registrato/SCR — existing

### Active

- [ ] Tornar a importacao de PDFs mais confiavel, cobrindo melhor variacoes reais de layout e OCR
- [ ] Evoluir o dashboard para um painel mais analitico, com leitura clara de categorias, tendencias e comportamento de gastos
- [ ] Melhorar o acompanhamento de parcelamentos, financiamentos e previsao de encerramento de compromissos
- [ ] Ampliar insights e recomendacoes automaticas sem comprometer privacidade local-first
- [ ] Refinar a experiencia de uso para que o fluxo de importar, entender e acompanhar a vida financeira fique mais claro

### Out of Scope

- Hospedar backend ou depender de servidor remoto para processamento financeiro — o valor central e manter tudo local
- Enviar PDFs, extratos ou dados financeiros do usuario para servicos externos — conflito direto com a proposta de privacidade
- Transformar o produto em plataforma multiusuario com autenticacao e contas online — nao e a prioridade do projeto atual

## Context

O projeto ja existe e funciona como app web estatico com HTML, CSS e JavaScript modular, usando IndexedDB como unica persistencia. Hoje ele ja importa PDFs de Nubank, Itaú e Registrato/SCR, renderiza multiplas abas analiticas e oferece CRUD inline para configuracoes manuais.

O usuario quer evoluir esse brownfield para ficar mais proximo de um gerenciador financeiro local completo: nao basta importar dados, o sistema precisa explicar para onde o dinheiro vai, mostrar historico e tendencias, indicar quando parcelas acabam e produzir insights relevantes com dados reais.

O principal diferencial nao e automacao em nuvem, e sim privacidade: nada de backend, nada de sincronizacao externa e nada de upload de dados bancarios para fora da maquina de quem usa.

## Constraints

- **Tech stack**: HTML + CSS + Vanilla JS + IndexedDB + Chart.js/PDF.js via CDN — o projeto ja esta estruturado assim e deve continuar client-side
- **Privacy**: Todo processamento e armazenamento devem permanecer locais — essa e a proposta central do produto
- **Deployment**: Precisa continuar publicavel como app estatico, idealmente via GitHub Pages — sem infraestrutura de servidor
- **Brownfield**: Novas fases devem respeitar contratos ja existentes de tabs, window API publica, stores IndexedDB e fluxo de refresh — evitar regressao nas capacidades atuais

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manter arquitetura local-first sem backend | Privacidade e autonomia sao parte central do valor do produto | — Pending |
| Evoluir o produto como mini gerenciador financeiro analitico | O objetivo nao e apenas importar PDFs, mas gerar leitura financeira util | — Pending |
| Tratar confiabilidade de importacao, analise e UX como trilhas paralelas da evolucao | O usuario quer melhorar os tres eixos juntos, nao otimizar apenas parser ou apenas interface | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 after initialization*
