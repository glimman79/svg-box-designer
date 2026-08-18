export type ParsedConnectionLabel = {
  prefix: string;
  number: number;
};

const connectionLabelPattern = /^([A-Z]+)(\d+)$/;

export const parseConnectionLabel = (label: string): ParsedConnectionLabel | null => {
  const match = connectionLabelPattern.exec(label);

  if (!match) {
    return null;
  }

  const number = Number.parseInt(match[2], 10);

  return Number.isSafeInteger(number)
    ? { prefix: match[1], number }
    : null;
};

export const hasConnectionLabelPrefix = (label: string, ...prefixes: string[]) => {
  const parsedLabel = parseConnectionLabel(label);
  return parsedLabel !== null && prefixes.includes(parsedLabel.prefix);
};

export const getNextConnectionLabel = (prefix: string, labels: string[]) => {
  const usedNumbers = labels
    .map(parseConnectionLabel)
    .filter((label): label is ParsedConnectionLabel => label?.prefix === prefix)
    .map((label) => label.number);

  return `${prefix}${usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1}`;
};
