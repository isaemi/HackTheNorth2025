import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WorkoutProvider } from "./context/WorkoutContext";
import Index from "./pages/Index";
import PresetWorkout from "./pages/PresetWorkout";
import Rehab from "./pages/Rehab";
import WorkoutSession from "./pages/WorkoutSession";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <WorkoutProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/preset" element={<PresetWorkout />} />
            <Route path="/rehab" element={<Rehab />} />
            <Route path="/session" element={<WorkoutSession />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </WorkoutProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
