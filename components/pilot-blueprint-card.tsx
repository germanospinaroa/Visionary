import { PILOT_BLUEPRINT } from "@/lib/pilot-blueprint";

function renderList(items: readonly string[]) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function PilotBlueprintCard() {
  const { operatingModel, recommendedStack, modelStrategy, precisionRules, rolloutPlan, costControls } =
    PILOT_BLUEPRINT;

  return (
    <section className="card blueprint-card">
      <div className="blueprint-header">
        <span className="eyebrow">Pilot Blueprint</span>
        <h2 className="section-title">{operatingModel.name}</h2>
        <p className="section-copy">{operatingModel.principle}</p>
      </div>

      <div className="result-grid">
        <section className="result-block">
          <h3>Modo operativo</h3>
          {renderList(operatingModel.goals)}
        </section>
        <section className="result-block">
          <h3>Stack recomendado</h3>
          <p>Dashboard: {recommendedStack.dashboard}</p>
          <p>Automatización: {recommendedStack.automation}</p>
          <p>IA: {recommendedStack.ai}</p>
          <p>Storage: {recommendedStack.storage}</p>
          <p>Queue: {recommendedStack.queue}</p>
        </section>
        <section className="result-block full">
          <h3>Estrategia costo / precisión</h3>
          <p>Stage 1: {modelStrategy.stage1}</p>
          <p>Stage 2: {modelStrategy.stage2}</p>
          <p>{modelStrategy.reason}</p>
        </section>
        <section className="result-block full">
          <h3>Reglas de precisión</h3>
          {renderList(precisionRules)}
        </section>
        <section className="result-block">
          <h3>Rollout sugerido</h3>
          {renderList(rolloutPlan)}
        </section>
        <section className="result-block">
          <h3>Controles de costo</h3>
          {renderList(costControls)}
        </section>
      </div>
    </section>
  );
}
