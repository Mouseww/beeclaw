import { Link } from 'react-router-dom';

const featureCards = [
  {
    title: '不只是聊天，而是执行',
    description: 'BeeClaw 可以接任务、调工具、跑流程，把 AI 从“回答问题”升级成“真正干活”。',
  },
  {
    title: '多 Agent 协作',
    description: '让多个智能体分工协同，覆盖运营、开发、巡检、信息处理等真实业务场景。',
  },
  {
    title: '连接真实世界',
    description: '可接入消息渠道、浏览器、GitHub、服务器和定时任务，形成持续工作的自动化系统。',
  },
];

const useCases = [
  '团队内部 AI 助理与自动化运营',
  '开发任务协作、巡检与发布流程',
  '信息采集、工作流编排与提醒跟进',
  '面向企业的数字员工与 Agent 基础设施',
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.18),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-24 lg:px-8">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <span className="text-2xl">🐝</span>
            <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-yellow-200">BeeClaw</span>
            <span>AI Agent 执行平台</span>
          </div>

          <div className="mt-8 max-w-4xl space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              把 AI 变成真正能协作、能执行、能持续工作的数字员工。
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
              BeeClaw 不是只会聊天的机器人，而是一个可执行、可协作、可接入真实业务的 AI Agent 平台。
              你给目标，它负责调用工具、连接系统、分配 Agent、持续推进任务。
            </p>
          </div>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-yellow-400 px-6 py-3 text-base font-semibold text-slate-950 transition hover:bg-yellow-300"
            >
              进入 BeeClaw 控制台
            </Link>
            <a
              href="https://github.com/Mouseww/beeclaw"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/5"
            >
              查看 GitHub
            </a>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-3xl font-bold text-white">执行</div>
              <div className="mt-2 text-sm text-slate-300">不是回答建议，而是实际推进任务</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-3xl font-bold text-white">协作</div>
              <div className="mt-2 text-sm text-slate-300">多个 Agent 分工协同，覆盖完整流程</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-3xl font-bold text-white">连接</div>
              <div className="mt-2 text-sm text-slate-300">接入消息、浏览器、GitHub、服务器和定时任务</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-yellow-300">为什么是 BeeClaw</p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">让用户 3 秒看懂：它不是聊天玩具，而是数字员工基础设施。</h2>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {featureCards.map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <h3 className="text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-slate-900/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr,0.9fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-yellow-300">典型场景</p>
            <h2 className="mt-3 text-3xl font-bold text-white">适合团队自动化、开发协作和企业级 Agent 工作流。</h2>
            <ul className="mt-6 space-y-4 text-slate-300">
              {useCases.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 text-yellow-300">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/30">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-yellow-300">工作方式</p>
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-400">01</div>
                <div className="mt-1 text-lg font-semibold text-white">你提出目标</div>
                <div className="mt-2 text-sm text-slate-300">例如：发布版本、抓取信息、协调 Agent、自动跟进任务。</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-400">02</div>
                <div className="mt-1 text-lg font-semibold text-white">BeeClaw 调工具与流程</div>
                <div className="mt-2 text-sm text-slate-300">消息、浏览器、GitHub、服务器、定时任务都可以接入进同一条执行链路。</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-400">03</div>
                <div className="mt-1 text-lg font-semibold text-white">结果返回并持续推进</div>
                <div className="mt-2 text-sm text-slate-300">不是一次性回答，而是带状态、能跟踪、可继续推进的业务执行系统。</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="rounded-3xl border border-yellow-400/20 bg-gradient-to-r from-yellow-400/10 via-amber-300/10 to-blue-400/10 p-8 sm:p-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-yellow-200">一句话总结</p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              BeeClaw 是一个可执行、可协作、可接入真实业务的 AI Agent 平台。
            </h2>
            <p className="mt-4 text-lg text-slate-200">不是只会聊天，而是能真正干活的数字员工系统。</p>
          </div>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              立即查看控制台
            </Link>
            <a
              href="https://github.com/Mouseww/beeclaw"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 font-semibold text-white transition hover:bg-white/5"
            >
              查看源码与项目说明
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
