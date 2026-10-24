/** Cuts at the last sentence end (or word break) that fits. */
export function trimToLength(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentence > max * 0.6) return head.slice(0, sentence + 1).trim();
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).trim();
}
