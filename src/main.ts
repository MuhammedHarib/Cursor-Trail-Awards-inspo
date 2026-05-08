import * as THREE from "three";
import { FluidSimulation } from "./FluidSimulation";
import "./style.css";

const canvas = document.getElementById("fluid") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Canvas element #fluid not found");
}

new FluidSimulation(canvas, {
  simResolution: 256,
  dyeResolution: 1024,
  curl: 25,
  pressureIterations: 50,
  velocityDissipation: 0.95,
  dyeDissipation: 0.95,
  splatRadius: 0.275,
  forceStrength: 7.5,
  pressureDecay: 0.75,
  threshold: 1.0,
  edgeSoftness: 0.0,
  inkColor: new THREE.Color(1, 1, 1), // Use THREE.Color object directly
});