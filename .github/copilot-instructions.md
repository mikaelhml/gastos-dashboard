# Copilot Instructions — Dashboard de Gastos Pessoais

## Como rodar localmente

ES Modules nativos **não funcionam** via `file://` — exige servidor HTTP:

```bash
cd gastos-dashboard
python -m http.server 8080
# ou no Windows:
serve.bat
```

Acessar em `http://localhost:8080`. Não há build, bundle, transpile ou instalação de dependências.

## Arquitetura

App web estático (GitHub Pages), sem backend, sem framework, sem build tool.

**Camada de persistência:** `js/db.js` é o único ponto de acesso ao IndexedDB. Banco: `gastos_db_public` v2. Todas as views importam exclusivamente de `db.js` — nunca acessam `indexedDB` diretamente.

**Fluxo de dados:**
```
index.html (type="module")
  └─ app.js             ← init, seed, refresh geral, expõe funções ao window
       ├─ db.js         ← wrapper IndexedDB (único ponto de acesso)
       ├─ seed.js       ← DEVE ficar VAZIO na versão pública
       ├─ views/*.js    ← cada arquivo renderiza uma aba; recebe dados via parâmetro
       ├─ parsers/      ← cada parser recebe um File e retorna { importado, mes, duplicata }
       └─ utils/        ← funções puras sem efeitos colaterais
```

**Ciclo de refresh:** `refreshDashboard()` em `app.js` usa uma `Promise` encadeada (`_refreshChain`) para serializar chamadas concorrentes. Após qualquer importação bem-sucedida, chamar `window.refreshDashboard()`.

**Funções expostas ao `window`:** `switchTab`, `filterLancamentos`, `clearLancamentosFilters`, `filterExtrato`, `clearExtratoFilters`, `recalcularProjecao`, `clearBase`, `refreshDashboard`, `selectEmoji`, `syncEmojiPicker`, `toggleEmojiPicker`. São chamadas por atributos `onclick`/`oninput` no HTML — não remover nem renomear sem atualizar o `index.html`.

## Convenções do codebase

### IndexedDB
- Operações: `getAll`, `addItem`, `putItem`, `deleteItem`, `clearStore`, `bulkAdd` (todas em `db.js`).
- `bulkAdd` usa uma única transação para inserções em lote — usar sempre que importar múltiplos registros.
- `seedIfEmpty` só popula uma store se ela estiver com 0 registros.
- `clearAllImported()` apaga `extrato_transacoes`, `extrato_summary`, `lancamentos`, `pdfs_importados` — mas **mantém** `assinaturas` e `despesas_fixas`.

### Parsers de PDF
- Dependência compartilhada: `js/parsers/pdf-utils.js` — contém `extrairLinhasPDF`, `extrairEstruturaPDF`, `extrairGruposPDF`, `computeHash`, `parseBRL`, `parseDataNubank`.
- PDF.js é carregado dinamicamente via `import()` dentro de `pdf-utils.js` (CDN 4.2.67).
- Senha de PDF: armazenada em `cachedPdfPassword` (escopo do módulo em `pdf-utils.js`) e reutilizada automaticamente para os próximos PDFs da sessão.
- Cada parser exporta uma função `importar<Banco>(file, onProgress)` que retorna `{ importado: N, duplicata: bool, mes: string }`.
- Deduplicação por SHA-256: checar `pdfs_importados` antes de processar.

### Detecção de layout (`layout-profiles.js`)
Ordem de prioridade: `matchFileName` → `matchContent` (analisa as primeiras 120 linhas normalizadas/sem acentos/uppercase). Para adicionar novo banco: incluir novo perfil no array `PDF_LAYOUT_PROFILES` — não alterar parsers existentes.

### Parser Itaú (`itau-fatura.js`) — ponto de atenção
- `extrairEstruturaPDF` com `tol=3` (menor que o padrão 8) para lidar com layout de 2 colunas.
- `montarLinhasColunadas` agrupa grupos por posição X para separar coluna esquerda e direita.
- Estratégias de fallback em cascata para OCR ruim.
- Variante Uniclass/Signature ainda em estabilização — PDFs desse tipo podem retornar `0 lançamentos`.

### Views
- Cada view recebe todos os dados como parâmetros (não busca do IndexedDB diretamente).
- Renderizam HTML diretamente via `innerHTML`; usar `escapeHtml()` de `js/utils/dom.js` em conteúdo vindo de dados do usuário.
- Filtros de tabela (`filterLancamentos`, `filterExtrato`) operam sobre o DOM já renderizado.

### Categorização automática
`js/utils/categorizer.js` — array `REGRAS` com `{ cat, keywords }`. A **ordem importa**: regras mais específicas primeiro. Correspondência case-insensitive na descrição completa.

## Regras invioláveis

- **Nunca usar `localStorage`** — persistência exclusivamente em IndexedDB.
- **Nunca adicionar backend** — app 100% client-side.
- **Nunca trocar a stack** (sem framework JS, sem build tool).
- **`seed.js` deve ficar vazio** na versão pública — dados entram via importação de PDF ou formulários inline.
- **Não reintroduzir dados pessoais** em nenhum arquivo commitado.
- **Não editar arquivos gerados** — não existem arquivos `.g.dart` ou similares, mas nunca comprometer dados do usuário hardcoded.

## Stores do IndexedDB (`gastos_db_public` v2)

| Store | keyPath | Limpo por `clearAllImported`? |
|---|---|---|
| `assinaturas` | `id` (auto) | ❌ |
| `observacoes` | `id` (auto) | ❌ |
| `despesas_fixas` | `id` (auto) | ❌ |
| `orcamentos` | `cat` | ❌ |
| `lancamentos` | `id` (auto) | ✅ |
| `extrato_transacoes` | `id` (auto) | ✅ |
| `extrato_summary` | `mes` (string) | ✅ |
| `pdfs_importados` | `hash` (SHA-256) | ✅ |

## Dependências CDN (fixas — não atualizar sem testar)

- PDF.js `4.2.67` — `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs`
- Chart.js `4.4.1` — via CDN no `index.html`

## Deploy

```bash
git add .
git commit -m "descrição"
git push
```

GitHub Pages publica automaticamente a partir do branch `main` (raiz `/`). O arquivo `.nojekyll` é obrigatório para evitar processamento Jekyll.
