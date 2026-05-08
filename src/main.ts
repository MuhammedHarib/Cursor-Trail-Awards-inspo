import * as THREE from "three";
import { FluidSimulation } from "./FluidSimulation";
import "./style.css";

const canvas = document.getElementById("fluid") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Canvas element #fluid not found");
}

new FluidSimulation(canvas, {
  simResolution: 128,       // was 256 — smaller sim = tighter, faster fluid
  dyeResolution: 512,       // was 1024 — less spread
  curl: 30,                 // was 25 — more tight swirling
  pressureIterations: 10,   // was 50 — less pressure spread
  splatRadius: 0.001,        // was 0.275 — THIS is the main fix, much smaller splat
  forceStrength: 5,         // was 7.5 — less explosive on fast moves
  velocityDissipation: 0.92, // was 0.95 — fades faster so trail doesn't linger too long
  dyeDissipation: 0.90,     // was 0.95 — ink fades faster
  pressureDecay: 0.75,
  threshold: 0.05,          // was 1.0 from before
  edgeSoftness: 0.3,        // soft edges on the trail
  inkColor: new THREE.Color(1, 1, 1),
});















// new FluidSimulation(canvas, {
//   simResolution: 128,        // Kept at your working value
//   dyeResolution: 512,        // Kept at your working value
//   curl: 10,                  // FIXED: Lowered from 30 to 10 to stop the "shaking"
//   pressureIterations: 30,    // FIXED: Increased from 10 to 30 to smooth the flow
//   splatRadius: 0.001,         // FIXED: Large enough to definitely see
//   forceStrength: 6.0,        // FIXED: Enough "punch" to move the ink
//   velocityDissipation: 0.95, // Standard smooth fade
//   dyeDissipation: 0.92,      // Standard ink fade
//   pressureDecay: 0.75,
//   threshold: 0.001,          // Lowered to ensure every tiny move shows up
//   edgeSoftness: 0.0,         // Crisp ink look
//   inkColor: new THREE.Color(1, 1, 1), 
// });