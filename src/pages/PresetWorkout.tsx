import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Clock, Users, Target } from "lucide-react";
import backgroundImage from "@/assets/background-image.png";

const PresetWorkout = () => {
  const navigate = useNavigate();
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<string>("");
  const [injuries, setInjuries] = useState<string>("");

  const levels = ["Beginner", "Intermediate", "Advanced", "Master"];

  const categories = {
    Intensity: ["Gentle", "Moderate", "Strong", "Intense"],
    "Target Area": ["Core", "Hips", "Back", "Shoulders", "Legs"],
    Style: ["Ashtanga", "Hatha", "Iyengar", "Vinyasa"],
    Custom: ["Prenatal", "Senior", "Kids", "Recovery"],
  };

  const durations = ["15 minutes", "30 minutes", "45 minutes", "1 Hour"];

  const handleStartWorkout = async () => {
    try {
      let response = await fetch("http://localhost:5000/api/cohere", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: selectedLevel,
          style: selectedStyle,
          duration: selectedDuration,
          injuries,
        }),
      });

      if (!response.ok) {
        console.warn("Cohere failed, fallback to Martian");
        response = await fetch("http://localhost:5000/api/martian", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: selectedLevel,
            style: selectedStyle,
            duration: selectedDuration,
            injuries,
          }),
        });
      }

      const data = await response.json();
      console.log("Workout routines:", data);

      navigate("/session", {
        state: {
          type: "preset",
          level: selectedLevel,
          style: selectedStyle,
          duration: selectedDuration,
          injuries,
          routines: data,
        },
      });
    } catch (err) {
      console.error("Workout fetch failed:", err);
      alert("Failed to fetch workouts. Please try again.");
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
      <div className="max-w-5xl bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-6">
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
                  onClick={() => setSelectedLevel(level)}
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
                    setSelectedCategory(category);
                    setSelectedStyle("");
                  }}
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
                      className={`cursor-pointer text-center p-2 w-full block text-xs ${
                        selectedStyle === style
                          ? "bg-primary text-primary-foreground"
                          : ""
                      }`}
                      onClick={() => setSelectedStyle(style)}
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
                  onClick={() => setSelectedDuration(duration)}
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
            />
          </CardContent>
        </Card>

        {/* Start Button */}
        <div className="flex justify-center mt-6">
          <Button
            variant="hero"
            size="lg"
            onClick={handleStartWorkout}
            disabled={!selectedLevel || !selectedStyle || !selectedDuration}
            className="min-w-[200px]"
          >
            Start Workout Session
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PresetWorkout;
