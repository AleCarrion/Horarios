import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, ClockIcon, UsersIcon } from "./icons";

interface Props {
  coveragePct: number;
  covered: number;
  total: number;
  issues: number;
  people: number;
}

function Ring({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="h-9 w-9 shrink-0 sm:h-14 sm:w-14" role="img" aria-label={`${pct}% de cobertura`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="6" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform="rotate(-90 28 28)"
        style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)" }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0e7490" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
        {pct}%
      </text>
    </svg>
  );
}

function Card({ delay, icon, label, children, tone, className = "" }: { delay: number; icon: ReactNode; label: string; children: ReactNode; tone?: string; className?: string }) {
  return (
    <div
      className={`glass anim-fade-up group flex flex-col items-start gap-1.5 rounded-2xl p-2.5 transition sm:flex-row sm:items-center sm:gap-3 sm:p-4 duration-200 hover:-translate-y-0.5 hover:shadow-lg ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl max-sm:hidden sm:h-11 sm:w-11 ${tone ?? "bg-brand/10 text-brand"} transition-transform group-hover:scale-110`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-muted sm:text-xs">{label}</div>
        <div className="text-sm font-bold leading-tight sm:text-xl">{children}</div>
      </div>
    </div>
  );
}

export function StatCards({ coveragePct, covered, total, issues, people }: Props) {
  return (
    <section aria-label="Resumen del mes" className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4 print:hidden">
      <div className="glass anim-fade-up flex flex-col items-start gap-1.5 rounded-2xl p-2.5 text-brand-2 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <Ring pct={coveragePct} />
        <div>
          <div className="text-[11px] font-medium text-muted sm:text-xs">Cobertura</div>
          <div className="text-sm font-bold leading-tight text-foreground sm:text-xl">{coveragePct === 100 ? "Completa" : "Con huecos"}</div>
        </div>
      </div>
      <Card delay={60} icon={<ClockIcon />} label="Turnos cubiertos">
        {covered}
        <span className="text-sm font-medium text-muted"> / {total}</span>
      </Card>
      <Card
        delay={120}
        icon={issues ? <AlertIcon /> : <CheckIcon />}
        label="Avisos"
        tone={issues ? "bg-red-500/15 text-red-600" : "bg-emerald-500/15 text-emerald-600"}
      >
        {issues === 0 ? "Todo en orden" : issues}
      </Card>
      <Card delay={180} icon={<UsersIcon />} label="Personas este mes" tone="bg-accent/15 text-accent" className="max-sm:hidden">
        {people}
      </Card>
    </section>
  );
}
