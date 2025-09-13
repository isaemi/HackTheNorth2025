import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// MediaPipe
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera as MediaPipeCamera } from "@mediapipe/camera_utils";

// === Angle Utils ===
const angleBetween = (a: any, b: any, c: any) => {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const abLen = Math.hypot(ab.x, ab.y, ab.z);
  const cbLen = Math.hypot(cb.x, cb.y, cb.z);
  return Math.acos(dot / (abLen * cbLen + 1e-6)) * (180 / Math.PI);
};

const extractAngles = (lm: any) => ({
  left_knee: angleBetween(lm[23], lm[25], lm[27]),
  right_knee: angleBetween(lm[24], lm[26], lm[28]),
  left_elbow: angleBetween(lm[11], lm[13], lm[15]),
  right_elbow: angleBetween(lm[12], lm[14], lm[16]),
});

const scorePose = (angles: any, template: any) => {
  if (!template?.angles_deg) return null;
  const ref = template.angles_deg;
  const tol = template.tolerance_deg || {};
  const weights = template.weights || {};
  let total = 0,
    wsum = 0;

  for (const k of Object.keys(ref)) {
    if (angles[k] == null) continue;
    const diff = Math.abs(angles[k] - ref[k]);
    const norm = Math.min(diff / (tol[k] ?? 20), 1);
    const w = weights[k] ?? 1;
    total += (1 - norm) * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  return Math.round((total / wsum) * 100);
};

// === Draw Skeleton ===
function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  connections: Array<[number, number]>
) {
  // lines
  ctx.strokeStyle = "#00FF00";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [i, j] of connections) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;
    const ax = a.x * ctx.canvas.width;
    const ay = a.y * ctx.canvas.height;
    const bx = b.x * ctx.canvas.width;
    const by = b.y * ctx.canvas.height;
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();

  // points
  ctx.fillStyle = "#FF0000";
  for (const p of landmarks) {
    if (!p) continue;
    const x = p.x * ctx.canvas.width;
    const y = p.y * ctx.canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// === Main Component ===
const WorkoutSession = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null); // 오른쪽: 카메라
  const templateCanvasRef = useRef<HTMLCanvasElement>(null); // 왼쪽: 템플릿

  const [sessionData, setSessionData] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("Position yourself in the camera view");

  useEffect(() => {
    if (location.state) setSessionData(location.state);
  }, [location.state]);

  // ⏱️ 10초마다 다음 템플릿으로 변경 (loop 모드)
  useEffect(() => {
    if (!sessionData?.templates) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) =>
        prev + 1 < sessionData.templates.length ? prev + 1 : 0
      );
    }, 10000);
    return () => clearInterval(interval);
  }, [sessionData]);

  // draw template
  useEffect(() => {
    if (!templateCanvasRef.current || !sessionData?.templates) return;
    const ctx = templateCanvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(
      0,
      0,
      templateCanvasRef.current.width,
      templateCanvasRef.current.height
    );
    const template = sessionData.templates[currentStep];
    if (template?.landmarks) {
      drawSkeleton(ctx, template.landmarks, POSE_CONNECTIONS as any);
    }
  }, [sessionData, currentStep]);

  // Webcam + Pose Detection
  useEffect(() => {
    if (!videoRef.current || !liveCanvasRef.current) return;

    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results: any) => {
      const canvas = liveCanvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // mirror
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      // background video
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {
        drawSkeleton(ctx, results.poseLandmarks, POSE_CONNECTIONS as any);

        // angle + score
        const angles = extractAngles(results.poseLandmarks);
        const template = sessionData?.templates?.[currentStep];
        const s = scorePose(angles, template);
        if (s != null) setScore(s);

        if (angles.left_knee != null) {
          setFeedback(`Left knee angle: ${angles.left_knee.toFixed(1)}°`);
        }
      }

      ctx.restore();
    });

    const camera = new MediaPipeCamera(videoRef.current, {
      onFrame: async () => {
        await pose.send({ image: videoRef.current! });
      },
      width: 640,
      height: 480,
    });

    camera.start();

    toast({
      title: "Webcam activated",
      description: "Pose detection started",
    });
  }, [sessionData, currentStep]);

  return (
    <div className="h-screen bg-gradient-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            End Session
          </Button>
          <h1 className="text-3xl font-bold text-foreground">
            {sessionData?.templates?.[currentStep]?.pose_id ||
              "Custom Video Analysis"}
          </h1>
        </div>

        {/* 2 columns */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Left: Template skeleton */}
          <Card>
            <CardHeader>
              <CardTitle>
                Template Pose ({currentStep + 1}/{sessionData?.templates?.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <canvas
                ref={templateCanvasRef}
                width={640}
                height={480}
                className="w-full h-auto bg-gray-100 rounded"
              />
            </CardContent>
          </Card>

          {/* Right: Live camera */}
          <Card>
            <CardHeader>
              <CardTitle>Live Camera</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-black rounded relative overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="hidden"
                />
                <canvas
                  ref={liveCanvasRef}
                  width={640}
                  height={480}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold">
                {score != null ? `${score}%` : "—"}
              </h3>
              <p>Form Accuracy</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h4 className="font-semibold mb-2">Live Feedback</h4>
              <p>{feedback}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WorkoutSession;
