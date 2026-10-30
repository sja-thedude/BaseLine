// On-device face detection (MediaPipe BlazeFace). Runs in the browser, so screening
// photos costs no API units and no photo leaves the device to be screened.
import type { FaceDetector } from "@mediapipe/tasks-vision";
import type { Box } from "./image";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export interface Face {
  box: Box;
  confidence: number;
  /** Nose offset from the eye midpoint, in eye-distances. ~0 is facing the camera. */
  yaw: number;
  /** Tilt of the eye line in degrees. */
  roll: number;
}

let detector: Promise<FaceDetector | null> | null = null;

export function loadDetector() {
  detector ??= (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM);
      return await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    } catch {
      return null;
    }
  })();
  return detector;
}

export async function detectFaces(img: ImageBitmap): Promise<Face[] | null> {
  const d = await loadDetector();
  if (!d) return null;
  const { detections } = d.detect(img);
  return detections
    .map((det) => {
      const b = det.boundingBox!;
      const [re, le, nose] = det.keypoints;
      const eyeDx = (le.x - re.x) * img.width;
      const eyeDy = (le.y - re.y) * img.height;
      const eyeDist = Math.hypot(eyeDx, eyeDy) || 1;
      const midX = ((re.x + le.x) / 2) * img.width;
      return {
        box: { x: b.originX, y: b.originY, w: b.width, h: b.height },
        confidence: det.categories[0]?.score ?? 0,
        yaw: (nose.x * img.width - midX) / eyeDist,
        roll: (Math.atan2(eyeDy, eyeDx) * 180) / Math.PI,
      };
    })
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
}
