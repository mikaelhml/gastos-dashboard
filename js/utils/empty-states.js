function buildAction(intent, label, tab) {
  return { intent, label, tab };
}

export function buildEmptyStateViewModels({
  importedTransactionCount = 0,
  importedSummaryCount = 0,
  manualSubscriptionCount = 0,
  manualFixedExpenseCount = 0,
} = {}) {
  const importedCount = Number(importedTransactionCount || 0) + Number(importedSummaryCount || 0);
  const manualCount = Number(manualSubscriptionCount || 0) + Number(manualFixedExpenseCount || 0);
  const hasImportedData = importedCount > 0;
  const hasManualData = manualCount > 0;

  const baseActions = [
    buildAction('importar', 'Importar PDFs', 'importar'),
    buildAction('restaurar-backup', 'Restaurar backup', 'importar'),
  ];

  const recurringActions = [
    buildAction('assinaturas', 'Adicionar assinatura recorrente', 'assinaturas'),
    buildAction('despesas', 'Adicionar despesa fixa', 'despesas'),
  ];

  if (hasImportedData) {
    return {
      hasImportedData,
      hasManualData,
      shouldShowImportFirstStep: false,
      overview: { shouldRender: false, actions: [] },
      statement: { shouldRender: false, actions: [] },
      transactions: { shouldRender: false, actions: [] },
      import: { shouldRender: false, actions: [] },
    };
  }

  if (hasManualData) {
    return {
      hasImportedData,
      hasManualData,
      shouldShowImportFirstStep: false,
      overview: {
        shouldRender: true,
        title: 'Você já cadastrou compromissos recorrentes',
        body: 'Assinaturas e despesas fixas já entram no planejamento, mas os gráficos e resumos desta aba precisam de PDFs importados para mostrar histórico real.',
        actions: baseActions,
      },
      statement: {
        shouldRender: true,
        title: 'Falta importar o histórico da conta',
        body: 'Seu planejamento manual já existe, mas o Extrato só ganha fluxo de caixa e movimentações quando você importa PDFs de conta.',
        actions: baseActions,
      },
      transactions: {
        shouldRender: true,
        title: 'Os lançamentos recorrentes já estão preparados',
        body: 'Para acompanhar lançamentos reais, importe faturas ou extratos. Depois, use esta aba para buscar, filtrar e revisar tudo junto.',
        actions: [
          buildAction('importar', 'Importar PDFs', 'importar'),
          ...recurringActions,
        ],
      },
      import: {
        shouldRender: false,
        actions: [],
      },
    };
  }

  return {
    hasImportedData,
    hasManualData,
    shouldShowImportFirstStep: true,
    overview: {
      shouldRender: true,
      title: 'Comece importando seus primeiros dados',
      body: 'A Visão Geral mostra tendências, fluxo de caixa e resumos quando existe histórico real. Para chegar lá, importe PDFs ou recupere um backup local.',
      actions: [...baseActions, ...recurringActions],
    },
    statement: {
      shouldRender: true,
      title: 'O Extrato aparece depois da primeira importação',
      body: 'Importe um PDF de conta para ver entradas, saídas e categorias reais desta aba. Se você já salvou tudo antes, restaure um backup local.',
      actions: baseActions,
    },
    transactions: {
      shouldRender: true,
      title: 'Os lançamentos ganham vida com dados importados',
      body: 'Depois de importar PDFs, esta aba reúne compras, movimentos de conta e filtros para entender o histórico completo.',
      actions: [
        buildAction('importar', 'Importar PDFs', 'importar'),
        buildAction('despesas', 'Cadastrar despesa fixa', 'despesas'),
      ],
    },
    import: {
      shouldRender: true,
      title: 'Comece por aqui',
      body: 'Importe PDFs, restaure um backup local ou registre compromissos recorrentes para preparar o painel sem sair do navegador.',
      actions: [...baseActions, ...recurringActions],
    },
  };
}
