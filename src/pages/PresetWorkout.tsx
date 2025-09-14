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
      setWorkout(resp.data);

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
      <div className="max-w-5xl bg-white/95 backdrop-blur-sm rounded-lg p-6 relative 
                      border-4 border-[#f8c87f] shadow-2xl">
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
          <Card className="bg-[#FFF8EB] border border-[#f8c87f] shadow-sm">
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
                  size="sm"
                  className={`w-full justify-start text-xs rounded-md ${
                    selectedLevel === level
                      ? "bg-primary text-white border border-primary"
                      : "bg-[#FFFBF0] border border-[#f8c87f]/50 hover:bg-[#f9e5b5] hover:border-[#f8c87f]"
                  }`}
                  onClick={() => !isSubmitting && setSelectedLevel(level)}
                  disabled={isSubmitting}
                >
                  {level}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Category */}
          <Card className="bg-[#FFF8EB] border border-[#f8c87f] shadow-sm">
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
                  size="sm"
                  className={`w-full justify-start text-xs rounded-md ${
                    selectedCategory === category
                      ? "bg-primary text-white border border-primary"
                      : "bg-[#FFFBF0] border border-[#f8c87f]/50 hover:bg-[#f9e5b5] hover:border-[#f8c87f]"
                  }`}
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
          <Card className="bg-[#FFF8EB] border border-[#f8c87f] shadow-sm">
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
                      className={`text-center p-2 w-full block text-xs rounded-md ${
                        selectedStyle === style
                          ? "bg-primary text-white border border-primary"
                          : "bg-[#FFFBF0] border border-[#f8c87f]/50 hover:bg-[#f9e5b5] hover:border-[#f8c87f]"
                      } ${
                        isSubmitting
                          ? "pointer-events-none opacity-60"
                          : "cursor-pointer"
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
          <Card className="bg-[#FFF8EB] border border-[#f8c87f] shadow-sm">
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
                  size="sm"
                  className={`w-full justify-start text-xs rounded-md ${
                    selectedDuration === duration
                      ? "bg-primary text-white border border-primary"
                      : "bg-[#FFFBF0] border border-[#f8c87f]/50 hover:bg-[#f9e5b5] hover:border-[#f8c87f]"
                  }`}
                  onClick={() =>
                    !isSubmitting && setSelectedDuration(duration)
                  }
                  disabled={isSubmitting}
                >
                  {duration}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Injuries */}
        <Card className="bg-[#FFF8EB] border border-[#f8c87f] shadow-sm mt-4">
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
            className="w-full sm:w-auto h-20 text-2xl bg-primary text-white rounded-xl px-10 shadow-lg hover:border-[#f8c87f] hover:bg-[#f9e5b5] hover:text-foreground"
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
