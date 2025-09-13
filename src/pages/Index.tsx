import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import beaverImage from "@/assets/fitness-beaver.png";
import beaverImage2 from "@/assets/fitness-beaver2.png";
import backgroundImage from "@/assets/background-image.png";
import { useEffect } from "react";
import { speak } from "@/utils/speak";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => {
      speak("Welcome! Choose a workout or upload a video");
      window.removeEventListener("click", handler);
    };

    window.addEventListener("click", handler);

    return () => {
      window.removeEventListener("click", handler);
    };
  }, []);

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat flex flex-col items-center justify-center relative overflow-hidden" style={{backgroundImage: `url(${backgroundImage})`}}>
      <div className="text-center z-10 max-w-4xl mx-auto px-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-xl p-8 flex flex-col items-center justify-center">
        <h1 className="text-6xl md:text-7xl font-bold text-foreground mb-6 leading-tight">
          Your AI Fitness
          <br />
          <span className="bg-gradient-primary bg-clip-text text-transparent">
            Coach
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto">
          Real-time pose detection and personalized feedback to perfect your form and track your progress
        </p>
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <Button 
            variant="hero"
            size="xl"
            onClick={() => navigate('/preset')}
            className="w-full sm:w-auto min-w-[200px]"
          >
            Choose Preset Workout
          </Button>
          
          <Button 
            variant="secondary-hero"
            size="xl"
            onClick={() => navigate('/upload')}
            className="w-full sm:w-auto min-w-[200px]"
          >
            Upload Custom Video
          </Button>
        </div>
      </div>
    </div>

      <div className="absolute bottom-8 right-8 w-48 h-36 md:w-64 md:h-48">
        <div className="relative w-full h-full">
          {/* Shadow */}
          <img
            src={beaverImage2}
            alt="Beaver shadow"
            className="absolute bottom-0 opacity-40 z-0"
          />
          {/* Character */}
          <img
            src={beaverImage}
            alt="Fitness beaver mascot doing exercises"
            className="absolute bottom-0 w-full z-10 animate-bounce"
          />
        </div>
      </div>
      
      <div className="absolute top-20 left-10 w-20 h-20 bg-primary/5 rounded-full blur-xl"></div>
      <div className="absolute bottom-40 left-20 w-32 h-32 bg-secondary/5 rounded-full blur-xl"></div>
      <div className="absolute top-40 right-40 w-24 h-24 bg-accent/5 rounded-full blur-xl"></div>
    </div>
  );
};

export default Index;
