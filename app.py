from pathlib import Path


def main() -> None:
    project_root = Path(__file__).resolve().parent
    message = f"""
Este repositorio usa Next.js como runtime principal para mantener paridad entre local y Vercel.

Pasos rápidos:
1. Crear {project_root / ".env.local"} con OPENAI_API_KEY=...
2. Ejecutar: npm install
3. Ejecutar: npm run dev
4. Abrir: http://localhost:3000

El archivo app.py existe solo como wrapper de compatibilidad para el entregable.
"""
    print(message.strip())


if __name__ == "__main__":
    main()
