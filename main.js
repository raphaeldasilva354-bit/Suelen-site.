/* =====================================================================
   SM Designer — main.js
   Desenvolvido por Especialista Senior em JavaScript / WebGL
   - Sobrancelha 3D Dourada perfeitamente enquadrada e centralizada no mobile
   - Efeito de pó dourado cintilante que reage ao toque do dedo
   - Sem repetição de logo, tipografia limpa e padrão no canto
   - Comparadores Antes/Depois otimizados (sem 50%)
   ===================================================================== */
(() => {
  'use strict';

  /* ============ 1. Configuração de Negócio & Contato ============ */
  const WHATSAPP_NUMBER = '559784451251'; // 55 + DDD + número (Cristalina - GO)
  const DEFAULT_MESSAGE = 'Olá Suelen! Vim pelo site e gostaria de agendar meu horário.';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  const isMobile = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;

  /* Links inteligentes do WhatsApp com base no serviço selecionado */
  function configureWhatsAppLinks() {
    const serviceMessages = {
      'Design de sobrancelhas': 'Olá Suelen! Vim pelo site e gostaria de agendar um Design de Sobrancelhas.',
      'Design + henna': 'Olá Suelen! Vim pelo site e gostaria de agendar um Design com Henna.',
      'Brow lamination': 'Olá Suelen! Vim pelo site e gostaria de agendar uma Brow Lamination.',
      'Geral': DEFAULT_MESSAGE,
    };

    document.querySelectorAll('[data-wa]').forEach((anchor) => {
      const service = anchor.getAttribute('data-service') || 'Geral';
      const text = serviceMessages[service] || DEFAULT_MESSAGE;
      anchor.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';

      anchor.addEventListener('click', () => {
        if (navigator.vibrate) {
          try { navigator.vibrate(12); } catch (_) {}
        }
      });
    });
  }
  configureWhatsAppLinks();

  /* Fallback se GSAP não carregar */
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('js');
    console.info('SM Designer: Modo estático (sem GSAP).');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load',
  });

  /* ============ 2. Scroll Suave Híbrido (Lenis + GSAP) ============ */
  let lenisInstance = null;
  if (window.Lenis) {
    lenisInstance = new Lenis({
      lerp: isTouchDevice ? 1 : 0.09,
      smoothWheel: !reduceMotion,
      smoothTouch: false,
      touchMultiplier: 1.2,
    });

    lenisInstance.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenisInstance.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Rolagem suave para âncoras internas
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      const targetEl = targetId.length > 1 ? document.querySelector(targetId) : null;
      if (!targetEl) return;
      e.preventDefault();

      if (lenisInstance) {
        lenisInstance.scrollTo(targetEl, { offset: -30 });
      } else {
        targetEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  });

  /* ============ 3. Cena 3D: Sobrancelha Dourada & Pó que se mexe com o dedo ============ */
  const canvas = document.getElementById('gl');
  const BASE_Z = 8;
  const BROW_W = 7.0;

  const hasThree = !!window.THREE;
  const uniforms = {
    uTime:   { value: 0 },
    uIntro:  { value: reduceMotion ? 0 : 1 }, // 1 = pó se juntando, 0 = sobrancelha formada
    uScroll: { value: 0 },                    // 0 -> 1 enquanto o hero sai da tela (vira pó dourado)
    uSY:     { value: 0 },                    // deslocamento vertical do pó com a rolagem
    uMouse:  { value: hasThree ? new THREE.Vector2(99, 99) : null },
    uBrow:   { value: hasThree ? new THREE.Vector3(1, 1, 0) : null },
    uCloud:  { value: hasThree ? new THREE.Vector3(10, 7, 9) : null },
    uDpr:    { value: 1 },
    uH:      { value: 800 },
    uTan:    { value: 0.414 },
    uHalfW:  { value: isMobile ? 0.75 : 1.0 },
  };

  function initWebGLScene() {
    if (!window.THREE || !canvas) return false;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !isMobile,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      return false;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    uniforms.uDpr.value = dpr;

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    cam.position.z = BASE_Z;

    /* Densidade rica de fios e bolinhas douradas cintilantes */
    const PER_BROW = isMobile ? 380 : 900;
    const DUST_COUNT = isMobile ? 2800 : 7000;
    const S = 3;
    const VPS = (S + 1) * 2;
    const totalStrands = PER_BROW * 2;

    const pos = new Float32Array(totalStrands * VPS * 3);
    const aRoot = new Float32Array(totalStrands * VPS * 3);
    const aNormal = new Float32Array(totalStrands * VPS * 2);
    const aInfo = new Float32Array(totalStrands * VPS * 4);
    const aCloud = new Float32Array(totalStrands * VPS * 3);
    const idx = new Uint16Array(totalStrands * S * 6);
    const strands = [];

    const X0 = 0.2;
    const L = 3.15;
    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    const ARCH_H = 0.5;
    const TAIL_DROP = 0.18;
    const arch = (t) => ARCH_H * Math.sin(Math.PI * Math.pow(t, 1.95)) - TAIL_DROP * Math.pow(t, 2.5);

    const thick = (t) => {
      const w = clamp01((t - 0.5) / 0.5);
      const ss = w * w * (3 - 2 * w);
      return 0.64 * (1 - 0.25 * t) * (1 - ss) + 0.025;
    };

    const ANGLES = [[0, 1.30], [0.2, 1.18], [0.65, 0.48], [1, -0.31]];
    const hairAngle = (t) => {
      for (let k = 1; k < ANGLES.length; k++) {
        if (t <= ANGLES[k][0]) {
          const [t0, a0] = ANGLES[k - 1];
          const [t1, a1] = ANGLES[k];
          const f = (t - t0) / (t1 - t0);
          return a0 + (a1 - a0) * (f * f * (3 - 2 * f));
        }
      }
      return ANGLES[ANGLES.length - 1][1];
    };

    for (let i = 0; i < totalStrands; i++) {
      const side = i % 2 ? 1 : -1;
      const t = Math.pow(Math.random(), 0.9);
      const u = Math.random() - 0.5;
      const rx = X0 + L * t + (Math.random() - 0.5) * 0.05;
      const ry = arch(t) + u * thick(t);
      const rz = (Math.random() - 0.5) * 0.25;

      const th = hairAngle(t) - 0.5 * u + (Math.random() - 0.5) * 0.24;
      const len = (0.36 + Math.random() * 0.3) * (1 - 0.3 * t);
      const curv = 0.18 + (Math.random() - 0.5) * 0.3;
      const rnd = Math.random();
      const ord = clamp01(t + (Math.random() - 0.5) * 0.25);
      const cx = Math.random() - 0.5;
      const cy = Math.random() - 0.5;
      const cz = Math.random() - 0.5;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const pts = [];

      for (let j = 0; j <= S; j++) {
        const f = j / S;
        const px = rx + c * len * f + s * curv * len * f * f;
        const py = ry + s * len * f - c * curv * len * f * f;
        const tx = c * len + 2 * s * curv * len * f;
        const ty = s * len - 2 * c * curv * len * f;
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl;
        const ny = tx / tl;
        pts.push([side * px, py, rz]);

        for (let k = 0; k < 2; k++) {
          const v = i * VPS + j * 2 + k;
          pos[v * 3] = side * px;
          pos[v * 3 + 1] = py;
          pos[v * 3 + 2] = rz;
          aRoot[v * 3] = side * rx;
          aRoot[v * 3 + 1] = ry;
          aRoot[v * 3 + 2] = rz;
          aNormal[v * 2] = side * nx;
          aNormal[v * 2 + 1] = ny;
          aInfo[v * 4] = k ? 1 : -1;
          aInfo[v * 4 + 1] = f;
          aInfo[v * 4 + 2] = rnd;
          aInfo[v * 4 + 3] = ord;
          aCloud[v * 3] = cx;
          aCloud[v * 3 + 1] = cy;
          aCloud[v * 3 + 2] = cz;
        }
      }
      for (let j = 0; j < S; j++) {
        const a = i * VPS + j * 2;
        idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], (i * S + j) * 6);
      }
      strands.push({ pts, ord });
    }

    const strandGeo = new THREE.BufferGeometry();
    strandGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    strandGeo.setAttribute('aRoot', new THREE.BufferAttribute(aRoot, 3));
    strandGeo.setAttribute('aNormal', new THREE.BufferAttribute(aNormal, 2));
    strandGeo.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 4));
    strandGeo.setAttribute('aCloud', new THREE.BufferAttribute(aCloud, 3));
    strandGeo.setIndex(new THREE.BufferAttribute(idx, 1));

    // Geometria das Bolinhas Douradas
    const dPos = new Float32Array(DUST_COUNT * 3);
    const dCloud = new Float32Array(DUST_COUNT * 3);
    const dRand = new Float32Array(DUST_COUNT);
    const dOrd = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      const st = strands[(Math.random() * strands.length) | 0];
      const sf = Math.random() * S;
      const j = Math.min(S - 1, sf | 0);
      const f = sf - j;
      const a = st.pts[j];
      const b = st.pts[j + 1];
      dPos[i * 3] = a[0] + (b[0] - a[0]) * f + (Math.random() - 0.5) * 0.04;
      dPos[i * 3 + 1] = a[1] + (b[1] - a[1]) * f + (Math.random() - 0.5) * 0.04;
      dPos[i * 3 + 2] = a[2] + (Math.random() - 0.5) * 0.1;
      dCloud[i * 3] = Math.random() - 0.5;
      dCloud[i * 3 + 1] = Math.random() - 0.5;
      dCloud[i * 3 + 2] = Math.random() - 0.5;
      dRand[i] = Math.random();
      dOrd[i] = st.ord;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dustGeo.setAttribute('aCloud', new THREE.BufferAttribute(dCloud, 3));
    dustGeo.setAttribute('aRand', new THREE.BufferAttribute(dRand, 1));
    dustGeo.setAttribute('aOrd', new THREE.BufferAttribute(dOrd, 1));

    const commonGLSL = /* glsl */ `
      uniform float uTime, uIntro, uScroll, uSY, uDpr, uH, uTan, uHalfW;
      uniform vec3 uBrow, uCloud;
      uniform vec2 uMouse;

      float formation(float k) {
        float m = clamp(uIntro + uScroll, 0.0, 1.0);
        float x = clamp(m * 1.6 - k * 0.6, 0.0, 1.0);
        return x * x * (3.0 - 2.0 * x);
      }
      vec3 browPos(vec3 p) {
        return vec3(p.x * uBrow.x, p.y * uBrow.y + uBrow.z, p.z);
      }
      vec3 cloudPos(vec3 c, float r) {
        vec3 w = c * uCloud;
        float H = uCloud.y;
        w.y = mod(w.y + uSY * (0.25 + 0.75 * r) + H * 0.5, H) - H * 0.5;
        return w;
      }
      vec3 wander(float r, float mm) {
        float a = 0.012 + 0.3 * mm;
        return vec3(sin(uTime * .6 + r * 40.), cos(uTime * .5 + r * 25.), sin(uTime * .4 + r * 12.)) * a;
      }
      // Efeito de repulsão: o pó dourado desvia suavemente onde o cliente toca o dedo na tela
      vec2 repel(vec2 p) {
        vec2 d = p - uMouse;
        float f = smoothstep(1.8, 0.0, length(d));
        return normalize(d + 1e-4) * f * 0.45;
      }
    `;

    // Shader dos Fios: DOURADO PURO E LUMINOSO
    const strandMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        ${commonGLSL}
        attribute vec3 aRoot;
        attribute vec2 aNormal;
        attribute vec4 aInfo;
        attribute vec3 aCloud;
        varying float vSide, vT, vR, vFade, vGlint;
        void main() {
          float side = aInfo.x, t = aInfo.y, r = aInfo.z, ord = aInfo.w;
          float mm = formation(mix(r, ord, 0.5));
          vec3 bp = browPos(position);
          vec3 br = browPos(aRoot);
          vec3 c = cloudPos(aCloud, r);

          float ang = r * 6.2831 + uTime * (r - .5) * .6;
          mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
          vec3 off = (bp - br) * 0.32 * (1.0 - smoothstep(0.7, 1.0, mm));
          off.xy = R * off.xy;

          vec3 p = mix(bp, c + off, mm);
          p += wander(r, mm);
          p.x += sin(uTime * 1.3 + r * 20.) * 0.015 * t * (1.0 - mm);
          p.xy += repel(mix(br, c, mm).xy);

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float wpp = 2.0 * uTan * (-mv.z) / uH;
          float hw = uHalfW * mix(1.0, 0.35, t) * (1.0 - 0.4 * mm) * wpp;
          vec2 n = normalize(mix(aNormal, R * aNormal, mm) + 1e-5);
          mv.xy += n * side * hw;
          gl_Position = projectionMatrix * mv;

          vSide = side;
          vT = t;
          vR = r;
          vFade = 1.0 - smoothstep(0.55, 1.0, mm);
          float sweep = sin(abs(position.x) * 1.5 - uTime * 1.1 + r * 0.9);
          vGlint = pow(max(sweep, 0.0), 12.0) * (1.0 - mm);
        }`,
      fragmentShader: /* glsl */ `
        varying float vSide, vT, vR, vFade, vGlint;
        void main() {
          float edge = 1.0 - smoothstep(0.25, 1.0, abs(vSide));
          
          // Paleta Dourada Rica e Aparente (mais escura e contrastante):
          vec3 base = vec3(0.50, 0.30, 0.10); // raiz castanho-dourado escuro e forte
          vec3 mid  = vec3(0.68, 0.46, 0.18); // corpo dourado encorpado e denso
          vec3 tip  = vec3(0.82, 0.60, 0.28); // pontas em ouro quente e visível
          vec3 hi   = vec3(0.95, 0.82, 0.48); // reflexo dourado cintilante

          vec3 col = mix(base, mid, smoothstep(0.05, 0.55, vT));
          col = mix(col, tip, smoothstep(0.55, 1.0, vT));
          col *= 0.88 + 0.24 * vR;
          col = mix(col, hi, clamp(vGlint * 0.75, 0.0, 1.0)); // brilho sutil que realça sem clarear
          
          float a = edge * mix(1.0, 0.82, vT) * vFade;
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }`,
    });

    // Shader do Pó Dourado: Bolinhas que reagem ao toque
    const dustMat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        ${commonGLSL}
        attribute vec3 aCloud;
        attribute float aRand;
        attribute float aOrd;
        varying float vMix, vFlick, vAmt;
        void main() {
          float mm = formation(mix(aRand, aOrd, 0.5));
          vec3 p = mix(browPos(position), cloudPos(aCloud, aRand), mm);
          p += wander(aRand, mm);
          p.xy += repel(p.xy); // Bolinhas se mexem e desviam do dedo
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.6 + aRand * 3.4) * uDpr * (8.0 / -mv.z) * mix(0.55, 1.0, mm);
          gl_Position = projectionMatrix * mv;
          vMix = aRand;
          vAmt = mix(0.4, 1.0, mm);
          vFlick = .55 + .45 * sin(uTime * 1.4 + aRand * 60.);
        }`,
      fragmentShader: /* glsl */ `
        varying float vMix, vFlick, vAmt;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vFlick * vAmt;
          // Pó dourado encorpado
          vec3 c = mix(vec3(0.68, 0.48, 0.18), vec3(0.90, 0.72, 0.34), vMix);
          gl_FragColor = vec4(c, a * 0.9);
        }`,
    });

    const strandMesh = new THREE.Mesh(strandGeo, strandMat);
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    strandMesh.frustumCulled = false;
    dustPoints.frustumCulled = false;
    scene.add(strandMesh, dustPoints);

    // Ajuste de enquadramento preciso da Sobrancelha 3D (Especialmente no Mobile)
    const view = { h: 6.6, w: 6 };
    function handleResize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.fov = 45;
      cam.updateProjectionMatrix();

      const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const visH = 2 * tanHalf * BASE_Z;
      const visW = visH * cam.aspect;
      view.h = visH;
      view.w = visW;

      const isPortrait = cam.aspect < 0.9;
      // No celular: 82% da largura útil visível para ter respiro perfeito e não cortar nas pontas
      const fit = isPortrait ? Math.min(visW * 0.82, 6.4) : Math.min(visW * 0.65, 9.8);
      const s = fit / BROW_W;

      // Mede o ponto médio exato da área central (.hero-stage) na tela real
      const stageEl = document.querySelector('.hero-stage');
      let centerRatio = isPortrait ? 0.46 : 0.50;
      if (stageEl) {
        const rect = stageEl.getBoundingClientRect();
        if (rect.height > 0) {
          centerRatio = (rect.top + rect.height * 0.5) / window.innerHeight;
        }
      }

      const browY = (0.5 - centerRatio) * visH;
      // Proporções naturais perfeitas (sem esticar verticalmente)
      uniforms.uBrow.value.set(s, s, browY);
      uniforms.uCloud.value.set(visW * 1.3, visH * 1.3, 9);
      uniforms.uH.value = h;
      uniforms.uTan.value = tanHalf;
      ScrollTrigger.refresh();
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(handleResize).observe(canvas);
    } else {
      window.addEventListener('resize', handleResize);
    }
    handleResize();

    // Rastreamento Preciso do Toque do Dedo e do Cursor
    const target = new THREE.Vector2(9, 9);
    const mouse = new THREE.Vector2(9, 9);
    let touchTimer = null;

    const setTouchPosition = (clientX, clientY) => {
      target.set((clientX / window.innerWidth) * 2 - 1, -((clientY / window.innerHeight) * 2 - 1));
      clearTimeout(touchTimer);
    };

    const resetTouchPosition = () => {
      touchTimer = setTimeout(() => target.set(9, 9), 600);
    };

    // Eventos Pointer
    window.addEventListener('pointermove', (e) => setTouchPosition(e.clientX, e.clientY), { passive: true });
    window.addEventListener('pointerdown', (e) => setTouchPosition(e.clientX, e.clientY), { passive: true });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      resetTouchPosition();
    }, { passive: true });
    window.addEventListener('pointercancel', resetTouchPosition, { passive: true });

    // Eventos Touch dedicados para dispositivos móveis
    window.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) setTouchPosition(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) setTouchPosition(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', resetTouchPosition, { passive: true });

    document.documentElement.addEventListener('mouseleave', () => target.set(9, 9));

    // Loop Contínuo: O pó dourado flutua e reage ao toque do cliente por toda a página
    gsap.ticker.add((time) => {
      uniforms.uTime.value = time;
      mouse.lerp(target, 0.08);

      const vh = 2 * uniforms.uTan.value * cam.position.z;
      uniforms.uMouse.value.set((mouse.x * vh * cam.aspect) / 2, (mouse.y * vh) / 2);

      const cx = THREE.MathUtils.clamp(target.x, -1, 1);
      const cy = THREE.MathUtils.clamp(target.y, -1, 1);
      cam.position.x += (cx * 0.18 - cam.position.x) * 0.05;
      cam.position.y += (cy * 0.1 - cam.position.y) * 0.05;

      uniforms.uSY.value = (window.scrollY / (canvas.clientHeight || 1)) * view.h * 0.6;
      renderer.render(scene, cam);
    });

    // Câmera se aproxima sutilmente com o scroll
    gsap.to(cam.position, {
      z: 6.2,
      ease: 'none',
      scrollTrigger: { trigger: 'main', start: 'top top', end: 'bottom bottom', scrub: 1.2 },
    });

    return true;
  }

  let webGLReady = false;
  try {
    webGLReady = initWebGLScene();
  } catch (err) {
    console.warn('SM Designer: WebGL não inicializado.', err);
  }
  if (!webGLReady) root.classList.add('no-gl');

  // EFEITO 3D: Ao rolar para baixo, a sobrancelha se desfaz em fios e vira pó dourado
  gsap.to(uniforms.uScroll, {
    value: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 },
  });

  /* ============ 4. Entrada Coreografada (A Sobrancelha 3D Dourada se Forma) ============ */
  if (!reduceMotion) {
    const heroTl = gsap.timeline({ delay: 0.2 });

    heroTl
      // 1. As partículas douradas se unem e montam a sobrancelha
      .to(uniforms.uIntro, { value: 0, duration: 3.0, ease: 'expo.out' }, 0)
      // 2. O título entra suavemente
      .fromTo('.hero-title .line>span', { yPercent: 110 }, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12 }, 0.3)
      // 3. Rodapé do hero e navegação aparecem
      .fromTo('.hero-foot, .nav', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.1, ease: 'power2.out' }, 0.8);
  }

  /* ============ 5. Navegação & Botão Fixo Inferior (Mobile Dock) ============ */
  ScrollTrigger.create({
    start: 50,
    end: 'max',
    toggleClass: { targets: '.nav', className: 'is-solid' },
  });

  const dockElement = document.getElementById('mobileDock') || document.querySelector('.dock');
  if (dockElement) {
    ScrollTrigger.create({
      trigger: '.hero',
      start: 'bottom 80%',
      endTrigger: '.fim',
      end: 'top 80%',
      toggleClass: { targets: dockElement, className: 'is-on' },
    });
  }

  /* ============ 6. Revelações Discretas ao Rolar ============ */
  if (!reduceMotion) {
    gsap.utils.toArray('[data-r]').forEach((el) => {
      if (el.closest('.hero')) return;

      gsap.fromTo(el, { y: 26, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      });
    });

    const manifestoImg = document.querySelector('.frame img');
    if (manifestoImg) {
      gsap.fromTo(manifestoImg, { yPercent: -5, scale: 1.1 }, {
        yPercent: 5,
        scale: 1.1,
        ease: 'none',
        scrollTrigger: { trigger: '.frame', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }
  }

  /* ============ 7. Comparadores Antes e Depois (Apenas Antes e Depois, sem 50%) ============ */
  document.querySelectorAll('.ba-card').forEach((card, cardIndex) => {
    const box = card.querySelector('[data-ba]');
    if (!box) return;

    const rangeInput = box.querySelector('input');
    const pills = card.querySelectorAll('.ba-pill');

    if (!box.querySelector('.ba-knob')) {
      box.insertAdjacentHTML('beforeend', '<i class="ba-knob" aria-hidden="true"></i>');
    }

    const setPercentage = (val) => {
      const clamped = Math.max(0, Math.min(100, Math.round(val)));
      if (rangeInput) rangeInput.value = clamped;
      box.style.setProperty('--p', clamped + '%');

      // Botões ativos: "Antes" se >= 50%, "Depois" se < 50%
      pills.forEach((p) => {
        const pVal = parseFloat(p.getAttribute('data-set-ba'));
        if (pVal === 100) {
          p.classList.toggle('is-active', clamped >= 50);
        } else if (pVal === 0) {
          p.classList.toggle('is-active', clamped < 50);
        }
      });
    };

    const getPercentageFromX = (clientX) => {
      const rect = box.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      return Math.max(0, Math.min(100, pct));
    };

    // Ações dos botões [Antes] e [Depois]
    pills.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetVal = parseFloat(btn.getAttribute('data-set-ba'));
        const currentVal = parseFloat(rangeInput ? rangeInput.value : 50);

        if (navigator.vibrate) {
          try { navigator.vibrate(8); } catch (_) {}
        }

        const animObj = { val: currentVal };
        gsap.to(animObj, {
          val: targetVal,
          duration: 0.4,
          ease: 'power2.out',
          onUpdate: () => setPercentage(animObj.val),
        });
      });
    });

    if (rangeInput) {
      rangeInput.addEventListener('input', () => setPercentage(rangeInput.value));
    }

    // Arrasto livre por toque ou mouse
    let isDragging = false;

    const onPointerDown = (e) => {
      isDragging = true;
      box.classList.add('is-drag');
      try { box.setPointerCapture(e.pointerId); } catch (_) {}
      setPercentage(getPercentageFromX(e.clientX));

      if (navigator.vibrate) {
        try { navigator.vibrate(6); } catch (_) {}
      }
    };

    const onPointerMove = (e) => {
      if (!isDragging && !box.hasPointerCapture(e.pointerId)) return;
      setPercentage(getPercentageFromX(e.clientX));
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      box.classList.remove('is-drag');
      if (box.hasPointerCapture(e.pointerId)) {
        try { box.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    box.addEventListener('pointerdown', onPointerDown);
    box.addEventListener('pointermove', onPointerMove);
    box.addEventListener('pointerup', onPointerUp);
    box.addEventListener('pointercancel', onPointerUp);

    // Estado inicial padrão: 100% (exibe o "Antes" com o botão destacado)
    setPercentage(100);

    // Dica de movimento sutil na primeira visualização
    if (cardIndex === 0 && !reduceMotion) {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 82%',
        once: true,
        onEnter: () => {
          const anim = { v: 100 };
          gsap.timeline({ delay: 0.5 })
            .to(anim, { v: 25, duration: 0.9, ease: 'power2.inOut', onUpdate: () => setPercentage(anim.v) })
            .to(anim, { v: 100, duration: 0.8, ease: 'power2.inOut', onUpdate: () => setPercentage(anim.v) });
        },
      });
    }
  });

  /* ============ 8. Recalcular ScrollTrigger após carregamento total ============ */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
  });
})();
