import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import RehabReasoningBanner from "@/components/rehab/RehabReasoningBanner";
import { useWorkout } from "@/context/WorkoutContext";
import api from "@/services/api";

// MediaPipe
import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
import { Camera as MediaPipeCamera } from "@mediapipe/camera_utils";

/**
 * WorkoutSession — ALL improvements:
 * - Robust angle-based scoring:
 *    • normalization (translate/scale/rotate)
 *    • angles incl. spine_tilt
 *    • visibility gating
 *    • per-joint median smoothing (N=7)
 *    • trim worst joint
 *    • non-linear top-end lift
 * - Hybrid similarity (optional when template.landmarks present):
 *    • bone-vector cosine similarity
 *    • pose embedding (coords+unit bones) distance → similarity
 *    • blended final score: 0.60*angles + 0.25*bones + 0.15*embed
 * - Color-coded skeleton by per-joint error
 *
 * Expected location.state:
 * {
 *   templates: Array<{
 *     pose_id: string,
 *     angles_deg: Record<string, number>,
 *     tolerance_deg: Record<string, number>,
 *     weights: Record<string, number>,
 *     camera_view?: "front" | "side",
 *     // OPTIONAL normalized template landmarks:
 *     //  either as name→{x,y} object (builder output) OR index-array [{x,y}, ...]
 *     landmarks?: Record<string, {x:number,y:number}> | Array<{x:number,y:number}>
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

// Name → index (to consume builder JSON landmarks keyed by names)
const NAME_TO_INDEX: Record<string, number> = {
  left_shoulder: L.LEFT_SHOULDER,
  right_shoulder: L.RIGHT_SHOULDER,
  left_elbow: L.LEFT_ELBOW,
  right_elbow: L.RIGHT_ELBOW,
  left_wrist: L.LEFT_WRIST,
  right_wrist: L.RIGHT_WRIST,
  left_hip: L.LEFT_HIP,
  right_hip: L.RIGHT_HIP,
  left_knee: L.LEFT_KNEE,
  right_knee: L.RIGHT_KNEE,
  left_ankle: L.LEFT_ANKLE,
  right_ankle: L.RIGHT_ANKLE,
  left_heel: L.LEFT_HEEL,
  right_heel: L.RIGHT_HEEL,
  left_foot_index: L.LEFT_FOOT_INDEX,
  right_foot_index: L.RIGHT_FOOT_INDEX,
  // "mid_hip" is synthetic; recomputed locally.
};

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

// Coarse limb groups for user-friendly visibility prompts
const LIMB_GROUPS: Record<string, number[]> = {
  "left arm": [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST],
  "right arm": [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST],
  "left leg": [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE],
  "right leg": [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
  torso: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
};

function missingLimbGroups(visibility: number[], thresh = 0.5): string[] {
  const out: string[] = [];
  for (const [name, inds] of Object.entries(LIMB_GROUPS)) {
    if (!visOK(inds, visibility, thresh)) out.push(name);
  }
  return out;
}

// ======================= HYBRID SIMILARITY HELPERS =======================

// Bone list for orientation similarity
const BONES: Array<[number, number]> = [
  [L.LEFT_SHOULDER, L.LEFT_ELBOW],
  [L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
  [L.LEFT_ELBOW, L.LEFT_WRIST],
  [L.RIGHT_ELBOW, L.RIGHT_WRIST],
  [L.LEFT_HIP, L.LEFT_KNEE],
  [L.RIGHT_HIP, L.RIGHT_KNEE],
  [L.LEFT_KNEE, L.LEFT_ANKLE],
  [L.RIGHT_KNEE, L.RIGHT_ANKLE],
  [L.LEFT_SHOULDER, L.LEFT_HIP],
  [L.RIGHT_SHOULDER, L.RIGHT_HIP],
];

const unitVec = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const vx = b.x - a.x,
    vy = b.y - a.y;
  const n = Math.hypot(vx, vy) || 1e-6;
  return { x: vx / n, y: vy / n };
};

function boneCosineScore(
  normUser: Record<string, { x: number; y: number }>,
  normTpl: Record<string, { x: number; y: number }>,
  visibility: number[]
) {
  const cosines: number[] = [];
  for (const [i, j] of BONES) {
    const ok = (visibility[i] ?? 1) >= 0.5 && (visibility[j] ?? 1) >= 0.5;
    if (!ok || !normUser[i] || !normUser[j] || !normTpl[i] || !normTpl[j])
      continue;
    const u = unitVec(normUser[i], normUser[j]);
    const v = unitVec(normTpl[i], normTpl[j]);
    const cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    cosines.push(Math.max(0, cos)); // clamp to [0,1]
  }
  if (!cosines.length) return 0;
  return 100 * (cosines.reduce((s, c) => s + c, 0) / cosines.length);
}

const EMB_KEYS = [
  L.LEFT_SHOULDER,
  L.RIGHT_SHOULDER,
  L.LEFT_HIP,
  L.RIGHT_HIP,
  L.LEFT_ELBOW,
  L.RIGHT_ELBOW,
  L.LEFT_KNEE,
  L.RIGHT_KNEE,
  L.LEFT_WRIST,
  L.RIGHT_WRIST,
  L.LEFT_ANKLE,
  L.RIGHT_ANKLE,
];

function embedPose(norm: Record<string, { x: number; y: number }>) {
  const shL = norm[L.LEFT_SHOULDER],
    shR = norm[L.RIGHT_SHOULDER];
  if (!shL || !shR) return [];
  const base = { x: (shL.x + shR.x) / 2, y: (shL.y + shR.y) / 2 };
  const v: number[] = [];
  for (const k of EMB_KEYS) {
    const p = norm[k];
    if (!p) return [];
    v.push(p.x - base.x, p.y - base.y);
  }
  for (const [i, j] of BONES) {
    const u = unitVec(norm[i], norm[j]);
    v.push(u.x, u.y);
  }
  return v;
}

function similarityEmbed(u: number[], t: number[]) {
  if (!u.length || u.length !== t.length) return 0;
  let d2 = 0;
  for (let i = 0; i < u.length; i++) {
    const d = u[i] - t[i];
    d2 += d * d;
  }
  const d = Math.sqrt(d2);
  const scale = Math.sqrt(u.length) * 0.15; // soft margin
  const s = Math.max(0, 1 - d / (scale + 1e-6)); // 0..1
  return 100 * s;
}

// Build a 33-length array from template.landmarks that could be name→{x,y} or array
function coerceTemplateLandmarks(
  lm:
    | Record<string, { x: number; y: number }>
    | Array<{ x: number; y: number }>
    | undefined
): Pt[] | null {
  if (!lm) return null;
  const out: Pt[] = new Array(33).fill(null) as any;
  if (Array.isArray(lm)) {
    // assume already index-aligned
    for (let i = 0; i < Math.min(33, lm.length); i++) {
      const p = lm[i];
      if (p) out[i] = { x: p.x, y: p.y };
    }
  } else {
    for (const [name, idx] of Object.entries(NAME_TO_INDEX)) {
      const p = (lm as any)[name];
      if (p) out[idx] = { x: p.x, y: p.y };
    }
  }
  return out;
}

// ======================= DRAWING =======================
function drawSkeletonColored(
  ctx: CanvasRenderingContext2D,
  lm: Pt[],
  connections: Array<[number, number]>,
  jointErr: Record<string, number> // normalized error
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
    if (a === L.LEFT_ELBOW || b === L.LEFT_ELBOW) return "left_elbow";
    if (a === L.RIGHT_ELBOW || b === L.RIGHT_ELBOW) return "right_elbow";
    if (a === L.LEFT_KNEE || b === L.LEFT_KNEE) return "left_knee";
    if (a === L.RIGHT_KNEE || b === L.RIGHT_KNEE) return "right_knee";
    if (a === L.LEFT_SHOULDER || b === L.LEFT_SHOULDER) return "left_shoulder";
    if (a === L.RIGHT_SHOULDER || b === L.RIGHT_SHOULDER)
      return "right_shoulder";
    return "spine_tilt";
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

// Small callout labels for top issues on the skeleton
function drawIssueCallouts(
  ctx: CanvasRenderingContext2D,
  lm: Pt[],
  issues: Array<{ joint: string; text: string }>
) {
  if (!issues.length) return;
  const W = ctx.canvas.width,
    H = ctx.canvas.height;

  const anchorFor = (joint: string): { x: number; y: number } | null => {
    switch (joint) {
      case "left_elbow":
        return lm[L.LEFT_ELBOW] ? { x: lm[L.LEFT_ELBOW].x * W, y: lm[L.LEFT_ELBOW].y * H } : null;
      case "right_elbow":
        return lm[L.RIGHT_ELBOW] ? { x: lm[L.RIGHT_ELBOW].x * W, y: lm[L.RIGHT_ELBOW].y * H } : null;
      case "left_knee":
        return lm[L.LEFT_KNEE] ? { x: lm[L.LEFT_KNEE].x * W, y: lm[L.LEFT_KNEE].y * H } : null;
      case "right_knee":
        return lm[L.RIGHT_KNEE] ? { x: lm[L.RIGHT_KNEE].x * W, y: lm[L.RIGHT_KNEE].y * H } : null;
      case "left_shoulder":
        return lm[L.LEFT_SHOULDER]
          ? { x: lm[L.LEFT_SHOULDER].x * W, y: lm[L.LEFT_SHOULDER].y * H }
          : null;
      case "right_shoulder":
        return lm[L.RIGHT_SHOULDER]
          ? { x: lm[L.RIGHT_SHOULDER].x * W, y: lm[L.RIGHT_SHOULDER].y * H }
          : null;
      case "left_hip":
        return lm[L.LEFT_HIP] ? { x: lm[L.LEFT_HIP].x * W, y: lm[L.LEFT_HIP].y * H } : null;
      case "right_hip":
        return lm[L.RIGHT_HIP]
          ? { x: lm[L.RIGHT_HIP].x * W, y: lm[L.RIGHT_HIP].y * H }
          : null;
      case "spine_tilt":
        if (lm[L.LEFT_SHOULDER] && lm[L.RIGHT_SHOULDER]) {
          return {
            x: ((lm[L.LEFT_SHOULDER].x + lm[L.RIGHT_SHOULDER].x) / 2) * W,
            y: ((lm[L.LEFT_SHOULDER].y + lm[L.RIGHT_SHOULDER].y) / 2) * H,
          };
        }
        return null;
      default:
        return null;
    }
  };

  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
  issues.forEach(({ joint, text }, idx) => {
    const anchor = anchorFor(joint);
    if (!anchor) return;
    const padX = 8;
    const padY = 6;
    const metrics = ctx.measureText(text);
    const boxW = Math.ceil(metrics.width) + padX * 2;
    const boxH = 22;

    // Offset labels slightly to avoid overlap; alternate directions
    const offX = 12 * (idx % 2 === 0 ? 1 : -1);
    const offY = -28 - idx * 4;
    const x = Math.min(Math.max(4, anchor.x + offX - boxW / 2), W - boxW - 4);
    const y = Math.min(Math.max(4, anchor.y + offY - boxH / 2), H - boxH - 4);

    // Box
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    // Text
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + padX, y + boxH - 8);

    // Leader line from box to anchor
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(x + boxW / 2, y + boxH);
    ctx.stroke();
  });
}

// ======================= ANGLE SCORING =======================
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

  const refKeys = Object.keys(ref);
  const rows: Array<[string, number, number, number, number]> = []; // [joint, diffDeg, normErr, tolDeg, weight]
  for (const k of refKeys) {
    if (!(k in userAngles)) continue;
    const lmReq = JOINT_LM[k];
    if (lmReq && !visOK(lmReq, visibility, 0.5)) continue; // gate low-confidence joints

    const diff = wrapDiff(userAngles[k], ref[k]);
    const t = Math.max(1e-6, tol[k] ?? 12);
    const w = W[k] ?? 1;
    const n = Math.min(diff / t, 1); // cap at 1
    rows.push([k, diff, n, t, w]);
  }

  const expected = refKeys.length;
  const visibleCount = rows.length;
  if (!rows.length)
    return {
      score: null,
      rows: [],
      jointErr: {} as Record<string, number>,
      coverage: 0,
      expected,
      visibleCount,
    } as any;

  // Trim the single worst joint
  rows.sort((a, b) => b[2] - a[2]);
  const used = rows.slice(1);

  let num = 0,
    den = 0;
  used.forEach(([, , n, , w]) => {
    num += n * w;
    den += w;
  });

  const mae = den ? num / den : 1;
  const sRaw = Math.max(0, 1 - mae);
  const sDisp = Math.pow(sRaw, 0.6); // non-linear lift near top
  const score = Math.round(100 * sDisp);

  const jointErr: Record<string, number> = {};
  rows.forEach(([k, , n]) => (jointErr[k] = n));
  const coverage = expected ? visibleCount / expected : 0;
  return { score, rows, jointErr, coverage, expected, visibleCount } as any;
}

// ======================= MAIN COMPONENT =======================
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
  // Per-exercise stable scores and session completion
  const [perExerciseScores, setPerExerciseScores] = useState<(number | null)[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  // Buffer of frame-by-frame scores for the current step (high-coverage only)
  const scoreBufferRef = useRef<number[]>([]);
  const lastCoverageRef = useRef<number>(0);
  const [feedback, setFeedback] = useState(
    "Position yourself in the camera view"
  );
  const { workout, ensureCamera, cameraStatus } = useWorkout();
  const [loadingSet, setLoadingSet] = useState<Set<number>>(new Set());
  const [failedSet, setFailedSet] = useState<Set<number>>(new Set());
  // Simple per-step countdown
  const [stepDurationSec, setStepDurationSec] = useState<number>(30);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(30);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const timerIdRef = useRef<number | null>(null);

  // Per-joint smoother
  const { push: smoothAngle, reset: resetSmoother } = useAngleSmoother(7);

  // Cache of normalized template shape & embedding (if landmarks provided)
  const tplShapeRef = useRef<{
    poseId?: string;
    normTpl?: Record<string, { x: number; y: number }>;
    embTpl?: number[];
  }>({});

  // Score EMA to reduce jitter in display
  const scoreEmaRef = useRef<number | null>(null);
  const stopCameraRef = useRef<null | (() => void)>(null);

  // Keep the latest template available to the pose callback without
  // reinitializing the camera/pose pipeline on every change.
  const currentTemplateRef = useRef<any>(null);

  const currentTemplate = useMemo(
    () => sessionData?.templates?.[currentStep],
    [sessionData, currentStep]
  );

  // Initialize/reset per-exercise scores array when session templates change
  useEffect(() => {
    const len = sessionData?.templates?.length || workout?.exercises?.length || 0;
    if (len > 0) {
      setPerExerciseScores((prev) => {
        if (prev.length === len) return prev;
        return new Array(len).fill(null);
      });
    }
  }, [sessionData?.templates?.length, workout?.exercises?.length]);

  // Helper to robustly aggregate frame scores into a single stable score
  const aggregateScore = (frames: number[]): number | null => {
    if (!frames || frames.length === 0) return null;
    const vals = [...frames].sort((a, b) => a - b);
    const start = Math.floor(vals.length * 0.7); // top 30%
    const top = vals.slice(start);
    if (top.length === 0) return Math.round(vals[Math.floor(vals.length / 2)]);
    const med = top[Math.floor((top.length - 1) / 2)];
    return Math.round(med);
  };

  // Advance to next exercise, persisting a stable score for the current step
  const goNext = () => {
    // Pause timer while transitioning
    setIsTimerRunning(false);
    // Save current step score
    const stable = aggregateScore(scoreBufferRef.current);
    setPerExerciseScores((prev) => {
      const next = [...prev];
      if (currentStep < next.length) next[currentStep] = stable;
      return next;
    });
    // Clear buffer for next step
    scoreBufferRef.current = [];
    scoreEmaRef.current = null;
    setScore(null);
    resetSmoother();

    const total = sessionData?.templates?.length || workout?.exercises?.length || 0;
    const nextStep = currentStep + 1;
    if (nextStep < total) {
      setCurrentStep(nextStep);
    } else {
      // End of session
      setSessionComplete(true);
      // stop camera pipeline
      try { stopCameraRef.current?.(); } catch {}
    }
  };

  // Parse exercise duration like "45 sec", "1 min", "00:30", etc.
  const parseDurationToSeconds = (s?: string | null): number => {
    if (!s) return 30;
    const str = String(s).trim().toLowerCase();
    const parts = str.split(":");
    if (parts.length === 2 || parts.length === 3) {
      const nums = parts.map((t) => parseInt(t, 10));
      if (nums.every((n) => !isNaN(n))) {
        const [h, m, sec] = parts.length === 3 ? nums : [0, nums[0], nums[1]];
        return Math.max(10, h * 3600 + m * 60 + sec);
      }
    }
    const m = str.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/);
    if (m) {
      const val = parseFloat(m[1]);
      const unit = m[2];
      if (/h/.test(unit)) return Math.max(10, Math.round(val * 3600));
      if (/m/.test(unit) && !/ms/.test(unit)) return Math.max(10, Math.round(val * 60));
      return Math.max(10, Math.round(val));
    }
    const num = parseInt(str, 10);
    if (!isNaN(num)) return Math.max(10, num);
    return 30;
  };

  // Prefer workout context; fallback to location.state templates if present
  useEffect(() => {
    if (workout?.exercises?.length) {
      setSessionData({
        type: "workout",
        templates: new Array(workout.exercises.length).fill(null),
      });
      setCurrentStep(0);
      return;
    }
    if (location.state?.templates) {
      setSessionData(location.state);
      setCurrentStep(0);
    }
  }, [workout, location.state]);

  // Initialize timer on step change
  useEffect(() => {
    const secs = parseDurationToSeconds(workout?.exercises?.[currentStep]?.duration);
    setStepDurationSec(secs);
    setTimeLeftSec(secs);
    setIsTimerRunning(true);
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, [currentStep, workout?.exercises]);

  // Tick timer
  useEffect(() => {
    if (!isTimerRunning || sessionComplete) return;
    if (timerIdRef.current) clearInterval(timerIdRef.current);
    timerIdRef.current = window.setInterval(() => {
      setTimeLeftSec((t) => {
        if (t <= 1) {
          if (timerIdRef.current) {
            clearInterval(timerIdRef.current);
            timerIdRef.current = null;
          }
          setTimeout(() => goNext(), 0);
          return 0;
        }
        return t - 1;
      });
    }, 1000) as unknown as number;
    return () => {
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [isTimerRunning, sessionComplete]);

  // Fetch pose templates and overlay images per exercise via backend
  useEffect(() => {
    const fetchForIndex = async (idx: number) => {
      if (!workout?.exercises?.[idx]) return;
      const name = workout.exercises[idx].name;
      try {
        setLoadingSet((prev) => {
          const next = new Set(prev);
          next.add(idx);
          return next;
        });
        // A) search for pose by exercise name
        const searchResp = await api.get("/poses/search", {
          params: { name },
        });
        const matches: Array<{ pose_id: string; score?: number }> =
          searchResp?.data || [];
        if (!matches.length) {
          toast({
            title: "No pose found",
            description: `No template matched "${name}"`,
          });
          setFailedSet((prev) => {
            const next = new Set(prev);
            next.add(idx);
            return next;
          });
          if (idx === currentStep && sessionData?.templates?.length) {
            setCurrentStep((p) =>
              p + 1 < sessionData.templates.length ? p + 1 : 0
            );
            // Mark score as null for skipped step
            setPerExerciseScores((prev) => {
              const next = [...prev];
              if (idx < next.length) next[idx] = null;
              return next;
            });
          }
          return;
        }
        const best = matches[0];

        // B) fetch mediapipe-correct pose data
        const tplResp = await api.get(
          `/poses/${encodeURIComponent(best.pose_id)}`
        );
        const tplData = tplResp?.data || {};
        tplData.pose_id = tplData.pose_id || best.pose_id;

        // C) fetch overlay image (optional)
        let overlayUrl: string | undefined;
        try {
          const overlayResp = await api.get(
            `/poses/${encodeURIComponent(best.pose_id)}/overlay`,
            { responseType: "blob" }
          );
          const blob = overlayResp?.data as Blob;
          if (blob && blob.size > 0) overlayUrl = URL.createObjectURL(blob);
        } catch {}

        setSessionData((prev: any) => {
          if (!prev?.templates) return prev;
          const next = [...prev.templates];
          next[idx] = { ...tplData, overlayUrl, searchScore: best.score };
          return { ...prev, templates: next };
        });
      } catch (err) {
        console.error("Pose fetch failed for", name, err);
        toast({
          title: "Pose fetch failed",
          description: `Could not load template for "${name}"`,
          variant: "destructive",
        } as any);
      } finally {
        setLoadingSet((prev) => {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
      }
    };

    if (workout?.exercises?.length && sessionData?.templates?.length) {
      workout.exercises.forEach((_, idx) => {
        if (!sessionData.templates[idx] && !failedSet.has(idx))
          fetchForIndex(idx);
      });
    }
  }, [workout, sessionData?.templates?.length, failedSet, currentStep]);

  // Auto-advance every 10s (loop)
  useEffect(() => {
    if (!sessionData?.templates?.length) return;
    const id = setInterval(() => {
      setCurrentStep((p) => (p + 1 < sessionData.templates.length ? p + 1 : 0));
      resetSmoother();
    }, 10000);
    return () => clearInterval(id);
  }, [sessionData, resetSmoother]);

  // Keep the template canvas' pixel size synced to its CSS box for crisp lines
  useEffect(() => {
    const c = templateCanvasRef.current;
    if (!c) return;
    const syncSize = () => {
      const rect = c.getBoundingClientRect();
      const W = Math.max(1, Math.floor(rect.width));
      const H = Math.max(1, Math.floor(rect.height));
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // Prepare & draw template preview; cache template shape/embedding if landmarks exist
  useEffect(() => {
    const canvas = templateCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tplShapeRef.current = {}; // reset cache unless set below

    const t = currentTemplate;
    // Draw overlay if available
    if (t?.overlayUrl) {
      const img = new Image();
      img.onload = () => {
        const cw = canvas.width,
          ch = canvas.height;
        const iw = img.width,
          ih = img.height;
        const scale = Math.min(cw / iw, ch / ih);
        const dw = Math.max(1, Math.floor(iw * scale));
        const dh = Math.max(1, Math.floor(ih * scale));
        const dx = Math.floor((cw - dw) / 2);
        const dy = Math.floor((ch - dh) / 2);
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, dx, dy, dw, dh);
      };
      img.src = t.overlayUrl;
    }

    // If landmarks exist, cache normalized template for scoring
    if (t?.landmarks) {
      const lmArr = coerceTemplateLandmarks(t.landmarks);
      if (lmArr) {
        const norm = normalizeXY(lmArr as any);
        if (norm) {
          tplShapeRef.current = {
            poseId: t.pose_id,
            normTpl: norm,
            embTpl: embedPose(norm),
          };
        }
      }
    }
  }, [currentTemplate]);

  // Sync the ref whenever the current template changes
  useEffect(() => {
    currentTemplateRef.current = currentTemplate ?? null;
  }, [currentTemplate]);

  // Webcam + Pose Detection (initialize once)
  useEffect(() => {
    const video = videoRef.current;
    const canvas = liveCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d")!;
    let camera: MediaPipeCamera | null = null;
    let pose: Pose | null = null;
    let ro: ResizeObserver | null = null;

    // Ensure camera permission before starting pipeline
    let cancelled = false;
    const start = async () => {
      const ok = await ensureCamera();
      if (!ok || cancelled) return;

      // Resize canvas to element size for crisp drawing
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.floor(rect.width);
        canvas.height = Math.floor(rect.height);
      };
      resize();
      ro = new ResizeObserver(resize);
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
        // Disable selfie mode to avoid mirrored processing
        selfieMode: false,
      });

      pose.onResults((results: any) => {
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw video bg
        if (results.image) {
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        }

        if (sessionComplete) {
          ctx.restore();
          return;
        }

        const lm: Pt[] | undefined = results.poseLandmarks;
        const tpl = currentTemplateRef.current;
        if (!lm || !tpl) {
          ctx.restore();
          return;
        }

      // Visibility array
      const visibility: number[] = Array(33).fill(1);
      for (let i = 0; i < lm.length; i++) {
        visibility[i] = lm[i]?.visibility ?? 1;
      }

      // Normalize → angles → smoothing
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

      // --- Angle score
      const {
        score: sAngle,
        rows,
        jointErr,
        coverage = 0,
        expected = 0,
        visibleCount = 0,
      } = scoreAgainstTemplate(angles, tpl, visibility) as any;
      lastCoverageRef.current = coverage;

      // --- Optional hybrid scores if template landmarks available
      let sBone = 0,
        sEmbed = 0;
      const tplShape = tplShapeRef.current;
      if (tpl && tplShape.poseId === tpl.pose_id && tplShape.normTpl) {
        sBone = boneCosineScore(norm, tplShape.normTpl, visibility);
        const embUser = embedPose(norm);
        if (tplShape.embTpl && embUser.length) {
          sEmbed = similarityEmbed(embUser, tplShape.embTpl);
        }
      }

      // Blend (angles dominate). If angle score missing, fall back to others.
      let finalScore: number | null = null;
      if (sAngle != null) {
        finalScore = Math.round(0.6 * sAngle + 0.25 * sBone + 0.15 * sEmbed);
      } else if (sBone || sEmbed) {
        finalScore = Math.round(0.65 * sBone + 0.35 * sEmbed);
      }

      // Penalize low coverage (discourages hiding limbs)
      if (finalScore != null) {
        const cov = Math.max(0, Math.min(1, coverage));
        // 0 at 0.75 coverage, 1 at 1.0 coverage (linear ramp)
        const covFactor = Math.max(0, Math.min(1, (cov - 0.75) / 0.25));
        finalScore = Math.round(finalScore * covFactor);
      }

      // EMA smoothing for display
      if (finalScore != null) {
        const prev = scoreEmaRef.current;
        const alpha = 0.25;
        const ema = prev == null ? finalScore : Math.round(alpha * finalScore + (1 - alpha) * prev);
        scoreEmaRef.current = ema;
        setScore(ema);
        // Capture only high-coverage frames for stable aggregation
        if (coverage >= 0.85) {
          const buf = scoreBufferRef.current;
          buf.push(ema);
          if (buf.length > 600) buf.splice(0, buf.length - 600); // ~20s at 30fps
        }
      } else {
        scoreEmaRef.current = null;
        setScore(null);
      }

      // Feedback and prompts
      const missing = missingLimbGroups(visibility, 0.5);
      if (coverage < 0.6 || missing.length >= 2) {
        setFeedback(
          `Move back and show your full body. Missing: ${missing.join(", ")}`
        );
      } else if (rows.length) {
        const sorted = [...rows].sort((a, b) => b[2] - a[2]); // [joint, diff, norm, tol, w]
        const top = sorted.filter((r) => r[2] >= 0.6).slice(0, 2);
        if (!top.length) {
          setFeedback("Nice! Hold steady…");
        } else {
          const tips = top.map(([joint, diff]) => {
            const ref = (tpl.angles_deg || {})[joint] as number | undefined;
            const val = angles[joint];
            const delta = ref != null && val != null ? Math.round(ref - val) : Math.round(diff);
            const mag = Math.abs(delta);
            const dir = delta > 0 ? "increase" : "decrease";
            // Friendly verbs for common joints
            const verb = /elbow|knee/.test(joint)
              ? delta > 0
                ? "straighten"
                : "bend"
              : /spine/.test(joint)
              ? delta > 0
                ? "stand more upright"
                : "lean slightly"
              : dir;
            const name = joint.replace(/_/g, " ");
            return `${verb} ${name} ~${mag}°`;
          });
          setFeedback(tips.join(" • "));
        }
      } else {
        setFeedback("Find the camera and stand tall. 🙂");
      }

      // Draw skeleton color-coded by ANGLE error (intuitive)
      drawSkeletonColored(ctx, lm, POSE_CONNECTIONS as any, jointErr);

      // Draw callouts for the top issues near the relevant joints
      let issueCallouts: Array<{ joint: string; text: string }> = [];
      if (rows.length) {
        const sorted = [...rows].sort((a, b) => b[2] - a[2]);
        const top = sorted.filter((r) => r[2] >= 0.6).slice(0, 2);
        issueCallouts = top.map(([joint, diff]) => {
          const ref = (tpl.angles_deg || {})[joint] as number | undefined;
          const val = angles[joint];
          const delta = ref != null && val != null ? Math.round(ref - val) : Math.round(diff);
          const mag = Math.abs(delta);
          const dir = delta > 0 ? "↑" : "↓";
          const nice = joint.replace(/_/g, " ");
          // Short label e.g., "bend left elbow 12°"
          const verb = /elbow|knee/.test(joint)
            ? delta > 0
              ? "straighten"
              : "bend"
            : /spine/.test(joint)
            ? delta > 0
              ? "upright"
              : "lean"
            : delta > 0
            ? "increase"
            : "decrease";
          const text = `${verb} ${nice} ${mag}° ${dir}`;
          return { joint, text };
        });
      }
      drawIssueCallouts(ctx, lm, issueCallouts);

      // If limbs missing, draw a gentle overlay prompt
      if (coverage < 0.8 || missing.length) {
        const pad = 12;
        const text = `Move back to show full body${missing.length ? ` • Missing: ${missing.join(", ")}` : ""}`;
        ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto";
        const metrics = ctx.measureText(text);
        const tw = Math.ceil(metrics.width) + pad * 2;
        const th = 34;
        const x = Math.max(8, Math.floor((ctx.canvas.width - tw) / 2));
        const y = 10;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x, y, tw, th);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
        ctx.fillStyle = "#fff";
        ctx.fillText(text, x + pad, y + th - 12);
      }

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

    stopCameraRef.current = () => {
      try { camera?.stop(); } catch {}
      try { (pose as any)?.close?.(); } catch {}
      try { ro?.disconnect(); } catch {}
    };

    toast({ title: "Webcam activated", description: "Pose detection started" });

    return () => {
      cancelled = true;
      try {
        camera?.stop();
      } catch {}
      try {
        (pose as any)?.close?.();
      } catch {}
      ro?.disconnect();
    };
    };

    if (!sessionComplete) start();
    return () => {
      // ensure cleanup if effect re-runs
      try { camera?.stop(); } catch {}
      try { (pose as any)?.close?.(); } catch {}
      ro?.disconnect();
    };
  }, [ensureCamera, sessionComplete]);

  // If session completed, clear live feedback text and score buffer
  useEffect(() => {
    if (sessionComplete) {
      setFeedback("Session complete. Great job!");
      scoreBufferRef.current = [];
    }
  }, [sessionComplete]);

  const totalSteps = sessionData?.templates?.length || workout?.exercises?.length || 0;
  const isLast = currentStep + 1 >= totalSteps;

  // Reset per-step buffers when the step changes (covers auto-advance cases)
  useEffect(() => {
    scoreBufferRef.current = [];
    scoreEmaRef.current = null;
    setScore(null);
    resetSmoother();
  }, [currentStep, resetSmoother]);

  // Final report screen
  if (sessionComplete) {
    const items = workout?.exercises || [];
    const avg = (() => {
      const vals = perExerciseScores.filter((v): v is number => typeof v === "number");
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    })();
    return (
      <div className="min-h-screen bg-gradient-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Session Report</h1>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>Home</Button>
              <Button onClick={() => navigate("/preset")}>New Preset Workout</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  // Reset state and restart session
                  const len = sessionData?.templates?.length || workout?.exercises?.length || 0;
                  setPerExerciseScores(len ? new Array(len).fill(null) : []);
                  scoreBufferRef.current = [];
                  scoreEmaRef.current = null;
                  setScore(null);
                  resetSmoother();
                  setFeedback("Position yourself in the camera view");
                  setCurrentStep(0);
                  setSessionComplete(false);
                  // Reset and start timer for first step
                  const secs = parseDurationToSeconds(workout?.exercises?.[0]?.duration);
                  setStepDurationSec(secs);
                  setTimeLeftSec(secs);
                  setIsTimerRunning(true);
                }}
              >
                Restart Session
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Overview {avg != null ? `(Avg ${avg}%)` : ""}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {(items.length ? items : new Array(perExerciseScores.length).fill(null)).map((ex, i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <div className="text-sm">
                      <div className="font-medium">{ex?.name || `Exercise ${i + 1}`}</div>
                      {ex?.description ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">{ex.description}</div>
                      ) : null}
                    </div>
                    <div className="text-lg font-semibold">
                      {perExerciseScores[i] != null ? `${perExerciseScores[i]}%` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
            {currentTemplate?.pose_id || workout?.workoutName || "Workout Session"}
          </h1>
        </div>

        {/* Rehab reasoning banner if provided */}
        {workout?.reasoning ? (
          <RehabReasoningBanner reasoning={workout.reasoning} />
        ) : null}

        {/* 2 columns */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Left: Template skeleton (if preview provided) */}
          <Card>
            <CardHeader>
              <CardTitle>
                Template Pose ({(currentStep + 1).toString()}/
                {sessionData?.templates?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="relative">
                  <canvas
                    ref={templateCanvasRef}
                    className="w-full h-auto bg-gray-100 rounded"
                  />
                  {loadingSet.has(currentStep) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {/* Exercise info when a template is loaded */}
                {currentTemplate ? (
                  <div className="text-sm space-y-1">
                    <div className="font-semibold">
                      {workout?.exercises?.[currentStep]?.name ||
                        currentTemplate?.pose_id}
                    </div>
                    <div className="text-muted-foreground">
                      {[
                        workout?.exercises?.[currentStep]?.difficulty,
                        workout?.exercises?.[currentStep]?.duration,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                    {workout?.exercises?.[currentStep]?.description && (
                      <p className="text-muted-foreground/90">
                        {workout.exercises[currentStep].description}
                      </p>
                    )}
                    {Array.isArray(
                      workout?.exercises?.[currentStep]?.modifications
                    ) &&
                      (workout?.exercises?.[currentStep]?.modifications
                        ?.length ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Modifications:{" "}
                          {workout?.exercises?.[
                            currentStep
                          ]?.modifications?.join(", ")}
                        </p>
                      )}
                  </div>
                ) : failedSet.has(currentStep) ? (
                  <p className="text-sm text-muted-foreground">
                    No template found for "
                    {workout?.exercises?.[currentStep]?.name}". Skipping…
                  </p>
                ) : null}
              </div>
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
                {/* Controls overlay */}
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <Button variant="outline" onClick={() => setIsTimerRunning((r) => !r)}>
                    {isTimerRunning ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="secondary" onClick={goNext}>
                    {isLast ? "Finish" : "Next"}
                  </Button>
                </div>
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
                Angles (gated, smoothed) + Bones + Embedding
              </p>
              <p className="text-xs mt-1 opacity-70">
                Step {currentStep + 1} of {totalSteps}
              </p>
              {/* Countdown */}
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="text-2xl font-semibold tabular-nums">
                  {String(Math.floor(timeLeftSec / 60)).padStart(2, "0")}:
                  {String(timeLeftSec % 60).padStart(2, "0")}
                </div>
                <Progress
                  value={Math.max(
                    0,
                    Math.min(100, ((stepDurationSec - timeLeftSec) / Math.max(1, stepDurationSec)) * 100)
                  )}
                  className="w-full"
                />
              </div>
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
