import { AnalysisForm } from "@/components/analysis-form";

export default function ManualAnalyzerPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <span className="eyebrow">Manual Analyzer</span>
        <h1>Analizador visual manual</h1>
        <p>Herramienta secundaria para revisión manual de imágenes y cuestionarios.</p>
      </section>
      <AnalysisForm />
    </main>
  );
}
