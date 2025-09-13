import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Camera, Play, Pause, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const WorkoutSession = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [currentPose, setCurrentPose] = useState("Mountain Pose");
  const [reps, setReps] = useState(0);
  const [feedback, setFeedback] = useState("Position yourself in the camera view");

  useEffect(() => {
    if (location.state) {
      setSessionData(location.state);
    }
  }, [location.state]);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsWebcamActive(true);
        toast({
          title: "Webcam activated",
          description: "Position yourself in the camera view to begin",
        });
      }
    } catch (error) {
      console.error("Error accessing webcam:", error);
      toast({
        title: "Camera access denied",
        description: "Please allow camera access to use pose detection",
        variant: "destructive",
      });
    }
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsWebcamActive(false);
    }
  };

  const simulatePoseDetection = () => {
    // Simulate pose detection feedback
    const feedbacks = [
      "Great form! Keep it up!",
      "Lower your hips slightly",
      "Straighten your back",
      "Perfect squat depth!",
      "Align your knees with your toes"
    ];
    setFeedback(feedbacks[Math.floor(Math.random() * feedbacks.length)]);
    setReps(prev => prev + 1);
  };

  useEffect(() => {
    if (isWebcamActive) {
      const interval = setInterval(simulatePoseDetection, 3000);
      return () => clearInterval(interval);
    }
  }, [isWebcamActive]);

  return (
    <div className="min-h-screen bg-gradient-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              End Session
            </Button>
            <h1 className="text-3xl font-bold text-foreground">
              {sessionData?.type === 'preset' ? 
                `${sessionData.style} - ${sessionData.level}` : 
                'Custom Video Analysis'
              }
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={isWebcamActive ? "destructive" : "default"}
              onClick={isWebcamActive ? stopWebcam : startWebcam}
              className="flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              {isWebcamActive ? "Stop Camera" : "Start Camera"}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Instructions Panel */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader>
              <CardTitle>Current Exercise: {currentPose}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-muted rounded-lg mb-4 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4">
                    <Play className="w-12 h-12 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Exercise demonstration will appear here
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold">Instructions:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Stand with feet shoulder-width apart</li>
                  <li>• Keep your back straight</li>
                  <li>• Lower down until thighs are parallel</li>
                  <li>• Push through heels to return</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Webcam Feed */}
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardHeader>
              <CardTitle>Live Camera Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-black rounded-lg relative overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                />
                
                {!isWebcamActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button 
                      variant="hero"
                      onClick={startWebcam}
                      className="flex items-center gap-2"
                    >
                      <Camera className="w-5 h-5" />
                      Activate Camera
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats & Feedback */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-primary">{reps}</h3>
              <p className="text-sm text-muted-foreground">Repetitions</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-accent">85%</h3>
              <p className="text-sm text-muted-foreground">Form Accuracy</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-card backdrop-blur-sm border-0 shadow-card">
            <CardContent className="p-6">
              <h4 className="font-semibold mb-2">Live Feedback</h4>
              <p className="text-sm text-muted-foreground">{feedback}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WorkoutSession;