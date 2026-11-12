import {
  ArrowRight,
  Bot,
  ChartNoAxesCombined,
  Quote,
  ShieldCheck,
  Sparkles,
  Store,
  Wrench,
} from "lucide-react";
import type { Dashboard } from "../../api";
import { go } from "../../router";
import { Logo } from "../app/Shell";
import { percent } from "../ui";

function Cta({
  children,
  to,
  primary = true,
}: {
  children: string;
  to: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={() => go(to)}
      className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${
        primary
          ? "bg-ink text-white shadow-lg shadow-ink/20 hover:-translate-y-0.5 hover:bg-black"
          : "border border-clay-100 bg-white text-ink hover:border-clay-500"
      }`}
    >
      {children}
      {primary && <ArrowRight className="size-4" aria-hidden />}
    </button>
  );
}

function ProductPreview({ data }: { data?: Dashboard }) {
  const before = data?.baseline?.pickRate ?? 0.15;
  const after = data?.after?.pickRate ?? 0.6;
  const bar = (v: number, cls: string, label: string) => (
    <div>
      <div className="mb-1 flex justify-between text-xs text-white/70">
        <span>{label}</span>
        <span className="tabular-nums">{percent(v)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-white/10">
        <div className={`h-2.5 rounded-full ${cls}`} style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
  return (
    <div className="relative">
      <div
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-clay-500/30 via-amber-300/20 to-emerald-300/20 blur-2xl"
        aria-hidden
      />
      <div className="rounded-2xl border border-white/10 bg-ink p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span className="font-medium tracking-wide">PICKRATE · MAYABAZAR</span>
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">
            recorded run
          </span>
        </div>
        <div className="mt-3 flex items-end gap-3">
          <span className="text-5xl font-semibold tabular-nums">{percent(before)}</span>
          <ArrowRight className="mb-2 size-6 text-white/40" aria-hidden />
          <span className="text-5xl font-semibold tabular-nums text-emerald-300">
            {percent(after)}
          </span>
        </div>
        <div className="mt-5 grid gap-3">
          {bar(before, "bg-rose-400", "Before fixes")}
          {bar(after, "bg-emerald-400", "After approved fixes")}
        </div>
        <div className="mt-5 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/80">
          <Quote className="mb-1 size-3.5 text-white/40" aria-hidden />
          “No listing confirms the clay cups are food-safe, so none can be chosen.”
          <span className="mt-1 block text-white/50">An AI shopper, before the fix</span>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: ChartNoAxesCombined,
    title: "Measure",
    text: "AI shoppers compare your shop with competitors on realistic requests. You get a PickRate: how often they choose you.",
  },
  {
    icon: Wrench,
    title: "Fix",
    text: "The AI drafts the missing facts from your own notes. Every fact quotes a note, and you approve each change.",
  },
  {
    icon: ShieldCheck,
    title: "Prove",
    text: "Run the same shoppers again, then let a real agent buy through PayPal. The sale is attributed to the agent that made it.",
  },
];

const FEATURES = [
  {
    icon: ChartNoAxesCombined,
    title: "PickRate, in one number",
    text: "See how often AI shopping agents pick your store, and who won the sales you lost.",
  },
  {
    icon: Sparkles,
    title: "Why you lose, request by request",
    text: "Every lost sale shows what the shopper asked, what they decided and the exact reason.",
  },
  {
    icon: Wrench,
    title: "Fixes that cannot invent facts",
    text: "Each added fact must quote your own notes. The code checks the quote and every number.",
  },
  {
    icon: Bot,
    title: "A real agent can buy",
    text: "Your store speaks MCP and PayPal's Cart API. An agent searches, builds a cart and checks out.",
  },
  {
    icon: Store,
    title: "PayPal does the payment",
    text: "Orders v2 checkout, agent name in the payment, and webhooks verified through PayPal.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    text: "Prices and stock are never changed. Nothing goes live until you approve it.",
  },
];

const FAQ = [
  {
    q: "Is this real data?",
    a: "The demo shop, Mayabazar, is fictional. The shopper decisions are real recorded runs of AI models (Gemini and Groq free tiers). Competitor listings come from a one-time anonymised snapshot.",
  },
  {
    q: "Do I need my own website?",
    a: "You need a product catalog that AI shoppers can read. In this prototype we host the store interface for the demo shop; connecting a real catalog is the next step.",
  },
  {
    q: "How reliable is the 15% to 60%?",
    a: "It is a simulated panel of 20 requests, one run each. It shows the method working end to end, not a benchmark of any real assistant.",
  },
  {
    q: "Does it cost anything?",
    a: "No. The whole stack runs on free tiers and open source, and payments use the PayPal sandbox, so no real money moves.",
  },
];

export function Landing({ data }: { data?: Dashboard }) {
  return (
    <div className="min-h-screen bg-[#faf7f3] text-ink">
      <header className="sticky top-0 z-20 border-b border-clay-100/70 bg-[#faf7f3]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Logo />
          <nav
            className="hidden items-center gap-6 text-sm text-stone-600 md:flex"
            aria-label="Page sections"
          >
            <a
              href="#how"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="hover:text-ink"
            >
              How it works
            </a>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="hover:text-ink"
            >
              Features
            </a>
            <a
              href="#faq"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="hover:text-ink"
            >
              FAQ
            </a>
          </nav>
          <Cta to="/app">Open the demo</Cta>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-clay-100 bg-white px-3 py-1 text-xs font-medium text-clay-700">
            <Sparkles className="size-3.5" aria-hidden /> Search Console for AI shopping agents
          </span>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Be the shop AI shopping agents <span className="text-clay-500">pick.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-stone-600">
            When an AI shops for someone, it picks one store. ChosenOne shows small PayPal merchants
            how often that is them, why they lose, and exactly what to fix.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Cta to="/app">See the merchant dashboard</Cta>
            <Cta to="/app/shopper" primary={false}>
              Try the AI shopper
            </Cta>
          </div>
          <p className="mt-5 text-xs text-stone-500">
            Built on PayPal Orders v2 and the Store Sync Cart API · Gemini and Groq · MCP · free
            tiers only
          </p>
        </div>
        <ProductPreview data={data} />
      </section>

      <section id="how" className="border-y border-clay-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Measure. Fix. Prove.</h2>
          <p className="mt-2 max-w-2xl text-stone-600">
            Three steps, and you only have to keep your own product notes up to date.
          </p>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-clay-100 bg-[#faf7f3] p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-ink text-white">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold">
                  {i + 1}. {s.title}
                </h3>
                <p className="mt-2 text-sm text-stone-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">
          Everything a small shop needs to be chosen
        </h2>
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="rounded-2xl border border-clay-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <f.icon className="size-6 text-clay-500" aria-hidden />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-16 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              {data?.baseline && data.after
                ? `PickRate ${percent(data.baseline.pickRate)} → ${percent(data.after.pickRate)} on the demo shop`
                : "See it on the demo shop"}
            </h2>
            <p className="mt-2 max-w-xl text-white/70">
              After approving AI-drafted facts that quote the shop&apos;s own notes. A simulated
              panel of 20 requests, recorded and shipped with the code.
            </p>
          </div>
          <Cta to="/app/proof">See before and after</Cta>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
        <dl className="mt-8 divide-y divide-clay-100">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-sm text-stone-600">{f.a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10 text-center">
          <Cta to="/app">Open the demo</Cta>
        </div>
      </section>

      <footer className="border-t border-clay-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-stone-500">
          <span>ChosenOne · built solo for the PayPal AI Hackathon · MIT licensed</span>
          <span>Demo shop Mayabazar is fictional. Payments use the PayPal sandbox.</span>
        </div>
      </footer>
    </div>
  );
}
