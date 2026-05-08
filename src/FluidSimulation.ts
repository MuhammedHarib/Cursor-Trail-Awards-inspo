import * as THREE from "three";
import shaders from "./shaders";

export interface FluidConfig {
  simResolution: number;
  dyeResolution: number;
  curl: number;
  pressureIterations: number;
  splatRadius: number;
  forceStrength: number;
  velocityDissipation: number;
  dyeDissipation: number;
  pressureDecay: number;
  threshold: number;
  edgeSoftness: number;
  inkColor: THREE.Color;
}

interface DoubleTarget {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  swap(): void;
}

interface MouseState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  moved: boolean;
}

export class FluidSimulation {
  private config: FluidConfig;
  private renderer: THREE.WebGLRenderer;
  private dpr: number;
  private width: number;
  private height: number;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private simSize: { w: number; h: number };
  private dyeSize: { w: number; h: number };
  private velocity: DoubleTarget;
  private dye: DoubleTarget;
  private divergence: THREE.WebGLRenderTarget;
  private curl: THREE.WebGLRenderTarget;
  private pressure: DoubleTarget;
  private material: Record<string, THREE.ShaderMaterial>;
  private mouse: MouseState;

  constructor(canvas: HTMLCanvasElement, config: FluidConfig) {
    this.config = config;
    this._setupRenderer(canvas);
    this._setupScene();
    this._setupTargets();
    this._setupMaterials();
    this._setupInput();
    this._loop();
  }

  private _setupRenderer(canvas: HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x000000, 0); // transparent background
    // autoClear stays TRUE (default) so screen is wiped each frame
    this.dpr = this.renderer.getPixelRatio();
    this.width = innerWidth * this.dpr;
    this.height = innerHeight * this.dpr;
    window.addEventListener("resize", () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.width = innerWidth * this.dpr;
      this.height = innerHeight * this.dpr;
    });
  }

  private _setupScene(): void {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);
  }

  private _setupTargets(): void {
    const { simResolution: simRes, dyeResolution: dyeRes } = this.config;
    const aspect = this.width / this.height;
    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    };

    const single = (w: number, h: number) =>
      new THREE.WebGLRenderTarget(w, h, options);

    const double = (w: number, h: number): DoubleTarget => ({
      read: single(w, h),
      write: single(w, h),
      swap() {
        [this.read, this.write] = [this.write, this.read];
      },
    });

    this.simSize = { w: simRes, h: Math.round(simRes / aspect) };
    this.dyeSize = { w: dyeRes, h: Math.round(dyeRes / aspect) };

    this.velocity = double(this.simSize.w, this.simSize.h);
    this.dye = double(this.dyeSize.w, this.dyeSize.h);
    this.divergence = single(this.simSize.w, this.simSize.h);
    this.curl = single(this.simSize.w, this.simSize.h);
    this.pressure = double(this.simSize.w, this.simSize.h);
  }

  private _setupMaterials(): void {
    const make = (
      [vert, frag]: [string, string],
      uniforms: Record<string, THREE.IUniform>,
      transparent = false
    ) =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms,
        transparent,
        depthTest: false,
        depthWrite: false,
      });

    const tex = (): THREE.IUniform => ({ value: null });
    const num = (v = 0): THREE.IUniform => ({ value: v });
    const vec2 = (): THREE.IUniform => ({ value: new THREE.Vector2() });

    this.material = {
      splat: make(shaders.splat, {
        uTarget: tex(),
        aspectRatio: num(),
        radius: num(),
        color: { value: new THREE.Vector3() },
        point: { value: new THREE.Vector2() },
      }),
      advection: make(shaders.advection, {
        uVelocity: tex(),
        uSource: tex(),
        texelSize: vec2(),
        dt: num(),
        dissipation: num(),
      }),
      divergence: make(shaders.divergence, {
        uVelocity: tex(),
        texelSize: vec2(),
      }),
      curl: make(shaders.curl, {
        uVelocity: tex(),
        texelSize: vec2(),
      }),
      vorticity: make(shaders.vorticity, {
        uVelocity: tex(),
        uCurl: tex(),
        texelSize: vec2(),
        curlStrength: num(),
        dt: num(),
      }),
      pressure: make(shaders.pressure, {
        uPressure: tex(),
        uDivergence: tex(),
        texelSize: vec2(),
      }),
      gradientSubtract: make(shaders.gradientSubtract, {
        uPressure: tex(),
        uVelocity: tex(),
        texelSize: vec2(),
      }),
      clear: make(shaders.clear, {
        uTexture: tex(),
        value: num(),
      }),
      // transparent: true is critical — this is the only pass that
      // renders to the screen and must not fill pixels it doesn't touch
      display: make(
        shaders.display,
        {
          uTexture: tex(),
          threshold: num(),
          edgeSoftness: num(),
          inkColor: { value: new THREE.Color() },
        },
        true // <-- transparent
      ),
    };
  }

  private _setupInput(): void {
    this.mouse = { x: 0, y: 0, velocityX: 0, velocityY: 0, moved: false };

    const onMove = (x: number, y: number) => {
      this.mouse.velocityX =
        (x * this.dpr - this.mouse.x) * this.config.forceStrength;
      this.mouse.velocityY =
        (y * this.dpr - this.mouse.y) * this.config.forceStrength;
      this.mouse.x = x * this.dpr;
      this.mouse.y = y * this.dpr;
      this.mouse.moved = true;
    };

    window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    window.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: false }
    );
  }

  // All simulation passes render to offscreen targets — no clear needed
  private _passOffscreen(
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget
  ): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  // Final display pass renders to screen — renderer.autoClear handles the wipe
  private _passScreen(material: THREE.ShaderMaterial): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  private _loop(): void {
    const dt = 0.016;
    const { curl: curlStrength } = this.config;

    if (this.mouse.moved) {
      this.mouse.moved = false;
      const { x, y, velocityX, velocityY } = this.mouse;
      const color = new THREE.Vector3(velocityX, velocityY, 0);
      this._splat(x, y, color, this.velocity);
      this._splat(
        x,
        y,
        new THREE.Vector3(Math.abs(velocityX), Math.abs(velocityY), 0.5),
        this.dye
      );
    }

    this._advect(this.velocity, this.velocity, this.config.velocityDissipation, dt);
    this._advect(this.velocity, this.dye, this.config.dyeDissipation, dt);

    this._passCurl(this.velocity.read.texture);
    this._passVorticity(this.velocity, this.curl.texture, curlStrength, dt);

    this._passDivergence(this.velocity.read.texture);

    this._passClear(this.pressure, this.config.pressureDecay);
    for (let i = 0; i < this.config.pressureIterations; i++) {
      this._passPressure(this.pressure, this.divergence.texture);
    }

    this._passGradientSubtract(this.pressure.read.texture, this.velocity);

    this._renderDisplay();

    requestAnimationFrame(() => this._loop());
  }

  private _splat(
    x: number,
    y: number,
    color: THREE.Vector3,
    target: DoubleTarget
  ): void {
    const m = this.material.splat;
    m.uniforms.uTarget.value = target.read.texture;
    m.uniforms.aspectRatio.value = this.width / this.height;
    m.uniforms.point.value.set(x / this.width, 1 - y / this.height);
    m.uniforms.color.value.copy(color);
    m.uniforms.radius.value = this.config.splatRadius;
    this._passOffscreen(m, target.write);
    target.swap();
  }

  private _advect(
    velocity: DoubleTarget,
    source: DoubleTarget,
    dissipation: number,
    dt: number
  ): void {
    const m = this.material.advection;
    m.uniforms.uVelocity.value = velocity.read.texture;
    m.uniforms.uSource.value = source.read.texture;
    m.uniforms.texelSize.value.set(1 / this.simSize.w, 1 / this.simSize.h);
    m.uniforms.dt.value = dt;
    m.uniforms.dissipation.value = dissipation;
    this._passOffscreen(m, source.write);
    source.swap();
  }

  private _passCurl(velocity: THREE.Texture): void {
    const m = this.material.curl;
    m.uniforms.uVelocity.value = velocity;
    m.uniforms.texelSize.value.set(1 / this.simSize.w, 1 / this.simSize.h);
    this._passOffscreen(m, this.curl);
  }

  private _passVorticity(
    velocity: DoubleTarget,
    curl: THREE.Texture,
    curlStrength: number,
    dt: number
  ): void {
    const m = this.material.vorticity;
    m.uniforms.uVelocity.value = velocity.read.texture;
    m.uniforms.uCurl.value = curl;
    m.uniforms.curlStrength.value = curlStrength;
    m.uniforms.dt.value = dt;
    m.uniforms.texelSize.value.set(1 / this.simSize.w, 1 / this.simSize.h);
    this._passOffscreen(m, velocity.write);
    velocity.swap();
  }

  private _passDivergence(velocity: THREE.Texture): void {
    const m = this.material.divergence;
    m.uniforms.uVelocity.value = velocity;
    m.uniforms.texelSize.value.set(1 / this.simSize.w, 1 / this.simSize.h);
    this._passOffscreen(m, this.divergence);
  }

  private _passClear(target: DoubleTarget, value: number): void {
    const m = this.material.clear;
    m.uniforms.uTexture.value = target.read.texture;
    m.uniforms.value.value = value;
    this._passOffscreen(m, target.write);
    target.swap();
  }

  private _passPressure(
    pressure: DoubleTarget,
    divergence: THREE.Texture
  ): void {
    const m = this.material.pressure;
    m.uniforms.uPressure.value = pressure.read.texture;
    m.uniforms.uDivergence.value = divergence;
    m.uniforms.texelSize.value.set(1 / this.simSize.w, 1 / this.simSize.h);
    this._passOffscreen(m, pressure.write);
    pressure.swap();
  }

  private _passGradientSubtract(
    pressure: THREE.Texture,
    velocity: DoubleTarget
  ): void {
    const m = this.material.gradientSubtract;
    m.uniforms.uPressure.value = pressure;
    m.uniforms.uVelocity.value = velocity.read.texture;
    m.uniforms.texelSize.value.set(1 / this.simSize.w, 1 / this.simSize.h);
    this._passOffscreen(m, velocity.write);
    velocity.swap();
  }

  private _renderDisplay(): void {
    const m = this.material.display;
    m.uniforms.uTexture.value = this.dye.read.texture;
    m.uniforms.threshold.value = this.config.threshold;
    m.uniforms.edgeSoftness.value = this.config.edgeSoftness;
    m.uniforms.inkColor.value.copy(this.config.inkColor);
    this._passScreen(m); // renders to screen with autoClear wiping first
  }
}