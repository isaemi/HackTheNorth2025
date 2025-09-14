import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import backgroundImage from "@/assets/background-image.png";
import { useEffect } from "react";
import { speak } from "@/utils/speak";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => {
      speak("Welcome! Choose a workout or begin rehab");
      window.removeEventListener("click", handler);
    };

    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col bg-secondary">
      {/* Background image */}
      <img
        src={backgroundImage}
        alt="Background"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Title + description */}
<div className="relative z-10 text-center max-w-4xl mx-auto px-6 pt-14">
  <h1 className="text-6xl md:text-7xl font-bold text-foreground mb-6 leading-tight text-primary">
    FlowForm
  </h1>
  <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto">
    Real-time pose detection and personalized feedback to perfect your
    form and track your progress
  </p>
</div>

{/* Buttons */}
<div className="relative z-10 mb-24 flex flex-col sm:flex-row gap-10 justify-center items-center">
  <Button
    size="xl"
    onClick={() => navigate("/preset")}
    className="w-full sm:w-auto h-20 text-2xl bg-primary text-white rounded-xl px-10"
  >
    Choose Preset Workout
  </Button>

  <Button
    size="xl"
    onClick={() => navigate("/rehab")}
    className="w-full sm:w-auto h-20 text-2xl bg-primary text-white rounded-xl px-10"
  >
    Begin Rehab
  </Button>
</div>


      {/* Decorations */}
      <div className="absolute top-20 left-10 w-20 h-20 bg-primary/5 rounded-full blur-xl"></div>
      <div className="absolute bottom-40 left-20 w-32 h-32 bg-secondary/5 rounded-full blur-xl"></div>
      <div className="absolute top-40 right-40 w-24 h-24 bg-accent/5 rounded-full blur-xl"></div>
    </div>
  );
};

export default Index;
