import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Settings, BarChart3, Users, Layers, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReferenceManager } from "@/components/ProductionCapacity/ReferenceManager";

const PROJECT_NAME = "Análisis de Capacidad de Producción";
const DEVELOPER_NAME = "Sebastián Rincón García";

const features = [
  {
    icon: Layers,
    title: "Flujo en 7 pasos",
    description: "Desde datos hasta scheduling con asignación inteligente",
  },
  {
    icon: BarChart3,
    title: "Vista jerárquica",
    description: "Métricas de eficiencia por proceso, máquina y referencia",
  },
  {
    icon: Users,
    title: "Operarios & Máquinas",
    description: "Distribución óptima por estaciones operativas",
  },
  {
    icon: Zap,
    title: "Alertas de capacidad",
    description: "Detección de cuellos de botella y horas extras",
  },
];

export default function Cover() {
  const navigate = useNavigate();
  const [isReferenceManagerOpen, setIsReferenceManagerOpen] = useState(false);

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
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href;
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
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-semibold">Capacidad</span>
        </div>
      </header>

      <main className="hero-gradient">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <section className="grid md:grid-cols-2 gap-12 items-center animate-fade-in">
            <div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
                {PROJECT_NAME}
              </h1>
              <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                Plataforma para cargar demanda, configurar operarios y proyectar la producción
                por procesos y máquinas con asignación inteligente.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Desarrollado por {DEVELOPER_NAME}
              </p>
              <div className="mt-8 flex gap-3">
                <Button
                  size="lg"
                  onClick={() => navigate("/app")}
                  className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
                >
                  Comenzar análisis
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setIsReferenceManagerOpen(true)}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Gestionar Referencias
                </Button>
              </div>
            </div>

            {/* Decorative geometric element */}
            <div className="hidden md:flex items-center justify-center">
              <div className="relative w-64 h-64">
                <div className="absolute inset-0 rounded-3xl bg-primary/5 rotate-6 border border-primary/10" />
                <div className="absolute inset-3 rounded-2xl bg-primary/10 -rotate-3 border border-primary/10" />
                <div className="absolute inset-6 rounded-xl bg-card shadow-sm border flex items-center justify-center">
                  <Activity className="h-16 w-16 text-primary/40" />
                </div>
              </div>
            </div>
          </section>

          {/* Feature cards */}
          <section className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in" style={{ animationDelay: '0.15s' }}>
            {features.map((f) => (
              <Card
                key={f.title}
                className="hover-scale cursor-default border bg-card/80 backdrop-blur-sm"
              >
                <CardContent className="p-5 space-y-2">
                  <f.icon className="h-6 w-6 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      </main>

      <footer className="border-t py-6 bg-card">
        <div className="mx-auto max-w-6xl px-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {DEVELOPER_NAME}
        </div>
      </footer>

      <Dialog open={isReferenceManagerOpen} onOpenChange={setIsReferenceManagerOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestión de Referencias Máquina-Proceso</DialogTitle>
          </DialogHeader>
          <ReferenceManager onClose={() => setIsReferenceManagerOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
