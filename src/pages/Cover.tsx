import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PROJECT_NAME = "Análisis de Capacidad de Producción";
const DEVELOPER_NAME = "Tu Nombre"; // TODO: reemplazar por el nombre del desarrollador

export default function Cover() {
  const navigate = useNavigate();

  // SEO básico
  useEffect(() => {
    document.title = `${PROJECT_NAME} | Portada`;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", `${PROJECT_NAME} – desarrollado por ${DEVELOPER_NAME}. Cálculo y proyección de capacidad por procesos y máquinas.`);
    } else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = `${PROJECT_NAME} – desarrollado por ${DEVELOPER_NAME}. Cálculo y proyección de capacidad por procesos y máquinas.`;
      document.head.appendChild(m);
    }

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href;

    // JSON-LD
    const scriptId = "ld-cover";
    if (!document.getElementById(scriptId)) {
      const ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = scriptId;
      ld.innerHTML = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: PROJECT_NAME,
        author: { "@type": "Person", name: DEVELOPER_NAME },
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
      });
      document.head.appendChild(ld);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-semibold">Capacidad</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              {PROJECT_NAME}
            </h1>
            <p className="mt-4 text-muted-foreground">
              Plataforma para cargar demanda, configurar operarios y proyectar la
              producción por procesos y máquinas con asignación inteligente.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Desarrollado por {DEVELOPER_NAME}
            </p>
            <div className="mt-8 flex gap-3">
              <Button onClick={() => navigate("/app")}>Comenzar análisis</Button>
              <Button variant="outline" onClick={() => navigate("/app")}>Ver demo</Button>
            </div>
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <ul className="space-y-3 text-sm">
                <li>• Flujo en 3 pasos: datos → operarios → proyección</li>
                <li>• Vista jerárquica con métricas de eficiencia</li>
                <li>• Distribución óptima por máquinas operativas</li>
                <li>• Alertas de capacidad y estaciones efectivas</li>
              </ul>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="mx-auto max-w-6xl px-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {DEVELOPER_NAME}
        </div>
      </footer>
    </div>
  );
}
