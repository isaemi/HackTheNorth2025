import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Clock, Users, Target, Loader2 } from "lucide-react";
import backgroundImage from "@/assets/background-image.png";
import api from "@/services/api";
import { useWorkout } from "@/context/WorkoutContext";
import { useToast } from "@/hooks/use-toast";


const PresetWorkout = () => {
  const navigate = useNavigate();
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<string>("");
  const [injuries, setInjuries] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { toast } = useToast();

  const levels = ["Beginner", "Intermediate", "Advanced", "Master"];

  const categories = {
    Intensity: ["Gentle", "Moderate", "Strong", "Intense"],
    "Target Area": ["Core", "Hips", "Back", "Shoulders", "Legs"],
    Style: ["Ashtanga", "Hatha", "Iyengar", "Vinyasa"],
    Custom: ["Prenatal", "Senior", "Kids", "Recovery"],
  };

  const durations = ["15 minutes", "30 minutes", "45 minutes", "1 Hour"];

  const { setWorkout } = useWorkout();

  const handleStartWorkout = async () => {
    setIsSubmitting(true);
    const pending = toast({
      title: "Generating workout",
      description: "Hang tight…",
    });
    try {
      const payload: Record<string, any> = {
        level: selectedLevel,
        category: selectedCategory,
        style: selectedStyle,
        duration: selectedDuration,
      };
      if (injuries?.trim()) payload.injuries = injuries.trim();

      const resp = await api.post("/workouts/generate", payload);

      // Store for WorkoutSession consumption later
      setWorkout(resp.data);

      // Success toast
      try {
        const w = resp.data as any;
        pending.update({
          title: "Workout ready",
          description:
            [w?.workoutName, w?.totalDuration].filter(Boolean).join(" • ") ||
            "Ready to start",
          open: true,
        } as any);
      } catch {}

      // Navigate to session view
      navigate("/session");
      setTimeout(() => pending.dismiss?.(), 2500);
    } catch (err) {
      console.error("Workout fetch failed:", err);
      pending.update({
        title: "Failed to generate workout",
        description: "Please try again.",
        variant: "destructive",
        open: true,
      } as any);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAvailableStyles = () => {
    return selectedCategory
      ? categories[selectedCategory as keyof typeof categories]
      : [];
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat p-6 flex items-center justify-center"
      style={{ backgroundImage: `url(${backgroundImage})` }}
    >
      <div className="max-w-5xl bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-6 relative">
        {/* Header */}
        <div className="relative mb-6">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-foreground text-center">
            Choose Your Workout
          </h1>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          {/* Level */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="w-4 h-4 text-primary" />
                Level
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {levels.map((level) => (
                <Button
                  key={level}
                  variant={selectedLevel === level ? "default" : "outline"}
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => !isSubmitting && setSelectedLevel(level)}
                  disabled={isSubmitting}
                >
                  {level}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Category */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-primary" />
                Category
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.keys(categories).map((category) => (
                <Button
                  key={category}
                  variant={
                    selectedCategory === category ? "default" : "outline"
                  }
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => {
                    if (isSubmitting) return;
                    setSelectedCategory(category);
                    setSelectedStyle("");
                  }}
                  disabled={isSubmitting}
                >
                  {category}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Style */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-primary" />
                Style
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedCategory ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Select a category first
                </p>
              ) : (
                <div className="space-y-2">
                  {getAvailableStyles().map((style) => (
                    <Badge
                      key={style}
                      variant={
                        selectedStyle === style ? "default" : "secondary"
                      }
                      aria-disabled={isSubmitting}
                      className={`text-center p-2 w-full block text-xs ${
                        isSubmitting
                          ? "pointer-events-none opacity-60"
                          : "cursor-pointer"
                      } ${
                        selectedStyle === style
                          ? "bg-primary text-primary-foreground"
                          : ""
                      }`}
                      onClick={() => !isSubmitting && setSelectedStyle(style)}
                    >
                      {style}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Duration */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-primary" />
                Duration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {durations.map((duration) => (
                <Button
                  key={duration}
                  variant={
                    selectedDuration === duration ? "default" : "outline"
                  }
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => !isSubmitting && setSelectedDuration(duration)}
                  disabled={isSubmitting}
                >
                  {duration}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Injuries */}
        <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Any Injuries?</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Please describe any injuries or areas to avoid..."
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              className="min-h-[60px] text-sm"
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>

        {/* Start Button */}
        <div className="flex justify-center mt-6">
          <Button
            size="lg"
            onClick={handleStartWorkout}
            disabled={
              !selectedLevel ||
              !selectedStyle ||
              !selectedDuration ||
              isSubmitting
            }
            aria-busy={isSubmitting}
            className="w-full sm:w-auto h-20 text-2xl bg-primary text-white rounded-xl px-10"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </span>
            ) : (
              "Start Workout Session"
            )}
          </Button>
        </div>

        {isSubmitting && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <div className="flex items-center gap-3 text-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Generating your workout…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PresetWorkout;
