import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UserAuthProvider } from "@/contexts/UserAuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Cover from "./pages/Cover";
import CapacityHistory from "./pages/CapacityHistory";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserAuthProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Cover />} />
            <Route path="/app" element={<Index />} />
            <Route path="/historial" element={<CapacityHistory />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserAuthProvider>
  </QueryClientProvider>
);

export default App;
