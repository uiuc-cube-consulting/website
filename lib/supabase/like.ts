/**
 * Escape LIKE / ILIKE metacharacters so a user-supplied string is matched
 * literally when used inside a pattern.
 *
 * `_` matches any single character, `%` matches any run, and `\` is the
 * default escape character — all three are legal in names and emails, so an
 * unescaped lookup for `first_last` also matches `firstXlast`.
 */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
