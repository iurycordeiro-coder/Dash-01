/**
 * Utilitários centralizados para formatação de números e valores monetários
 * Garante consistência em todo o dashboard com duas casas decimais
 */

/**
 * Formata um número como moeda brasileira com exatamente 2 casas decimais
 * @param value - Valor numérico a ser formatado
 * @returns String formatada como "R$ 0,00"
 */
export const formatarMoeda = (value: any): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return "R$ 0,00";
  }

  const numValue = parseFloat(String(value));
  return numValue.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Formata um número com exatamente 2 casas decimais (sem símbolo de moeda)
 * @param value - Valor numérico a ser formatado
 * @returns String formatada como "0,00"
 */
export const formatarNumero = (value: any): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return "0,00";
  }

  const numValue = parseFloat(String(value));
  return numValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Formata um percentual com exatamente 2 casas decimais
 * @param value - Valor percentual (0-100)
 * @returns String formatada como "0,00%"
 */
export const formatarPercentual = (value: any): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return "0,00%";
  }

  const numValue = parseFloat(String(value));
  return numValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";
};

/**
 * Converte uma string com vírgula para número (padrão brasileiro)
 * @param value - String com formato brasileiro (ex: "1.234,56")
 * @returns Número parseado
 */
export const parseNumerosBrasileiro = (value: string): number => {
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/\./g, "") // Remove separador de milhares
    .replace(",", "."); // Converte vírgula em ponto
  return parseFloat(cleaned) || 0;
};

/**
 * Normaliza nomes de colunas removendo acentos e espaços extras
 * @param columnName - Nome da coluna original
 * @returns Nome normalizado em minúsculas
 */
export const normalizarNomeColuna = (columnName: string): string => {
  return columnName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

/**
 * Encontra uma coluna no objeto por nome flexível (com/sem acento)
 * @param obj - Objeto com as colunas
 * @param searchTerm - Termo a buscar (pode ser parcial)
 * @returns Nome da coluna encontrada ou undefined
 */
export const encontrarColuna = (
  obj: Record<string, any>,
  searchTerm: string
): string | undefined => {
  const normalizedSearch = normalizarNomeColuna(searchTerm);
  return Object.keys(obj).find(
    (key) => normalizarNomeColuna(key).includes(normalizedSearch)
  );
};

/**
 * Extrai valor monetário de uma célula, tratando diferentes formatos
 * @param value - Valor em qualquer formato
 * @returns Número parseado
 */
export const extrairValorMonetario = (value: any): number => {
  if (value === null || value === undefined) return 0;

  const stringValue = String(value).trim();

  // Se já é um número
  if (!isNaN(Number(stringValue))) {
    return parseFloat(stringValue);
  }

  // Remove "R$" e espaços
  const cleaned = stringValue
    .replace(/R\$\s*/g, "")
    .replace(/\./g, "") // Remove separador de milhares
    .replace(",", "."); // Converte vírgula em ponto

  return parseFloat(cleaned) || 0;
};
