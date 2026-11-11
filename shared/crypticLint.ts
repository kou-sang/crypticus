// Revisión estática de una lista de cripticos antes de importarla.
// No verifica el mecanismo (eso requiere los datos de construcción), sino la coherencia del archivo:
// enumeración, dificultad, justificación obligatoria, pistas y duplicados.
import { answerLengthFromEnumeration, deriveEnumeration, normalizeAnswer, splitClue } from './answer';
import { parseDifficulty } from './scoring';
import type { CrypticImportItem, Difficulty } from './types';

export interface CrypticLintReport {
  errors: string[];
  warnings: string[];
  counts: Record<Difficulty, number>;
  total: number;
}

function normalizeClueText(clue: string): string {
  return normalizeAnswer(splitClue(clue).text);
}

function lintItem(raw: unknown, index: number, report: CrypticLintReport): { answer: string; clue: string } | null {
  if (typeof raw !== 'object' || raw === null) {
    report.errors.push(`#${index}: no es un objeto`);
    return null;
  }
  const item = raw as CrypticImportItem;
  const label = `#${index}${typeof item.answer === 'string' ? ` (${item.answer})` : ''}`;
  if (typeof item.clue !== 'string' || item.clue.trim().length < 3) {
    report.errors.push(`${label}: enunciado inválido`);
    return null;
  }
  if (typeof item.answer !== 'string' || normalizeAnswer(item.answer).length === 0) {
    report.errors.push(`${label}: respuesta inválida`);
    return null;
  }
  const tier = parseDifficulty(item.difficulty);
  if (tier) report.counts[tier] += 1;
  else report.errors.push(`${label}: dificultad desconocida`);

  const { enumeration: clueEnumeration } = splitClue(item.clue);
  const enumeration = item.enumeration ?? clueEnumeration ?? deriveEnumeration(item.answer);
  if (answerLengthFromEnumeration(enumeration) !== normalizeAnswer(item.answer).length) {
    report.errors.push(`${label}: la enumeración ${enumeration} no coincide con la respuesta`);
  }
  // Sin justificación no hay criptico: la explicación es obligatoria.
  if (typeof item.explanation !== 'string' || item.explanation.trim().length < 10) {
    report.errors.push(`${label}: falta la explicación`);
  }
  // Pistas elegibles (v1.9): la definición es obligatoria; el resto, según el tipo.
  const parts = item.parts;
  if (!parts) report.warnings.push(`${label}: sin partes (pistas en orden fijo)`);
  else {
    const body = normalizeAnswer(splitClue(item.clue).text);
    const kind = item.tags?.[0]?.toLowerCase();
    if (!parts.definicion?.length) report.errors.push(`${label}: falta la definición`);
    if (kind === 'doble definición' && (parts.definicion?.length ?? 0) < 2) report.errors.push(`${label}: la doble definición necesita dos definiciones`);
    if (kind !== 'doble definición' && !parts.relleno?.length) report.errors.push(`${label}: falta el relleno`);
    for (const part of [...(parts.definicion ?? []), ...(parts.indicador ?? []), ...(parts.relleno ?? [])]) {
      if (!body.includes(normalizeAnswer(part))) report.errors.push(`${label}: «${part}» no está en el enunciado`);
    }
  }
  if (!item.tags?.length) report.warnings.push(`${label}: sin tipo (tags)`);
  return { answer: normalizeAnswer(item.answer), clue: normalizeClueText(item.clue) };
}

function reportDuplicates(values: Map<string, number[]>, what: string, errors: string[]): void {
  for (const [value, indexes] of values) {
    if (indexes.length > 1) errors.push(`${what} «${value}» en ${indexes.map((i) => `#${i}`).join(', ')}`);
  }
}

export function lintCryptics(items: unknown): CrypticLintReport {
  const report: CrypticLintReport = { errors: [], warnings: [], counts: { easy: 0, medium: 0, hard: 0, veryHard: 0 }, total: 0 };
  if (!Array.isArray(items)) {
    report.errors.push('El archivo debe contener un array de cripticos.');
    return report;
  }
  report.total = items.length;
  const answers = new Map<string, number[]>();
  const clues = new Map<string, number[]>();
  items.forEach((raw, index) => {
    const keys = lintItem(raw, index, report);
    if (!keys) return;
    answers.set(keys.answer, [...(answers.get(keys.answer) ?? []), index]);
    clues.set(keys.clue, [...(clues.get(keys.clue) ?? []), index]);
  });
  // Regla del proyecto: las respuestas no se repiten.
  reportDuplicates(answers, 'Respuesta repetida', report.errors);
  reportDuplicates(clues, 'Enunciado repetido', report.errors);
  return report;
}
