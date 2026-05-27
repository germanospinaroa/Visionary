import Link from "next/link";
import { PilotBlueprintCard } from "@/components/pilot-blueprint-card";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <span className="eyebrow">Admin</span>
        <h1>Herramientas de administración</h1>
        <p>Espacio reservado para diagnóstico, blueprint operativo y herramientas internas.</p>
      </section>

      <div className="card blueprint-card" style={{ marginBottom: 24 }}>
        <div className="blueprint-header">
          <h2 className="section-title">Rutas disponibles</h2>
          <p className="section-copy">
            La operación vive en <Link href="/pilot">/pilot</Link>. El análisis manual vive en{" "}
            <Link href="/manual-analyzer">/manual-analyzer</Link>.
          </p>
        </div>
      </div>

      <PilotBlueprintCard />
    </main>
  );
}
