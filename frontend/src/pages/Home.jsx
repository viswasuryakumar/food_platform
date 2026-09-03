import { Link } from "react-router-dom";

const highlights = [
  {
    number: "01",
    title: "Find the right meal",
    copy: "Search campus kitchens by name or cuisine and turn a natural-language request into an editable order draft.",
  },
  {
    number: "02",
    title: "Order with confidence",
    copy: "Server-validated pricing and retry-safe payments protect every order from accidental changes or duplicate charges.",
  },
  {
    number: "03",
    title: "Follow every update",
    copy: "Authenticated live notifications and a complete status timeline keep customers informed from payment to pickup.",
  },
];

const engineering = [
  "Six independently deployable services",
  "128 automated API and unit tests",
  "Role-based access and validated inputs",
  "WebSocket status notifications",
];

export default function Home() {
  return (
    <div className="overflow-hidden">
      <section className="app-shell grid min-h-[calc(100vh-73px)] items-center gap-10 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:py-16">
        <div className="relative z-10">
          <div className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            Built for busy campus days
          </div>

          <h1 className="hero-title mt-6">
            Good food,
            <span className="block text-[#bd5f42]">without the wait.</span>
          </h1>

          <p className="muted mt-6 max-w-xl text-base leading-7 sm:text-lg">
            CampusCrave brings every campus kitchen into one fast, reliable ordering experience—from discovery and payment to live order tracking.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/register" className="btn-primary px-6 py-3">
              Start an order <span aria-hidden="true" className="ml-2">→</span>
            </Link>
            <Link to="/login" className="btn-soft px-6 py-3">Sign in to the demo</Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-[#dfd2c4] pt-5 text-sm text-[#66594d]">
            <span><strong className="text-[#2f2922]">Real-time</strong> tracking</span>
            <span><strong className="text-[#2f2922]">Secure</strong> payments</span>
            <span><strong className="text-[#2f2922]">Smart</strong> ordering</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="A selection of campus meals beside a phone showing live order tracking">
          <img
            src="/campuscrave-hero.jpg"
            alt="Burger, bowl, sushi, dosa, and iced coffee arranged around a phone with order tracking"
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
          <div className="hero-status-card">
            <span className="live-dot" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a7c6d]">Order update</p>
              <p className="mt-1 font-semibold text-[#2f2922]">Your meal is on the way</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e3d7ca] bg-[#fffaf4]/70 py-16 sm:py-20">
        <div className="app-shell">
          <div className="max-w-2xl">
            <p className="font-semibold text-[#9e4d35]">Three steps, one smooth flow</p>
            <h2 className="title-display mt-4">From “I’m hungry” to “it’s ready.”</h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {highlights.map((item) => (
              <article key={item.number} className="feature-card">
                <span className="feature-number">{item.number}</span>
                <h3 className="mt-8 text-xl font-semibold">{item.title}</h3>
                <p className="muted mt-3 text-sm leading-6">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="app-shell py-16 sm:py-20">
        <div className="engineering-panel">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e6b9a9]">Under the hood</p>
            <h2 className="font-display mt-4 max-w-xl text-3xl leading-tight text-white sm:text-4xl">
              A portfolio project engineered beyond the happy path.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#d8cec2]">
              The experience is backed by a production-minded microservice architecture with audited state changes, service health checks, CI gates, and resilient real-time updates.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {engineering.map((item) => (
              <div key={item} className="engineering-chip">
                <span className="text-[#e89474]" aria-hidden="true">✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e3d7ca] py-7">
        <div className="app-shell flex flex-col gap-2 text-sm text-[#75695d] sm:flex-row sm:items-center sm:justify-between">
          <p>CampusCrave · A full-stack microservices showcase</p>
          <Link to="/register" className="font-semibold text-[#9e4d35] hover:text-[#753723]">Explore the product →</Link>
        </div>
      </footer>
    </div>
  );
}
