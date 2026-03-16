// ============================================================================
// BeeClaw Dashboard — LLM 设置页面
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Card, CardSkeleton, ErrorState } from '../components';

interface LLMTierConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

interface LLMConfigResponse {
  local: LLMTierConfig;
  cheap: LLMTierConfig;
  strong: LLMTierConfig;
}

const TIER_META: Record<string, { label: string; icon: string; desc: string }> = {
  local: { label: 'Local 本地模型', icon: '🏠', desc: '低延迟本地推理，适合简单任务' },
  cheap: { label: 'Cheap 经济模型', icon: '💰', desc: '性价比优先，日常批量推理' },
  strong: { label: 'Strong 强力模型', icon: '🚀', desc: '最高质量推理，复杂决策场景' },
};

const TIERS = ['local', 'cheap', 'strong'] as const;

const inputStyle = {
  backgroundColor: 'var(--input-bg)',
  borderWidth: '1px',
  borderColor: 'var(--input-border)',
  color: 'var(--text-secondary)',
} as const;

function TierCard({
  tier,
  config,
  onSave,
  saving,
}: {
  tier: string;
  config: LLMTierConfig;
  onSave: (tier: string, config: LLMTierConfig) => void;
  saving: string | null;
}) {
  const meta = TIER_META[tier]!;
  const [form, setForm] = useState<LLMTierConfig>({ ...config });
  const [dirty, setDirty] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setForm({ ...config });
    setDirty(false);
  }, [config]);

  const update = (field: keyof LLMTierConfig, value: string | number | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave(tier, form);
    setDirty(false);
  };

  const isSaving = saving === tier;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{meta.icon}</span>
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-heading)' }}>{meta.label}</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{meta.desc}</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Base URL */}
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Base URL</label>
          <input
            type="text"
            value={form.baseURL}
            onChange={(e) => update('baseURL', e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full px-3 py-2 rounded-lg text-sm focus:border-blue-500 focus:outline-none transition-colors"
            style={inputStyle}
          />
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 pr-10 rounded-lg text-sm focus:border-blue-500 focus:outline-none transition-colors"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Model</label>
          <input
            type="text"
            value={form.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder="qwen2.5:7b"
            className="w-full px-3 py-2 rounded-lg text-sm focus:border-blue-500 focus:outline-none transition-colors"
            style={inputStyle}
          />
        </div>

        {/* Max Tokens + Temperature */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Max Tokens</label>
            <input
              type="number"
              value={form.maxTokens ?? ''}
              onChange={(e) =>
                update('maxTokens', e.target.value ? Number(e.target.value) : undefined)
              }
              placeholder="4096"
              min={1}
              className="w-full px-3 py-2 rounded-lg text-sm focus:border-blue-500 focus:outline-none transition-colors"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Temperature</label>
            <input
              type="number"
              value={form.temperature ?? ''}
              onChange={(e) =>
                update('temperature', e.target.value ? Number(e.target.value) : undefined)
              }
              placeholder="0.7"
              min={0}
              max={2}
              step={0.1}
              className="w-full px-3 py-2 rounded-lg text-sm focus:border-blue-500 focus:outline-none transition-colors"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={!dirty || isSaving}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
              dirty && !isSaving
                ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                : 'cursor-not-allowed'
            }`}
            style={!dirty || isSaving ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-faint)' } : undefined}
          >
            {isSaving ? '保存中...' : dirty ? '💾 保存配置' : '无更改'}
          </button>
        </div>
      </div>
    </Card>
  );
}

export function Settings() {
  const [config, setConfig] = useState<LLMConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config/llm');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as LLMConfigResponse;
      setConfig(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async (tier: string, tierConfig: LLMTierConfig) => {
    setSaving(tier);
    try {
      const res = await fetch(`/api/config/llm/${tier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tierConfig),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { ok: boolean; config: LLMConfigResponse };
      setConfig(data.config);
      setToast(`✅ ${TIER_META[tier]?.label} 配置已保存`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast(`❌ 保存失败: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSaving(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={loadConfig} />;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>⚙️ 系统设置</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>LLM 模型配置 — 设置不同用途的模型端点</p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`px-4 py-2 rounded-lg text-sm ${
            toast.startsWith('✅')
              ? 'bg-green-900/50 text-green-300 border border-green-800'
              : 'bg-red-900/50 text-red-300 border border-red-800'
          }`}
        >
          {toast}
        </div>
      )}

      {/* 配置卡片 */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <CardSkeleton count={3} />
        </div>
      ) : config ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {TIERS.map((tier) => (
            <TierCard
              key={tier}
              tier={tier}
              config={config[tier]}
              onSave={handleSave}
              saving={saving}
            />
          ))}
        </div>
      ) : null}

      {/* 说明 */}
      <div className="text-xs space-y-1" style={{ color: 'var(--text-faint)' }}>
        <p>💡 配置修改即时生效，无需重启服务。</p>
        <p>
          🏠 <strong>Local</strong> — 本地 Ollama 等，无 API 费用 &nbsp;|&nbsp; 💰{' '}
          <strong>Cheap</strong> — 经济型云端模型 &nbsp;|&nbsp; 🚀{' '}
          <strong>Strong</strong> — 最强模型，用于关键决策
        </p>
      </div>
    </div>
  );
}
