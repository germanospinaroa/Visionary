# Programa Piloto Recomendado

## Objetivo operativo

Convertir el MVP actual en un flujo controlado para auditoria visual retail con prioridad absoluta en precision, trazabilidad y costo unitario estable.

## Mejor opcion de arquitectura

1. `Next.js` como dashboard y capa API.
2. `Playwright` como worker transaccional del survey.
3. `Supabase` para tablas operativas, storage de imagenes, crops y auditoria.
4. `Inngest` como orquestador del piloto.
5. `OpenAI` con estrategia de doble etapa:
   - `gpt-4.1-mini` para primer pase.
   - `gpt-4.1` solo en casos ambiguos o de alto riesgo.

## Por que esta opcion es la mejor

- Es mas barata que correr siempre el modelo grande.
- Es mas precisa que un flujo de una sola llamada porque escala solo donde hay riesgo.
- Es mas segura porque deja huella de evidencia y decision de supervisor.
- Es mas simple de operar que un agente autonomo abierto.

## Regla de precision no negociable

Si el producto no esta confirmado por texto legible o match visual extremadamente fuerte, la salida operativa debe ser `No puedo responder`.

## Flujo recomendado del piloto

1. Tomar siguiente tienda desde Google Sheets.
2. Abrir survey con Playwright.
3. Descargar imagenes y screenshot de la pregunta.
4. Generar assets derivados una sola vez:
   - `main_full`
   - crops horizontales
   - grid crops
   - zoom central
   - OCR y score de calidad
5. Clasificar pregunta usando registry.
6. Analizar con `gpt-4.1-mini`.
7. Escalar a `gpt-4.1` solo si:
   - confianza no es alta
   - producto no confirmado
   - supervisor detecta riesgo de alucinacion
   - se requiere retry con nuevos crops
8. Validar con supervisor.
9. Seleccionar opcion visible solo si supervisor aprueba.
10. Guardar trazabilidad completa en Supabase.
11. Enviar a revision humana si persiste ambiguedad.

## Esquema minimo de autoaprobacion

Permitir respuesta automatica solo cuando:

- `producto_confirmado = true`
- `confianza = alta`
- `decision_supervisor.status = approve`
- `decision_supervisor.hallucination_risk = baja`
- `tipo_de_pregunta != unknown`
- existe `evidencia_trazable.crop_asset`

## Donde no ahorrar

- No ahorrar en evidencia trazable.
- No ahorrar en reintentos de crop cuando la foto tiene detalle pequeno.
- No ahorrar en revision humana de casos ambiguos durante el piloto.

## Donde si ahorrar

- Reusar inteligencia visual entre preguntas de la misma tienda.
- No volver a procesar la imagen completa en cada pregunta.
- Escalar al modelo grande solo por gatillos objetivos.
- Limitar revision humana a excepciones.

## Siguiente implementacion sugerida

1. Integrar Supabase.
2. Crear tablas `stores`, `survey_runs`, `images`, `questions`, `answers`, `human_reviews`.
3. Implementar worker Playwright real.
4. Conectar Google Sheets.
5. Medir:
   - precision por tipo de pregunta
   - costo por tienda
   - porcentaje de escalamiento
   - porcentaje de revision humana
   - tiempo por survey
