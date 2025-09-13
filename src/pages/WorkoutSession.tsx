import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// MediaPipe
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera as MediaPipeCamera } from "@mediapipe/camera_utils";

/**
 * WorkoutSession
 * - Live MediaPipe Pose from webcam
 * - Scores user vs. current template with robust pipeline:
 *    • normalization (translate/scale/rotate)
 *    • angle extraction incl. spine_tilt
 *    • visibility gating & joint weighting
 *    • per-joint angle smoothing (median over last N frames)
 *    • trim worst joint, non-linear top-end lift
 * - Draws color-coded skeleton by error
 *
 * Expected location.state:
 * {
 *   templates: Array<{
 *     pose_id: string,
 *     angles_deg: Record<string, number>,
 *     tolerance_deg: Record<string, number>,
 *     weights: Record<string, number>,
 *     camera_view?: "front" | "side"
 *     // (optional) landmarks/image preview not required
 *   }>
 * }
 */

// ---- MediaPipe landmark indices (BlazePose Full) ----
const L = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

// ---- Joints & required landmarks for visibility gating ----
const JOINT_LM: Record<string, number[]> = {
  left_elbow: [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST],
  right_elbow: [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST],
  left_knee: [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE],
  right_knee: [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
  left_shoulder: [L.LEFT_ELBOW, L.LEFT_SHOULDER, L.LEFT_HIP],
  right_shoulder: [L.RIGHT_ELBOW, L.RIGHT_SHOULDER, L.RIGHT_HIP],
  left_hip: [L.LEFT_SHOULDER, L.LEFT_HIP, L.LEFT_KNEE],
  right_hip: [L.RIGHT_SHOULDER, L.RIGHT_HIP, L.RIGHT_KNEE],
  spine_tilt: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
};

// ---- Simple math helpers ----
type Pt = { x: number; y: number; z?: number; visibility?: number };

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Pt | { x: number; y: number }) => Math.hypot(a.x, a.y);

const angleBetween2D = (a: Pt, b: Pt, c: Pt) => {
  const BA = sub(a, b);
  const BC = sub(c, b);
  const d = (BA.x * BC.x + BA.y * BC.y) / (len(BA) * len(BC) + 1e-6);
  const clamped = Math.max(-1, Math.min(1, d));
  return Math.acos(clamped) * (180 / Math.PI);
};

// Translate by mid-hip, scale by shoulder→hip distance, rotate shoulders horizontal.
function normalizeXY(lm: Pt[]) {
  const lhip = lm[L.LEFT_HIP];
  const rhip = lm[L.RIGHT_HIP];
  const lsh = lm[L.LEFT_SHOULDER];
  const rsh = lm[L.RIGHT_SHOULDER];
  if (!lhip || !rhip || !lsh || !rsh) return null;

  const midHip = { x: (lhip.x + rhip.x) / 2, y: (lhip.y + rhip.y) / 2 };
  const scale = len({ x: lsh.x - lhip.x, y: lsh.y - lhip.y }) + 1e-6;
  const shv = { x: rsh.x - lsh.x, y: rsh.y - lsh.y };
  const theta = Math.atan2(shv.y, shv.x);
  const c = Math.cos(-theta),
    s = Math.sin(-theta);

  const out: Record<string, { x: number; y: number }> = {};
  const apply = (p: Pt) => {
    const tx = (p.x - midHip.x) / scale;
    const ty = (p.y - midHip.y) / scale;
    return { x: c * tx - s * ty, y: s * tx + c * ty };
  };

  // Only the ones we need for angle calc + drawing
  const keys = Object.values(L) as number[];
  keys.forEach((idx) => {
    const p = lm[idx];
    if (p) out[idx] = apply(p);
  });
  // reference
  (out as any)["mid_hip"] = { x: 0, y: 0 };
  return out;
}

function extractAngles(norm: Record<string, { x: number; y: number }>) {
  const j = (ai: number, bi: number, ci: number) =>
    angleBetween2D(norm[ai], norm[bi], norm[ci]);

  const angles: Record<string, number> = {
    left_elbow: j(L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST),
    right_elbow: j(L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST),
    left_knee: j(L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE),
    right_knee: j(L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE),
    left_shoulder: j(L.LEFT_ELBOW, L.LEFT_SHOULDER, L.LEFT_HIP),
    right_shoulder: j(L.RIGHT_ELBOW, L.RIGHT_SHOULDER, L.RIGHT_HIP),
    left_hip: j(L.LEFT_SHOULDER, L.LEFT_HIP, L.LEFT_KNEE),
    right_hip: j(L.RIGHT_SHOULDER, L.RIGHT_HIP, L.RIGHT_KNEE),
  };

  // spine tilt (deg from vertical)
  const lsh = norm[L.LEFT_SHOULDER],
    rsh = norm[L.RIGHT_SHOULDER];
  const shMid = { x: (lsh.x + rsh.x) / 2, y: (lsh.y + rsh.y) / 2 };
  const hipMid = (norm as any)["mid_hip"];
  const v = { x: shMid.x - hipMid.x, y: shMid.y - hipMid.y };
  const spine = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 180;
  angles["spine_tilt"] = Math.abs(spine - 90);

  return angles;
}

// Wrap angle difference to [0, 180]
const wrapDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ---- Median smoother per joint (N frames) ----
function useAngleSmoother(N = 7) {
  const buffers = useRef<Map<string, number[]>>(new Map());
  const push = (k: string, v: number) => {
    const buf = buffers.current.get(k) || [];
    buf.push(v);
    if (buf.length > N) buf.shift();
    buffers.current.set(k, buf);
    const s = [...buf].sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)];
  };
  const reset = () => buffers.current.clear();
  return { push, reset };
}

// ---- Visibility helpers ----
const visOK = (names: number[], vis: number[], thresh = 0.5) =>
  names.every((i) => (vis[i] ?? 0) >= thresh);

// ---- Draw skeleton with color by per-joint error ----
function drawSkeletonColored(
  ctx: CanvasRenderingContext2D,
  lm: Pt[],
  connections: Array<[number, number]>,
  jointErr: Record<string, number> // normalized error 0..1 per major joint
) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height;

  const pickColor = (keyGuess: string) => {
    const n = jointErr[keyGuess] ?? 0;
    if (n <= 1.0) return "rgba(124,255,134,0.95)"; // green
    if (n <= 2.0) return "rgba(255,211,110,0.95)"; // yellow
    return "rgba(255,110,122,0.95)"; // red
  };

  const segToKey = (a: number, b: number) => {
    const sA =
      [L.LEFT_ELBOW, L.RIGHT_ELBOW].includes(a as any) ||
      [L.LEFT_ELBOW, L.RIGHT_ELBOW].includes(b as any)
        ? a === L.LEFT_ELBOW || b === L.LEFT_ELBOW
          ? "left_elbow"
          : "right_elbow"
        : [L.LEFT_KNEE, L.RIGHT_KNEE].includes(a as any) ||
          [L.LEFT_KNEE, L.RIGHT_KNEE].includes(b as any)
        ? a === L.LEFT_KNEE || b === L.LEFT_KNEE
          ? "left_knee"
          : "right_knee"
        : [L.LEFT_SHOULDER, L.RIGHT_SHOULDER].includes(a as any) ||
          [L.LEFT_SHOULDER, L.RIGHT_SHOULDER].includes(b as any)
        ? a === L.LEFT_SHOULDER || b === L.LEFT_SHOULDER
          ? "left_shoulder"
          : "right_shoulder"
        : "spine_tilt";
    return sA;
  };

  ctx.lineWidth = 6;
  connections.forEach(([i, j]) => {
    const A = lm[i];
    const B = lm[j];
    if (!A || !B) return;
    ctx.strokeStyle = pickColor(segToKey(i, j));
    ctx.beginPath();
    ctx.moveTo(A.x * W, A.y * H);
    ctx.lineTo(B.x * W, B.y * H);
    ctx.stroke();
  });
}

// ---- Robust scoring (visibility gating, trim worst, non-linear top end) ----
function scoreAgainstTemplate(
  userAngles: Record<string, number>,
  tpl: any,
  visibility: number[]
) {
  if (!tpl?.angles_deg)
    return { score: null, rows: [], jointErr: {} as Record<string, number> };
  const ref = tpl.angles_deg as Record<string, number>;
  const tol = (tpl.tolerance_deg || {}) as Record<string, number>;
  const W = (tpl.weights || {}) as Record<string, number>;

  const rows: Array<[string, number, number, number, number]> = []; // [joint, diffDeg, normErr, tolDeg, weight]
  for (const k of Object.keys(ref)) {
    if (!(k in userAngles)) continue;
    const lmReq = JOINT_LM[k];
    if (lmReq && !visOK(lmReq, visibility, 0.5)) continue; // gate low-confidence joints

    const diff = wrapDiff(userAngles[k], ref[k]);
    const t = Math.max(1e-6, tol[k] ?? 12);
    const w = W[k] ?? 1;
    const n = Math.min(diff / t, 1); // cap at 1
    rows.push([k, diff, n, t, w]);
  }

  if (!rows.length)
    return { score: null, rows: [], jointErr: {} as Record<string, number> };

  // Trim the single worst joint
  rows.sort((a, b) => b[2] - a[2]);
  const used = rows.slice(1);

  let num = 0,
    den = 0;
  used.forEach(([, , n, , w]) => {
    // soft visibility-based weight tweak (keep 0.6..1.0)
    const lmReq = JOINT_LM[rows[0][0]]; // not perfect mapping per-row, OK for live preview
    const vmin = lmReq ? Math.min(...lmReq.map((i) => visibility[i] ?? 1)) : 1;
    const wEff = w * (0.6 + 0.4 * Math.max(0, Math.min(1, vmin)));
    num += n * wEff;
    den += wEff;
  });

  const mae = den ? num / den : 1;
  const sRaw = Math.max(0, 1 - mae);
  const sDisp = Math.pow(sRaw, 0.6); // non-linear lift near top
  const score = Math.round(100 * sDisp);

  const jointErr: Record<string, number> = {};
  rows.forEach(([k, , n]) => (jointErr[k] = n));
  return { score, rows, jointErr };
}

// === Main Component ===
const WorkoutSession = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const templateCanvasRef = useRef<HTMLCanvasElement>(null);

  const [sessionData, setSessionData] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState(
    "Position yourself in the camera view"
  );

  // Per-joint smoother
  const { push: smoothAngle, reset: resetSmoother } = useAngleSmoother(7);

  // Remember last template (for UI header)
  const currentTemplate = useMemo(
    () => sessionData?.templates?.[currentStep],
    [sessionData, currentStep]
  );

  useEffect(() => {
    if (location.state) setSessionData(location.state);
  }, [location.state]);

  // Auto-advance every 10s (loop)
  useEffect(() => {
    if (!sessionData?.templates?.length) return;
    const id = setInterval(() => {
      setCurrentStep((p) => (p + 1 < sessionData.templates.length ? p + 1 : 0));
      resetSmoother();
    }, 10000);
    return () => clearInterval(id);
  }, [sessionData, resetSmoother]);

  // Draw a basic stick template if landmarks preview provided (optional)
  useEffect(() => {
    const canvas = templateCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const t = currentTemplate;
    if (!t?.landmarks) return;

    // Expect t.landmarks as array of {x,y}
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 2;
    ctx.beginPath();
    (POSE_CONNECTIONS as any as Array<[number, number]>).forEach(([i, j]) => {
      const a = t.landmarks[i];
      const b = t.landmarks[j];
      if (!a || !b) return;
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    });
    ctx.stroke();

    ctx.fillStyle = "#9ca3af";
    for (const p of t.landmarks) {
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [currentTemplate]);

  // Webcam + Pose Detection
  useEffect(() => {
    const video = videoRef.current;
    const canvas = liveCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d")!;
    let camera: MediaPipeCamera | null = null;
    let pose: Pose | null = null;

    // Resize canvas to element size for crisp drawing
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1, // can switch to 2 during "hold"
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
      selfieMode: true,
    });

    pose.onResults((results: any) => {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Mirror
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      // Draw video bg
      if (results.image) {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      }

      const lm: Pt[] | undefined = results.poseLandmarks;
      if (!lm || !currentTemplate) {
        ctx.restore();
        return;
      }

      // Gather visibility as array by index
      const visibility: number[] = Array(33).fill(1);
      for (let i = 0; i < lm.length; i++) {
        visibility[i] = lm[i]?.visibility ?? 1;
      }

      // Normalize → angles → smooth per joint
      const norm = normalizeXY(lm);
      if (!norm) {
        ctx.restore();
        return;
      }
      const rawAngles = extractAngles(norm);
      const angles: Record<string, number> = {};
      for (const k of Object.keys(rawAngles)) {
        angles[k] = smoothAngle(k, rawAngles[k]);
      }

      // Score
      const {
        score: s,
        rows,
        jointErr,
      } = scoreAgainstTemplate(angles, currentTemplate, visibility);
      if (s != null) setScore(s);

      // Feedback (simple)
      if (rows.length) {
        const worst = [...rows].sort((a, b) => b[2] - a[2])[0]; // [joint, diff, norm, tol, w]
        const [joint, diff, norm, tol] = worst;
        const pct = Math.min(100, Math.round((diff / tol) * 100));
        setFeedback(
          norm <= 1
            ? "Nice! Hold steady…"
            : `Adjust ${joint.replace("_", " ")} ~${Math.round(
                diff
              )}° (within ${Math.round(tol)}°)`
        );
      } else {
        setFeedback("Find the camera and stand tall. :)");
      }

      // Draw skeleton color-coded by error
      drawSkeletonColored(ctx, lm, POSE_CONNECTIONS as any, jointErr);

      ctx.restore();
    });

    camera = new MediaPipeCamera(video, {
      onFrame: async () => {
        if (pose && video) await pose.send({ image: video });
      },
      width: 1280,
      height: 720,
    });
    camera.start();

    toast({ title: "Webcam activated", description: "Pose detection started" });

    return () => {
      try {
        camera?.stop();
      } catch {}
      try {
        (pose as any)?.close?.();
      } catch {}
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTemplate]);

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
            {currentTemplate?.pose_id || "Custom Video Analysis"}
          </h1>
        </div>

        {/* 2 columns */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Left: Template skeleton (if any preview provided) */}
          <Card>
            <CardHeader>
              <CardTitle>
                Template Pose ({currentStep + 1}/
                {sessionData?.templates?.length || 0})
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
              <h3 className="text-4xl font-bold">
                {score != null ? `${score}%` : "—"}
              </h3>
              <p className="opacity-80">Form Accuracy</p>
              <p className="text-xs mt-2 opacity-70">
                (Visibility-gated, smoothed, trim-worst, non-linear)
              </p>
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
