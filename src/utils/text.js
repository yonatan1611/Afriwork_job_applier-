export function stripHtml(html = '') {
  return (html || '').replace(/<[^>]+>/g, ' ');
}

export function tokenize(text = '') {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/gi, ' ') // keep alphanumerics and plus
    .split(/\s+/)
    .filter(Boolean);
}

export function toWordSet(text = '') {
  return new Set(tokenize(text));
}
