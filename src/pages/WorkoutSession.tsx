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

// ---------- Template preview projection helpers ----------
type XY = { x: number; y: number };

function detectCanonicalSpace(points: XY[]): "canonical" | "image01" {
  // If any coord is outside [ -0.05, 1.05 ], assume canonical (e.g., -1..+1)
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (!p) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const within01 =
    minX >= -0.05 && maxX <= 1.05 && minY >= -0.05 && maxY <= 1.05;
  return within01 ? "image01" : "canonical";
}

/**
 * Project a set of points to canvas space.
 * - canonical: arbitrary units around (0,0) → fit bbox into canvas with margin
 * - image01: [0..1] → simple scale to canvas
 * Optional horizontal mirror for selfie parity.
 */
function projectToCanvas(
  pts: XY[],
  canvas: HTMLCanvasElement,
  opts?: { mirror?: boolean; marginFrac?: number }
): XY[] {
  const W = canvas.width,
    H = canvas.height;
  const mirror = !!opts?.mirror;
  const marginFrac = opts?.marginFrac ?? 0.08; // 8% padding

  const mode = detectCanonicalSpace(pts);

  if (mode === "image01") {
    // straightforward: [0..1] → pixels
    return pts.map((p) => {
      if (!p) return p as any;
      const x01 = mirror ? 1 - p.x : p.x;
      return { x: x01 * W, y: p.y * H };
    });
  }

  // canonical fit: compute bbox → scale to fit with margins, keep aspect
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (!p) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bw = maxX - minX || 1e-6;
  const bh = maxY - minY || 1e-6;

  const padX = W * marginFrac;
  const padY = H * marginFrac;
  const availW = Math.max(1, W - 2 * padX);
  const availH = Math.max(1, H - 2 * padY);
  const s = Math.min(availW / bw, availH / bh);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const outCenter = { x: W / 2, y: H / 2 };
  return pts.map((p) => {
    if (!p) return p as any;
    const sx = (p.x - cx) * s;
    const sy = (p.y - cy) * s;
    const dx = mirror ? -sx : sx;
    return { x: outCenter.x + dx, y: outCenter.y + sy };
  });
}

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
    num += n * w;
    den += w;
  });

  const mae = den ? num / den : 1;
  const sRaw = Math.max(0, 1 - mae);
  const sDisp = Math.pow(sRaw, 0.6); // non-linear lift near top
  const score = Math.round(100 * sDisp);

  const jointErr: Record<string, number> = {};
  rows.forEach(([k, , n]) => (jointErr[k] = n));
  return { score, rows, jointErr };
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
  const [feedback, setFeedback] = useState(
    "Position yourself in the camera view"
  );

  // Per-joint smoother
  const { push: smoothAngle, reset: resetSmoother } = useAngleSmoother(7);

  // Cache of normalized template shape & embedding (if landmarks provided)
  const tplShapeRef = useRef<{
    poseId?: string;
    normTpl?: Record<string, { x: number; y: number }>;
    embTpl?: number[];
  }>({});

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
    if (!t?.landmarks) return;

    const lmArr = coerceTemplateLandmarks(t.landmarks);
    if (!lmArr) return;

    // Cache normalized template for hybrid scoring (uses canonical normalizeXY)
    const norm = normalizeXY(lmArr as any);
    if (norm) {
      tplShapeRef.current = {
        poseId: t.pose_id,
        normTpl: norm,
        embTpl: embedPose(norm),
      };
    }

    // --- PREVIEW RENDERING with projection ---
    const MIRROR_PREVIEW = true;

    // Build compact set of points used by POSE_CONNECTIONS
    const usedIdx = new Set<number>();
    (POSE_CONNECTIONS as any as Array<[number, number]>).forEach(([i, j]) => {
      usedIdx.add(i);
      usedIdx.add(j);
    });
    const pts: XY[] = [];
    usedIdx.forEach((i) => {
      const p = lmArr[i];
      if (p) pts[i] = { x: p.x, y: p.y };
    });

    // Project to canvas space (auto-detect canonical vs [0..1])
    const proj = projectToCanvas(pts, canvas, {
      mirror: MIRROR_PREVIEW,
      marginFrac: 0.1,
    });

    // Dynamic stroke based on canvas size
    const stroke = Math.max(2, Math.round(canvas.width * 0.008));

    // Lines
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = stroke;
    ctx.beginPath();
    (POSE_CONNECTIONS as any as Array<[number, number]>).forEach(([i, j]) => {
      const a = proj[i],
        b = proj[j];
      if (!a || !b) return;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    });
    ctx.stroke();

    // Points
    ctx.fillStyle = "#9ca3af";
    const r = Math.max(2, Math.round(stroke * 0.5));
    proj.forEach((p) => {
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
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
      } = scoreAgainstTemplate(angles, currentTemplate, visibility);

      // --- Optional hybrid scores if template landmarks available
      let sBone = 0,
        sEmbed = 0;
      const tplShape = tplShapeRef.current;
      if (tplShape.poseId === currentTemplate.pose_id && tplShape.normTpl) {
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
      setScore(finalScore);

      // Feedback (simple, driven by angles)
      if (rows.length) {
        const worst = [...rows].sort((a, b) => b[2] - a[2])[0]; // [joint, diff, norm, tol, w]
        const [joint, diff, normErr, tol] = worst;
        setFeedback(
          normErr <= 1
            ? "Nice! Hold steady…"
            : `Adjust ${joint.replace("_", " ")} ~${Math.round(
                diff
              )}° (within ${Math.round(tol)}°)`
        );
      } else {
        setFeedback("Find the camera and stand tall. 🙂");
      }

      // Draw skeleton color-coded by ANGLE error (intuitive)
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
          {/* Left: Template skeleton (if preview provided) */}
          <Card>
            <CardHeader>
              <CardTitle>
                Template Pose ({(currentStep + 1).toString()}/
                {sessionData?.templates?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <canvas
                ref={templateCanvasRef}
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
                Angles (gated, smoothed) + Bones + Embedding
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
