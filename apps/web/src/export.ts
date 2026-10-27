import type { SearchResponse } from './types';

export function exportEvidence(filename: string, response: SearchResponse) {
  const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = `${filename.replace(/\.wav$/i, '')}-soundtrace.json`;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
