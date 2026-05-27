# Validador Visual Pilot Base

Base de piloto para analizar una imagen principal y una captura de cuestionario usando OpenAI Vision, con ejecución local y deploy en Vercel usando `Next.js`.

## Requisitos

- Node.js 22 o superior
- Una API key de OpenAI con acceso a modelos multimodales

## Instalación

```bash
npm install
```

## Configuración

1. Crea un archivo `.env.local` en la raíz del proyecto.
2. Añade tu clave:

```bash
OPENAI_API_KEY=tu_api_key_aqui
```

## Ejecutar localmente

```bash
npm run dev
```

La app quedará disponible en `http://localhost:3000`.

## Cómo probarlo

1. Abre la aplicación en el navegador.
2. Pega una `URL de la imagen principal` que sea pública y descargable.
3. Sube la `imagen del cuestionario`.
4. Opcionalmente rellena `Pregunta manual` o `Contexto adicional`.
5. Pulsa `Analizar`.
6. Revisa:
   - tipo de pregunta
   - respuesta final
   - confianza
   - evidencia trazable
   - decisión de supervisor
   - explicación
   - advertencias
7. Si quieres guardar el resultado, usa `Descargar JSON`.

## Deploy en Vercel

```bash
npx vercel --prod
```

Antes del deploy, configura `OPENAI_API_KEY` como variable de entorno en Vercel.

## Mejoras ya incluidas para piloto

- estrategia de doble etapa: `gpt-4.1-mini` y escalado a `gpt-4.1`
- registro de preguntas para orientar estrategia visual
- salida conservadora con `no_puedo_responder`
- decisión de supervisor y riesgo de alucinación
- evidencia trazable para cada respuesta
- más crops derivados para producto pequeño

## Archivos principales

- `app/page.tsx`: página principal
- `components/analysis-form.tsx`: formulario, previews y estado del cliente
- `components/result-card.tsx`: renderizado del resultado y descarga JSON
- `components/pilot-blueprint-card.tsx`: blueprint operativo del piloto
- `app/api/analyze/route.ts`: endpoint server-side para descarga de imagen, llamada a OpenAI y validación de salida
- `lib/image.ts`: capa de adquisición/conversión de imágenes
- `lib/question-registry.ts`: clasificación operativa de preguntas
- `lib/pilot-blueprint.ts`: blueprint resumido del piloto
- `lib/prompt.ts`: prompt base y wrapper de instrucciones
- `lib/schema.ts`: contrato del JSON y normalización
- `PILOTO.md`: propuesta concreta de implementación del programa piloto

## Dónde modificar si luego conectas Playwright

La extensión natural está en `lib/image.ts`.

Hoy la imagen principal se obtiene con:

- `fetchRemoteImage(url)`
- `bufferToDataUrl(buffer, mimeType)`
- `fileToDataUrl(file)`

Si después quieres usar Playwright, cambia o amplía `fetchRemoteImage` para que:

1. navegue a una URL o flujo web,
2. capture la imagen relevante,
3. devuelva el mismo contrato `{ buffer, mimeType }`.

Así no tendrás que reescribir ni la UI ni `app/api/analyze/route.ts`.

## Compatibilidad con el entregable pedido

Se incluyen `app.py` y `requirements.txt` porque fueron solicitados, pero la app real y el deploy productivo usan `Next.js` para mantener compatibilidad directa con Vercel.
