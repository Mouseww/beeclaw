// ============================================================================
// BeeClaw Dashboard — 事件注入表单
// ============================================================================

import { useState } from 'react';
import { injectEvent } from '../api/client';

const CATEGORIES = ['finance', 'politics', 'tech', 'social', 'general'];

export function EventInjectForm({ onInjected }: { onInjected?: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [importance, setImportance] = useState(0.5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await injectEvent({ title: title.trim(), content: content.trim(), category, importance });
      setTitle('');
      setContent('');
      setCategory('general');
      setImportance(0.5);
      onInjected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '注入失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="事件标题..."
        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-bee-500 transition-colors theme-input"
        style={{ backgroundColor: 'var(--input-bg)', borderWidth: '1px', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="事件详情..."
        rows={3}
        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-bee-500 transition-colors resize-none theme-input"
        style={{ backgroundColor: 'var(--input-bg)', borderWidth: '1px', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
      />
      <div className="flex gap-3 items-center">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-bee-500"
          style={{ backgroundColor: 'var(--input-bg)', borderWidth: '1px', borderColor: 'var(--input-border)', color: 'var(--text-primary)' }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>重要性</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={importance}
            onChange={(e) => setImportance(Number(e.target.value))}
            className="flex-1 accent-bee-500"
          />
          <span className="text-xs text-bee-400 w-8 text-right">{importance.toFixed(1)}</span>
        </div>
        <button
          type="submit"
          disabled={submitting || !title.trim() || !content.trim()}
          className="px-4 py-1.5 rounded-lg bg-bee-600 text-white text-sm font-medium hover:bg-bee-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? '注入中...' : '注入事件'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
