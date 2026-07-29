import { M0Capabilities } from "../components/m0-capabilities";

export const dynamic = "force-dynamic";

const probes = [
  { label: "GET health", href: "/api/m0/health" },
  { label: "GET secure cookie", href: "/api/m0/cookie" },
  { label: "GET streaming response", href: "/api/m0/stream" },
  { label: "Auth callback placeholder", href: "/auth/callback?next=/today" },
] as const;

export default async function M0Page() {
  const renderedAt = new Date().toISOString();

  return (
    <main>
      <header>
        <p>Engineering baseline · no user data</p>
        <h1>LabFlow Sites M0</h1>
        <p>
          Waiting for the approved visual source before any product UI is
          implemented.
        </p>
      </header>

      <section aria-labelledby="server-probe-title">
        <h2 id="server-probe-title">Server probe</h2>
        <p>
          Server render timestamp: <time dateTime={renderedAt}>{renderedAt}</time>
        </p>
        <ul>
          {probes.map((probe) => (
            <li key={probe.href}>
              <a href={probe.href}>{probe.label}</a>
              <code>{probe.href}</code>
            </li>
          ))}
        </ul>
      </section>

      <M0Capabilities />

      <section aria-labelledby="boundary-title">
        <h2 id="boundary-title">G3 boundary</h2>
        <p>
          The 23 frozen routes and representative states exist only as a typed
          fixture harness. Supabase business queries, migrations, and G4
          workflows are intentionally absent.
        </p>
      </section>
    </main>
  );
}
