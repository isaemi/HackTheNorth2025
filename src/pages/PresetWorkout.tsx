import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Clock, Users, Target } from "lucide-react";

const PresetWorkout = () => {
  const navigate = useNavigate();
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [selectedDuration, setSelectedDuration] = useState<string>("");
  const [injuries, setInjuries] = useState<string>("");

  const levels = ["Beginner", "Intermediate", "Advanced"];
  
  const styles = [
    "Ashtanga", "Athletes", "Chair", "Chakras", "Core", "Element", 
    "Gentle", "Hatha", "Heart", "Hips", "Hot", "Iyengar", "Kids", 
    "Partner", "Prenatal", "Peak", "Postnatal", "Power", "Restorative", 
    "Runners", "Seasonal", "Senior", "Sports", "Teens", "Therapeutic", 
    "Time", "Vinyasa", "Warm Up", "Women", "Yin"
  ];
  
  const durations = [
    "5 Minute", "15 Minute", "30 Minute", "45 Minute", 
    "1 Hour", "75 Minute", "90 Minute"
  ];

  const handleStartWorkout = () => {
    if (selectedLevel && selectedStyle && selectedDuration) {
      navigate('/session', { 
        state: { 
          type: 'preset',
          level: selectedLevel, 
          style: selectedStyle, 
          duration: selectedDuration,
          injuries 
        } 
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
          <h1 className="text-4xl font-bold text-foreground">Choose Your Workout</h1>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Level Selection */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Level
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {levels.map((level) => (
                <Button
                  key={level}
                  variant={selectedLevel === level ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSelectedLevel(level)}
                >
                  {level}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Style Selection */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Style
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                {styles.map((style) => (
                  <Badge
                    key={style}
                    variant={selectedStyle === style ? "default" : "secondary"}
                    className={`cursor-pointer text-center p-2 ${
                      selectedStyle === style ? "bg-primary text-primary-foreground" : ""
                    }`}
                    onClick={() => setSelectedStyle(style)}
                  >
                    {style}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Duration & Injuries */}
          <div className="space-y-6">
            <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Duration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {durations.map((duration) => (
                  <Button
                    key={duration}
                    variant={selectedDuration === duration ? "default" : "outline"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setSelectedDuration(duration)}
                  >
                    {duration}
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
              <CardHeader>
                <CardTitle>Any Injuries?</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Please describe any injuries or areas to avoid..."
                  value={injuries}
                  onChange={(e) => setInjuries(e.target.value)}
                  className="min-h-[100px]"
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Start Button */}
        <div className="flex justify-center mt-8">
          <Button
            variant="hero"
            size="xl"
            onClick={handleStartWorkout}
            disabled={!selectedLevel || !selectedStyle || !selectedDuration}
            className="min-w-[250px]"
          >
            Start Workout Session
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PresetWorkout;