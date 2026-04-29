/**
 * TechSun Visual Engine v5.8 - Production Stable (Release_v5.8)
 */

const CONFIG = {
    tiltStrengthStandard: 8.0, // 有云膜时的标准力度
    tiltStrengthFree: 12.0,    // 无云膜时的自由力度（防止翻面）
    parallaxStrength: 0.25,
    zoomMin: 0.8,
    zoomMax: 1.2,
    cloudAssetRatio: 3.0
};

const STATE = {
    version: 'v1-c',
    hasCloud: true,
    hasLight: true,
    brightness: 1.0,
    cloudOpacity: 1.0,
    speed: 0.8,
    bgColor: '#000000',
    defaultGreen: false,
    arraySize: 8,
    calibrationScale: 1.5,
    designRatio: 3.0,
    zoom: 1.0,
    targetZoom: 1.0,
    versions: [], // 动态探测
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
        i.onload = () => { 
            updateTexture(texLight, i, 0); 
            texLightReady = true; 
            STATE.hasLight = true;
            syncHUD();
            res(); 
        };
        i.onerror = () => { 
            clearTexture(texLight, 0); 
            texLightReady = true; 
            STATE.hasLight = false;
            syncHUD();
            res(); 
        };
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
        
        // 探测逻辑：后缀判定 > 私有云 > 信号弹
        const isSceneSuffix = v.endsWith('-c');

        const tryLocalCloud = () => {
            c.onload = () => { STATE.hasCloud = true; res(); };
            c.onerror = () => {
                if (isSceneSuffix) {
                    // 如果带 -c 后缀且没私有云，强制加载共享云
                    STATE.hasCloud = true;
                    c.onload = res;
                    c.onerror = res;
                    c.src = './cloud-12.png';
                } else {
                    tryFlagFile();
                }
            };
            c.src = `${path}cloud.png`;
        };

        const tryFlagFile = () => {
            const flag = new Image();
            flag.onload = () => {
                STATE.hasCloud = true;
                c.onload = res;
                c.onerror = res;
                c.src = './cloud-12.png'; 
            };
            flag.onerror = () => {
                STATE.hasCloud = false;
                res();
            };
            flag.src = `${path}use_cloud.png`;
        };

        tryLocalCloud();
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
        if (e.target.tagName === "INPUT") return;
        
        let x, y;
        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX;
            y = e.touches[0].clientY;
        } else {
            x = e.clientX;
            y = e.clientY;
        }

        const dx = (x - startX) / window.innerWidth * 5.0;
        const dy = (y - startY) / window.innerHeight * 5.0;
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
    // 动态力度：根据是否有云膜决定倾斜自由度
    const currentTilt = STATE.hasCloud ? CONFIG.tiltStrengthStandard : CONFIG.tiltStrengthFree;
    
    // 逻辑解耦：只有有云膜时，阵列尺寸才参与计算
    let depthRatio = 1.0;
    let zOffset = -30; 

    if (STATE.hasCloud) {
        depthRatio = STATE.arraySize / 12;
        zOffset = -(STATE.arraySize / 12) * 50;
    } else {
        // FREE 模式：锁定在对标 12mm 的视觉深度
        depthRatio = 1.0; 
        zOffset = -50;
    }

    const rx = -ny * currentTilt * 2.0 * depthRatio;
    const ry = nx * currentTilt * 2.0 * depthRatio;
    const curZoom = STATE.targetZoom || 1.0;
    const stage = document.getElementById('stage');

    stage.style.transform = `scale(${curZoom}) rotateX(${rx}deg) rotateY(${ry}deg)`;
    stage.style.setProperty('--after-x', `${-nx * 20}px`);
    stage.style.setProperty('--after-y', `${-ny * 20}px`);
    stage.style.setProperty('--depth-z', `${zOffset}px`);

    const lightingOverlay = document.querySelector('.lighting-overlay');
    if (lightingOverlay) lightingOverlay.style.transform = `translate(${-nx * 15}%, ${-ny * 15}%)`;

    const cloudImg = document.getElementById('cloudImg');
    if (cloudImg) {
        // 应用云膜透明度
        cloudImg.style.opacity = STATE.cloudOpacity;

        // 核心联动 1：缩放随阵列尺寸变化
        const depthScale = (STATE.arraySize / 8.0); 
        
        // 核心联动 2：位移随阵列尺寸和倾斜角度双重变化 (找回 70.4 系数)
        const x = -nx * 0.032 * 100 * 22 * depthScale;
        const y = -ny * 0.032 * 100 * 22 * depthScale;
        cloudImg.style.transform = `translate(-50%,-50%) translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${depthScale * CONFIG.cloudAssetRatio})`;

        // 核心联动 3：动态景深（模糊与倾斜强度挂钩，上限由阵列尺寸决定）
        const intensity = Math.sqrt(nx * nx + ny * ny); // 倾斜强度
        const limit = (STATE.arraySize / 12) * 3.0;     // 动态阈值
        const threshold = limit * 0.3; 
        
        let blurProgress = 0;
        if (intensity > threshold) {
            blurProgress = (intensity - threshold) / (limit - threshold);
        }

        // 阵列尺寸越大，最大模糊上限越高 (10.8px)
        const maxBlur = (STATE.arraySize / 12) * 10.8; 
        const dynamicBlur = blurProgress * maxBlur;

        if (dynamicBlur < 0.1) {
            cloudImg.style.filter = 'none';
        } else {
            cloudImg.style.filter = `blur(${dynamicBlur.toFixed(1)}px)`;
        }
    }
}

function syncHUD() {
    // 1. 渲染版本按钮
    const hudList = document.getElementById('hud-version-list');
    if (hudList) {
        hudList.innerHTML = '';
        STATE.versions.forEach(v => {
            const b = document.createElement('button');
            b.className = 'hud-v-btn'; 
            const displayV = v.replace(/-c$/i, '').toUpperCase();
            b.textContent = displayV;
            b.classList.toggle('active', v === STATE.version);
            b.onclick = () => switchVersion(v);
            hudList.appendChild(b);
        });
    }

    // 2. 动态控制滑块显隐
    const hudContainer = document.querySelector('.hud-container');
    const sideDepthSection = document.getElementById('depth-slider')?.closest('.panel-section');
    const sideCloudOpSection = document.getElementById('cloud-opacity-slider')?.closest('.panel-section');
    const sideBrightSection = document.getElementById('bright-slider')?.closest('.panel-section');
    const sideSpeedSection = document.getElementById('speed-slider')?.closest('.panel-section');

    if (hudContainer) {
        hudContainer.innerHTML = '';
        
        // --- 阵列尺寸 (仅有云膜时) ---
        if (STATE.hasCloud) {
            if (sideDepthSection) sideDepthSection.style.display = 'block';
            if (sideCloudOpSection) sideCloudOpSection.style.display = 'block';
            
            const depthCard = document.createElement('div');
            depthCard.className = 'hud-card mini';
            depthCard.innerHTML = `
                <div class="hud-label-row"><label>阵列尺寸</label><div class="hud-val" id="hud-depth-val">${STATE.arraySize}mm</div></div>
                <input type="range" id="hud-depth-slider" min="6" max="12" step="1" value="${STATE.arraySize}">
            `;
            hudContainer.appendChild(depthCard);
            const ds = depthCard.querySelector('#hud-depth-slider');
            ds.oninput = (e) => {
                STATE.arraySize = parseInt(e.target.value);
                document.getElementById('hud-depth-val').textContent = STATE.arraySize + 'mm';
                document.getElementById('depth-val').textContent = STATE.arraySize + 'mm';
                document.getElementById('depth-slider').value = STATE.arraySize;
            };
        } else {
            if (sideDepthSection) sideDepthSection.style.display = 'none';
            if (sideCloudOpSection) sideCloudOpSection.style.display = 'none';
        }

        // --- 光效控件 (仅有 Light 时) ---
        if (STATE.hasLight) {
            if (sideBrightSection) sideBrightSection.style.display = 'block';
            if (sideSpeedSection) sideSpeedSection.style.display = 'block';

            // 1. 透明度
            const brightCard = document.createElement('div');
            brightCard.className = 'hud-card mini';
            brightCard.innerHTML = `
                <div class="hud-label-row"><label>光效透明度</label><div class="hud-val" id="hud-bright-val">${STATE.brightness.toFixed(1)}x</div></div>
                <input type="range" id="hud-bright-slider" min="0.1" max="2.0" step="0.1" value="${STATE.brightness}">
            `;
            hudContainer.appendChild(brightCard);
            const bs = brightCard.querySelector('#hud-bright-slider');
            bs.oninput = (e) => {
                STATE.brightness = parseFloat(e.target.value);
                document.getElementById('hud-bright-val').textContent = STATE.brightness.toFixed(1) + 'x';
                document.getElementById('bright-val').textContent = STATE.brightness.toFixed(1) + 'x';
                document.getElementById('bright-slider').value = STATE.brightness;
            };

            // 2. 速率 (找回被删的速率)
            const speedCard = document.createElement('div');
            speedCard.className = 'hud-card mini';
            speedCard.innerHTML = `
                <div class="hud-label-row"><label>动画速率</label><div class="hud-val" id="hud-speed-val">${STATE.speed.toFixed(1)}x</div></div>
                <input type="range" id="hud-speed-slider" min="0.1" max="2.0" step="0.1" value="${STATE.speed}">
            `;
            hudContainer.appendChild(speedCard);
            const ss = speedCard.querySelector('#hud-speed-slider');
            ss.oninput = (e) => {
                STATE.speed = parseFloat(e.target.value);
                document.getElementById('hud-speed-val').textContent = STATE.speed.toFixed(1) + 'x';
                document.getElementById('speed-val').textContent = STATE.speed.toFixed(1) + 'x';
                document.getElementById('speed-slider').value = STATE.speed;
            };
        } else {
            if (sideBrightSection) sideBrightSection.style.display = 'none';
            if (sideSpeedSection) sideSpeedSection.style.display = 'none';
        }
    }
    const sideList = document.getElementById('version-list');
    if (sideList) {
        sideList.innerHTML = '';
        STATE.versions.forEach(v => {
            const b = document.createElement('button');
            b.className = 'v-btn'; 
            const displayV = v.replace(/-c$/i, '').toUpperCase();
            b.textContent = displayV;
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

    // 云膜透明度滑块（仅侧边栏）
    const cloudOpSlider = document.getElementById('cloud-opacity-slider');
    const cloudOpVal = document.getElementById('cloud-opacity-val');
    if (cloudOpSlider) {
        cloudOpSlider.oninput = (e) => {
            STATE.cloudOpacity = parseFloat(e.target.value);
            if (cloudOpVal) cloudOpVal.textContent = STATE.cloudOpacity.toFixed(1) + 'x';
        };
    }

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
    document.getElementById('bg-color-hex').oninput = (e) => {
        let val = e.target.value.trim();
        // 自动补全 # 号逻辑
        if (val.length === 6 && !val.startsWith('#')) val = '#' + val;
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            updateStageColor(val);
        }
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

/**
 * 自动探测版本数量并初始化 UI (优化为非阻塞并行探测)
 */
async function initVersionSystem() {
    STATE.versions = [];
    const maxSearch = 15;
    
    // 1. 立即加载默认版本
    loadVersion(STATE.version);

    // 2. 极速探测逻辑
    const detectTasks = Array.from({ length: maxSearch }, (_, idx) => {
        const i = idx + 1;
        const vBase = `v${i}`;
        const vScene = `v${i}-c`;
        
        return new Promise(resolve => {
            let variants = [vScene, vBase];
            let resolved = false;

            // 必须保留循环！
            variants.forEach(vName => {
                const check = (imgSrc) => {
                    const img = new Image();
                    img.onload = () => { 
                        if(!resolved){ 
                            resolved = true; 
                            resolve(vName); 
                            // 发现一个版本，立即同步到全局并渲染
                            if (!STATE.versions.includes(vName)) {
                                STATE.versions.push(vName);
                                STATE.versions.sort((a,b) => parseInt(a.replace('v','')) - parseInt(b.replace('v','')));
                                renderVersionUI();
                            }
                        } 
                    };
                    img.src = imgSrc;
                };
                check(`${vName}/top.png`);
                check(`${vName}/under.png`);
            });
            
            // 本地 300ms 足以探测是否存在
            setTimeout(() => { if(!resolved) resolve(null); }, 300);
        });
    });

    // 3. 后台收尾
    await Promise.all(detectTasks);
    if (STATE.versions.length === 0) {
        STATE.versions = ['v1-c'];
        renderVersionUI();
    }
}

/**
 * 动态渲染侧边栏和 HUD 的版本按钮
 */
function renderVersionUI() {
    syncHUD(); // 统一调用 syncHUD 进行渲染，避免逻辑碎片化
}

/**
 * 切换版本封装
 */
window.switchVersion = function(v) {
    STATE.version = v;
    loadVersion(v);
    renderVersionUI(); 
};

initGL(); initParallax(); initUI(); 
initVersionSystem(); // 改为异步探测加载
requestAnimationFrame(loop);
window.addEventListener('resize', syncCanvasSize);
