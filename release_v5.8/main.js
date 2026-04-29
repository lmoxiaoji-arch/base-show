/**
 * TechSun Visual Engine v5.5 - Production Stable
 */

const CONFIG = {
    tiltStrength: 8.00,
    parallaxStrength: 0.25,
    zoomMin: 0.8,
    zoomMax: 1.2,
    cloudAssetRatio: 3.0
};

const STATE = {
    version: 'v1',
    brightness: 1.0,
    speed: 0.8,
    bgColor: '#000000',
    defaultGreen: false,
    arraySize: 8,
    calibrationScale: 1.5,
    designRatio: 3.0,
    zoom: 1.0,
    targetZoom: 1.0,
    versions: ['v1', 'v2', 'v3', 'v4', 'v5'],
    parallax: { x: 0, y: 0, targetX: 0, targetY: 0, friction: 0.08 }
};

// UI Elements
const glCanvas = document.getElementById('glCanvas');
const topImg = document.getElementById('topImg');
const layerUnder = document.getElementById('layer-under');
const layerClouds = document.getElementById('layer-clouds');

/* ── WebGL Shader ── */
const VS_SRC = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
    }
`;

const FS_SRC = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_tex_light;
    uniform sampler2D u_tex_color;
    uniform float u_time;
    uniform float u_bright;

    vec3 color_rainbow(float t) {
        vec3 c = vec3(0.5);
        vec3 d = vec3(0.5);
        vec3 e = vec3(1.0);
        vec3 f = vec3(0.0, 0.33, 0.67);
        return c + d * cos(6.28318 * (e * t + f));
    }

    void main() {
        vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
        vec4 t1 = texture2D(u_tex_light, uv);
        vec4 t2 = texture2D(u_tex_color, uv);
        
        float hL = t1.r; float aL = t1.a;
        float hC = t2.r; float aC = t2.a;

        // White Light
        vec3 haloL = vec3(0.0);
        float pulseL = 0.0;
        if (aL > 0.0) {
            float movePhaseL = fract(hL - u_time);
            float dL = abs(movePhaseL - 0.5);
            float coreL = pow(smoothstep(0.1, 0.0, dL), 1.5);
            float bloomL = smoothstep(0.25, 0.0, dL) * 0.4;
            pulseL = (coreL + bloomL) * hL; 
            haloL = vec3(1.0) * pulseL;
        }

        // Color Light
        vec3 haloC = vec3(0.0);
        float pulseC = 0.0;
        if (aC > 0.0) {
            float movePhaseC = fract(hC - u_time);
            float dC = abs(movePhaseC - 0.5);
            float coreC = pow(smoothstep(0.1, 0.0, dC), 1.5);
            float bloomC = smoothstep(0.25, 0.0, dC) * 0.4;
            pulseC = (coreC + bloomC) * hC;
            vec3 rainbow = color_rainbow(fract(hC * 1.5 + u_time * 2.0));
            haloC = rainbow * pulseC; 
        }

        float totalPulse = min(1.0, pulseL + pulseC);
        float maxH = max(aL > 0.0 ? hL : 0.0, aC > 0.0 ? hC : 0.0);
        vec3 baseGlow = vec3(maxH * maxH * 0.8) * totalPulse;

        vec3 combinedHalo = (haloL * 0.7 + haloC) * u_bright * 2.8;
        vec3 finalGlow = baseGlow + (vec3(1.0) - exp(-combinedHalo)) * 1.1;

        float lum = dot(finalGlow, vec3(0.299, 0.587, 0.114));
        float outAlpha = min(1.0, lum * 1.2) * max(aL, aC);

        gl_FragColor = vec4(finalGlow, outAlpha);
    }
`;

let gl, prog, uLocs;
let texLight, texColor;
let texLightReady = false, texColorReady = false;

function initGL() {
    gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;
    const createShader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, createShader(gl.VERTEX_SHADER, VS_SRC));
    gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, FS_SRC));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uLocs = {
        time: gl.getUniformLocation(prog, 'u_time'),
        bright: gl.getUniformLocation(prog, 'u_bright'),
        tex1: gl.getUniformLocation(prog, 'u_tex_light'),
        tex2: gl.getUniformLocation(prog, 'u_tex_color')
    };
    gl.uniform1i(uLocs.tex1, 0);
    gl.uniform1i(uLocs.tex2, 1);

    texLight = gl.createTexture();
    texColor = gl.createTexture();
    const setupTex = (t, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    setupTex(texLight, 0); setupTex(texColor, 1);
}

function updateTexture(tex, img, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
}

function clearTexture(tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
}

async function loadVersion(v) {
    STATE.version = v;
    const path = `./${v}/`;
    const tasks = [];

    tasks.push(new Promise(res => {
        topImg.onload = () => {
            const stage = document.getElementById('stage');
            if (stage && topImg.naturalWidth) {
                stage.style.width = topImg.naturalWidth + 'px';
                stage.style.height = topImg.naturalHeight + 'px';
            }
            syncCanvasSize();
            res();
        };
        topImg.onerror = res;
        topImg.src = `${path}top.png`;
    }));

    tasks.push(new Promise(res => {
        const p = new Image();
        p.onload = () => { layerUnder.style.backgroundImage = `url(${path}under.png)`; res(); };
        p.onerror = () => { layerUnder.style.backgroundImage = 'none'; res(); };
        p.src = `${path}under.png`;
    }));

    texLightReady = false; texColorReady = false;
    tasks.push(new Promise(res => {
        const i = new Image();
        i.onload = () => { updateTexture(texLight, i, 0); texLightReady = true; res(); };
        i.onerror = () => { clearTexture(texLight, 0); texLightReady = true; res(); };
        i.src = `${path}light.png`;
    }));
    tasks.push(new Promise(res => {
        const i = new Image();
        i.onload = () => { updateTexture(texColor, i, 1); texColorReady = true; res(); };
        i.onerror = () => { clearTexture(texColor, 1); texColorReady = true; res(); };
        i.src = `${path}color light.png`;
    }));

    tasks.push(new Promise(res => {
        layerClouds.innerHTML = '';
        const c = new Image();
        c.id = 'cloudImg';
        c.className = 'cloud-item';
        c.onload = res; c.onerror = () => { c.src = './cloud-12.png'; res(); };
        c.src = `${path}cloud-12.png`;
        layerClouds.appendChild(c);
    }));

    await Promise.all(tasks);
    syncHUD();
}

function syncCanvasSize() {
    if (!topImg || !gl) return;
    const r = topImg.getBoundingClientRect();
    glCanvas.width = r.width; glCanvas.height = r.height;
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
}

function initParallax() {
    let isDragging = false;
    let startX = 0, startY = 0;
    let baseTargetX = 0, baseTargetY = 0;

    const onStart = (e) => {
        isDragging = true;
        startX = e.clientX || (e.touches && e.touches[0].clientX);
        startY = e.clientY || (e.touches && e.touches[0].clientY);
        baseTargetX = STATE.parallax.targetX;
        baseTargetY = STATE.parallax.targetY;
    };
    const onMove = (e) => {
        if (!isDragging) return;
        // 健壮的坐标获取逻辑
        let x, y;
        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX;
            y = e.touches[0].clientY;
        } else {
            x = e.clientX;
            y = e.clientY;
        }

        // 提升灵敏度：将系数从 2 提高到 5，让拖拽更省力
        const dx = (x - startX) / window.innerWidth * 5.0;
        const dy = (y - startY) / window.innerHeight * 5.0;
        // 动态限位：位移极限随阵列尺寸缩放，防止薄阵列穿帮
        const limit = (STATE.arraySize / 12) * 3.0;
        STATE.parallax.targetX = Math.max(-limit, Math.min(limit, baseTargetX + dx));
        STATE.parallax.targetY = Math.max(-limit, Math.min(limit, baseTargetY + dy));
    };
    const onEnd = () => {
        isDragging = false;
        // 松手回弹归零
        STATE.parallax.targetX = 0;
        STATE.parallax.targetY = 0;
    };

    window.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchstart', onStart);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
}

function updateParallax() {
    const p = STATE.parallax;
    p.x += (p.targetX - p.x) * p.friction;
    p.y += (p.targetY - p.y) * p.friction;
    
    // 静止归零：防止无穷逼近导致的微抖动
    if (Math.abs(p.x - p.targetX) < 0.001) p.x = p.targetX;
    if (Math.abs(p.y - p.targetY) < 0.001) p.y = p.targetY;

    const nx = p.x, ny = p.y;
    // 动态力度：偏转强度随阵列尺寸线性缩放
    const depthRatio = STATE.arraySize / 12;
    const rx = -ny * CONFIG.tiltStrength * 2.0 * depthRatio;
    const ry = nx * CONFIG.tiltStrength * 2.0 * depthRatio;
    const curZoom = STATE.targetZoom || 1.0;
    const stage = document.getElementById('stage');

    stage.style.transform = `scale(${curZoom}) rotateX(${rx}deg) rotateY(${ry}deg)`;
    stage.style.setProperty('--after-x', `${-nx * 20}px`);
    stage.style.setProperty('--after-y', `${-ny * 20}px`);

    // 动态计算景深偏移：对标 12mm 为 -50px
    const zOffset = -(STATE.arraySize / 12) * 50;
    stage.style.setProperty('--depth-z', `${zOffset}px`);

    const lightingOverlay = document.querySelector('.lighting-overlay');
    if (lightingOverlay) lightingOverlay.style.transform = `translate(${-nx * 15}%, ${-ny * 15}%)`;

    const cloudImg = document.getElementById('cloudImg');
    if (cloudImg) {
        const depthScale = (STATE.arraySize / 8.0); 
        // 恢复平滑位移，移除会导致跳动的取整
        const x = -nx * 0.032 * 100 * 22;
        const y = -ny * 0.032 * 100 * 22;
        cloudImg.style.transform = `translate(-50%,-50%) translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px, 0.1px) scale(${depthScale * CONFIG.cloudAssetRatio})`;

        // 物理级动态景深
        const limit = (STATE.arraySize / 12) * 3.0;
        const intensity = Math.sqrt(nx * nx + ny * ny);
        const threshold = limit * 0.3; 
        
        let blurProgress = 0;
        if (intensity > threshold) {
            blurProgress = (intensity - threshold) / (limit - threshold);
        }

        // 重新对标模糊度：12mm 下调 10% 后约为 10.8px
        const maxBlur = (STATE.arraySize / 12) * 10.8; 
        const dynamicBlur = blurProgress * maxBlur;

        // 关键修复：当不需要模糊时，彻底移除 filter 属性，防止引擎持续运行导致的颤动
        if (dynamicBlur < 0.1) {
            layerClouds.style.filter = 'none';
        } else {
            layerClouds.style.filter = `blur(${dynamicBlur.toFixed(1)}px)`;
        }
    }
}

function syncHUD() {
    const hudList = document.getElementById('hud-version-list');
    if (hudList) {
        hudList.innerHTML = '';
        STATE.versions.forEach(v => {
            const b = document.createElement('button');
            b.className = 'hud-v-btn'; b.textContent = v.toUpperCase();
            b.classList.toggle('active', v === STATE.version);
            b.onclick = () => loadVersion(v);
            hudList.appendChild(b);
        });
    }
    const sideList = document.getElementById('version-list');
    if (sideList) {
        sideList.innerHTML = '';
        STATE.versions.forEach(v => {
            const b = document.createElement('button');
            b.className = 'v-btn'; b.textContent = v.toUpperCase();
            b.classList.toggle('active', v === STATE.version);
            b.onclick = () => loadVersion(v);
            sideList.appendChild(b);
        });
    }
    const setVal = (id, val) => { if (document.getElementById(id)) document.getElementById(id).textContent = val; };
    setVal('depth-val', STATE.arraySize + 'mm');
    setVal('bright-val', STATE.brightness.toFixed(1) + 'x');
    setVal('speed-val', STATE.speed.toFixed(1) + 'x');
    setVal('hud-depth-val', STATE.arraySize + 'mm');
    setVal('hud-bright-val', STATE.brightness.toFixed(1) + 'x');
    setVal('hud-speed-val', STATE.speed.toFixed(1) + 'x');
}

function initUI() {
    const setup = (id, key, hudId) => {
        const s = document.getElementById(id);
        if (s) s.oninput = (e) => {
            STATE[key] = parseFloat(e.target.value);
            if (hudId) document.getElementById(hudId).value = STATE[key];
            syncHUD();
        };
    };
    setup('depth-slider', 'arraySize', 'hud-depth-slider');
    setup('bright-slider', 'brightness', 'hud-bright-slider');
    setup('speed-slider', 'speed', 'hud-speed-slider');
    setup('hud-depth-slider', 'arraySize', 'depth-slider');
    setup('hud-bright-slider', 'brightness', 'bright-slider');
    setup('hud-speed-slider', 'speed', 'speed-slider');

    document.getElementById('btn-preview').onclick = () => document.body.classList.add('is-preview');
    document.getElementById('emergency-exit').onclick = () => document.body.classList.remove('is-preview');

    let lastColor = STATE.bgColor;
    const greenToggle = document.getElementById('green-screen-toggle');
    if (greenToggle) {
        greenToggle.onchange = (e) => {
            if (e.target.checked) { lastColor = STATE.bgColor; updateStageColor('#00FF2A'); }
            else { updateStageColor(lastColor); }
        };
    }

    function updateStageColor(color) {
        STATE.bgColor = color;
        document.getElementById('stage').style.backgroundColor = color;
        document.getElementById('bg-color-picker').value = color;
        document.getElementById('bg-color-hex').value = color.toUpperCase();
        const indicator = document.getElementById('bg-color-indicator');
        if (indicator) indicator.style.backgroundColor = color;
    }

    document.getElementById('bg-color-picker').oninput = (e) => updateStageColor(e.target.value);
    document.getElementById('bg-color-hex').onchange = (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) updateStageColor(e.target.value);
    };
}

let lastT = 0, timeAccum = 0;
function loop(t) {
    const dt = (t - lastT) * 0.001; lastT = t;
    timeAccum = (timeAccum + dt * STATE.speed) % 1.0;
    updateParallax();
    if (texLightReady && texColorReady && gl) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texLight);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texColor);
        gl.uniform1f(uLocs.time, timeAccum);
        gl.uniform1f(uLocs.bright, STATE.brightness);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(loop);
}

initGL(); initParallax(); initUI(); loadVersion(STATE.version);
requestAnimationFrame(loop);
window.addEventListener('resize', syncCanvasSize);
